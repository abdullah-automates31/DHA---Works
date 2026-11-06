// Server-side reads for the verification screens. Everything goes through the signed-in staff member's client, so the
// database (is_admin, migration 0037) decides what comes back; nothing here can read more than a verified admin may.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dha/supabase';
import { parseCounts, parseDetail, parseQueue, safeStoragePath, type Detail } from './parse.ts';
import { bucketFor, PAGE_SIZE, type Role, type Tab } from './rules.ts';

type Client = SupabaseClient<Database>;
const SIGNED_URL_SECONDS = 300; // short on purpose: these are identity documents

export async function loadCounts(supabase: Client, role: Role): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('admin_verification_counts', { p_role: role });
  return parseCounts(data);
}

export async function loadQueue(supabase: Client, o: { role: Role; tab: Tab; q: string; filter: number | null; page: number }) {
  const { data, error } = await supabase.rpc('admin_verification_queue', {
    p_role: o.role,
    p_status: o.tab,
    p_search: o.q || undefined,
    p_filter: o.filter ?? undefined,
    p_limit: PAGE_SIZE,
    p_offset: (o.page - 1) * PAGE_SIZE,
  });
  if (error) return { ok: false as const, queue: parseQueue(null) };
  return { ok: true as const, queue: parseQueue(data) };
}

export async function loadFilters(supabase: Client, role: Role): Promise<{ id: number; label: string }[]> {
  if (role === 'resident') {
    const { data } = await supabase.from('service_areas').select('phase').eq('active', true).order('phase');
    return (data ?? []).map((r) => ({ id: r.phase, label: `Phase ${r.phase}` }));
  }
  const { data } = await supabase.from('categories').select('id, name').eq('active', true).order('sort');
  return (data ?? []).map((r) => ({ id: r.id, label: r.name }));
}

export async function loadDetail(supabase: Client, id: string): Promise<Detail | null> {
  const { data, error } = await supabase.rpc('admin_verification_detail', { p_profile: id });
  return error ? null : parseDetail(data);
}

/** Short-lived links for the documents, voice clip and photo of one applicant. Paths that look odd are skipped. */
export async function signedUrls(supabase: Client, d: Detail): Promise<Record<string, string>> {
  const wanted: { bucket: 'identity' | 'worker-media'; path: string }[] = [];
  for (const doc of d.documents) if (safeStoragePath(doc.path)) wanted.push({ bucket: bucketFor(doc.type), path: doc.path });
  if (d.worker?.voicePath && safeStoragePath(d.worker.voicePath)) wanted.push({ bucket: bucketFor('voice'), path: d.worker.voicePath });
  const out: Record<string, string> = {};
  for (const bucket of ['identity', 'worker-media'] as const) {
    const paths = wanted.filter((w) => w.bucket === bucket).map((w) => w.path);
    if (paths.length === 0) continue;
    const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  }
  return out;
}
