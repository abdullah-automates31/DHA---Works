import { Tabs } from 'expo-router';

import { TabBar } from '@/components/TabBar';
import { colors } from '@/theme';

// The four tabs of the signed-in worker app (the design's "Requests" tab is not part of the MVP).
// One bar, exactly as designed (white, gold marker), the same on iPhone and Android.
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="open-jobs" />
      <Tabs.Screen name="my-jobs" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
