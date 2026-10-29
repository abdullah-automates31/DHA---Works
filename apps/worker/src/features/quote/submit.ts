// Sending the quote: one call to submit_quote, with every refusal turned into a friendly message.
// Injectable client so the behaviour can be unit tested. Raw server text is never shown.
import type { SubmitQuoteArgs } from './rules.ts';

export type QuoteErrorKey =
  | 'quote.errors.notAvailable'
  | 'quote.errors.expired'
  | 'quote.errors.needInterest'
  | 'quote.errors.rejected'
  | 'quote.errors.alreadySent'
  | 'quote.errors.past'
  | 'quote.errors.total'
  | 'quote.errors.otherNote'
  | 'quote.errors.network'
  | 'quote.errors.generic';

type Err = { name?: string; message?: string; details?: string | null } | null | undefined;

export function quoteErrorKey(error: Err): QuoteErrorKey {
  const text = `${error?.name ?? ''} ${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  if (text.includes('already sent a quote')) return 'quote.errors.alreadySent';
  if (text.includes('did not accept your quote')) return 'quote.errors.rejected';
  if (text.includes('has expired')) return 'quote.errors.expired';
  if (text.includes('show interest in the job')) return 'quote.errors.needInterest';
  if (text.includes('choose a visit time in the future')) return 'quote.errors.past';
  if (text.includes('not available for quotes') || text.includes('not approved') || text.includes('suspended')) {
    return 'quote.errors.notAvailable';
  }
  if (text.includes('quotes_total_positive')) return 'quote.errors.total';
  if (text.includes('quotes_other_note_required')) return 'quote.errors.otherNote';
  if (text.includes('network') || text.includes('fetch') || error?.name === 'TypeError') return 'quote.errors.network';
  return 'quote.errors.generic';
}

export type QuoteClient = {
  submitQuote(args: SubmitQuoteArgs): PromiseLike<{ error: Err }>;
};

/** ok = sent. "alreadySent" is also reported as ok:false so the screen can explain, but it means the quote exists. */
export type SendQuoteResult = { ok: true } | { ok: false; key: QuoteErrorKey };

export async function sendQuote(client: QuoteClient, args: SubmitQuoteArgs): Promise<SendQuoteResult> {
  try {
    const { error } = await client.submitQuote(args);
    return error ? { ok: false, key: quoteErrorKey(error) } : { ok: true };
  } catch (thrown) {
    return { ok: false, key: thrown instanceof Error && thrown.name === 'TypeError' ? 'quote.errors.network' : 'quote.errors.generic' };
  }
}
