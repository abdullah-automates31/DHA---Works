// Attack drill for the sign-in and takeover guards. LOCAL STACK ONLY (refuses any other address).
// Usage: npm run db:local -- start, seed supabase/dev/seed_phone_workers.sql, then: node scripts/challenge-auth-local.mjs
// Each check prints PASS or FAIL; the process exits 1 if any guard failed. It reads the local anon key and the
// static test OTP from the git-ignored .supabase-local config and the worker .env, and never prints them.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = readFileSync(join(root, 'apps/worker/.env'), 'utf8');
const anon = env.match(/EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
const BASE = 'http://127.0.0.1:55321';
const cfg = readFileSync(join(root, '.supabase-local/supabase/config.toml'), 'utf8');
const PHONE = '923001234567';
const OTHER = '923211234567';
const code = (phone) => cfg.match(new RegExp(`${phone}\\s*=\\s*"(\\d+)"`))?.[1];
if (!anon || !code(PHONE) || !code(OTHER)) throw new Error('local anon key or test OTP not found; is the local stack set up?');

const headers = { apikey: anon, 'content-type': 'application/json' };
const post = async (path, body, token) => {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  return { status: res.status, json: await res.json().catch(() => ({})) };
};
const sql = (q) => execFileSync('docker', ['exec', '-i', 'supabase_db_dha-works', 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c', q], { encoding: 'utf8' }).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`); if (!ok) failed++; };

async function signIn(phone) {
  const otp = await post('/auth/v1/otp', { phone });
  if (otp.status !== 200) return { otp };
  const v = await post('/auth/v1/verify', { type: 'sms', phone, token: code(phone) });
  return { otp, verify: v, session: v.json };
}

// Start from a clean slate for this account.
sql(`delete from auth.sessions where user_id = (select id from auth.users where phone = '${PHONE}')`);
sql(`delete from public.notifications where type = 'new_sign_in'`);
sql(`update public.profiles set account_status = 'active' where phone = '+${PHONE}'`);

// 1. Two real sign-ins -> the first device is told about the second.
const first = await signIn(PHONE);
check('sign-in 1 works with the OTP', first.verify?.status === 200, `status ${first.verify?.status}`);
const early = await post('/auth/v1/otp', { phone: PHONE });
check('asking for a second code within 60 s for the same number is refused', early.status === 429, `status ${early.status}`);
console.log('      waiting 61 s for the per-number limit...'); await sleep(61_000);
const second = await signIn(PHONE);
check('sign-in 2 (another device) works', second.verify?.status === 200, `status ${second.verify?.status}`);
const notices = sql(`select count(*) from public.notifications where type = 'new_sign_in' and user_id = (select id from auth.users where phone = '${PHONE}')`);
check('exactly one new_sign_in notice exists for the owner', notices === '1', `count ${notices}`);
const seen = await fetch(`${BASE}/rest/v1/notifications?type=eq.new_sign_in&select=type,payload`, { headers: { ...headers, authorization: `Bearer ${first.session.access_token}` } }).then((r) => r.json());
check('the first device can read the notice and it holds no data', Array.isArray(seen) && seen.length === 1 && JSON.stringify(seen[0].payload) === '{}');

// 1b. Sign out other devices: the stolen (first) session dies, the current (second) one stays.
const out = await post('/auth/v1/logout?scope=others', {}, second.session.access_token);
check('sign out other devices answers OK', out.status === 204 || out.status === 200, `status ${out.status}`);
const dead = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: first.session.refresh_token });
check('the other device can no longer refresh its session', dead.status >= 400, `status ${dead.status}`);
const alive = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: second.session.refresh_token });
check('this device stays signed in', alive.status === 200, `status ${alive.status}`);
second.session = alive.json;

// 2. Suspension kills the live sessions.
sql(`update public.profiles set account_status = 'suspended' where phone = '+${PHONE}'`);
const refresh = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: second.session.refresh_token });
check('a suspended worker cannot refresh the session', refresh.status >= 400, `status ${refresh.status}`);
const left = sql(`select count(*) from auth.sessions where user_id = (select id from auth.users where phone = '${PHONE}')`);
check('no session is left after suspension', left === '0', `sessions ${left}`);
sql(`update public.profiles set account_status = 'active' where phone = '+${PHONE}'`);

// 3. The sign-in phone cannot be changed over the API.
const third = await signIn(PHONE).catch(() => null);
const token = third?.session?.access_token ?? second.session.access_token;
const change = await fetch(`${BASE}/auth/v1/user`, { method: 'PUT', headers: { ...headers, authorization: `Bearer ${token}` }, body: JSON.stringify({ phone: '923001110099' }) });
const phoneNow = sql(`select phone from auth.users where id = (select id from auth.users where phone = '${PHONE}')`);
check('a signed-in user cannot move the account to another number', change.status >= 400 && phoneNow === PHONE, `status ${change.status}`);

console.log('\nnote: per-IP limits (code guessing, SMS flood) are not enforced by the local auth server (no rate-limit IP header).');
console.log('      Test them on hosted DEV with: HOSTED_ANON_KEY=... node scripts/challenge-guess-hosted.mjs');

console.log(failed === 0 ? '\nAll guards held.' : `\n${failed} guard(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
