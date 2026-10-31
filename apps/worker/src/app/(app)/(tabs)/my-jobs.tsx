import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/AuthForm';
import { MyJobCard } from '@/components/MyJobParts';
import { cashHref, quoteHref, statusHref } from '@/features/job/routes';
import { inTab, jobKind, type MyJobsTab } from '@/features/myjobs/rules';
import { useMyJobs } from '@/features/myjobs/useMyJobs';
import { t } from '@/i18n';
import { colors, fontFamily } from '@/theme';

const TABS: { key: MyJobsTab; label: 'myjobs.tabActive' | 'myjobs.tabCompleted' | 'myjobs.tabAll' }[] = [
  { key: 'active', label: 'myjobs.tabActive' },
  { key: 'completed', label: 'myjobs.tabCompleted' },
  { key: 'all', label: 'myjobs.tabAll' },
];

// W11 My jobs: every job the worker engaged with, from worker_jobs (live). Active / Completed / All.
// The resident's name, phone and plot appear only on jobs the worker won (the database sends nothing earlier).
export default function MyJobsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, refresh, refreshing } = useMyJobs();
  const [tab, setTab] = useState<MyJobsTab>('active');
  const now = new Date();

  const jobs = data.status === 'ready' ? data.jobs.filter((j) => inTab(jobKind(j), tab)) : [];

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>{t('myjobs.title')}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.green} />}
      >
        <View style={styles.seg} accessibilityRole="tablist">
          {TABS.map(({ key, label }) => (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
              onPress={() => setTab(key)}
              style={[styles.segButton, tab === key && styles.segOn]}
            >
              <Text style={[styles.segText, tab === key && { color: '#fff' }]}>{t(label)}</Text>
            </Pressable>
          ))}
        </View>

        {data.status === 'loading' ? <ActivityIndicator color={colors.green} style={{ marginTop: 32 }} /> : null}

        {data.status === 'error' ? (
          <View style={styles.message}>
            <Text style={styles.messageTitle}>{t('myjobs.errorTitle')}</Text>
            <Text style={styles.messageBody}>{t('myjobs.errorBody')}</Text>
            <PrimaryButton label={t('common.retry')} onPress={() => void refresh()} showArrow={false} />
          </View>
        ) : null}

        {data.status === 'ready' && jobs.length === 0 ? (
          <View style={styles.message}>
            <Text style={styles.messageTitle}>{t(tab === 'completed' ? 'myjobs.emptyCompletedTitle' : 'myjobs.emptyTitle')}</Text>
            <Text style={styles.messageBody}>{t(tab === 'completed' ? 'myjobs.emptyCompletedBody' : 'myjobs.emptyBody')}</Text>
          </View>
        ) : null}

        {jobs.map((job, index) => {
          // Every job the worker engaged with opens its status screen (W12): the timeline and the next action.
          const open = () => router.push(statusHref(job.id));
          return (
            <MyJobCard
              key={job.id}
              job={job}
              index={index}
              now={now}
              onOpen={open}
              onQuote={() => router.push(quoteHref(job.id))}
              onCash={() => router.push(cashHref(job.id))}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: 20, paddingBottom: 4 },
  title: { fontFamily: fontFamily.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.28, color: colors.ink },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 12 },
  seg: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 14, padding: 4, gap: 4 },
  segButton: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: colors.green },
  segText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.muted },
  message: { backgroundColor: colors.mint, borderRadius: 18, padding: 16, gap: 8, marginTop: 4 },
  messageTitle: { fontFamily: fontFamily.extrabold, fontSize: 15, color: colors.greenDark },
  messageBody: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 19, color: colors.muted },
});
