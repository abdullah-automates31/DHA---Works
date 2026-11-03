// Saving the Introduction from the Profile tab: an optional new voice recording and the written "about" text.
// Same order as the application: upload the file first, then point the profile at it, then remove the old file.
// Injectable for unit tests.
type Err = { name?: string; message?: string } | null;

export type IntroductionErrorKey = 'introduction.errors.voice' | 'introduction.errors.network' | 'introduction.errors.generic';
export type IntroductionResult = { ok: true; voicePath: string | null } | { ok: false; key: IntroductionErrorKey };

export type IntroductionClient = {
  /** about: null leaves the saved text alone; an empty string clears it */
  updateDetails(args: { voicePath: string | null; about: string | null }): PromiseLike<{ error: Err }>;
  uploadVoice(bytes: ArrayBuffer): PromiseLike<{ path: string | null; error: Err }>;
  deleteVoice(path: string): PromiseLike<unknown>;
};

export type IntroductionInput = {
  newVoice: ArrayBuffer | null;
  previousVoicePath: string | null;
  /** the text in the box, or null when it was not changed */
  about: string | null;
};

export function introductionErrorKey(error: Err): IntroductionErrorKey {
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (text.includes('network') || text.includes('fetch') || error?.name === 'TypeError') return 'introduction.errors.network';
  return 'introduction.errors.generic';
}

export async function saveIntroduction(client: IntroductionClient, input: IntroductionInput): Promise<IntroductionResult> {
  try {
    let voicePath: string | null = null;
    if (input.newVoice) {
      const uploaded = await client.uploadVoice(input.newVoice);
      if (uploaded.error || !uploaded.path) return { ok: false, key: 'introduction.errors.voice' };
      voicePath = uploaded.path;
    }
    if (voicePath === null && input.about === null) return { ok: true, voicePath: null };

    const saved = await client.updateDetails({ voicePath, about: input.about });
    if (saved.error) {
      // The uploaded file was never attached to the profile: do not leave it behind.
      if (voicePath) await client.deleteVoice(voicePath).then(undefined, () => undefined);
      return { ok: false, key: introductionErrorKey(saved.error) };
    }
    if (voicePath && input.previousVoicePath && input.previousVoicePath !== voicePath) {
      await client.deleteVoice(input.previousVoicePath).then(undefined, () => undefined);
    }
    return { ok: true, voicePath };
  } catch (thrown) {
    return { ok: false, key: thrown instanceof Error && thrown.name === 'TypeError' ? 'introduction.errors.network' : 'introduction.errors.generic' };
  }
}
