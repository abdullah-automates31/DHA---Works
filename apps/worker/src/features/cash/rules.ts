// Pure rules for W13 Record cash (unit tested with node --test). The database is the authority (record_cash_worker
// checks the status, the amount and the reason, and settles the job); these rules only guide the form.
import { amountDigits, parseAmount } from '../quote/rules.ts';

// The reasons offered in the design, sent to the database as the explanation text.
export const CASH_REASONS = ['Extra work was needed', 'Customer asked for extra work', 'I gave a discount', 'Something else'] as const;
export type CashMode = 'full' | 'different';

export type CashInput = { mode: CashMode; amount: string; reason: string | null };

export type CashCheck =
  | { ok: true; amount: number; reason: string | null }
  | { ok: false; missing: 'amount' | 'reason' };

/**
 * Full amount: exactly what the quote agreed, no reason. Different amount: a whole-rupee amount is required (zero
 * is allowed, for example nothing was paid) and a reason unless the amount happens to equal the agreed one.
 */
export function checkCash(input: CashInput, agreed: number): CashCheck {
  if (input.mode === 'full') return { ok: true, amount: agreed, reason: null };
  if (amountDigits(input.amount) === '') return { ok: false, missing: 'amount' };
  const amount = parseAmount(input.amount);
  if (amount === agreed) return { ok: true, amount, reason: null };
  const reason = (input.reason ?? '').trim();
  if (reason === '' || !(CASH_REASONS as readonly string[]).includes(reason)) return { ok: false, missing: 'reason' };
  return { ok: true, amount, reason };
}

/** More than the quote: the amount field turns red and the warning gets the stronger wording (as in the design). */
export function isMoreThanQuote(input: CashInput, agreed: number): boolean {
  return input.mode === 'different' && amountDigits(input.amount) !== '' && parseAmount(input.amount) > agreed;
}

// ---------------------------------------------------------------- the call
export type CashErrorKey =
  | 'cash.errors.notReady'
  | 'cash.errors.amount'
  | 'cash.errors.reason'
  | 'cash.errors.alreadyRecorded'
  | 'cash.errors.network'
  | 'cash.errors.generic';

type Err = { name?: string; message?: string } | null | undefined;

export function cashErrorKey(error: Err): CashErrorKey {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('record the cash after you mark')) return 'cash.errors.notReady';
  if (text.includes('enter the amount you received')) return 'cash.errors.amount';
  if (text.includes('explain why the amount differs')) return 'cash.errors.reason';
  if (text.includes('already recorded the amount')) return 'cash.errors.alreadyRecorded';
  if (text.includes('network') || text.includes('fetch') || error?.name === 'TypeError') return 'cash.errors.network';
  return 'cash.errors.generic';
}

export type CashClient = { recordCash(jobId: string, amount: number, reason: string | null): PromiseLike<{ error: Err }> };
export type CashResult = { ok: true } | { ok: false; key: CashErrorKey };

export async function recordCash(client: CashClient, jobId: string, amount: number, reason: string | null): Promise<CashResult> {
  try {
    const { error } = await client.recordCash(jobId, amount, reason);
    return error ? { ok: false, key: cashErrorKey(error) } : { ok: true };
  } catch (thrown) {
    return { ok: false, key: thrown instanceof Error && thrown.name === 'TypeError' ? 'cash.errors.network' : 'cash.errors.generic' };
  }
}
