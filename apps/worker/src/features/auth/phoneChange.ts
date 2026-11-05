// Changing the sign-in number safely. The server does the real work: updateUser({ phone }) sends a fresh code to the NEW
// number, the number only changes once that code is confirmed (type 'phone_change'), and migration 0033 then mirrors the
// confirmed number to the profile. The app never writes the contact phone itself. Injectable client so it can be tested.
import { authErrorKey, type AuthErrorKey } from './errors.ts';

type OtpError = { name?: string; code?: string; status?: number; message?: string } | null;

export type PhoneChangeClient = {
  updateUser(attributes: { phone: string }): PromiseLike<{ error: OtpError }>;
  verifyOtp(credentials: { phone: string; token: string; type: 'phone_change' }): PromiseLike<{ error: OtpError }>;
};

export type PhoneChangeResult = { ok: true } | { ok: false; key: AuthErrorKey };

async function call(request: () => PromiseLike<{ error: OtpError }>): Promise<OtpError> {
  try {
    return (await request()).error;
  } catch (thrown) {
    return { name: thrown instanceof Error ? thrown.name : 'Error', message: 'network request failed' };
  }
}

/** Step 1: ask for a code on the new number. The number is NOT changed yet. */
export async function requestPhoneChange(client: PhoneChangeClient, newPhone: string): Promise<PhoneChangeResult> {
  const error = await call(() => client.updateUser({ phone: newPhone }));
  return error ? { ok: false, key: authErrorKey(error) } : { ok: true };
}

/** Step 2: confirm with the code that arrived on the new number. Only now does the number change. */
export async function confirmPhoneChange(client: PhoneChangeClient, newPhone: string, code: string): Promise<PhoneChangeResult> {
  const error = await call(() => client.verifyOtp({ phone: newPhone, token: code, type: 'phone_change' }));
  return error ? { ok: false, key: authErrorKey(error) } : { ok: true };
}
