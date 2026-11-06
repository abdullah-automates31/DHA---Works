// Maps a Supabase auth error to one of our translation keys. Duck-typed so it needs no Supabase import
// (and can be unit tested). Never shows raw server text to the worker.
export type AuthErrorKey =
  | 'auth.errors.tooManyRequests'
  | 'auth.errors.wrongOrExpiredCode'
  | 'auth.errors.sendFailed'
  | 'auth.errors.network'
  | 'auth.errors.generic';

type ErrorLike = { name?: string; code?: string; status?: number; message?: string } | null | undefined;

export function authErrorKey(error: ErrorLike): AuthErrorKey {
  if (!error) return 'auth.errors.generic';
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();

  if (code === 'over_sms_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429) {
    return 'auth.errors.tooManyRequests';
  }
  if (code === 'sms_send_failed') return 'auth.errors.sendFailed';
  // Supabase returns otp_expired for both a wrong and an expired code.
  if (code === 'otp_expired' || code === 'otp_disabled' || message.includes('token has expired or is invalid')) {
    return 'auth.errors.wrongOrExpiredCode';
  }
  if (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    message.includes('network request failed') ||
    message.includes('failed to fetch')
  ) {
    return 'auth.errors.network';
  }
  return 'auth.errors.generic';
}

/**
 * True when the server says this sign-in no longer belongs to a real account (user deleted, session revoked,
 * or a local database reset). A network failure is not 'gone': the person stays signed in and can retry.
 */
export function isSessionGone(error: ErrorLike): boolean {
  if (!error) return false;
  const code = error.code ?? '';
  if (code === 'user_not_found' || code === 'session_not_found' || code === 'refresh_token_not_found') return true;
  const message = (error.message ?? '').toLowerCase();
  return (
    message.includes('user from sub claim in jwt does not exist') ||
    message.includes('user not found') ||
    message.includes('session from session_id claim in jwt does not exist')
  );
}
