import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dha/supabase';
import { PAGE_SIZE } from '../../lib/format.ts';
import { safePath } from '../../lib/json.ts';
import { parseUserCounts, parseUserDetail, parseUsers, type UserDetail } from './parse.ts';

type Client = SupabaseClient<Database>;
export type UserState = 'all' | 'active' | 'suspended' | 'open_reports';
export const USER_STATES: UserState[] = ['all', 'active', 'suspended', 'open_reports'];
export const parseUserState = (v: unknown): UserState => (USER_STATES as unknown[]).includes(v) ? (v as UserState) : 'all';

export async function loadUserCounts(supabase: Client) {
  const { data } = await supabase.rpc('admin_users_counts');
  return parseUserCounts(data);
}

export async function loadUsers(supabase: Client, o: { role: 'worker' | 'resident'; state: UserState; phase: number | null; q: string; page: number }) {
  const { data, error } = await supabase.rpc('admin_users_list', {
    p_role: o.role, p_state: o.state, p_phase: o.phase ?? undefined, p_search: o.q || undefined, p_limit: PAGE_SIZE, p_offset: (o.page - 1) * PAGE_SIZE,
  });
  return { ok: !error, list: parseUsers(error ? null : data) };
}

export async function loadUserDetail(supabase: Client, id: string): Promise<UserDetail | null> {
  const { data, error } = await supabase.rpc('admin_user_detail', { p_profile: id });
  return error ? null : parseUserDetail(data);
}

/** Five-minute links to a person's documents and photo (identity documents are sensitive). */
export async function userDocUrls(supabase: Client, d: UserDetail): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const identity = d.documents.filter((x) => x.type !== 'profile_photo' && safePath(x.path)).map((x) => x.path);
  const media = d.documents.filter((x) => x.type === 'profile_photo' && safePath(x.path)).map((x) => x.path);
  for (const [bucket, paths] of [['identity', identity], ['worker-media', media]] as const) {
    if (paths.length === 0) continue;
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 300);
    for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}
