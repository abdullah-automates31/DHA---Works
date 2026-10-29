// Maps profile RPC errors to translation keys. Raw server text is never shown or logged:
// a database error for a CNIC conflict carries the CNIC value in its "details" field.
export type ProfileErrorKey =
  | 'about.errors.cnicRejected'
  | 'about.errors.cnicUnavailable'
  | 'about.errors.mobileRejected'
  | 'about.errors.network'
  | 'about.errors.locked'
  | 'about.errors.generic';

type ErrorLike = { name?: string; code?: string; message?: string; details?: string | null } | null | undefined;

/**
 * True when the profile row already exists: register_profile says so when it sees the row, and a true race
 * (two requests at the same moment) surfaces as a primary-key violation on profiles instead.
 */
export function isAlreadyRegistered(error: ErrorLike): boolean {
  const text = `${error?.message ?? ''} ${error?.details ?? ''}`.toLowerCase();
  return text.includes('profile already exists') || text.includes('profiles_pkey') || text.includes('worker_details_pkey');
}

export function profileErrorKey(error: ErrorLike): ProfileErrorKey {
  if (!error) return 'about.errors.generic';
  const text = `${error.message ?? ''} ${error.details ?? ''}`.toLowerCase();

  if (text.includes('profiles_cnic_role_unique') || (error.code === '23505' && !isAlreadyRegistered(error))) {
    // Deliberately vague: confirming that a CNIC is already registered would leak who has an account.
    return 'about.errors.cnicUnavailable';
  }
  if (text.includes('profiles_cnic_format')) return 'about.errors.cnicRejected';
  if (text.includes('profiles_phone_length')) return 'about.errors.mobileRejected';
  if (text.includes('locked after approval') || text.includes('cannot be changed')) return 'about.errors.locked';
  if (
    error.name === 'TypeError' ||
    text.includes('network request failed') ||
    text.includes('failed to fetch') ||
    text.includes('fetch failed')
  ) {
    return 'about.errors.network';
  }
  return 'about.errors.generic';
}
