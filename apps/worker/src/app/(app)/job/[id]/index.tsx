import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/AuthForm';
import { InfoCard, InterestCard, PhotoRow, ResidentCard, VoiceMessage } from '@/components/JobDetailParts';
import { BoltIcon, ChevronLeftIcon } from '@/components/icons';
import { BottomBar, FieldError } from '@/components/onboarding';
import { timeAgo } from '@/features/feed/format';
import { interestBanner, jobChip, postedText, startQuote } from '@/features/job/detail';
import { quoteHref } from '@/features/job/routes';
import { expressInterest, recordJobView, useJob, type JobDetail } from '@/features/job/useJob';
import { t } from '@/i18n';
import { colors, fontFamily } from '@/theme';

// W08 Job detail. Shows only what a worker may see before acceptance (photos, description, voice note, how many
// others are interested, a verified-resident card with the phase). "I will quote this job" records the worker's
// interest (safe to repeat) and opens quote creation. Jobs that are gone, expired or taken show a clear message.
export default function JobDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, reload } = useJob(id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const job = state.status === 'ready' ? state.job : null;
  const standing = job?.standing;

  // One view per worker is counted for jobs the worker has not engaged with yet; failures are silent.
  useEffect(() => {
    if (id && standing === 'none') void recordJobView(id);
  }, [id, standing]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/open-jobs'));
  const openQuote = (jobId: string) => router.push(quoteHref(jobId));

  async function onQuote(detail: JobDetail) {
    if (busy) return;
    setError(null);
    if (detail.standing === 'interested') {
      openQuote(detail.id); // interest was recorded earlier
      return;
    }
    setBusy(true);
    const result = await startQuote({ expressInterest }, detail.id);
    setBusy(false);
    if (!result.ok) {
      setError(t(result.key));
      if (result.key === 'job.errors.unavailable' || result.key === 'job.errors.rejected') void reload();
      return;
    }
    openQuote(detail.id);
  }

  const banner = job && job.standing === 'none' ? interestBanner(job.others, job.quotes) : null;

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={goBack} style={styles.back}>
          <ChevronLeftIcon size={22} color={colors.greenDark} />
        </Pressable>
        <Text style={styles.topTitle} numberOfLines={1}>
          {job ? t('job.title', { code: job.code }) : ''}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      {state.status === 'loading' ? <ActivityIndicator color={colors.green} style={{ marginTop: 48 }} /> : null}

      {state.status === 'unavailable' ? (
        <Message title={t('job.unavailableTitle')} body={t('job.unavailableBody')}>
          <PrimaryButton label={t('job.backToJobs')} onPress={() => router.replace('/open-jobs')} showArrow={false} />
        </Message>
      ) : null}

      {state.status === 'error' ? (
        <Message title={t('job.loadFailedTitle')} body={t('job.loadFailedBody')}>
          <PrimaryButton label={t('common.retry')} onPress={() => void reload()} showArrow={false} />
        </Message>
      ) : null}

      {job ? (
        <>
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: job.standing === 'closed' ? 32 : 112 }]}>
            <View style={styles.chipRow}>
              <Chip kind={jobChip(job.urgency, job.postedAt)} />
              <Text style={styles.posted}>{postedText(timeAgo(job.postedAt))}</Text>
            </View>
            <Text style={styles.title}>{job.title}</Text>
            <View style={styles.tags}>
              {job.categoryName ? <Tag>{job.categoryName}</Tag> : null}
              <Tag>{t('feed.where', { phase: job.phase, lane: job.lane })}</Tag>
            </View>

            <PhotoRow photos={job.photos} />
            {job.description ? <InfoCard title={t('job.customerSays')}>{job.description}</InfoCard> : null}
            {job.hasVoiceNote ? <VoiceMessage uri={job.voiceUrl} /> : null}

            {banner ? (
              <InterestCard
                title={t(banner.titleKey, { count: banner.count })}
                body={banner.quoted > 0 ? t('job.interested.subQuoted', { quoted: banner.quoted }) : t('job.interested.sub')}
              />
            ) : null}

            <ResidentCard phase={job.phase} />

            {job.standing === 'closed' ? (
              <View style={styles.closed}>
                <Text style={styles.closedTitle}>{t('job.closedTitle')}</Text>
                <Text style={styles.closedBody}>{t('job.closedBody')}</Text>
              </View>
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </ScrollView>

          {job.standing !== 'closed' ? (
            <BottomBar
              hideArrow
              label={job.standing === 'quoted' ? t('job.quoteSent') : job.standing === 'interested' ? t('job.createQuote') : t('job.quoteThisJob')}
              onPress={() => void onQuote(job)}
              loading={busy}
              disabled={job.standing === 'quoted'}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function Chip({ kind }: { kind: 'urgent' | 'new' | 'open' }) {
  if (kind === 'urgent') {
    const red = colors.chip.declined;
    return (
      <View style={[styles.chip, { backgroundColor: red.bg, flexDirection: 'row', gap: 4 }]}>
        <BoltIcon size={13} color={red.fg} strokeWidth={2.6} />
        <Text style={[styles.chipText, { color: red.fg }]}>{t('job.chipUrgent')}</Text>
      </View>
    );
  }
  const isNew = kind === 'new';
  return (
    <View style={[styles.chip, { backgroundColor: isNew ? colors.gold : colors.mint }]}>
      <Text style={[styles.chipText, { color: colors.greenDark }]}>{isNew ? t('job.chipNew') : t('job.chipOpen')}</Text>
    </View>
  );
}

function Tag({ children }: { children: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{children}</Text>
    </View>
  );
}

function Message({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <View style={styles.message}>
      <Text style={styles.messageTitle}>{title}</Text>
      <Text style={styles.messageBody}>{body}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.ink },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 12 },
  chipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chip: { height: 26, paddingHorizontal: 10, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontFamily: fontFamily.bold, fontSize: 12 },
  posted: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.muted },
  title: { fontFamily: fontFamily.extrabold, fontSize: 24, lineHeight: 28, letterSpacing: -0.24, color: colors.ink },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: colors.mint, justifyContent: 'center' },
  tagText: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.greenDark },
  message: { margin: 20, backgroundColor: colors.mint, borderRadius: 18, padding: 16, gap: 10 },
  messageTitle: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.greenDark },
  messageBody: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 19, color: colors.muted },
  closed: { backgroundColor: colors.mint, borderRadius: 18, padding: 14, gap: 4 },
  closedTitle: { fontFamily: fontFamily.extrabold, fontSize: 14, color: colors.greenDark },
  closedBody: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 18, color: colors.muted },
});
