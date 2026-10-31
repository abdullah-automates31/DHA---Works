import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { checkPush } from './check-pushed-commits.mjs';

const dir = mkdtempSync(join(tmpdir(), 'dha-push-'));
after(() => rmSync(dir, { recursive: true, force: true }));
const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' }).trim();

const SAFE = '[auth.sms.twilio]\nenabled = false\nauth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"\n';
const UNSAFE = `${SAFE}\n[auth.sms.test_otp]\n923001234567 = "123456"\n`;

function commit(config, message) {
  mkdirSync(join(dir, 'supabase'), { recursive: true });
  writeFileSync(join(dir, 'supabase', 'config.toml'), config);
  git('add', '.');
  git('commit', '-m', message);
  return git('rev-parse', 'HEAD');
}

git('init', '-q');
const ZERO = '0'.repeat(40);
const base = commit(SAFE, 'safe');
const bad = commit(UNSAFE, 'adds a test otp');
const fixed = commit(SAFE, 'removes it again');
const line = (local, remote) => `refs/heads/dev ${local} refs/heads/dev ${remote}\n`;

test('a safe commit range passes', () => {
  assert.deepEqual(checkPush(dir, line(base, ZERO)), []);
});

test('a commit holding a test OTP blocks the push even when a later commit removed it', () => {
  const issues = checkPush(dir, line(fixed, base));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'TEST_OTP');
  assert.ok(issues[0].message.startsWith(bad.slice(0, 8)));
});

test('a range that only contains the fixed commit passes', () => {
  assert.deepEqual(checkPush(dir, line(fixed, bad)), []);
});

test('a new branch is checked against everything not on a remote', () => {
  assert.equal(checkPush(dir, line(fixed, ZERO)).length, 1);
});

test('deleting a branch is not checked', () => {
  assert.deepEqual(checkPush(dir, `refs/heads/dev ${ZERO} refs/heads/dev ${fixed}\n`), []);
});
