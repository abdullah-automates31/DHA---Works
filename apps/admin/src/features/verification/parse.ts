// Turns the JSON that the database functions return (migration 0038) into typed values. Everything is checked:
// a reply that does not look right becomes an empty or null result instead of reaching a screen unchecked.
import { isDocType, type DocType } from './rules.ts';

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const nums = (v: unknown): number[] => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export type QueueRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  waitingSince: string;
  documents: string[];
  worker: { categories: string[]; phases: number[]; references: number; hasVoice: boolean } | null;
  address: { phase: number; lane: string; plotNo: string } | null;
};
export type Queue = { total: number; rows: QueueRow[] };

export function parseQueue(json: unknown): Queue {
  const o = obj(json);
  const rows: QueueRow[] = [];
  for (const raw of Array.isArray(o?.rows) ? (o.rows as unknown[]) : []) {
    const r = obj(raw);
    if (!r || !isUuid(r.id)) continue;
    const extra = obj(r.extra);
    const addr = obj(extra?.address);
    rows.push({
      id: r.id,
      name: str(r.full_name),
      phone: str(r.phone),
      email: str(r.email),
      waitingSince: str(r.waiting_since) ?? new Date(0).toISOString(),
      documents: strs(r.documents),
      worker: extra && 'categories' in extra ? { categories: strs(extra.categories), phases: nums(extra.phases), references: num(extra.references) ?? 0, hasVoice: extra.has_voice === true } : null,
      address: addr && num(addr.phase) !== null ? { phase: num(addr.phase) as number, lane: str(addr.lane) ?? '', plotNo: str(addr.plot_no) ?? '' } : null,
    });
  }
  return { total: num(o?.total) ?? 0, rows };
}

export function parseCounts(json: unknown): Record<string, number> {
  const o = obj(json) ?? {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) if (num(v) !== null) out[k] = num(v) as number;
  return out;
}

export type DetailDoc = { type: DocType; path: string };
export type Detail = {
  id: string;
  role: 'worker' | 'resident';
  name: string | null;
  phone: string | null;
  email: string | null;
  cnicMasked: string | null;
  status: string;
  reason: string | null;
  submittedAt: string | null;
  avatarPath: string | null;
  documents: DetailDoc[];
  history: { decision: string; reason: string | null; decidedAt: string; by: string | null }[];
  worker: { experienceYears: number | null; about: string | null; voicePath: string | null; categories: string[]; phases: number[]; references: { name: string; phone: string; address: string | null }[] } | null;
  addresses: { label: string | null; phase: number; lane: string; plotNo: string; floor: string | null }[];
};

export function parseDetail(json: unknown): Detail | null {
  const o = obj(json);
  if (!o || !isUuid(o.id) || (o.role !== 'worker' && o.role !== 'resident')) return null;
  const documents: DetailDoc[] = [];
  for (const raw of Array.isArray(o.documents) ? (o.documents as unknown[]) : []) {
    const d = obj(raw);
    if (d && isDocType(d.type) && typeof d.path === 'string' && d.path.length > 0) documents.push({ type: d.type, path: d.path });
  }
  const w = obj(o.worker);
  return {
    id: o.id,
    role: o.role,
    name: str(o.full_name),
    phone: str(o.phone),
    email: str(o.email),
    cnicMasked: str(o.cnic_masked),
    status: str(o.status) ?? 'pending',
    reason: str(o.reason),
    submittedAt: str(o.submitted_at),
    avatarPath: str(o.avatar_path),
    documents,
    history: (Array.isArray(o.history) ? (o.history as unknown[]) : []).flatMap((raw) => {
      const h = obj(raw);
      return h && str(h.decision) && str(h.decided_at) ? [{ decision: h.decision as string, reason: str(h.reason), decidedAt: h.decided_at as string, by: str(h.decided_by_name) }] : [];
    }),
    worker: o.role === 'worker' ? {
      experienceYears: num(w?.experience_years),
      about: str(w?.about),
      voicePath: str(w?.voice_intro_path),
      categories: strs(o.categories),
      phases: nums(o.phases),
      references: (Array.isArray(o.references) ? (o.references as unknown[]) : []).flatMap((raw) => {
        const r = obj(raw);
        return r && str(r.name) && str(r.phone) ? [{ name: r.name as string, phone: r.phone as string, address: str(r.address) }] : [];
      }),
    } : null,
    addresses: (Array.isArray(o.addresses) ? (o.addresses as unknown[]) : []).flatMap((raw) => {
      const a = obj(raw);
      return a && num(a.phase) !== null ? [{ label: str(a.label), phase: num(a.phase) as number, lane: str(a.lane) ?? '', plotNo: str(a.plot_no) ?? '', floor: str(a.floor) }] : [];
    }),
  };
}

/** A storage path is only ever used if it is a plain "<uuid>/<file>" path: no traversal, no absolute path. */
export function safeStoragePath(path: string): boolean {
  return /^[0-9a-f-]{36}\/[A-Za-z0-9._-]{1,200}$/i.test(path) && !path.includes('..');
}
