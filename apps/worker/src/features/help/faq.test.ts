import assert from 'node:assert/strict';
import { test } from 'node:test';

import { faqs } from './faq.ts';

test('four questions, none about claiming or calling before acceptance', () => {
  const list = faqs(null);
  assert.equal(list.length, 4);
  const text = list.map((f) => f.question + f.answer).join(' ').toLowerCase();
  assert.ok(!text.includes('claim'));
  assert.ok(!text.includes('call the customer'));
});

test('the helpline number appears in an answer only when it is passed in', () => {
  assert.ok(!faqs(null).map((f) => f.answer).join(' ').includes('1092'));
  assert.ok(faqs('1092').some((f) => f.answer.includes('helpline on 1092')));
});
