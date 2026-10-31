import { useEffect, useRef } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '@/i18n';
import { colors, fontFamily } from '@/theme';

import { AuthHero } from './AuthHero';

// Shared frame for sign-in and the code step: green hero on top, form below, terms at the bottom.
export function AuthScreen({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollViewInstance>(null);

  // The hero is tall, so with the keyboard open the field and button sit below the visible area.
  // Scroll to the bottom once the keyboard shows so the hero moves off and the form stays in view.
  useEffect(() => {
    const event = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const sub = Keyboard.addListener(event, () => {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => sub.remove();
  }, []);

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        bounces={false}
      >
        <AuthHero />
        <View style={[styles.body, { paddingBottom: 32 + insets.bottom }]}>
          <View style={styles.form}>{children}</View>
          <Text style={styles.terms}>{t('auth.terms')}</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.signIn.paper },
  scroll: { flexGrow: 1 },
  body: { flex: 1, paddingHorizontal: 26, paddingTop: 30, gap: 24 },
  form: { gap: 12 },
  terms: {
    marginTop: 'auto',
    marginHorizontal: 6,
    textAlign: 'center',
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: colors.signIn.footnote,
  },
});
