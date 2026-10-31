import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSharedConfig, parseTables } from './lib/config-guard.mjs';
import { buildLocalConfig, checkLocalArgs, LOCAL_TEST_OTPS, parseEnvFile, removeTable, twilioFromEnv } from './lib/local-config.mjs';

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

test('parseEnvFile reads KEY=value lines, skips comments and strips matching quotes', () => {
  const env = parseEnvFile('# note\n\nTWILIO_ACCOUNT_SID=ACabc\nTWILIO_AUTH_TOKEN="tok"\nEMPTY=\n  SPACED = x y \n');
  assert.deepEqual(env, { TWILIO_ACCOUNT_SID: 'ACabc', TWILIO_AUTH_TOKEN: 'tok', EMPTY: '', SPACED: 'x y' });
});

test('twilioFromEnv needs the account, the token and one service; Verify wins over Messaging', () => {
  assert.equal(twilioFromEnv({}), null);
  assert.equal(twilioFromEnv({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't' }), null);
  assert.equal(twilioFromEnv({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_VERIFY_SERVICE_SID: 'VA1' }), null);
  const verify = twilioFromEnv({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_VERIFY_SERVICE_SID: 'VA1', TWILIO_MESSAGING_SERVICE_SID: 'MG1' });
  assert.equal(verify.provider, 'twilio_verify');
  assert.equal(verify.vars.LOCAL_TWILIO_SERVICE_SID, 'VA1');
  assert.equal(twilioFromEnv({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_MESSAGING_SERVICE_SID: 'MG1' }).provider, 'twilio');
});

test('with Twilio values the local config enables the real provider through env() and writes no secret', () => {
  const twilio = twilioFromEnv({ TWILIO_ACCOUNT_SID: 'ACsecret1', TWILIO_AUTH_TOKEN: 'tokensecret2', TWILIO_VERIFY_SERVICE_SID: 'VAsecret3' });
  const text = buildLocalConfig(SHARED, twilio);
  const tables = parseTables(text);
  assert.equal(tables['auth.sms.twilio_verify'].enabled, 'true');
  assert.equal(tables['auth.sms.twilio'], undefined);
  assert.deepEqual(tables['auth.sms.test_otp'], LOCAL_TEST_OTPS);
  for (const secret of ['ACsecret1', 'tokensecret2', 'VAsecret3']) assert.ok(!text.includes(secret));
  assert.equal(buildLocalConfig(text, twilio), text);
});
