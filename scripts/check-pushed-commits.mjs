// Used by .githooks/pre-push: checks the Supabase config in every commit about to be pushed (not the working
// tree), because a commit that already holds a test OTP or credential would publish it even if a later edit removed it.
// git feeds the hook lines of "<local ref> <local sha> <remote ref> <remote sha>" on stdin.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkSharedConfig } from './lib/config-guard.mjs';

const ZERO = /^0+$/;
const CONFIG_FILE = /^supabase\/.*config.*\.toml$/;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Shas that the push would add: new branch = everything not already on a remote; update = remote..local. */
export function commitsToPush(cwd, localSha, remoteSha) {
  if (ZERO.test(localSha)) return []; // branch deletion
  const range = ZERO.test(remoteSha) ? [localSha, '--not', '--remotes'] : [`${remoteSha}..${localSha}`];
  return git(cwd, ['rev-list', ...range]).split(/\r?\n/).filter(Boolean);
}

export function checkCommit(cwd, sha) {
  const issues = [];
  const files = git(cwd, ['ls-tree', '-r', '--name-only', sha]).split(/\r?\n/).filter(Boolean);
  for (const file of files.filter((f) => CONFIG_FILE.test(f))) {
    for (const issue of checkSharedConfig(git(cwd, ['show', `${sha}:${file}`]))) {
      issues.push({ ...issue, message: `${sha.slice(0, 8)} ${file}: ${issue.message}` });
    }
  }
  if (files.some((f) => f.startsWith('.supabase-local/'))) {
    issues.push({ code: 'LOCAL_WORKDIR_TRACKED', message: `${sha.slice(0, 8)}: .supabase-local/ is committed` });
  }
  return issues;
}

export function checkPush(cwd, stdinText) {
  const issues = [];
  for (const line of stdinText.split(/\r?\n/).filter(Boolean)) {
    const [, localSha, , remoteSha] = line.trim().split(/\s+/);
    for (const sha of commitsToPush(cwd, localSha, remoteSha)) issues.push(...checkCommit(cwd, sha));
  }
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let input = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) input += chunk;
  const issues = checkPush(process.cwd(), input);
  if (issues.length === 0) {
    console.log('pre-push: pushed commits hold no static test OTPs or literal/placeholder credentials');
  } else {
    console.error('pre-push: blocked, a commit being pushed has an unsafe Supabase config:');
    for (const issue of issues) console.error(`  [${issue.code}] ${issue.message}`);
    process.exit(1);
  }
}
