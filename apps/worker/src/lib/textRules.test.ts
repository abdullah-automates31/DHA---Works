import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { en } from '../i18n/en.ts';
import { translate } from '../i18n/translate.ts';

// Guards for the 5 Nov audit finding "text that bypasses src/i18n/en.ts" (L3). The pure rules files turn data into
// words; those words must live in en.ts so Urdu can be added in one place.

const SRC = join(import.meta.dirname, '..');
const RULE_FILES = ['features/myjobs/rules.ts', 'features/notifications/rules.ts', 'features/feed/format.ts', 'features/profile/summary.ts'];

// a quoted piece of text that reads like a sentence or label: a capital letter, then at least one more word
const SENTENCE = /(['"`])[A-Z][A-Za-z’']*(?: [A-Za-z’']+)+[.!?]?\1/;

test('the pure rules files hold no hard-coded sentences (they use t(...) and en.ts)', () => {
  const offenders: string[] = [];
  for (const file of RULE_FILES) {
    readFileSync(join(SRC, file), 'utf8')
      .split('\n')
      .forEach((line, index) => {
        const code = line.trim();
        if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*') || code.startsWith('import ')) return;
        const withoutTrailingComment = code.replace(/\s\/\/.*$/, '');
        if (SENTENCE.test(withoutTrailingComment)) offenders.push(`${file}:${index + 1}: ${code}`);
      });
  }
  assert.deepEqual(offenders, [], 'move the wording into src/i18n/en.ts and call t(key)');
});

test('every key used by the rules files exists in en.ts (a missing key would show as the key itself)', () => {
  const missing: string[] = [];
  for (const file of RULE_FILES) {
    const text = readFileSync(join(SRC, file), 'utf8');
    for (const match of text.matchAll(/\bt\(\s*'([^']+)'/g)) {
      const key = match[1] ?? '';
      if (translate(en, key) === key) missing.push(`${file}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
