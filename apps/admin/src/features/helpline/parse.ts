// Helpline log (migration 0041): what admin_helpline_* return.
import { int, isUuid, obj, page, str } from '../../lib/json.ts';

export type CallRow = {
  id: string; calledAt: string; callerName: string; callerPhone: string; callerRole: string; reason: string; outcome: string;
  notes: string | null; reportCode: string | null; reportId: string | null; callbackDoneAt: string | null;
};

export function parseCalls(json: unknown) {
  return page<CallRow>(json, (r) => {
    if (!isUuid(r.id) || !str(r.called_at) || !str(r.caller_name)) return null;
    return {
      id: r.id, calledAt: r.called_at as string, callerName: r.caller_name as string, callerPhone: str(r.caller_phone) ?? '', callerRole: str(r.caller_role) ?? 'other',
      reason: str(r.reason) ?? 'question', outcome: str(r.outcome) ?? 'answered', notes: str(r.notes), reportCode: str(r.report_code),
      reportId: isUuid(r.report_id) ? r.report_id : null, callbackDoneAt: str(r.callback_done_at),
    };
  });
}

export type HelplineSummary = {
  callsToday: number; answeredToday: number; callbacksPending: number; oldestCallbackSince: string | null; casesMonth: number; unsafeCasesMonth: number;
};

export function parseSummary(json: unknown): HelplineSummary {
  const o = obj(json) ?? {};
  return {
    callsToday: int(o.calls_today), answeredToday: int(o.answered_today), callbacksPending: int(o.callbacks_pending),
    oldestCallbackSince: str(o.oldest_callback_since), casesMonth: int(o.cases_month), unsafeCasesMonth: int(o.unsafe_cases_month),
  };
}

