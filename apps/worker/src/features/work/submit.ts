// Submitting the application from W03b: trades, details, optional voice file, then submit_for_review.
// Every step is safe to repeat, so a failure part-way just means "try again". Injectable for unit tests.
export type SubmitErrorKey =
  | 'work.errors.trades'
  | 'work.errors.documents'
  | 'work.errors.identity'
  | 'work.errors.locked'
  | 'work.errors.voice'
  | 'work.errors.network'
  | 'work.errors.generic';

export type SubmitResult = { ok: true } | { ok: false; key: SubmitErrorKey };

type Err = { name?: string; message?: string } | null;

export type SubmitClient = {
  setCategories(ids: number[]): PromiseLike<{ error: Err }>;
  updateDetails(args: { years: number | null; fee: number | null; voicePath: string | null }): PromiseLike<{ error: Err }>;
  uploadVoice(bytes: ArrayBuffer): PromiseLike<{ path: string | null; error: Err }>;
  deleteVoice(path: string): PromiseLike<unknown>;
  submit(): PromiseLike<{ error: Err }>;
};

export type SubmitInput = {
  tradeIds: number[];
  years: number | null;
  fee: number | null;
  /** a recording made in this session that still has to be uploaded */
  newVoice: ArrayBuffer | null;
  /** the voice file already saved earlier, replaced (and then deleted) when newVoice is given */
  previousVoicePath: string | null;
};

export function submitErrorKey(error: Err): SubmitErrorKey {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('choose at least one trade') || text.includes('unknown or inactive trade')) return 'work.errors.trades';
  if (text.includes('both sides of your cnic') || text.includes('profile photo') || text.includes('police certificate')) {
    return 'work.errors.documents';
  }
  if (text.includes('name, phone and cnic')) return 'work.errors.identity';
  if (text.includes('not applicable') || text.includes('not available for your account')) return 'work.errors.locked';
  if (text.includes('network') || text.includes('fetch') || error?.name === 'TypeError') return 'work.errors.network';
  return 'work.errors.generic';
}

export async function submitApplication(client: SubmitClient, input: SubmitInput): Promise<SubmitResult> {
  try {
    const categories = await client.setCategories(input.tradeIds);
    if (categories.error) return { ok: false, key: submitErrorKey(categories.error) };

    let voicePath: string | null = null;
    if (input.newVoice) {
      const uploaded = await client.uploadVoice(input.newVoice);
      if (uploaded.error || !uploaded.path) return { ok: false, key: 'work.errors.voice' };
      voicePath = uploaded.path;
    }

    const details = await client.updateDetails({ years: input.years, fee: input.fee, voicePath });
    if (details.error) return { ok: false, key: submitErrorKey(details.error) };

    // The new voice file is now the one on the profile: remove the one it replaces (worker-media allows it).
    if (voicePath && input.previousVoicePath && input.previousVoicePath !== voicePath) {
      await client.deleteVoice(input.previousVoicePath).then(undefined, () => undefined);
    }

    const submitted = await client.submit();
    if (submitted.error) {
      // A repeat tap or a second device: it is already submitted, which is what the worker wanted.
      if ((submitted.error.message ?? '').toLowerCase().includes('already submitted')) return { ok: true };
      return { ok: false, key: submitErrorKey(submitted.error) };
    }
    return { ok: true };
  } catch (thrown) {
    return { ok: false, key: thrown instanceof Error && thrown.name === 'TypeError' ? 'work.errors.network' : 'work.errors.generic' };
  }
}
