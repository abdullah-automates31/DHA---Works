'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/lib/action';
import { saveSettingsAction } from './actions';

const initial: ActionState = {};

/** Helpline number and show/hide, plus the report and review windows. Saved together. */
export function HelplineForm({ number, enabled, reportDays, reviewDays }: { number: string; enabled: boolean; reportDays: number; reviewDays: number }) {
  const [state, run, pending] = useActionState(saveSettingsAction, initial);
  return (
    <form action={run} className="col" style={{ gap: 12 }}>
      <div className="grid2" style={{ gap: 12 }}>
        <label className="fld">Helpline number<input className="inp" name="helplineNumber" defaultValue={number} placeholder="1092" maxLength={20} inputMode="tel" /></label>
        <label className="fld">Report window (days after a job)<input className="inp" name="reportDays" type="number" min={1} max={30} defaultValue={reportDays} required /></label>
      </div>
      <label className="fld">Review window (days after a job)<input className="inp" name="reviewDays" type="number" min={1} max={30} defaultValue={reviewDays} required style={{ maxWidth: 200 }} /></label>
      <label className="row g8 b" style={{ fontSize: 14 }}><input type="checkbox" name="helplineEnabled" defaultChecked={enabled} /> Show the helpline number in both apps (Help screen and the unsafe buttons)</label>
      <span className="mut" style={{ fontSize: 12.5 }}>Keep this off until DHA has confirmed the number. Residents and workers see the number only when it is on.</span>
      {state.error ? <div className="note red" role="alert" style={{ padding: '10px 12px', fontSize: 13 }}>{state.error}</div> : null}
      {state.ok ? <div className="note g" role="status" style={{ padding: '10px 12px', fontSize: 13 }}>{state.ok}</div> : null}
      <button type="submit" className={`btn${pending ? ' off' : ''}`} disabled={pending} style={{ alignSelf: 'flex-start' }}>{pending ? 'Saving...' : 'Save changes'}</button>
    </form>
  );
}
