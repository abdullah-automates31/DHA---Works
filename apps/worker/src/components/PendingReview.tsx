import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextLink } from '@/components/AuthForm';
import { formatSent } from '@/features/profile/sent';
import { useHelpline } from '@/features/profile/useHelpline';
import { t } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fontFamily } from '@/theme';

import { CheckIcon, ClockIcon, PhoneIcon } from './icons';

// W04 Application under review (worker/screens/w-pending.dc.html). The helpline card is part of the design but
// stays hidden until DHA approves the number (app_settings), as decided. Sign out is our addition.
export function PendingReview({ sentAt }: { sentAt: string | null }) {
  const insets = useSafeAreaInsets();
  const helpline = useHelpline();
  const sent = formatSent(sentAt);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 24 }]}>
      <View style={styles.iconTile}>
        <ClockIcon size={36} color="#5C4300" />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={styles.title}>{t('pending.title')}</Text>
        <Text style={styles.body}>{t('pending.body')}</Text>
      </View>

      <View style={styles.card}>
        <Step state="done" title={t('pending.sent')} sub={sent} showLine lineGreen />
        <Step state="current" title={t('pending.review')} sub={t('pending.inProgress')} subGreen showLine />
        <Step state="todo" title={t('pending.areas')} />
      </View>

      {helpline ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void Linking.openURL(`tel:${helpline}`)}
          style={styles.help}
        >
          <View style={styles.helpIcon}>
            <PhoneIcon size={22} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.helpTitle}>{t('pending.help')}</Text>
            <Text style={styles.helpSub}>{t('pending.helpCall', { number: helpline })}</Text>
          </View>
        </Pressable>
      ) : null}

      <View style={{ marginTop: 'auto', paddingBottom: insets.bottom + 24 }}>
        <TextLink label={t('temp.signOut')} onPress={() => void supabase.auth.signOut()} />
      </View>
    </View>
  );
}

function Step({
  state,
  title,
  sub,
  subGreen,
  showLine,
  lineGreen,
}: {
  state: 'done' | 'current' | 'todo';
  title: string;
  sub?: string;
  subGreen?: boolean;
  showLine?: boolean;
  lineGreen?: boolean;
}) {
  return (
    <View style={styles.step}>
      <View style={{ alignItems: 'center' }}>
        <View style={[styles.dot, state === 'done' && { backgroundColor: colors.green }, state === 'current' && { backgroundColor: colors.gold }]}>
          {state === 'done' ? <CheckIcon size={14} color="#fff" strokeWidth={3} /> : null}
        </View>
        {showLine ? <View style={[styles.line, lineGreen && { backgroundColor: colors.green }]} /> : null}
      </View>
      <View style={{ flex: 1, paddingTop: state === 'current' ? 2 : 0 }}>
        <Text style={[styles.stepTitle, state === 'todo' && { color: colors.muted }]}>{title}</Text>
        {sub ? <Text style={[styles.stepSub, subGreen && { color: colors.green, fontFamily: fontFamily.extrabold }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, gap: 16 },
  iconTile: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#F6E7B4', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fontFamily.extrabold, fontSize: 28, lineHeight: 32, letterSpacing: -0.28, color: colors.ink },
  body: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20, color: colors.muted },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#D5E0D9', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  line: { width: 2, height: 28, backgroundColor: '#D5E0D9' },
  stepTitle: { fontFamily: fontFamily.extrabold, fontSize: 13, lineHeight: 17, color: colors.ink },
  stepSub: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.muted },
  help: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.mint, borderRadius: 18, padding: 14 },
  helpIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  helpTitle: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.ink },
  helpSub: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.muted },
});
