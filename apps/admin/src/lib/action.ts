// Shared pieces of the server actions: the state a form shows, and how a database refusal becomes a sentence.
// The database functions raise plain-English refusals with code P0001; anything else is shown generically so no
// internal detail reaches the screen.
export type ActionState = { error?: string; ok?: string };
export const idle: ActionState = {};

export function refusal(error: { code?: string | null; message?: string | null } | null): ActionState | null {
  if (!error) return null;
  if (error.code === 'P0001' && error.message) return { error: error.message };
  if (error.code === '42501') return { error: 'Your session is not allowed to do that. Sign in again.' };
  return { error: 'That could not be saved. Reload the page and try again.' };
}

/** A text field from a form, trimmed and capped. A missing or non-text field is an empty string. */
export function field(formData: FormData, name: string, max = 1000): string {
  const v = formData.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export const BAD_REQUEST: ActionState = { error: 'That request was not understood. Reload the page and try again.' };
