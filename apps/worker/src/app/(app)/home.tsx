import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { PrimaryButton } from '@/components/AuthForm';
import { Crest } from '@/components/Crest';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

// Temporary signed-in screen. Onboarding (W02 onwards) replaces it; the route guard by profile status comes then.
export default function SignedInPlaceholder() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <Crest size={96} />
      <AppText variant="h2" color={colors.greenDark}>
        {t('app.name')}
      </AppText>
      <AppText variant="bodyBold" color={colors.signIn.fieldText} style={styles.center}>
        {t('home.signedInAs', { email: session?.user.email ?? '' })}
      </AppText>
      <AppText variant="small" color={colors.signIn.footnote} style={styles.center}>
        {t('home.comingNext')}
      </AppText>
      <View style={styles.button}>
        <PrimaryButton label={t('home.signOut')} onPress={() => void supabase.auth.signOut()} showArrow={false} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 26 },
  center: { textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: 12 },
});
