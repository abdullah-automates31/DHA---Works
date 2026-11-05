import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

// Guards for the rules of the 5 Nov performance work (docs/PERFORMANCE.md). They read the app's own source, so a
// future change that breaks a rule fails here instead of showing up as a slow screen.

const SRC = join(import.meta.dirname, '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(path);
  }
  return out;
}

const FILES = sourceFiles(SRC).map((path) => ({ path: path.slice(SRC.length + 1), text: readFileSync(path, 'utf8') }));

test('no query asks for every column: select("*") and a bare select() are not allowed', () => {
  const offenders = FILES.filter(({ text }) => /\.select\(\s*(\)|['"`]\s*\*\s*['"`])/.test(text) || /\.select\(\s*['"`][^'"`]*(^|,)\s*\*\s*(,|['"`])/.test(text)).map((f) => f.path);
  assert.deepEqual(offenders, [], 'name the columns the screen draws');
});

test('no list endpoint is read without a limit or a range', () => {
  // Reads from the growing tables must be paged. Config-sized tables (categories, service_areas, app_settings, the
  // worker's own single rows) are exempt.
  const GROWING = ['worker_feed', 'worker_jobs', 'notifications', 'job_photos', 'cash_records', 'quotes', 'job_interests'];
  const offenders: string[] = [];
  for (const { path, text } of FILES) {
    for (const table of GROWING) {
      for (const match of text.matchAll(new RegExp(`\\.from\\('${table}'\\)([\\s\\S]*?)(?=\\n\\s*(?:\\.from\\(|const |let |return |\\}\\)|\\]\\))|;)`, 'g'))) {
        const chain = match[1] ?? '';
        const single = /\.(maybeSingle|single)\(\)/.test(chain) || /head:\s*true/.test(chain);
        const bounded = /\.(limit|range)\(/.test(chain);
        // a read narrowed to one job by id is a single-job read, not a list
        const oneJob = /\.eq\('(id|job_id)',/.test(chain);
        if (!single && !bounded && !oneJob) offenders.push(`${path}: ${table}`);
      }
    }
  }
  assert.deepEqual(offenders, [], 'add .range(...) / .limit(...) (see lib/usePaged.ts)');
});

test('no screen queries inside a loop (N+1): every await on a query sits outside map/for/forEach callbacks', () => {
  const offenders: string[] = [];
  for (const { path, text } of FILES) {
    if (/\.(map|forEach|flatMap)\(\s*async/.test(text) && /supabase/.test(text)) offenders.push(`${path}: async map over rows`);
    if (/for\s*\([^)]*\)\s*\{[^}]*await\s+supabase/.test(text)) offenders.push(`${path}: await supabase inside a for loop`);
  }
  assert.deepEqual(offenders, [], 'fetch the whole set in one query (a join, or .in(...)) instead of one query per row');
});
