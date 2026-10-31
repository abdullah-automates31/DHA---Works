import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSharedConfig, parseTables } from './lib/config-guard.mjs';
import { buildLocalConfig, checkLocalArgs, LOCAL_TEST_OTPS, removeTable } from './lib/local-config.mjs';

const SHARED = `[auth.sms]
enable_signup = true

[auth.sms.twilio]
enabled = false
auth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"

[auth.mfa]
x = 1
`;

test('removeTable drops only the named table', () => {
  const out = removeTable(SHARED, 'auth.sms.twilio');
  assert.ok(!out.includes('auth.sms.twilio'));
  assert.ok(out.includes('[auth.sms]') && out.includes('[auth.mfa]'));
});

test('the local config has all five test OTPs and an enabled fake Twilio table', () => {
  const tables = parseTables(buildLocalConfig(SHARED));
  assert.equal(Object.keys(LOCAL_TEST_OTPS).length, 5);
  assert.deepEqual(tables['auth.sms.test_otp'], LOCAL_TEST_OTPS);
  assert.equal(tables['auth.sms.twilio'].enabled, 'true');
  assert.equal(tables['auth.mfa'].x, '1');
});

test('the local config is what the guard rejects, so it can never be the pushed one', () => {
  assert.ok(checkSharedConfig(buildLocalConfig(SHARED)).some((i) => i.code === 'TEST_OTP'));
});

test('building twice does not duplicate tables', () => {
  const once = buildLocalConfig(SHARED);
  assert.equal(buildLocalConfig(once), once);
});

test('the local wrapper allows local commands and blocks anything that can reach a hosted project', () => {
  for (const ok of [['start'], ['stop'], ['status'], ['db', 'reset'], ['db', 'lint', '--local'], ['test', 'db'], ['functions', 'serve']]) {
    assert.equal(checkLocalArgs(ok), null, ok.join(' '));
  }
  for (const bad of [[], ['config', 'push'], ['db', 'push'], ['link'], ['secrets', 'set'], ['db', 'lint', '--linked'], ['db', 'reset', '--db-url=x'], ['start', '--workdir', 'supabase'], ['migration', 'new', 'x'], ['db']]) {
    assert.notEqual(checkLocalArgs(bad), null, bad.join(' '));
  }
});
