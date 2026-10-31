import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ErrorText, Field, FieldLabel, FormTitle, PrimaryButton, TextLink } from '@/components/AuthForm';
import { AuthScreen } from '@/components/AuthScreen';
import { OTP_CHANNEL, OTP_CHANNEL_NAME } from '@/features/auth/channel';
import { requestPhoneOtp, verifyPhoneOtp } from '@/features/auth/otp';
import { isCompleteOtp, maskPhone, normalizePhone, OTP_LENGTH, sanitizeOtp } from '@/features/auth/validation';
import { t } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fontFamily } from '@/theme';

const RESEND_SECONDS = 60;

// Step 2 of sign-in: the six-digit code sent on WhatsApp. This screen is not in the approved designs;
// it reuses the W01 frame and controls (see docs/OPEN-QUESTIONS.md). A good code creates the session and the
// root layout then moves to the signed-in area.
export default function VerifyScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = normalizePhone(params.phone ?? '');

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

  // Opened without a phone (e.g. a stale deep link): back to the start.
  useEffect(() => {
    if (!phone) router.replace('/sign-in');
  }, [phone, router]);

  async function verify(value: string) {
    if (!phone || verifying) return;
    if (!isCompleteOtp(value)) {
      setError(t('auth.errors.invalidCode', { channel: OTP_CHANNEL_NAME }));
      return;
    }
    setError(null);
    setNotice(null);
    setVerifying(true);
    const result = await verifyPhoneOtp(supabase.auth, phone, value);
    setVerifying(false);
    if (!result.ok) setError(t(result.key));
    // On success onAuthStateChange stores the session and the layout switches screens.
  }

  async function resend() {
    if (!phone || cooldown > 0) return;
    setError(null);
    setNotice(null);
    setCooldown(RESEND_SECONDS);
    const result = await requestPhoneOtp(supabase.auth, phone, OTP_CHANNEL);
    if (!result.ok) {
      setError(t(result.key));
      return;
    }
    setNotice(t('auth.resent', { channel: OTP_CHANNEL_NAME }));
  }

  return (
    <AuthScreen>
      <FormTitle>{t('auth.codeTitle')}</FormTitle>
      <Text style={styles.sent}>{t('auth.codeSent', { phone: maskPhone(phone ?? ''), channel: OTP_CHANNEL_NAME })}</Text>
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
      <TextLink label={t('auth.changePhone')} onPress={() => router.back()} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  sent: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21, color: colors.signIn.fieldText },
  codeInput: { fontFamily: fontFamily.extrabold, fontSize: 22, letterSpacing: 6 },
  notice: { fontFamily: fontFamily.semibold, fontSize: 13, color: colors.green },
});
