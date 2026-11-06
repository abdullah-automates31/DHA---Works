// Turns the JSON from admin_dashboard() (migration 0040) into typed values. A reply that does not look right
// becomes zeros and an empty list, so the dashboard can never crash or show unchecked data.
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const int = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const text = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AttentionKind = 'unsafe' | 'report' | 'worker' | 'resident' | 'cancellation' | 'stuck';
const KINDS: AttentionKind[] = ['unsafe', 'report', 'worker', 'resident', 'cancellation', 'stuck'];

export type Attention = { id: string; kind: AttentionKind; title: string; detail: string; since: string };
export type Stages = { open: number; scheduled: number; in_progress: number; completed: number; cash_collected: number; disputed: number };
export type Dashboard = {
  workers: { count: number; oldestSince: string | null };
  residents: { count: number; oldestSince: string | null };
  reports: { count: number; unsafe: number };
  jobsToday: { count: number; inProgress: number };
  stages: Stages;
  attention: Attention[];
};

export function parseDashboard(json: unknown): Dashboard {
  const o = obj(json);
  const w = obj(o.workers_pending);
  const r = obj(o.residents_pending);
  const rep = obj(o.reports_open);
  const jt = obj(o.jobs_today);
  const st = obj(o.stages);
  const attention: Attention[] = [];
  for (const raw of Array.isArray(o.attention) ? (o.attention as unknown[]) : []) {
    const a = obj(raw);
    const kind = KINDS.find((k) => k === a.kind);
    const id = text(a.id);
    const title = text(a.title);
    const since = text(a.since);
    if (!kind || !id || !title || !since || Number.isNaN(Date.parse(since))) continue;
    attention.push({ id, kind, title, detail: text(a.detail) ?? '', since });
  }
  return {
    workers: { count: int(w.count), oldestSince: text(w.oldest_since) },
    residents: { count: int(r.count), oldestSince: text(r.oldest_since) },
    reports: { count: int(rep.count), unsafe: int(rep.unsafe) },
    jobsToday: { count: int(jt.count), inProgress: int(jt.in_progress) },
    stages: {
      open: int(st.open),
      scheduled: int(st.scheduled),
      in_progress: int(st.in_progress),
      completed: int(st.completed),
      cash_collected: int(st.cash_collected),
      disputed: int(st.disputed),
    },
    attention: attention.slice(0, 10),
  };
}

export const isUuidText = (v: string): boolean => UUID.test(v);
