import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthPhoneField, ErrorText, Field, FieldLabel, PrimaryButton, TextLink } from '@/components/AuthForm';
import { ChevronLeftIcon } from '@/components/icons';
import { OTP_CHANNEL, OTP_CHANNEL_NAME } from '@/features/auth/channel';
import { confirmPhoneChange, requestPhoneChange } from '@/features/auth/phoneChange';
import {
  formatNational,
  formatPhoneDisplay,
  isCompleteOtp,
  normalizePhone,
  OTP_LENGTH,
  sanitizeNationalInput,
  sanitizeOtp,
} from '@/features/auth/validation';
import { t } from '@/i18n';
import { useMyProfile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { colors, fontFamily } from '@/theme';

type Step = 'number' | 'code' | 'done';

// Change number (not in the approved designs; see docs/OPEN-QUESTIONS.md). Step 1: the new number. Step 2: the code
// that arrives on the NEW number. The server changes the sign-in number only after that code is confirmed, and a
// database trigger copies it to the profile (migration 0033); the app never writes the phone itself.
export default function ChangeNumberScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { state, refresh } = useMyProfile();
  const current = state.status === 'ready' ? state.profile?.phone ?? null : null;

  const [step, setStep] = useState<Step>('number');
  const [digits, setDigits] = useState('');
  const [newPhone, setNewPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/profile');
  }

  async function sendCode() {
    if (busy) return;
    const phone = normalizePhone(digits);
    if (!phone) {
      setError(t('auth.errors.invalidPhone'));
      return;
    }
    if (phone === current) {
      setError(t('changeNumber.errors.same'));
      return;
    }
    setError(null);
    setBusy(true);
    const result = await requestPhoneChange(supabase.auth, phone, OTP_CHANNEL);
    setBusy(false);
    if (!result.ok) {
      setError(t(result.key));
      return;
    }
    setNewPhone(phone);
    setCode('');
    setStep('code');
  }

  async function confirm(value: string) {
    if (busy || !newPhone) return;
    if (!isCompleteOtp(value)) {
      setError(t('auth.errors.invalidCode', { channel: OTP_CHANNEL_NAME }));
      return;
    }
    setError(null);
    setBusy(true);
    const result = await confirmPhoneChange(supabase.auth, newPhone, value);
    if (!result.ok) {
      setBusy(false);
      setError(t(result.key));
      return;
    }
    await refresh();
    setBusy(false);
    setStep('done');
  }

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={goBack} style={styles.back}>
          <ChevronLeftIcon size={22} color={colors.greenDark} />
        </Pressable>
        <Text style={styles.topTitle}>{t('changeNumber.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'number' ? (
          <>
            {current ? (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>{t('changeNumber.current')}</Text>
                <Text style={styles.cardValue}>{formatPhoneDisplay(current)}</Text>
              </View>
            ) : null}
            <Text style={styles.body}>{t('changeNumber.intro')}</Text>
            <FieldLabel>{t('changeNumber.newLabel')}</FieldLabel>
            <AuthPhoneField
              prefix={t('about.countryCode')}
              value={formatNational(digits)}
              onChangeText={(v) => {
                setDigits(sanitizeNationalInput(v));
                if (error) setError(null);
              }}
              placeholder={t('auth.phonePlaceholder')}
              keyboardType="phone-pad"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => void sendCode()}
              maxLength={12}
              accessibilityLabel={t('changeNumber.newLabel')}
              hasError={error !== null}
            />
            <ErrorText>{error}</ErrorText>
            <PrimaryButton label={t('changeNumber.sendCode')} onPress={() => void sendCode()} loading={busy} />
            <Text style={styles.hint}>{t('changeNumber.lostOld')}</Text>
          </>
        ) : null}

        {step === 'code' && newPhone ? (
          <>
            <Text style={styles.body}>
              {t('changeNumber.codeSent', { phone: formatPhoneDisplay(newPhone), channel: OTP_CHANNEL_NAME })}
            </Text>
            <FieldLabel>{t('auth.codeLabel')}</FieldLabel>
            <Field
              value={code}
              onChangeText={(v) => {
                const next = sanitizeOtp(v);
                setCode(next);
                if (error) setError(null);
                if (next.length === OTP_LENGTH) void confirm(next);
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
            <PrimaryButton label={t('changeNumber.confirm')} onPress={() => void confirm(code)} loading={busy} />
            <TextLink
              label={t('changeNumber.wrongNumber')}
              onPress={() => {
                setError(null);
                setStep('number');
              }}
            />
          </>
        ) : null}

        {step === 'done' && newPhone ? (
          <>
            <Text style={styles.doneTitle}>{t('changeNumber.doneTitle')}</Text>
            <Text style={styles.body}>{t('changeNumber.doneBody', { phone: formatPhoneDisplay(newPhone) })}</Text>
            <PrimaryButton label={t('changeNumber.done')} onPress={goBack} showArrow={false} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.ink },
  content: { paddingHorizontal: 20, paddingTop: 2, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 16, gap: 2 },
  cardLabel: { fontFamily: fontFamily.semibold, fontSize: 12, color: colors.muted },
  cardValue: { fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.ink },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 21, color: colors.ink },
  hint: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center', marginTop: 4 },
  codeInput: { fontFamily: fontFamily.extrabold, fontSize: 22, letterSpacing: 6 },
  doneTitle: { fontFamily: fontFamily.extrabold, fontSize: 22, color: colors.greenDark },
});
