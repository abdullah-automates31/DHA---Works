import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/AuthForm';
import { DetailSkeleton, SkeletonGroup } from '@/components/Skeleton';
import { StatusChip } from '@/components/MyJobParts';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';
import { reportHref } from '@/features/job/routes';
import { jobKind, reportableJobs } from '@/features/myjobs/rules';
import { useMyJobs } from '@/features/myjobs/useMyJobs';
import { t } from '@/i18n';
import { colors, fontFamily } from '@/theme';

// Report a problem, opened from Help and support. Reports are filed per job (W14), so the worker first picks the job.
// Only jobs that can be reported are listed (from start until 7 days after completion).
export default function ReportPickScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, refresh } = useMyJobs();
  const jobs = data.status === 'ready' ? reportableJobs(data.jobs, new Date()) : [];

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/help'))} style={styles.back}>
          <ChevronLeftIcon size={22} color={colors.greenDark} />
        </Pressable>
        <Text style={styles.topTitle}>{t('report.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {data.status === 'loading' ? (
          <SkeletonGroup>
            <DetailSkeleton inset={false} />
          </SkeletonGroup>
        ) : null}

        {data.status === 'error' ? (
          <View style={styles.message}>
            <Text style={styles.messageTitle}>{t('myjobs.errorTitle')}</Text>
            <Text style={styles.messageBody}>{t('myjobs.errorBody')}</Text>
            <PrimaryButton label={t('common.retry')} onPress={() => void refresh()} showArrow={false} />
          </View>
        ) : null}

        {data.status === 'ready' && jobs.length === 0 ? (
          <View style={styles.message}>
            <Text style={styles.messageTitle}>{t('report.noJobsTitle')}</Text>
            <Text style={styles.messageBody}>{t('report.noJobsBody')}</Text>
          </View>
        ) : null}

        {jobs.length > 0 ? <Text style={styles.lead}>{t('report.pickJob')}</Text> : null}
        {jobs.map((job) => (
          <Pressable key={job.id} accessibilityRole="button" accessibilityLabel={job.title} onPress={() => router.push(reportHref(job.id))} style={styles.row}>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.rowTitle}>{job.title}</Text>
              <View style={styles.rowMeta}>
                <StatusChip kind={jobKind(job)} />
                <Text style={styles.code}>{job.code}</Text>
              </View>
            </View>
            <ChevronRightIcon size={20} color={colors.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.ink },
  content: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 32, gap: 12 },
  lead: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.muted },
  row: { backgroundColor: '#fff', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle: { fontFamily: fontFamily.extrabold, fontSize: 15, color: colors.ink },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  code: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.muted },
  message: { backgroundColor: colors.mint, borderRadius: 18, padding: 16, gap: 10 },
  messageTitle: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.greenDark },
  messageBody: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 19, color: colors.muted },
});
