// The only documented way to push Supabase auth config to a hosted project.
//   npm run supabase:config-push -- <target>            checks only, never pushes
//   npm run supabase:config-push -- <target> --run      pushes after every check passes
// Targets and the pinned CLI version live in scripts/supabase-targets.json. Run with --run only when the
// user asks for a hosted config push in the current task. A raw `supabase config push` bypasses these checks.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './check-supabase-config.mjs';
import { checkPushTarget } from './lib/config-guard.mjs';

const [targetName, ...flags] = process.argv.slice(2);
const targets = JSON.parse(readFileSync(join(root, 'scripts', 'supabase-targets.json'), 'utf8'));

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return env;
}

const cliVersion = spawnSync('supabase', ['--version'], { encoding: 'utf8', shell: true }).stdout?.trim();
const refFile = join(root, 'supabase', '.temp', 'project-ref');
const issues = checkPushTarget({
  targetName: targetName ?? '',
  targets,
  linkedRef: existsSync(refFile) ? readFileSync(refFile, 'utf8').trim() : null,
  cliVersion,
  config: readFileSync(join(root, 'supabase', 'config.toml'), 'utf8'),
  env: { ...readEnvFile(join(root, 'supabase', '.env')), ...readEnvFile(join(root, 'supabase', '.env.local')), ...process.env },
});

if (issues.length > 0) {
  console.error(`config push to "${targetName ?? ''}" refused:`);
  for (const issue of issues) console.error(`  [${issue.code}] ${issue.message}`);
  process.exit(1);
}

const ref = targets.targets[targetName].ref;
if (!flags.includes('--run')) {
  console.log(`All checks passed for "${targetName}" (${ref}). Nothing was pushed; add --run to push.`);
  process.exit(0);
}
const result = spawnSync('supabase', ['config', 'push', '--project-ref', ref], { cwd: root, stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
