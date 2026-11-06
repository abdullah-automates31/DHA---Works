import { redirect } from 'next/navigation';
import { parseStatus } from './status.ts';
import { createClient } from './supabase/server.ts';

/**
 * Every portal page and action starts here. A password alone is not enough: the database must report this very
 * session as verified (migration 0037). Anything unexpected is treated as "not an admin". The database rules
 * (is_admin) are the real gate; this is the first, friendly one.
 */
export async function requireAdmin() {
  const supabase = await createClient();
  // getClaims checks the token signature here, without a call to the auth server (the project signs with an asymmetric
  // key), so it costs no network time. A revoked or suspended session is still caught below: the database function
  // looks the session up on every call, and is_admin() does the same for every query the page then makes.
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) redirect('/signin');
  const { data: status } = await supabase.rpc('admin_session_status');
  const s = parseStatus(status);
  if (s === 'not_admin') redirect('/signin?e=notadmin');
  if (s === 'needs_code') redirect('/signin/code');
  return { supabase, user: { id: sub, email: typeof data?.claims?.email === 'string' ? data.claims.email : null } };
}
