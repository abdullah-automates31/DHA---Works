// Runs the Supabase CLI against a generated, git-ignored copy of the project (.supabase-local/) so the
// static test OTPs exist locally but never in supabase/config.toml, the file `supabase config push` sends.
// Usage: npm run db:local -- start | stop | status | db reset | db lint --local | test db | functions serve
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { checkRepo, root } from './check-supabase-config.mjs';
import { buildLocalConfig, checkLocalArgs } from './lib/local-config.mjs';

const COPIED = ['migrations', 'tests', 'functions', 'templates', 'dev'];
const workdir = join(root, '.supabase-local');
const args = process.argv.slice(2);

const problem = checkLocalArgs(args);
if (problem) {
  console.error(problem);
  process.exit(2);
}

const issues = checkRepo();
if (issues.length > 0) {
  console.error('Refusing to start: the tracked Supabase config is not clean.');
  for (const issue of issues) console.error(`  [${issue.code}] ${issue.message}`);
  process.exit(1);
}

// Rebuild from scratch on every run so the copy can never go stale. Containers and data are keyed by
// project_id, which is unchanged, so no database data is lost.
rmSync(workdir, { recursive: true, force: true });
mkdirSync(join(workdir, 'supabase'), { recursive: true });
for (const name of COPIED) {
  const from = join(root, 'supabase', name);
  if (existsSync(from)) cpSync(from, join(workdir, 'supabase', name), { recursive: true });
}
// Keep the service image versions that `supabase link` pinned in supabase/.temp. Without them the CLI falls back
// to older default images (for example storage-api 1.62.5), which break uploads on a database migrated by the
// pinned version. Only version pins are copied, never the project ref or link data.
const PINS = ['storage-version', 'storage-migration', 'gotrue-version', 'rest-version'];
mkdirSync(join(workdir, 'supabase', '.temp'), { recursive: true });
for (const name of PINS) {
  const from = join(root, 'supabase', '.temp', name);
  if (existsSync(from)) cpSync(from, join(workdir, 'supabase', '.temp', name));
}
writeFileSync(join(workdir, 'supabase', 'config.toml'), buildLocalConfig(readFileSync(join(root, 'supabase', 'config.toml'), 'utf8')));

// Relative path on purpose: the repo path contains a space and the CLI shim runs through a shell on Windows.
const result = spawnSync('supabase', ['--workdir', '.supabase-local', ...args], { cwd: root, stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
