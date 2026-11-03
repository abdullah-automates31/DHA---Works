// Sending the quote: one call to submit_quote, with every refusal turned into a friendly message.
// Injectable client so the behaviour can be unit tested. Raw server text is never shown.
import { buildBillPath, checkBill, type Bill } from '../myjobs/actions.ts';
import type { SubmitQuoteArgs } from './rules.ts';

export type QuoteErrorKey =
  | 'quote.errors.notAvailable'
  | 'quote.errors.expired'
  | 'quote.errors.needInterest'
  | 'quote.errors.rejected'
  | 'quote.errors.alreadySent'
  | 'quote.errors.total'
  | 'quote.errors.otherNote'
  | 'quote.errors.billRequired'
  | 'quote.errors.billInvalid'
  | 'quote.errors.billType'
  | 'quote.errors.billSize'
  | 'quote.errors.billUpload'
  | 'quote.errors.network'
  | 'quote.errors.generic';

type Err = { name?: string; message?: string; details?: string | null } | null | undefined;

export function quoteErrorKey(error: Err): QuoteErrorKey {
  const text = `${error?.name ?? ''} ${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  if (text.includes('already sent a quote')) return 'quote.errors.alreadySent';
  if (text.includes('did not accept your quote')) return 'quote.errors.rejected';
  if (text.includes('has expired')) return 'quote.errors.expired';
  if (text.includes('show interest in the job')) return 'quote.errors.needInterest';
  if (text.includes('not available for quotes') || text.includes('not approved') || text.includes('suspended')) {
    return 'quote.errors.notAvailable';
  }
  if (text.includes('upload the material bill')) return 'quote.errors.billRequired';
  if (text.includes('invalid bill path')) return 'quote.errors.billInvalid';
  if (text.includes('quotes_total_positive')) return 'quote.errors.total';
  if (text.includes('quotes_other_note_required')) return 'quote.errors.otherNote';
  if (text.includes('network') || text.includes('fetch') || error?.name === 'TypeError') return 'quote.errors.network';
  return 'quote.errors.generic';
}

export type QuoteClient = {
  submitQuote(args: SubmitQuoteArgs): PromiseLike<{ error: Err }>;
  /** Uploads the bill photo (job-media) under the worker's own folder; returns its path. */
  uploadBill?(bytes: ArrayBuffer, mime: string, extension: string): PromiseLike<{ path: string | null; error: Err }>;
  deleteBill?(path: string): PromiseLike<unknown>;
};

/** ok = sent. "alreadySent" is also reported as ok:false so the screen can explain, but it means the quote exists. */
export type SendQuoteResult = { ok: true } | { ok: false; key: QuoteErrorKey };

/**
 * Sends the quote. With materials the bill photo goes first (it is checked, then uploaded) and its path travels with the
 * quote; if the quote is then refused the uploaded file is removed again, so no orphan is left behind.
 */
export async function sendQuote(client: QuoteClient, args: SubmitQuoteArgs, bill: Bill | null = null): Promise<SendQuoteResult> {
  let uploaded: string | null = null;
  try {
    let sending = args;
    if (args.p_materials > 0) {
      if (!bill || !client.uploadBill) return { ok: false, key: 'quote.errors.billRequired' };
      const check = checkBill(bill.mime, bill.bytes.byteLength);
      if (!check.ok) return { ok: false, key: check.key.replace('myjobs.errors.', 'quote.errors.') as QuoteErrorKey };
      const up = await client.uploadBill(bill.bytes, bill.mime, check.extension);
      if (up.error || !up.path) return { ok: false, key: 'quote.errors.billUpload' };
      uploaded = up.path;
      sending = { ...args, p_material_bill_path: up.path };
    }
    const { error } = await client.submitQuote(sending);
    if (error) {
      const key = quoteErrorKey(error);
      // "already sent" means the quote exists (with its own bill), so this new file is not needed either way.
      if (uploaded && client.deleteBill) await client.deleteBill(uploaded);
      return { ok: false, key };
    }
    return { ok: true };
  } catch (thrown) {
    if (uploaded && client.deleteBill) await client.deleteBill(uploaded);
    return { ok: false, key: thrown instanceof Error && thrown.name === 'TypeError' ? 'quote.errors.network' : 'quote.errors.generic' };
  }
}

export { buildBillPath };
