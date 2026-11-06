// Labels and checks for the helpline log. The database repeats every check (migration 0041).
export const CALLER_ROLES = [
  { key: 'resident', label: 'Resident' },
  { key: 'worker', label: 'Worker' },
  { key: 'other', label: 'Other' },
] as const;

export const REASONS = [
  { key: 'question', label: 'Question' },
  { key: 'unsafe', label: 'Unsafe' },
  { key: 'cash_price', label: 'Cash and price' },
  { key: 'complaint', label: 'Complaint' },
] as const;

export const OUTCOMES = [
  { key: 'answered', label: 'Answered' },
  { key: 'advised', label: 'Advised' },
  { key: 'callback_pending', label: 'Callback pending' },
] as const;

export type CallerRole = (typeof CALLER_ROLES)[number]['key'];
export type Reason = (typeof REASONS)[number]['key'];
export type Outcome = (typeof OUTCOMES)[number]['key'];

export const isCallerRole = (v: unknown): v is CallerRole => CALLER_ROLES.some((r) => r.key === v);
export const isReason = (v: unknown): v is Reason => REASONS.some((r) => r.key === v);
export const isOutcome = (v: unknown): v is Outcome => OUTCOMES.some((r) => r.key === v);

export const PHONE_PATTERN = /^[0-9+() -]{5,20}$/;

export function reasonLabel(key: string): string {
  return REASONS.find((r) => r.key === key)?.label ?? key;
}

/** What the table shows as the outcome: a linked case wins over the chosen outcome. */
export function outcomeChip(c: { outcome: string; reportCode: string | null; callbackDoneAt: string | null }): { label: string; tone: 'ok' | 'red' | 'pur' | 'gray' } {
  if (c.reportCode) return { label: 'Case opened', tone: 'pur' };
  if (c.outcome === 'callback_pending') return c.callbackDoneAt ? { label: 'Call-back done', tone: 'ok' } : { label: 'Callback pending', tone: 'red' };
  return { label: c.outcome === 'advised' ? 'Advised' : 'Answered', tone: 'ok' };
}

export type LogCheck = { ok: true } | { ok: false; hint: string };

export function checkCall(v: { name: string; phone: string; role: string; reason: string; outcome: string; notes: string }): LogCheck {
  if (v.name.trim().length < 2) return { ok: false, hint: "Enter the caller's name." };
  if (!PHONE_PATTERN.test(v.phone.trim())) return { ok: false, hint: "Enter the caller's phone number (digits, 5 to 20 characters)." };
  if (!isCallerRole(v.role)) return { ok: false, hint: 'Choose who is calling.' };
  if (!isReason(v.reason)) return { ok: false, hint: 'Choose the reason for the call.' };
  if (!isOutcome(v.outcome)) return { ok: false, hint: 'Choose the outcome.' };
  if (v.notes.length > 1000) return { ok: false, hint: 'The notes are too long (1000 characters at most).' };
  return { ok: true };
}
