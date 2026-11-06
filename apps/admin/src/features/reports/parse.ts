// Reports and cases (migration 0041): typed readings of what admin_reports_* return.
import { arr, bool, int, isUuid, num, obj, page, str, strs, type Obj } from '../../lib/json.ts';

export type ReportRow = {
  id: string;
  code: string;
  kind: string;
  status: string;
  action: string | null;
  createdAt: string;
  resolvedAt: string | null;
  systemGenerated: boolean;
  reporterName: string;
  reporterRole: string;
  againstName: string;
  againstRole: string;
  jobCode: string;
  jobTitle: string;
};

export function parseReports(json: unknown) {
  return page<ReportRow>(json, (r) => {
    if (!isUuid(r.id) || !str(r.code) || !str(r.kind) || !str(r.status) || !str(r.created_at)) return null;
    return {
      id: r.id, code: r.code as string, kind: r.kind as string, status: r.status as string, action: str(r.action),
      createdAt: r.created_at as string, resolvedAt: str(r.resolved_at), systemGenerated: bool(r.system_generated),
      reporterName: str(r.reporter_name) ?? 'Unknown', reporterRole: str(r.reporter_role) ?? '', againstName: str(r.against_name) ?? 'Unknown',
      againstRole: str(r.against_role) ?? '', jobCode: str(r.job_code) ?? '', jobTitle: str(r.job_title) ?? '',
    };
  });
}

export type ReportCounts = {
  open: number; resolved: number; all: number; openByKind: Record<string, number>;
  resolvedThisWeek: number; resolvedLastWeek: number; unsafeMonth: number; unsafeOpen: number; cashDisputesMonth: number; firstCallMinutes: number | null;
};

export function parseReportCounts(json: unknown): ReportCounts {
  const o = obj(json) ?? {};
  const by: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(o.open_by_kind) ?? {})) if (num(v) !== null) by[k] = num(v) as number;
  return {
    open: int(o.open), resolved: int(o.resolved), all: int(o.all), openByKind: by,
    resolvedThisWeek: int(o.resolved_this_week), resolvedLastWeek: int(o.resolved_last_week),
    unsafeMonth: int(o.unsafe_month), unsafeOpen: int(o.unsafe_open), cashDisputesMonth: int(o.cash_disputes_month),
    firstCallMinutes: num(o.first_call_minutes),
  };
}

export type Person = { id: string; name: string; role: string; phone: string | null; accountStatus: string; detail: string | null };
export type ReportDetail = {
  id: string; code: string; kind: string; status: string; action: string | null; actionReason: string | null; reasonText: string | null;
  systemGenerated: boolean; createdAt: string; resolvedAt: string | null; assignedToName: string | null;
  reporter: Person; against: Person;
  job: { id: string; code: string; title: string; status: string; phase: number; lane: string; plotNo: string | null; startedAt: string | null; quoteTotal: number | null };
  photos: string[];
  notes: { id: string; note: string; createdAt: string; authorName: string }[];
  calls: { id: string; calledId: string; calledName: string; outcome: string | null; calledAt: string; calledByName: string }[];
};

function person(v: unknown): Person | null {
  const p = obj(v);
  if (!p || !isUuid(p.id)) return null;
  return { id: p.id, name: str(p.name) ?? 'Unknown', role: str(p.role) ?? '', phone: str(p.phone), accountStatus: str(p.account_status) ?? 'active', detail: str(p.detail) };
}

export function parseReportDetail(json: unknown): ReportDetail | null {
  const o = obj(json);
  const r = obj(o?.report);
  const j = obj(o?.job);
  const reporter = person(o?.reporter);
  const against = person(o?.against);
  if (!o || !r || !j || !reporter || !against || !isUuid(r.id) || !isUuid(j.id) || !str(r.kind) || !str(r.status)) return null;
  const notes = arr(o.notes).flatMap((raw) => {
    const n = obj(raw as Obj);
    return n && isUuid(n.id) && str(n.note) && str(n.created_at) ? [{ id: n.id, note: n.note as string, createdAt: n.created_at as string, authorName: str(n.author_name) ?? 'Staff' }] : [];
  });
  const calls = arr(o.calls).flatMap((raw) => {
    const c = obj(raw as Obj);
    return c && isUuid(c.id) && str(c.called_at) ? [{ id: c.id, calledId: str(c.called_id) ?? '', calledName: str(c.called_name) ?? 'Unknown', outcome: str(c.outcome), calledAt: c.called_at as string, calledByName: str(c.called_by_name) ?? 'Staff' }] : [];
  });
  return {
    id: r.id, code: str(r.code) ?? '', kind: r.kind as string, status: r.status as string, action: str(r.action), actionReason: str(r.action_reason),
    reasonText: str(r.reason_text), systemGenerated: bool(r.system_generated), createdAt: str(r.created_at) ?? new Date(0).toISOString(),
    resolvedAt: str(r.resolved_at), assignedToName: str(r.assigned_to_name), reporter, against,
    job: { id: j.id, code: str(j.code) ?? '', title: str(j.title) ?? '', status: str(j.status) ?? '', phase: int(j.phase), lane: str(j.lane) ?? '', plotNo: str(j.plot_no), startedAt: str(j.started_at), quoteTotal: num(j.quote_total) },
    photos: strs(o.photos),
    notes, calls,
  };
}

/** One line of the activity list of a case, oldest first. */
export type ActivityItem = { key: string; tone: 'stop' | 'ok' | 'now'; title: string; sub: string; at: string };
