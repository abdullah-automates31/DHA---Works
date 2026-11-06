'use client';

import { useActionState, useState } from 'react';
import type { ActionState } from '@/lib/action';
import { decideReportAction } from './actions';
import { canDecide, choicesFor, REASON_MAX, type Choice } from './rules';

const initial: ActionState = {};

/** "Action on <name>" of the case screen (A08): pick one outcome, write the reason, save. */
export function ReportDecision({ reportId, against }: { reportId: string; against: { name: string; role: string } }) {
  const [state, run, pending] = useActionState(decideReportAction, initial);
  const [choice, setChoice] = useState<Choice>('keep_open');
  const [reason, setReason] = useState('');
  const options = choicesFor(against);
  const current = options.find((o) => o.key === choice) ?? options[0]!;
  const verdict = canDecide(choice, reason);

  return (
    <form action={run} className="card col" style={{ gap: 10 }}>
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="choice" value={choice} />
      <h2 className="h2">Action on {against.name}</h2>
      {options.map((o) => (
        <button key={o.key} type="button" className={`opt${choice === o.key ? ' on' : ''}${o.tone === 'stop' ? ' rj' : ''}`} style={{ alignItems: 'flex-start' }} aria-pressed={choice === o.key} onClick={() => setChoice(o.key)}>
          <span className="rd" style={{ marginTop: 2 }} />
          <span>
            <span style={{ display: 'block' }}>{o.label}</span>
            <span className="mut" style={{ display: 'block', fontWeight: 600, fontSize: 12.5, marginTop: 2 }}>{o.hint}</span>
          </span>
        </button>
      ))}
      {current.needsReason ? (
        <label className="fld">
          Reason (kept in the case record{choice === 'warning' ? ', and sent to them as the warning' : ''})
          <textarea className="inp" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} placeholder="What happened and why this action." />
        </label>
      ) : null}
      {!verdict.ok ? <div className="note y" style={{ padding: '10px 12px', fontSize: 13 }}>{verdict.hint}</div> : null}
      {state.error ? <div className="note red" role="alert" style={{ padding: '10px 12px', fontSize: 13 }}>{state.error}</div> : null}
      {state.ok ? <div className="note g" role="status" style={{ padding: '10px 12px', fontSize: 13 }}>{state.ok}</div> : null}
      <button type="submit" className={`btn full${current.tone === 'stop' ? ' red' : ''}${!verdict.ok || pending ? ' off' : ''}`} style={{ height: 46 }} disabled={!verdict.ok || pending}>
        {pending ? 'Saving...' : choice === 'keep_open' ? 'Mark in review' : 'Save status'}
      </button>
    </form>
  );
}
