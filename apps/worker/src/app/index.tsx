import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { Crest } from '@/components/Crest';
import { t } from '@/i18n';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { colors, size, spacing } from '@/theme';

// Foundation placeholder: proves fonts, theme, translations and the Supabase client work.
// Real screens (sign-in first) replace this in the next stage.
export default function FoundationScreen() {
  const insets = useSafeAreaInsets();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!env.isConfigured) return;
    void supabase.auth.getSession().then(({ data }) => setSignedIn(data.session !== null));
  }, []);

  const status = !env.isConfigured
    ? t('foundation.envMissing')
    : signedIn === null
      ? t('common.loading')
      : signedIn
        ? t('foundation.signedIn')
        : t('foundation.signedOut');

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        paddingHorizontal: size.screenGutter,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
      }}
    >
      <Crest size={112} />
      <AppText variant="h1" color={colors.green}>
        {t('app.name')}
      </AppText>
      <AppText variant="h3" color={colors.muted}>
        {t('foundation.title')}
      </AppText>
      <AppText variant="caption" color={colors.muted} style={{ textAlign: 'center' }}>
        {status}
      </AppText>
    </View>
  );
}
