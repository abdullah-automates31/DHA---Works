import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ErrorText, Field, FieldLabel, FormTitle, PrimaryButton, TextLink } from '@/components/AuthForm';
import { AuthScreen } from '@/components/AuthScreen';
import { authErrorKey } from '@/features/auth/errors';
import { isCompleteOtp, normalizeEmail, OTP_LENGTH, sanitizeOtp } from '@/features/auth/validation';
import { t } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fontFamily } from '@/theme';

const RESEND_SECONDS = 60;

// Step 2 of sign-in: the six-digit code from the email. This screen is not in the approved designs;
// it reuses the W01 frame and controls (see docs/OPEN-QUESTIONS.md). A good code creates the session and the
// root layout then moves to the signed-in area.
export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = normalizeEmail(params.email ?? '');

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Opened without an email (e.g. a stale deep link): back to the start.
  useEffect(() => {
    if (!email) router.replace('/sign-in');
  }, [email, router]);

  async function verify(value: string) {
    if (verifying) return;
    if (!isCompleteOtp(value)) {
      setError(t('auth.errors.invalidCode'));
      return;
    }
    setError(null);
    setNotice(null);
    setVerifying(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: value, type: 'email' });
    setVerifying(false);
    if (verifyError) setError(t(authErrorKey(verifyError)));
    // On success onAuthStateChange stores the session and the layout switches screens.
  }

  async function resend() {
    if (cooldown > 0) return;
    setError(null);
    setNotice(null);
    setCooldown(RESEND_SECONDS);
    const { error: sendError } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (sendError) {
      setError(t(authErrorKey(sendError)));
      return;
    }
    setNotice(t('auth.resent'));
  }

  return (
    <AuthScreen>
      <FormTitle>{t('auth.codeTitle')}</FormTitle>
      <Text style={styles.sent}>{t('auth.codeSent', { email })}</Text>
      <FieldLabel>{t('auth.codeLabel')}</FieldLabel>
      <Field
        value={code}
        onChangeText={(v) => {
          const next = sanitizeOtp(v);
          setCode(next);
          if (error) setError(null);
          if (next.length === OTP_LENGTH) void verify(next);
        }}
        placeholder={t('auth.codePlaceholder')}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        autoFocus
        maxLength={OTP_LENGTH + 2}
        style={styles.codeInput}
        accessibilityLabel={t('auth.codeLabel')}
        hasError={error !== null}
      />
      <ErrorText>{error}</ErrorText>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <PrimaryButton label={t('auth.verify')} onPress={() => void verify(code)} loading={verifying} />
      <TextLink
        label={cooldown > 0 ? t('auth.resendIn', { seconds: cooldown }) : t('auth.resend')}
        onPress={() => void resend()}
        disabled={cooldown > 0}
      />
      <TextLink label={t('auth.changeEmail')} onPress={() => router.back()} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  sent: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21, color: colors.signIn.fieldText },
  codeInput: { fontFamily: fontFamily.extrabold, fontSize: 22, letterSpacing: 6 },
  notice: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.green },
});
