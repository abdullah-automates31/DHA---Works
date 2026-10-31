import { authErrorKey, type AuthErrorKey } from './errors.ts';

type OtpError = { name?: string; code?: string; status?: number; message?: string } | null;

export type OtpClient = {
  signInWithOtp(credentials: {
    phone: string;
    options: { shouldCreateUser: boolean; channel: 'whatsapp' };
  }): PromiseLike<{ error: OtpError }>;
  verifyOtp(credentials: { phone: string; token: string; type: 'sms' }): PromiseLike<{ error: OtpError }>;
};

export type OtpResult = { ok: true } | { ok: false; key: AuthErrorKey };

async function call(request: () => PromiseLike<{ error: OtpError }>): Promise<OtpError> {
  try {
    return (await request()).error;
  } catch (thrown) {
    return { name: thrown instanceof Error ? thrown.name : 'Error', message: 'network request failed' };
  }
}

/** Requests the login code on WhatsApp. Supabase still verifies phone OTPs with type 'sms'. */
export async function requestPhoneOtp(client: OtpClient, phone: string): Promise<OtpResult> {
  const error = await call(() =>
    client.signInWithOtp({ phone, options: { shouldCreateUser: true, channel: 'whatsapp' } }),
  );
  return error ? { ok: false, key: authErrorKey(error) } : { ok: true };
}

export async function verifyPhoneOtp(client: OtpClient, phone: string, token: string): Promise<OtpResult> {
  const error = await call(() => client.verifyOtp({ phone, token, type: 'sms' }));
  return error ? { ok: false, key: authErrorKey(error) } : { ok: true };
}
