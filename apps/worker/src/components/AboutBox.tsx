import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ABOUT_MAX, limitAbout } from '@/features/work/rules';
import { t } from '@/i18n';
import { colors, fontFamily } from '@/theme';

// The written "about you" box used on the application (Your work) and on Profile > Introduction.
type Props = { label: string; hint: string; placeholder: string; value: string; onChange: (text: string) => void };

export function AboutBox({ label, hint, placeholder, value, onChange }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChange(limitAbout(text))}
        placeholder={placeholder}
        placeholderTextColor="#8A978F"
        multiline
        textAlignVertical="top"
        maxLength={ABOUT_MAX}
        style={styles.input}
      />
      <Text style={styles.counter}>{t('introduction.counter', { count: value.length, max: ABOUT_MAX })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.muted },
  hint: { fontFamily: fontFamily.medium, fontSize: 12, color: colors.muted, marginTop: -4 },
  input: {
    minHeight: 110,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#D5DDD8',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: fontFamily.medium,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
  },
  counter: { alignSelf: 'flex-end', fontFamily: fontFamily.medium, fontSize: 11, color: colors.muted },
});
