// Saves the W02 details. register_profile creates the row once; every later save (or a repeat request that
// finds the row already there, including a true race) goes through update_my_profile.
import { isAlreadyRegistered, profileErrorKey, type ProfileErrorKey } from './errors.ts';
import type { Gender } from './validation.ts';

export type AboutValues = {
  fullName: string;
  phone: string; // +92XXXXXXXXXX
  gender: Gender;
  dateOfBirth: string; // yyyy-mm-dd
  cnic: string; // #####-#######-#
};

export type SaveResult = { ok: true } | { ok: false; key: ProfileErrorKey };

type RpcError = { name?: string; code?: string; message?: string; details?: string | null } | null;
export type RpcClient = {
  rpc(fn: 'register_profile' | 'update_my_profile', args: Record<string, unknown>): PromiseLike<{ error: RpcError }>;
};

async function call(client: RpcClient, fn: 'register_profile' | 'update_my_profile', args: Record<string, unknown>) {
  try {
    return (await client.rpc(fn, args)).error;
  } catch (thrown) {
    // A thrown fetch failure; keep only the kind, never the message (it can contain request details).
    return { name: thrown instanceof Error ? thrown.name : 'Error', message: 'network request failed' };
  }
}

export async function saveAbout(client: RpcClient, profileExists: boolean, v: AboutValues): Promise<SaveResult> {
  if (!profileExists) {
    const error = await call(client, 'register_profile', {
      p_role: 'worker',
      p_full_name: v.fullName,
      p_phone: v.phone,
      p_gender: v.gender,
      p_date_of_birth: v.dateOfBirth,
      p_cnic: v.cnic,
    });
    if (!error) return { ok: true };
    if (!isAlreadyRegistered(error)) return { ok: false, key: profileErrorKey(error) };
    // The row appeared in the meantime (double tap, retry, second device): save the details onto it instead.
  }
  const error = await call(client, 'update_my_profile', {
    p_full_name: v.fullName,
    p_phone: v.phone,
    p_gender: v.gender,
    p_date_of_birth: v.dateOfBirth,
    p_cnic: v.cnic,
  });
  return error ? { ok: false, key: profileErrorKey(error) } : { ok: true };
}
