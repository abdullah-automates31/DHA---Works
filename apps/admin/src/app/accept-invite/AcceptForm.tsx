'use client';

import { useActionState } from 'react';
import type { ActionState } from '@/lib/action';
import { acceptInviteAction } from '@/features/settings/actions';

const initial: ActionState = {};

export function AcceptForm({ email, token }: { email: string; token: string }) {
  const [state, run, pending] = useActionState(acceptInviteAction, initial);
  return (
    <form action={run} className="col" style={{ gap: 12 }}>
      <input type="hidden" name="token" value={token} />
      <label className="fld">Email<input className="inp" name="email" type="email" defaultValue={email} readOnly /></label>
      <label className="fld">Your full name<input className="inp" name="name" autoComplete="name" required maxLength={100} /></label>
      <label className="fld">Choose a password (12 characters or more)<input className="inp" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} /></label>
      <label className="fld">Type the password again<input className="inp" name="confirm" type="password" autoComplete="new-password" required minLength={12} maxLength={72} /></label>
      {state.error ? <div className="note red" role="alert" style={{ padding: '10px 12px', fontSize: 13 }}>{state.error}</div> : null}
      <button type="submit" className={`btn full${pending ? ' off' : ''}`} style={{ height: 46 }} disabled={pending}>{pending ? 'Creating...' : 'Create my staff account'}</button>
    </form>
  );
}
