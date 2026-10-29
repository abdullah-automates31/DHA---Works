import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ErrorText, Field, FieldLabel, FormTitle, PrimaryButton } from '@/components/AuthForm';
import { AuthScreen } from '@/components/AuthScreen';
import { MailIcon } from '@/components/icons';
import { authErrorKey } from '@/features/auth/errors';
import { isValidEmail, normalizeEmail } from '@/features/auth/validation';
import { t } from '@/i18n';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

// W01 Sign in. Email only for now; a six-digit code is emailed and entered on the next screen.
export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onContinue() {
    if (loading) return;
    if (!env.isConfigured) {
      setError(t('foundation.envMissing'));
      return;
    }
    if (!isValidEmail(email)) {
      setError(t('auth.errors.invalidEmail'));
      return;
    }
    setError(null);
    setLoading(true);
    const clean = normalizeEmail(email);
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (sendError) {
      setError(t(authErrorKey(sendError)));
      return;
    }
    router.push({ pathname: '/verify', params: { email: clean } });
  }

  return (
    <AuthScreen>
      <FormTitle>{t('auth.signInTitle')}</FormTitle>
      <FieldLabel>{t('auth.emailLabel')}</FieldLabel>
      <Field
        icon={<MailIcon size={22} color={colors.signIn.fieldText} />}
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          if (error) setError(null);
        }}
        placeholder={t('auth.emailPlaceholder')}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={onContinue}
        accessibilityLabel={t('auth.emailLabel')}
        hasError={error !== null}
      />
      <ErrorText>{error}</ErrorText>
      <PrimaryButton label={t('auth.continueWithEmail')} onPress={onContinue} loading={loading} />
    </AuthScreen>
  );
}
