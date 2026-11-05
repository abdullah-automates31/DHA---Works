import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { t } from '@/i18n';
import { colors } from '@/theme';

// Skeleton loaders: grey blocks shaped like the real content that pulse while data loads, so a screen keeps its
// layout instead of showing a lone spinner. One SkeletonGroup runs ONE shared animation for all blocks inside it
// (cheap: native-driver opacity). It stands still when the phone's "reduce motion" setting is on, and a screen
// reader hears a single "Loading" instead of every block.

const PulseContext = createContext<Animated.Value | null>(null);

export function SkeletonGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const [pulse] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  return (
    <PulseContext.Provider value={pulse}>
      <View accessible accessibilityLabel={t('common.loading')} accessibilityState={{ busy: true }} style={style}>
        {children}
      </View>
    </PulseContext.Provider>
  );
}

export function Skeleton({
  width = '100%',
  height = 14,
  radius = 8,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const pulse = useContext(PulseContext);
  const opacity = pulse ? pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }) : 1;
  return <Animated.View importantForAccessibility="no" style={[{ width, height, borderRadius: radius, backgroundColor: colors.placeholder, opacity }, style]} />;
}

// Open-jobs feed card (components/FeedJobCard.tsx): icon tile + title/sub + chip, two description lines, footer.
export function FeedCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width={44} height={44} radius={14} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="75%" height={16} />
          <Skeleton width="40%" height={12} />
        </View>
        <Skeleton width={56} height={26} radius={13} />
      </View>
      <Skeleton height={12} />
      <Skeleton width="85%" height={12} />
      <View style={styles.row}>
        <Skeleton width={34} height={34} radius={10} />
        <View style={{ flex: 1 }}>
          <Skeleton width={70} height={12} />
        </View>
        <Skeleton width={38} height={38} radius={19} />
      </View>
    </View>
  );
}

// Today's jobs on Home and the My jobs list: time/status row, title and place.
export function JobCardSkeleton() {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Skeleton width={90} height={14} />
        <View style={{ flex: 1 }} />
        <Skeleton width={72} height={26} radius={13} />
      </View>
      <Skeleton width="70%" height={16} />
      <View style={styles.row}>
        <Skeleton width={34} height={34} radius={17} />
        <Skeleton width="45%" height={12} />
      </View>
    </View>
  );
}

// Notifications list: one white card of icon + two lines + time rows.
export function NoticeListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View style={[styles.card, { paddingVertical: 0 }]}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} style={[styles.noticeRow, index < rows - 1 && styles.divider]}>
          <Skeleton width={36} height={36} radius={18} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width="60%" height={14} />
            <Skeleton height={12} />
          </View>
          <Skeleton width={28} height={10} />
        </View>
      ))}
    </View>
  );
}

// Job pages (detail, status, quote, cash, cancel, report): chip row, title, description and two info cards.
export function DetailSkeleton({ inset = true }: { inset?: boolean }) {
  return (
    <View style={[styles.detail, !inset && { paddingHorizontal: 0 }]}>
      <View style={styles.row}>
        <Skeleton width={84} height={26} radius={13} />
        <Skeleton width={70} height={12} />
      </View>
      <Skeleton width="80%" height={24} />
      <Skeleton height={12} />
      <Skeleton width="90%" height={12} />
      <View style={styles.card}>
        <Skeleton width="35%" height={14} />
        <Skeleton height={12} />
        <Skeleton width="60%" height={12} />
      </View>
      <View style={styles.card}>
        <Skeleton width="45%" height={14} />
        <Skeleton height={12} />
        <Skeleton width="70%" height={12} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  divider: { borderBottomWidth: 1.5, borderBottomColor: '#E2ECE6' },
  detail: { paddingHorizontal: 20, paddingTop: 6, gap: 12 },
});
