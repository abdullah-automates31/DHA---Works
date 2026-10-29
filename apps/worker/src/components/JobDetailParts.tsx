import { Image } from 'expo-image';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatDuration } from '@/features/work/rules';
import { t } from '@/i18n';
import { colors, fontFamily } from '@/theme';

import { PauseIcon, PlayIcon, UserIcon, UsersIcon } from './icons';

// Pieces of W08 Job detail (worker/screens/w-job.dc.html). Only what a worker may see before acceptance:
// photos, the description, the voice note, how many others are interested, and a "Verified resident" card with
// the phase. The resident's name, phone, plot and address are never shown here (docs/DECISIONS.md, UI-UX section 8).

const TILE_TINTS = ['#CFE0D6', '#F6E7B4', '#D6E6F7'];

export function PhotoRow({ photos }: { photos: string[] }) {
  if (photos.length === 0) return null;
  // Up to three tiles fit the width like the design; more photos make the row scroll sideways.
  const scroll = photos.length > 3;
  const tiles = photos.map((uri, index) => (
    <Image
      key={uri}
      source={{ uri }}
      contentFit="cover"
      accessibilityLabel={t('job.photoN', { n: index + 1 })}
      style={[styles.photo, scroll ? styles.photoFixed : styles.photoFlex, { backgroundColor: TILE_TINTS[index % 3] }]}
    />
  ));
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoScroll}>
      {tiles}
    </ScrollView>
  ) : (
    <View style={styles.photoRow}>{tiles}</View>
  );
}

export function InfoCard({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardBody}>{children}</Text>
    </View>
  );
}

const BARS = [12, 22, 30, 16, 26, 32, 18, 12, 22, 10];

export function VoiceMessage({ uri }: { uri: string | null }) {
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const ready = uri !== null;
  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  const on = Math.round(progress * BARS.length);

  function toggle() {
    if (!ready) return;
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.05)) void player.seekTo(0);
    void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).then(() => player.play());
  }

  return (
    <View style={[styles.card, styles.rowCard]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? t('job.voicePause') : t('job.voicePlay')}
        accessibilityState={{ disabled: !ready }}
        onPress={toggle}
        style={[styles.play, !ready && { opacity: 0.45 }]}
      >
        {status.playing ? <PauseIcon size={22} color="#fff" /> : <PlayIcon size={22} color="#fff" />}
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.cardTitle}>{t('job.voiceTitle')}</Text>
        {ready ? (
          <View style={styles.waveRow}>
            <View style={styles.wave}>
              {BARS.map((height, index) => (
                <View key={index} style={[styles.bar, { height }, index < on && { backgroundColor: colors.green }]} />
              ))}
            </View>
            <Text style={styles.duration}>{status.duration > 0 ? formatDuration(status.duration * 1000) : ''}</Text>
          </View>
        ) : (
          <Text style={styles.muted}>{t('job.voiceUnavailable')}</Text>
        )}
      </View>
    </View>
  );
}

export function InterestCard({ title, body }: { title: string; body: string }) {
  return (
    <View style={[styles.card, styles.rowCard, { backgroundColor: '#FBEFC6' }]}>
      <View style={[styles.ico, { backgroundColor: '#fff' }]}>
        <UsersIcon size={22} color="#5C4300" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.cardTitle, { color: '#3F2F00' }]}>{title}</Text>
        <Text style={[styles.sub, { color: '#5C4300' }]}>{body}</Text>
      </View>
    </View>
  );
}

/** "Verified resident · Phase 6", no name (decision 4): the avatar is a plain person icon, not initials. */
export function ResidentCard({ phase }: { phase: number }) {
  return (
    <View style={[styles.card, styles.rowCard]}>
      <View style={styles.avatar}>
        <UserIcon size={22} color="#5C4300" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{t('job.verifiedResident')}</Text>
        <Text style={styles.sub}>{t('job.residentPhase', { phase })}</Text>
      </View>
      <View style={styles.verified}>
        <Text style={styles.verifiedText}>{t('job.verified')}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', gap: 8 },
  photoScroll: { gap: 8 },
  photo: { height: 112, borderRadius: 12 },
  photoFlex: { flex: 1 },
  photoFixed: { width: 112 },
  card: { backgroundColor: '#fff', borderRadius: 18, paddingVertical: 14, paddingHorizontal: 16, gap: 8 },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14 },
  cardTitle: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.ink },
  cardBody: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20, color: colors.ink },
  play: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  waveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  wave: { flex: 1, height: 36, flexDirection: 'row', alignItems: 'center', gap: 3 },
  bar: { width: 4, borderRadius: 2, backgroundColor: '#8DB09E' },
  duration: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.muted, minWidth: 30, textAlign: 'right' },
  muted: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.muted },
  sub: { fontFamily: fontFamily.bold, fontSize: 12, lineHeight: 16, color: colors.muted },
  ico: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F6E7B4', alignItems: 'center', justifyContent: 'center' },
  verified: { height: 22, paddingHorizontal: 8, borderRadius: 11, backgroundColor: colors.mint, justifyContent: 'center' },
  verifiedText: { fontFamily: fontFamily.extrabold, fontSize: 11, color: colors.green },
});
