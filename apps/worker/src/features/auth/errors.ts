// Maps a Supabase auth error to one of our translation keys. Duck-typed so it needs no Supabase import
// (and can be unit tested). Never shows raw server text to the worker.
export type AuthErrorKey =
  | 'auth.errors.tooManyRequests'
  | 'auth.errors.wrongOrExpiredCode'
  | 'auth.errors.network'
  | 'auth.errors.generic';

type ErrorLike = { name?: string; code?: string; status?: number; message?: string } | null | undefined;

export function authErrorKey(error: ErrorLike): AuthErrorKey {
  if (!error) return 'auth.errors.generic';
  const code = error.code ?? '';
  const message = (error.message ?? '').toLowerCase();

  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || error.status === 429) {
    return 'auth.errors.tooManyRequests';
  }
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
