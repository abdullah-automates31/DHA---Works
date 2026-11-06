// `npm run safety:prod-ready`: lists what still blocks a production Supabase project. Exits 1 while anything is open.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkProductionReady } from './lib/production-ready.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const issues = checkProductionReady(readFileSync(join(root, 'supabase/config.toml'), 'utf8'));
if (issues.length === 0) console.log('production readiness (tracked config): OK. Still check the hosted dashboard by hand.');
else {
  console.error(`production readiness: ${issues.length} blocker(s)`);
  for (const i of issues) console.error(`  [${i.code}] ${i.message}`);
  process.exit(1);
}
