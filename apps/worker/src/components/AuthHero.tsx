import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { colors, fontFamily } from '@/theme';

import { Crest } from './Crest';
import { CashIcon, PinIcon, ShieldCheckIcon } from './icons';

// Green top block of the sign-in screen (W01): crest, brand, headline, body and three chips.
// Values come from worker/screens/Main.dc.html; the mock's 54px top padding includes a ~40px status bar,
// so the real safe-area inset replaces that part.
export function AuthHero() {
  const insets = useSafeAreaInsets();
  const chips = [
    { Icon: CashIcon, label: t('auth.chipPrice') },
    { Icon: ShieldCheckIcon, label: t('auth.chipVerified') },
    { Icon: PinIcon, label: t('auth.chipPhases') },
  ];

  return (
    <View style={[styles.hero, { paddingTop: insets.top + 14, height: 328 + insets.top }]}>
      <View style={styles.ring} />
      <View style={styles.brandRow}>
        <Crest size={54} />
        <View>
          <Text style={styles.brand}>
            DHA <Text style={styles.gold}>Works</Text>
          </Text>
          <Text style={styles.brandSub}>{t('auth.brandSub')}</Text>
        </View>
      </View>
      <Text style={styles.headline}>
        {t('auth.headlineLead')}
        <Text style={styles.gold}>{t('auth.headlineAccent')}</Text>
      </Text>
      <Text style={styles.body}>{t('auth.heroBody')}</Text>
      <View style={styles.chips}>
        {chips.map(({ Icon, label }) => (
          <View key={label} style={styles.chip}>
            <Icon size={15} color={colors.goldOnDark} strokeWidth={2.3} />
            <Text style={styles.chipText} numberOfLines={1}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.signIn.hero,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    paddingHorizontal: 28,
    overflow: 'hidden',
  },
  ring: {
    position: 'absolute',
    right: -90,
    top: -120,
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 1.5,
    borderColor: colors.signIn.heroRing,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { fontFamily: fontFamily.extrabold, fontSize: 18, lineHeight: 20, letterSpacing: -0.18, color: '#fff' },
  gold: { color: colors.goldOnDark },
  brandSub: { fontFamily: fontFamily.semibold, fontSize: 11.5, color: colors.signIn.heroSubtitle, marginTop: 3 },
  headline: {
    marginTop: 32,
    fontFamily: fontFamily.extrabold,
    fontSize: 32,
    lineHeight: 36,
    letterSpacing: -0.4,
    color: '#fff',
  },
  body: {
    marginTop: 12,
    fontFamily: fontFamily.regular,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.signIn.heroBody,
  },
  chips: {
    position: 'absolute',
    left: 28,
    right: 28,
    bottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  chip: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: colors.signIn.chipBg,
    borderWidth: 1,
    borderColor: colors.signIn.chipBorder,
  },
  chipText: { fontFamily: fontFamily.bold, fontSize: 11.5, color: '#fff', flexShrink: 1 },
});
