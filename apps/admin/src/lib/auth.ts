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
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect('/signin');
  const { data: status } = await supabase.rpc('admin_session_status');
  const s = parseStatus(status);
  if (s === 'not_admin') redirect('/signin?e=notadmin');
  if (s === 'needs_code') redirect('/signin/code');
  return { supabase, user: data.user };
}
