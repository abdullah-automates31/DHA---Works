import { useRouter } from 'expo-router';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/AuthForm';
import { FeedJobCard } from '@/components/FeedJobCard';
import { feedSubtitle } from '@/features/feed/format';
import { useFeed } from '@/features/feed/useFeed';
import { t } from '@/i18n';
import { useMyProfile } from '@/lib/profile';
import { colors, fontFamily } from '@/theme';

// W07 Open jobs: the worker's matching feed (trade + DHA phase), urgent first, then newest first.
// By decision there is no "Nearest" sort, no distance filter and no km labels (docs/UI-UX.md section 8), so the
// design's sort and distance row is not here. Pull down to refresh; the list also reloads each time the tab is shown.
export default function OpenJobsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state } = useMyProfile();
  const areas = state.status === 'ready' ? state.areas : [];
  const { data, refresh, refreshing } = useFeed(areas.join(','));
  const now = new Date();

  const subtitle = data.status === 'ready' ? feedSubtitle(data.trades, areas) : '';

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>{t('feed.title')}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.green} />}
      >
        {data.status === 'loading' ? <ActivityIndicator color={colors.green} style={{ marginTop: 40 }} /> : null}

        {data.status === 'error' ? (
          <View style={styles.message}>
            <Text style={styles.messageTitle}>{t('feed.errorTitle')}</Text>
            <Text style={styles.messageBody}>{t('feed.errorBody')}</Text>
            <PrimaryButton label={t('common.retry')} onPress={() => void refresh()} showArrow={false} />
          </View>
        ) : null}

        {data.status === 'ready' && data.jobs.length === 0 ? (
          <View style={styles.message}>
            <Text style={styles.messageTitle}>{t('feed.emptyTitle')}</Text>
            <Text style={styles.messageBody}>{t('feed.emptyBody')}</Text>
          </View>
        ) : null}

        {data.status === 'ready'
          ? data.jobs.map((job) => (
              <FeedJobCard key={job.id} job={job} now={now} onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })} />
            ))
          : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontFamily: fontFamily.extrabold, fontSize: 28, lineHeight: 34, letterSpacing: -0.28, color: colors.ink },
  subtitle: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.muted, marginTop: 2 },
  content: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 24, gap: 12 },
  message: { backgroundColor: colors.mint, borderRadius: 18, padding: 16, gap: 8, marginTop: 8 },
  messageTitle: { fontFamily: fontFamily.extrabold, fontSize: 15, color: colors.greenDark },
  messageBody: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 19, color: colors.muted },
});
