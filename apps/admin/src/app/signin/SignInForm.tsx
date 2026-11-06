'use client';

import { useActionState } from 'react';
import { signInAction, type FormState } from './actions';

const initial: FormState = {};

export function SignInForm({ notAdmin }: { notAdmin: boolean }) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form className="si-form" action={action} noValidate>
      <div>
        <h2>Staff sign in</h2>
        <p>Only DHA staff with an admin account can sign in.</p>
      </div>
      {notAdmin && !state.error ? <div className="si-alert err">That account cannot use the portal.</div> : null}
      {state.error ? (
        <div className="si-alert err" role="alert">
          {state.error}
        </div>
      ) : null}
      <label className="fld">
        Work email
        <input className="inp" type="email" name="email" placeholder="name@dha-works.example" autoComplete="username" maxLength={254} required />
      </label>
      <label className="fld">
        Password
        <input className="inp" type="password" name="password" placeholder="Enter your password" autoComplete="current-password" maxLength={200} required />
      </label>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'Signing in...' : 'Sign in'}
      </button>
      <p className="si-foot">No account? Ask the DHA Works administrator to invite you.</p>
    </form>
  );
}
