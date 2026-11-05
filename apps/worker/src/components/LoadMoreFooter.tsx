import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SkeletonGroup } from '@/components/Skeleton';
import { t } from '@/i18n';
import { colors, fontFamily } from '@/theme';

// The end of a paged list: skeleton rows while the next page loads, "Show more" when there is one, and a retry
// when loading it failed. The list also loads by itself when scrolled near the end; the button is there for a list
// too short to scroll (for example a filtered tab) and for anyone who prefers to tap.
export function LoadMoreFooter({
  hasMore,
  loading,
  failed,
  onLoad,
  skeleton,
}: {
  hasMore: boolean;
  loading: boolean;
  failed: boolean;
  onLoad: () => void;
  skeleton: ReactNode;
}) {
  if (loading) return <SkeletonGroup style={{ gap: 12 }}>{skeleton}</SkeletonGroup>;
  if (!hasMore) return null;
  return (
    <View style={styles.wrap}>
      {failed ? <Text style={styles.failed}>{t('common.loadMoreFailed')}</Text> : null}
      <Pressable accessibilityRole="button" onPress={onLoad} style={styles.button}>
        <Text style={styles.buttonText}>{failed ? t('common.retry') : t('common.showMore')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  failed: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.muted },
  button: { height: 44, paddingHorizontal: 22, borderRadius: 22, backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.extrabold, fontSize: 14, color: colors.greenDark },
});
