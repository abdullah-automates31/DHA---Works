// Jobs, job detail and cancellation requests (migration 0041).
import { arr, bool, int, isUuid, num, obj, page, str, strs } from '../../lib/json.ts';

export type JobRow = {
  id: string; code: string; title: string; status: string; phase: number; category: string; updatedAt: string;
  residentName: string; workerName: string | null; quoteTotal: number | null; openReports: number; cancelPending: boolean; underReview: string | null;
};

export function parseJobs(json: unknown) {
  return page<JobRow>(json, (r) => {
    if (!isUuid(r.id) || !str(r.code) || !str(r.status) || !str(r.updated_at)) return null;
    return {
      id: r.id, code: r.code as string, title: str(r.title) ?? '', status: r.status as string, phase: int(r.phase), category: str(r.category) ?? '',
      updatedAt: r.updated_at as string, residentName: str(r.resident_name) ?? 'Unknown', workerName: str(r.worker_name), quoteTotal: num(r.quote_total),
      openReports: int(r.open_reports), cancelPending: bool(r.cancel_pending), underReview: str(r.under_review_reason),
    };
  });
}

export type JobCounts = { total: number; byStatus: Record<string, number>; cancellationsPending: number };

export function parseJobCounts(json: unknown): JobCounts {
  const o = obj(json) ?? {};
  const by: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj(o.by_status) ?? {})) if (num(v) !== null) by[k] = num(v) as number;
  return { total: int(o.total), byStatus: by, cancellationsPending: int(o.cancellations_pending) };
}

export type JobDetail = {
  job: {
    id: string; code: string; title: string; description: string; status: string; urgency: string; preferredDate: string | null;
    windowFrom: string | null; windowTo: string | null; scheduledStart: string | null; scheduledEnd: string | null; postedAt: string | null;
    startedAt: string | null; completedAt: string | null; createdAt: string; underReview: string | null; stuckSince: string | null; stuckReason: string | null;
    cancelReason: string | null; cancelledByName: string | null; category: string; phase: number; lane: string; plotNo: string | null; floor: string | null; voicePath: string | null;
  };
  photos: string[];
  resident: { id: string; name: string; phone: string | null; verified: boolean; accountStatus: string } | null;
  worker: { id: string; name: string; phone: string | null; accountStatus: string; ratingAvg: number | null; ratingCount: number; jobsDone: number; category: string | null } | null;
  quote: { labour: number; materials: number; materialsNote: string | null; otherAmount: number; total: number; sentAt: string | null; decidedAt: string | null } | null;
  cash: { agreed: number; workerAmount: number | null; workerRecordedAt: string | null; workerReason: string | null; residentAmount: number | null; residentConfirmedAt: string | null; matched: boolean | null; quoteDifference: number | null } | null;
  counts: { interested: number; quotes: number };
  events: { type: string; at: string; actorName: string | null }[];
  reports: { id: string; code: string; kind: string; status: string; createdAt: string; reporterRole: string }[];
  cancellations: { id: string; status: string; requesterRole: string; requesterName: string; reasonCode: string; details: string | null; createdAt: string; decisionNote: string | null }[];
};

export function parseJobDetail(json: unknown): JobDetail | null {
  const o = obj(json);
  const j = obj(o?.job);
  if (!o || !j || !isUuid(j.id) || !str(j.status)) return null;
  const res = obj(o.resident);
  const wk = obj(o.worker);
  const q = obj(o.quote);
  const c = obj(o.cash);
  const counts = obj(o.counts);
  return {
    job: {
      id: j.id, code: str(j.code) ?? '', title: str(j.title) ?? '', description: str(j.description) ?? '', status: j.status as string, urgency: str(j.urgency) ?? 'asap',
      preferredDate: str(j.preferred_date), windowFrom: str(j.window_from), windowTo: str(j.window_to), scheduledStart: str(j.scheduled_start), scheduledEnd: str(j.scheduled_end),
      postedAt: str(j.posted_at), startedAt: str(j.started_at), completedAt: str(j.completed_at), createdAt: str(j.created_at) ?? new Date(0).toISOString(),
      underReview: str(j.under_review_reason), stuckSince: str(j.stuck_since), stuckReason: str(j.stuck_reason), cancelReason: str(j.cancel_reason),
      cancelledByName: str(j.cancelled_by_name), category: str(j.category) ?? '', phase: int(j.phase), lane: str(j.lane) ?? '', plotNo: str(j.plot_no), floor: str(j.floor), voicePath: str(j.voice_note_path),
    },
    photos: strs(o.photos),
    resident: res && isUuid(res.id) ? { id: res.id, name: str(res.name) ?? 'Unknown', phone: str(res.phone), verified: bool(res.verified), accountStatus: str(res.account_status) ?? 'active' } : null,
    worker: wk && isUuid(wk.id) ? { id: wk.id, name: str(wk.name) ?? 'Unknown', phone: str(wk.phone), accountStatus: str(wk.account_status) ?? 'active', ratingAvg: num(wk.rating_avg), ratingCount: int(wk.rating_count), jobsDone: int(wk.jobs_done), category: str(wk.category) } : null,
    quote: q ? { labour: int(q.labour), materials: int(q.materials), materialsNote: str(q.materials_note), otherAmount: int(q.other_amount), total: int(q.total), sentAt: str(q.sent_at), decidedAt: str(q.decided_at) } : null,
    cash: c ? { agreed: int(c.agreed_amount), workerAmount: num(c.worker_amount), workerRecordedAt: str(c.worker_recorded_at), workerReason: str(c.worker_reason), residentAmount: num(c.resident_amount), residentConfirmedAt: str(c.resident_confirmed_at), matched: typeof c.matched === 'boolean' ? c.matched : null, quoteDifference: num(c.quote_difference) } : null,
    counts: { interested: int(counts?.interested), quotes: int(counts?.quotes) },
    events: arr(o.events).flatMap((raw) => {
      const e = obj(raw);
      return e && str(e.type) && str(e.at) ? [{ type: e.type as string, at: e.at as string, actorName: str(e.actor_name) }] : [];
    }),
    reports: arr(o.reports).flatMap((raw) => {
      const r = obj(raw);
      return r && isUuid(r.id) && str(r.kind) ? [{ id: r.id, code: str(r.code) ?? '', kind: r.kind as string, status: str(r.status) ?? 'new', createdAt: str(r.created_at) ?? '', reporterRole: str(r.reporter_role) ?? '' }] : [];
    }),
    cancellations: arr(o.cancellations).flatMap((raw) => {
      const x = obj(raw);
      return x && isUuid(x.id) ? [{ id: x.id, status: str(x.status) ?? 'pending', requesterRole: str(x.requester_role) ?? '', requesterName: str(x.requester_name) ?? 'Unknown', reasonCode: str(x.reason_code) ?? 'other', details: str(x.details), createdAt: str(x.created_at) ?? '', decisionNote: str(x.decision_note) }] : [];
    }),
  };
}

export type CancellationRow = {
  id: string; status: string; requesterRole: string; requesterName: string; reasonCode: string; details: string | null; createdAt: string; decidedAt: string | null;
  decisionNote: string | null; jobId: string; jobCode: string; jobTitle: string; jobStatus: string; phase: number;
};

export function parseCancellations(json: unknown) {
  return page<CancellationRow>(json, (r) => {
    if (!isUuid(r.id) || !isUuid(r.job_id) || !str(r.created_at)) return null;
    return {
      id: r.id, status: str(r.status) ?? 'pending', requesterRole: str(r.requester_role) ?? '', requesterName: str(r.requester_name) ?? 'Unknown', reasonCode: str(r.reason_code) ?? 'other',
      details: str(r.details), createdAt: r.created_at as string, decidedAt: str(r.decided_at), decisionNote: str(r.decision_note), jobId: r.job_id,
      jobCode: str(r.job_code) ?? '', jobTitle: str(r.job_title) ?? '', jobStatus: str(r.job_status) ?? '', phase: int(r.phase),
    };
  });
}
