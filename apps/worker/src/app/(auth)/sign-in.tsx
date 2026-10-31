import { useRouter } from 'expo-router';
import { useState } from 'react';

import { AuthPhoneField, ErrorText, FieldLabel, FormTitle, PrimaryButton } from '@/components/AuthForm';
import { AuthScreen } from '@/components/AuthScreen';
import { OTP_CHANNEL } from '@/features/auth/channel';
import { requestPhoneOtp } from '@/features/auth/otp';
import { formatNational, normalizePhone, sanitizeNationalInput } from '@/features/auth/validation';
import { t } from '@/i18n';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

// W01 Sign in. The worker enters a Pakistani mobile; the six-digit code is sent on WhatsApp.
export default function SignInScreen() {
  const router = useRouter();
  const [digits, setDigits] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onContinue() {
    if (loading) return;
    if (!env.isConfigured) {
      setError(t('foundation.envMissing'));
      return;
    }
    const phone = normalizePhone(digits);
    if (!phone) {
      setError(t('auth.errors.invalidPhone'));
      return;
    }
    setError(null);
    setLoading(true);
    const result = await requestPhoneOtp(supabase.auth, phone, OTP_CHANNEL);
    setLoading(false);
    if (!result.ok) {
      setError(t(result.key));
      return;
    }
    router.push({ pathname: '/verify', params: { phone } });
  }

  return (
    <AuthScreen>
      <FormTitle>{t('auth.signInTitle')}</FormTitle>
      <FieldLabel>{t('auth.phoneLabel')}</FieldLabel>
      <AuthPhoneField
        prefix={t('about.countryCode')}
        value={formatNational(digits)}
        onChangeText={(v) => {
          setDigits(sanitizeNationalInput(v));
          if (error) setError(null);
        }}
        placeholder={t('auth.phonePlaceholder')}
        autoComplete="tel"
        textContentType="telephoneNumber"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={onContinue}
        maxLength={12}
        accessibilityLabel={t('auth.phoneLabel')}
        hasError={error !== null}
      />
      <ErrorText>{error}</ErrorText>
      <PrimaryButton label={t('auth.continueWithWhatsApp')} onPress={onContinue} loading={loading} />
    </AuthScreen>
  );
}
