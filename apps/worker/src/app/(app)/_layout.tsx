import { Redirect, Stack, usePathname } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { TextLink, PrimaryButton } from '@/components/AuthForm';
import { AppText } from '@/components/AppText';
import { allowedRoutes, type AppRoute, type ProfileSnapshot } from '@/features/profile/routing';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { ProfileProvider, useMyProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

// Everything a signed-in user sees goes through here: the profile is loaded once, and the worker may only be on
// the routes their profile allows (see features/profile/routing.ts). Anything else is redirected.
function ProfileGate() {
  const { state, refresh } = useMyProfile();
  const pathname = usePathname();

  if (state.status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.signIn.paper }}>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 26, gap: 16, backgroundColor: colors.signIn.paper }}>
        <AppText variant="bodyBold" style={{ textAlign: 'center' }}>
          {t('temp.loadFailed')}
        </AppText>
        <PrimaryButton label={t('common.retry')} onPress={() => void refresh()} showArrow={false} />
        <TextLink label={t('temp.signOut')} onPress={() => void supabase.auth.signOut()} />
      </View>
    );
  }

  const allowed = allowedRoutes(state.profile as ProfileSnapshot | null);
  if (!allowed.includes(pathname as AppRoute)) {
    return <Redirect href={allowed[0] ?? '/about'} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="about" />
      <Stack.Screen name="documents" />
      <Stack.Screen name="references" />
      <Stack.Screen name="work" />
      <Stack.Screen name="status" />
      <Stack.Screen name="home" />
    </Stack>
  );
}

export default function AppLayout() {
  const { session } = useAuth();
  return (
    <ProfileProvider key={session?.user.id ?? 'none'}>
      <ProfileGate />
    </ProfileProvider>
  );
}
