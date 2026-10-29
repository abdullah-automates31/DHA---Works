import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_VOICE_MS, MIN_VOICE_MS, formatDuration, voiceProgress } from '@/features/work/rules';
import { t } from '@/i18n';
import { colors, fontFamily } from '@/theme';

import { MicIcon, PauseIcon, PlayIcon, StopIcon } from './icons';

// Voice introduction card (W03b). Designed state: recording (red stop button, bars, "0:18 / 0:30").
// Idle and recorded states are not in the design; they reuse the same card (docs/OPEN-QUESTIONS.md).
// Recording stops by itself at 30 seconds and when the screen is left. Nothing is uploaded here.

const RED = '#C0392B';
const BAR_HEIGHTS = [10, 22, 30, 16, 26, 34, 18, 12, 20, 8, 14, 10];

export type Recorded = { uri: string; durationMs: number };

type Props = {
  /** a saved introduction (signed URL) or a new recording made on this screen */
  playbackUri: string | null;
  hasRecording: boolean;
  onRecorded: (recording: Recorded) => void;
  onError: (message: string | null) => void;
};

export function VoiceIntro({ playbackUri, hasRecording, onRecorded, onError }: Props) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const player = useAudioPlayer(playbackUri ? { uri: playbackUri } : null);
  const playerStatus = useAudioPlayerStatus(player);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recordingRef = useRef(false);

  const finish = useCallback(async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    const durationMs = recorder.getStatus().durationMillis;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
    } catch {
      // stopping an already-stopped recorder is harmless
    }
    setRecording(false);
    const uri = recorder.uri;
    if (!uri || durationMs < MIN_VOICE_MS) {
      setElapsed(0);
      onError(t('work.errors.voiceTooShort'));
      return;
    }
    setElapsed(durationMs);
    onError(null);
    onRecorded({ uri, durationMs });
  }, [onError, onRecorded, recorder]);

  // Live timer while recording, and the automatic stop at 30 s.
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => {
      const ms = recorder.getStatus().durationMillis;
      setElapsed(ms);
      if (ms >= MAX_VOICE_MS) void finish();
    }, 200);
    return () => clearInterval(timer);
  }, [recording, recorder, finish]);

  // Leaving the screen while recording ends the recording (no microphone left running).
  useEffect(
    () => () => {
      if (recordingRef.current) {
        recordingRef.current = false;
        void recorder.stop().catch(() => undefined);
      }
    },
    [recorder],
  );

  async function start() {
    onError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        onError(t('work.errors.micDenied'));
        return;
      }
      player.pause();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setElapsed(0);
      setRecording(true);
    } catch {
      onError(t('work.errors.voiceStartFailed'));
    }
  }

  function togglePlay() {
    if (playerStatus.playing) {
      player.pause();
      return;
    }
    if (playerStatus.didJustFinish || (playerStatus.duration > 0 && playerStatus.currentTime >= playerStatus.duration - 0.05)) {
      void player.seekTo(0);
    }
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).then(() => player.play());
  }

  const showPlay = !recording && hasRecording && playbackUri !== null;
  const progress = recording
    ? voiceProgress(elapsed)
    : showPlay && playerStatus.duration > 0
      ? Math.min(1, playerStatus.currentTime / playerStatus.duration)
      : hasRecording
        ? 1
        : 0;
  const barsOn = Math.round(progress * BAR_HEIGHTS.length);
  const shownMs = recording ? elapsed : hasRecording ? Math.round((playerStatus.duration || elapsed / 1000) * 1000) || elapsed : 0;

  const onPress = recording ? () => void finish() : showPlay ? togglePlay : () => void start();
  const label = recording ? t('work.voice.stop') : showPlay ? (playerStatus.playing ? t('work.voice.pause') : t('work.voice.play')) : t('work.voice.record');

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t('work.voice.title')}</Text>
        {recording ? <Text style={[styles.status, { color: RED }]}>{t('work.voice.recording')}</Text> : null}
        {!recording && hasRecording ? <Text style={[styles.status, { color: colors.green }]}>{t('work.voice.saved')}</Text> : null}
      </View>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={[styles.play, recording && { backgroundColor: RED }]}
        >
          {recording ? (
            <StopIcon size={22} color="#fff" />
          ) : showPlay ? (
            playerStatus.playing ? (
              <PauseIcon size={22} color="#fff" />
            ) : (
              <PlayIcon size={22} color="#fff" />
            )
          ) : (
            <MicIcon size={22} color="#fff" />
          )}
        </Pressable>
        <View style={styles.wave}>
          {BAR_HEIGHTS.map((height, index) => (
            <View key={index} style={[styles.bar, { height }, index < barsOn && { backgroundColor: colors.green }]} />
          ))}
        </View>
        <Text style={styles.time}>
          {formatDuration(shownMs)} / {formatDuration(MAX_VOICE_MS)}
        </Text>
      </View>
      <Text style={styles.help}>{hasRecording && !recording ? t('work.voice.again') : t('work.voice.help')}</Text>
      {hasRecording && !recording ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('work.voice.recordAgain')} onPress={() => void start()} style={styles.again}>
          <MicIcon size={18} color={colors.greenDark} />
          <Text style={styles.againText}>{t('work.voice.recordAgain')}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.ink },
  status: { fontFamily: fontFamily.bold, fontSize: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  wave: { flex: 1, height: 36, flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 4, borderRadius: 2, backgroundColor: '#8DB09E' },
  time: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.ink },
  help: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, color: colors.muted },
  again: {
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.mint,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  againText: { fontFamily: fontFamily.extrabold, fontSize: 14, color: colors.greenDark },
});
