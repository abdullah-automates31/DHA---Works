import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPushTarget, checkSharedConfig, parseTables } from './lib/config-guard.mjs';

const SAFE = `
[auth.sms]
enable_signup = true

[auth.sms.twilio]
enabled = false
account_sid = "env(SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID)"
message_service_sid = "env(SUPABASE_AUTH_SMS_TWILIO_MESSAGE_SERVICE_SID)"
auth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"
`;

const codes = (text) => checkSharedConfig(text).map((i) => i.code);

test('parseTables reads tables, quoted values and ignores comments', () => {
  const t = parseTables('# [auth.sms.test_otp]\n[a.b]\nx = "1" # note\ny = true\n');
  assert.deepEqual(t['a.b'], { x: '1', y: 'true' });
  assert.equal(t['auth.sms.test_otp'], undefined);
});

test('a clean shared config passes', () => {
  assert.deepEqual(codes(SAFE), []);
});

test('a commented-out test_otp example does not trip the guard', () => {
  assert.deepEqual(codes(`${SAFE}\n# [auth.sms.test_otp]\n# 4152127777 = "123456"\n`), []);
});

test('a static test OTP table fails', () => {
  assert.deepEqual(codes(`${SAFE}\n[auth.sms.test_otp]\n923001234567 = "123456"\n`), ['TEST_OTP']);
});

test('a phone-to-code line outside the expected table still fails', () => {
  assert.deepEqual(codes(`${SAFE}\n[auth.sms]\n923001234567 = "123456"\n`), ['TEST_OTP']);
});

test('literal and placeholder Twilio credentials fail', () => {
  const bad = SAFE.replace('env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)', 'placeholder').replace('env(SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID)', 'AC123abc');
  assert.deepEqual(codes(bad).sort(), ['LITERAL_CREDENTIAL', 'PLACEHOLDER_CREDENTIAL']);
});

test('an enabled Twilio table with an empty credential fails', () => {
  const bad = SAFE.replace('enabled = false', 'enabled = true').replace('env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)', '');
  assert.deepEqual(codes(bad), ['MISSING_CREDENTIAL']);
});

const targets = {
  cliVersion: '2.109.1',
  targets: { dev: { ref: 'devref', requireTwilio: false }, production: { ref: 'prodref', requireTwilio: true }, empty: { ref: null } },
  blockedRefs: ['relayref'],
};
const base = { targets, linkedRef: 'devref', cliVersion: '2.109.1', config: SAFE, env: {} };
const push = (over) => checkPushTarget({ ...base, targetName: 'dev', ...over }).map((i) => i.code);

test('a push to the linked dev project with a safe config passes', () => {
  assert.deepEqual(push({}), []);
});

test('unknown target, missing ref, wrong linked project and wrong CLI version fail', () => {
  assert.deepEqual(push({ targetName: 'staging' }), ['UNKNOWN_TARGET']);
  assert.deepEqual(push({ targetName: 'empty' }), ['NO_REF']);
  assert.deepEqual(push({ linkedRef: 'relayref' }), ['WRONG_PROJECT']);
  assert.deepEqual(push({ cliVersion: '2.110.0' }), ['CLI_VERSION']);
});

test('a blocked ref fails even when it is linked', () => {
  const t = { ...targets, targets: { dev: { ref: 'relayref' } } };
  assert.deepEqual(push({ targets: t, linkedRef: 'relayref' }), ['BLOCKED_REF']);
});

test('the push guard also rejects test OTPs in the config', () => {
  assert.ok(push({ config: `${SAFE}\n[auth.sms.test_otp]\n923001234567 = "123456"\n` }).includes('TEST_OTP'));
});

test('production needs Twilio enabled and real environment values', () => {
  const prod = (config, env) => push({ targetName: 'production', linkedRef: 'prodref', config, env });
  assert.deepEqual(prod(SAFE, {}), ['TWILIO_DISABLED', 'MISSING_PRODUCTION_CREDENTIAL', 'MISSING_PRODUCTION_CREDENTIAL', 'MISSING_PRODUCTION_CREDENTIAL']);
  const enabled = SAFE.replace('enabled = false', 'enabled = true');
  const full = { SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID: 'AC1', SUPABASE_AUTH_SMS_TWILIO_MESSAGE_SERVICE_SID: 'MG1', SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN: 'tok' };
  assert.deepEqual(prod(enabled, full), []);
  assert.deepEqual(prod(enabled, { ...full, SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN: 'placeholder' }), ['PLACEHOLDER_CREDENTIAL']);
});
