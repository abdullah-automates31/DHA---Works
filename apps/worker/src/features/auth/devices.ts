// Ends every sign-in of this account except the current phone (account-takeover remedy, docs/SECURITY.md section 15).
export type DevicesClient = {
  auth: { signOut: (options: { scope: 'others' }) => Promise<{ error: { message: string } | null }> };
};

export type SignOutOthersResult = { ok: true } | { ok: false };

export async function signOutOtherDevices(client: DevicesClient): Promise<SignOutOthersResult> {
  try {
    const { error } = await client.auth.signOut({ scope: 'others' });
    return error ? { ok: false } : { ok: true };
  } catch {
    return { ok: false };
  }
}
