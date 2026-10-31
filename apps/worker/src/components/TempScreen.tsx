import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/AppText';
import { PrimaryButton, TextLink } from '@/components/AuthForm';
import { Crest } from '@/components/Crest';
import { maskPhone } from '@/features/auth/validation';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';

// Stand-in for screens that are not designed or built yet. Wording is ours (docs/OPEN-QUESTIONS.md).
// It always offers sign out, so nobody is ever stuck on a screen with no way out.
export function TempScreen({
  title,
  body,
  reason,
  reasonLabel,
  action,
  noSignOut,
}: {
  title: string;
  body: string;
  reason?: string | null;
  reasonLabel?: string;
  action?: { label: string; onPress: () => void };
  noSignOut?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const phone = session?.user.phone ?? '';
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      <Crest size={96} />
      <AppText variant="h2" color={colors.greenDark} style={styles.center}>
        {title}
      </AppText>
      <AppText variant="small" color={colors.signIn.fieldText} style={styles.center}>
        {body}
      </AppText>
      {reason ? (
        <View style={styles.reason}>
          <AppText variant="caption" color={colors.muted}>
            {reasonLabel}
          </AppText>
          <AppText variant="bodyBold" color={colors.ink}>
            {reason}
          </AppText>
        </View>
      ) : null}
      <AppText variant="caption" color={colors.signIn.footnote} style={styles.center}>
        {t('temp.signedInAs', { phone: phone ? maskPhone(phone) : '' })}
      </AppText>
      <View style={styles.buttons}>
        {action ? <PrimaryButton label={action.label} onPress={action.onPress} showArrow={false} /> : null}
        {noSignOut ? null : <TextLink label={t('temp.signOut')} onPress={() => void supabase.auth.signOut()} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 26 },
  center: { textAlign: 'center' },
  reason: { alignSelf: 'stretch', backgroundColor: colors.mint, borderRadius: 14, padding: 14, gap: 4 },
  buttons: { alignSelf: 'stretch', gap: 16, marginTop: 12 },
});
