import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/AuthForm';
import { ChevronLeftIcon } from '@/components/icons';
import { BottomBar, FieldError, LabeledInput } from '@/components/onboarding';
import { formatRupees } from '@/features/home/format';
import { jobHref } from '@/features/job/routes';
import { useJob } from '@/features/job/useJob';
import {
  amountDigits,
  buildSubmitArgs,
  ITEM_NAME_MAX,
  MAX_ITEMS,
  computeTotal,
  isQuoteValid,
  materialsTotal,
  parseAmount,
  validateQuote,
  type MaterialItem,
  type QuoteInput,
} from '@/features/quote/rules';
import { sendQuote } from '@/features/quote/submit';
import { t } from '@/i18n';
import { supabase } from '@/lib/supabase';
import { colors, fontFamily } from '@/theme';

// W10 Create quote (worker/screens/w-quote.dc.html). The worker enters labour, materials (list optional), an
// optional extra cost with its reason, and picks a visit day and a 2-hour window. The total shown is a preview:
// the database computes the real total from the amounts and re-checks every rule when the quote is sent.
// A sent quote is final (revisions are MVP 2). The mock's "Agree the price over a call" line is not used: there is
// no contact before a quote is accepted (docs/UI-UX.md section 8).
export default function QuoteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, reload } = useJob(id ?? '');
  const job = state.status === 'ready' ? state.job : null;

  const goBack = () => (router.canGoBack() ? router.back() : router.replace(jobHref(id ?? '')));

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={goBack} style={styles.back}>
          <ChevronLeftIcon size={22} color={colors.greenDark} />
        </Pressable>
        <Text style={styles.topTitle}>{t('quote.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {state.status === 'loading' ? <ActivityIndicator color={colors.green} style={{ marginTop: 48 }} /> : null}

      {state.status === 'unavailable' ? (
        <Notice title={t('job.unavailableTitle')} body={t('job.unavailableBody')}>
          <PrimaryButton label={t('job.backToJobs')} onPress={() => router.replace('/open-jobs')} showArrow={false} />
        </Notice>
      ) : null}

      {state.status === 'error' ? (
        <Notice title={t('job.loadFailedTitle')} body={t('job.loadFailedBody')}>
          <PrimaryButton label={t('common.retry')} onPress={() => void reload()} showArrow={false} />
        </Notice>
      ) : null}

      {job && job.standing === 'quoted' ? (
        <Notice title={t('quote.alreadyTitle')} body={t('quote.alreadyBody')}>
          <PrimaryButton label={t('quote.backToJob')} onPress={() => router.replace(jobHref(job.id))} showArrow={false} />
        </Notice>
      ) : null}

      {job && job.standing === 'closed' ? (
        <Notice title={t('job.closedTitle')} body={t('job.closedBody')}>
          <PrimaryButton label={t('job.backToJobs')} onPress={() => router.replace('/open-jobs')} showArrow={false} />
        </Notice>
      ) : null}

      {job && job.standing === 'none' ? (
        <Notice title={t('quote.needInterestTitle')} body={t('quote.needInterestBody')}>
          <PrimaryButton label={t('quote.backToJob')} onPress={() => router.replace(jobHref(job.id))} showArrow={false} />
        </Notice>
      ) : null}

      {job && job.standing === 'interested' ? <QuoteForm jobId={job.id} when={job.when} onSent={() => (router.canGoBack() ? router.back() : router.replace(jobHref(job.id)))} /> : null}
    </View>
  );
}

function QuoteForm({ jobId, when, onSent }: { jobId: string; when: string; onSent: () => void }) {
  const [input, setInput] = useState<QuoteInput>({ labour: '', withMaterials: false, items: [{ name: '', price: '' }] });
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<QuoteInput>) => {
    setInput((current) => ({ ...current, ...patch }));
    if (error) setError(null);
  };

  const errors = validateQuote(input);
  const valid = isQuoteValid(input);
  const labour = parseAmount(input.labour);
  const materials = materialsTotal(input);
  const total = computeTotal(input);

  const setItem = (index: number, patch: Partial<MaterialItem>) =>
    set({ items: input.items.map((item, n) => (n === index ? { ...item, ...patch } : item)) });
  const addItem = () => input.items.length < MAX_ITEMS && set({ items: [...input.items, { name: '', price: '' }] });
  const removeItem = (index: number) => {
    const rest = input.items.filter((_, n) => n !== index);
    set({ items: rest.length > 0 ? rest : [{ name: '', price: '' }] });
  };

  async function onSend() {
    if (sending) return;
    setTouched(true);
    if (!valid) return;
    setError(null);
    setSending(true);
    const result = await sendQuote({ submitQuote: (args) => supabase.rpc('submit_quote', args) }, buildSubmitArgs(jobId, input));
    setSending(false);
    if (result.ok || result.key === 'quote.errors.alreadySent') {
      onSent(); // the quote exists either way; the job screen shows "Quote sent"
      return;
    }
    setError(t(result.key));
  }

  return (
    <>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
          <LabeledInput
            label={t('quote.labour')}
            value={input.labour}
            onChangeText={(v) => set({ labour: amountDigits(v) })}
            keyboardType="number-pad"
            maxLength={7}
          />

          <View style={{ gap: 6 }}>
            <Text style={styles.label}>{t('quote.materialsToggle')}</Text>
            <View style={styles.pills}>
              <Choice label={t('quote.withMaterials')} on={input.withMaterials} onPress={() => set({ withMaterials: true })} />
              <Choice label={t('quote.withoutMaterials')} on={!input.withMaterials} onPress={() => set({ withMaterials: false })} />
            </View>
          </View>

          {input.withMaterials ? (
            <View style={styles.items}>
              <Text style={styles.label}>{t('quote.materialsList')}</Text>
              {input.items.map((item, index) => (
                <View key={index} style={styles.itemRow}>
                  <View style={{ flex: 1 }}>
                    <LabeledInput
                      label={t('quote.itemName')}
                      value={item.name}
                      onChangeText={(v) => setItem(index, { name: v.slice(0, ITEM_NAME_MAX) })}
                      placeholder={t('quote.itemNamePlaceholder')}
                      maxLength={ITEM_NAME_MAX}
                      invalid={touched && errors.items === true && item.name.trim() === '' && parseAmount(item.price) > 0}
                    />
                  </View>
                  <View style={{ width: 104 }}>
                    <LabeledInput
                      label={t('quote.itemPrice')}
                      value={item.price}
                      onChangeText={(v) => setItem(index, { price: amountDigits(v) })}
                      keyboardType="number-pad"
                      maxLength={7}
                      invalid={touched && errors.items === true && item.name.trim() !== '' && parseAmount(item.price) === 0}
                    />
                  </View>
                  {input.items.length > 1 ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={t('quote.removeItem')} onPress={() => removeItem(index)} style={styles.remove}>
                      <Text style={styles.removeText}>×</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
              {input.items.length < MAX_ITEMS ? (
                <Pressable accessibilityRole="button" onPress={addItem} style={styles.addItem}>
                  <Text style={styles.addItemText}>{t('quote.addItem')}</Text>
                </Pressable>
              ) : null}
              <View style={styles.itemsTotal}>
                <Text style={styles.label}>{t('quote.materialsAuto')}</Text>
                <Text style={styles.itemsTotalValue}>{formatRupees(materials)}</Text>
              </View>
              {touched && errors.items ? <FieldError>{t('quote.errors.itemsHint')}</FieldError> : null}

              <Text style={styles.billHint}>{t('quote.billLater')}</Text>
            </View>
          ) : null}

          {when ? (
            <View style={styles.visitBox}>
              <Text style={styles.visitFixed}>{t('quote.visitFixed', { when })}</Text>
              <Text style={styles.billHint}>{t('quote.visitFixedHint')}</Text>
            </View>
          ) : null}

          <View style={styles.preview} accessibilityLabel={t('quote.preview')}>
            <Text style={styles.previewTitle}>{t('quote.preview')}</Text>
            <Line label={t('quote.labourLine')} value={formatRupees(labour)} />
            {materials > 0 ? <Line label={t('quote.materialsLine')} value={formatRupees(materials)} /> : null}
            <View style={styles.rule} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('quote.total')}</Text>
              <Text style={styles.totalValue}>{formatRupees(total)}</Text>
            </View>
            {when ? <Text style={styles.visit}>{t('quote.visitFixed', { when })}</Text> : null}
          </View>

          <Text style={styles.fine}>{t('quote.fine')}</Text>
          {touched && errors.total ? <FieldError>{t('quote.errors.totalHint')}</FieldError> : null}
          {error ? <FieldError>{error}</FieldError> : null}
        </ScrollView>
        <BottomBar hideArrow label={t('quote.send')} onPress={() => void onSend()} loading={sending} disabled={!valid} />
      </KeyboardAvoidingView>
    </>
  );
}

function Choice({ label, on, disabled, onPress }: { label: string; on: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled: Boolean(disabled) }}
      onPress={disabled ? undefined : onPress}
      style={[styles.pill, on && styles.pillOn, disabled && { opacity: 0.4 }]}
    >
      <Text style={[styles.pillText, on && { color: '#fff' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={styles.lineValue}>{value}</Text>
    </View>
  );
}

function Notice({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeBody}>{body}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  topTitle: { flex: 1, textAlign: 'center', fontFamily: fontFamily.extrabold, fontSize: 18, color: colors.ink },
  content: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 24, gap: 10 },
  pair: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  label: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.muted },
  items: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 8 },
  itemRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  remove: { width: 36, height: 44, marginTop: 20, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontFamily: fontFamily.extrabold, fontSize: 22, color: colors.muted },
  addItem: { height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  addItemText: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.greenDark },
  visitBox: { backgroundColor: colors.mint, borderRadius: 14, padding: 12, gap: 4 },
  visitFixed: { fontFamily: fontFamily.extrabold, fontSize: 14, color: colors.greenDark },
  billHint: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, color: colors.muted },
  itemsTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemsTotalValue: { fontFamily: fontFamily.extrabold, fontSize: 14, color: colors.ink },
  pills: { flexDirection: 'row', gap: 6 },
  pill: { flex: 1, minWidth: 0, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  pillOn: { backgroundColor: colors.green },
  pillText: { fontFamily: fontFamily.bold, fontSize: 13, color: colors.ink },
  preview: { backgroundColor: '#fff', borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, gap: 6, borderWidth: 1.5, borderColor: 'rgba(10,61,40,0.18)' },
  previewTitle: { fontFamily: fontFamily.bold, fontSize: 12, letterSpacing: 0.6, color: colors.muted },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  lineLabel: { flex: 1, fontFamily: fontFamily.regular, fontSize: 13, color: colors.ink },
  lineValue: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.ink },
  rule: { height: 1, backgroundColor: '#D4D9D5' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontFamily: fontFamily.extrabold, fontSize: 13, color: colors.ink },
  totalValue: { fontFamily: fontFamily.extrabold, fontSize: 20, color: colors.ink },
  visit: { fontFamily: fontFamily.bold, fontSize: 12, color: colors.muted },
  fine: { fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 17, color: colors.muted },
  notice: { margin: 20, backgroundColor: colors.mint, borderRadius: 18, padding: 16, gap: 10 },
  noticeTitle: { fontFamily: fontFamily.extrabold, fontSize: 16, color: colors.greenDark },
  noticeBody: { fontFamily: fontFamily.semibold, fontSize: 13, lineHeight: 19, color: colors.muted },
});
