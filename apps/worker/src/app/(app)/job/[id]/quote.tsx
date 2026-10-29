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
  DAY_COUNT,
  WINDOW_STARTS,
  amountDigits,
  buildSubmitArgs,
  computeTotal,
  dayLabel,
  defaultVisit,
  isQuoteValid,
  isWindowAvailable,
  parseAmount,
  validateQuote,
  visitText,
  windowLabel,
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

      {job && job.standing === 'interested' ? <QuoteForm jobId={job.id} onSent={() => router.replace(jobHref(job.id))} /> : null}
    </View>
  );
}

function QuoteForm({ jobId, onSent }: { jobId: string; onSent: () => void }) {
  const now = new Date();
  const [input, setInput] = useState<QuoteInput>({ labour: '', materials: '', materialsNote: '', other: '', otherNote: '' });
  const [visit, setVisit] = useState(() => defaultVisit(new Date()));
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
  const materials = parseAmount(input.materials);
  const other = parseAmount(input.other);
  const total = computeTotal(input);
  const windowOk = isWindowAvailable(now, visit.day, visit.window);

  function chooseDay(day: number) {
    // Moving to today can leave the chosen window in the past: pick the first one still open.
    const stillOpen = isWindowAvailable(new Date(), day, visit.window);
    const first = WINDOW_STARTS.findIndex((_, w) => isWindowAvailable(new Date(), day, w));
    setVisit({ day, window: stillOpen ? visit.window : Math.max(first, 0) });
    if (error) setError(null);
  }

  async function onSend() {
    if (sending) return;
    setTouched(true);
    if (!valid || !windowOk) {
      if (!windowOk) setError(t('quote.errors.past'));
      return;
    }
    setError(null);
    setSending(true);
    const result = await sendQuote(
      { submitQuote: (args) => supabase.rpc('submit_quote', args) },
      buildSubmitArgs(jobId, input, new Date(), visit.day, visit.window),
    );
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
          <View style={styles.pair}>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label={t('quote.labour')}
                value={input.labour}
                onChangeText={(v) => set({ labour: amountDigits(v) })}
                keyboardType="number-pad"
                maxLength={7}
              />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label={t('quote.materials')}
                value={input.materials}
                onChangeText={(v) => set({ materials: amountDigits(v) })}
                keyboardType="number-pad"
                maxLength={7}
              />
            </View>
          </View>

          <LabeledInput
            label={t('quote.materialsList')}
            value={input.materialsNote}
            onChangeText={(v) => set({ materialsNote: v })}
            placeholder={t('quote.materialsListPlaceholder')}
            maxLength={200}
          />

          <View style={styles.pair}>
            <View style={{ width: 112 }}>
              <LabeledInput
                label={t('quote.other')}
                value={input.other}
                onChangeText={(v) => set({ other: amountDigits(v) })}
                keyboardType="number-pad"
                maxLength={7}
              />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledInput
                label={t('quote.otherNote')}
                value={input.otherNote}
                onChangeText={(v) => set({ otherNote: v })}
                placeholder={t('quote.otherNotePlaceholder')}
                maxLength={120}
                invalid={errors.otherNote === true}
              />
            </View>
          </View>
          {errors.otherNote ? <Text style={styles.noteError}>{t('quote.errors.otherNoteHint')}</Text> : null}

          <View style={{ gap: 6 }}>
            <Text style={styles.label}>{t('quote.visitDay')}</Text>
            <View style={styles.pills}>
              {Array.from({ length: DAY_COUNT }, (_, day) => (
                <Choice key={day} label={dayLabel(now, day)} on={visit.day === day} onPress={() => chooseDay(day)} />
              ))}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={styles.label}>{t('quote.visitTime')}</Text>
            <View style={styles.pills}>
              {WINDOW_STARTS.map((_, window) => (
                <Choice
                  key={window}
                  label={windowLabel(window)}
                  on={visit.window === window}
                  disabled={!isWindowAvailable(now, visit.day, window)}
                  onPress={() => {
                    setVisit({ day: visit.day, window });
                    if (error) setError(null);
                  }}
                />
              ))}
            </View>
          </View>

          <View style={styles.preview} accessibilityLabel={t('quote.preview')}>
            <Text style={styles.previewTitle}>{t('quote.preview')}</Text>
            <Line label={t('quote.labourLine')} value={formatRupees(labour)} />
            {materials > 0 ? (
              <Line
                label={input.materialsNote.trim() ? t('quote.materialsLineWith', { list: input.materialsNote.trim() }) : t('quote.materialsLine')}
                value={formatRupees(materials)}
              />
            ) : null}
            {other > 0 ? (
              <Line label={t('quote.otherLineWith', { note: input.otherNote.trim() })} value={formatRupees(other)} />
            ) : null}
            <View style={styles.rule} />
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{t('quote.total')}</Text>
              <Text style={styles.totalValue}>{formatRupees(total)}</Text>
            </View>
            <Text style={styles.visit}>{t('quote.visit', { when: visitText(now, visit.day, visit.window) })}</Text>
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
  noteError: { fontFamily: fontFamily.bold, fontSize: 12, color: '#C0392B', marginTop: -4 },
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
