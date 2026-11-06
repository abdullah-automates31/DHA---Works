// Server-side reads for the report screens. Everything goes through the signed-in staff member's client.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dha/supabase';
import { safePath } from '../../lib/json.ts';
import { PAGE_SIZE } from '../../lib/format.ts';
import { parseReportCounts, parseReportDetail, parseReports, type ReportDetail } from './parse.ts';

type Client = SupabaseClient<Database>;
type Kind = Database['public']['Enums']['report_kind'];
const KINDS: Kind[] = ['unsafe', 'cash_price', 'no_show', 'poor_work', 'rude_damage', 'other'];
export const isKind = (v: unknown): v is Kind => KINDS.includes(v as Kind);

export async function loadReportCounts(supabase: Client) {
  const { data } = await supabase.rpc('admin_reports_counts');
  return parseReportCounts(data);
}

export async function loadReports(supabase: Client, o: { tab: 'open' | 'resolved' | 'all'; kind: Kind | null; q: string; page: number }) {
  const { data, error } = await supabase.rpc('admin_reports_list', {
    p_tab: o.tab, p_kind: o.kind ?? undefined, p_search: o.q || undefined, p_limit: PAGE_SIZE, p_offset: (o.page - 1) * PAGE_SIZE,
  });
  return { ok: !error, list: parseReports(error ? null : data) };
}

export async function loadReportDetail(supabase: Client, id: string): Promise<ReportDetail | null> {
  const { data, error } = await supabase.rpc('admin_report_detail', { p_report: id });
  return error ? null : parseReportDetail(data);
}

/** Five-minute links to the evidence photos of a case. */
export async function reportPhotoUrls(supabase: Client, paths: string[]): Promise<Record<string, string>> {
  const ok = paths.filter(safePath);
  if (ok.length === 0) return {};
  const { data } = await supabase.storage.from('report-media').createSignedUrls(ok, 300);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}
