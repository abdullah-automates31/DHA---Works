// Fails when the tracked Supabase config holds local-only data (static test OTPs, literal or placeholder
// credentials). Run by `npm run safety:supabase`, the local start wrapper, the push wrapper and the pre-push hook.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSharedConfig } from './lib/config-guard.mjs';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function trackedFiles() {
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
}

export function checkRepo() {
  const issues = [];
  const files = trackedFiles();
  for (const file of files.filter((f) => /^supabase\/.*config.*\.toml$/.test(f))) {
    for (const issue of checkSharedConfig(readFileSync(join(root, file), 'utf8'))) {
      issues.push({ ...issue, message: `${file}: ${issue.message}` });
    }
  }
  if (files.some((f) => f.startsWith('.supabase-local/'))) {
    issues.push({ code: 'LOCAL_WORKDIR_TRACKED', message: '.supabase-local/ is tracked by git; it holds the local test OTP config' });
  }
  return issues;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const issues = checkRepo();
  if (issues.length === 0) {
    console.log('supabase config guard: OK (no static test OTPs, no literal or placeholder credentials)');
  } else {
    console.error('supabase config guard: FAILED');
    for (const issue of issues) console.error(`  [${issue.code}] ${issue.message}`);
    process.exit(1);
  }
}
