import assert from 'node:assert/strict';
import { test } from 'node:test';

import { confirmPhoneChange, requestPhoneChange } from './phoneChange.ts';

test('requesting a change asks the server for a code on the new number and sends nothing else', async () => {
  const seen: unknown[] = [];
  const client = {
    async updateUser(a: { phone: string }) {
      seen.push(a);
      return { error: null };
    },
    verifyOtp: async () => ({ error: null }),
  };
  assert.deepEqual(await requestPhoneChange(client, '+923001234567'), { ok: true });
  assert.deepEqual(seen, [{ phone: '+923001234567' }]);
});

test('confirming uses the phone_change type with the code from the NEW number', async () => {
  const seen: unknown[] = [];
  const client = {
    updateUser: async () => ({ error: null }),
    async verifyOtp(a: { phone: string; token: string; type: 'phone_change' }) {
      seen.push(a);
      return { error: null };
    },
  };
  assert.deepEqual(await confirmPhoneChange(client, '+923001234567', '123456'), { ok: true });
  assert.deepEqual(seen, [{ phone: '+923001234567', token: '123456', type: 'phone_change' }]);
});

test('a wrong or expired code and a rate limit become friendly keys, a lost connection a network key', async () => {
  const wrong = { updateUser: async () => ({ error: null }), verifyOtp: async () => ({ error: { code: 'otp_expired' } }) };
  assert.deepEqual(await confirmPhoneChange(wrong, '+92300', '000000'), { ok: false, key: 'auth.errors.wrongOrExpiredCode' });
  const limited = { updateUser: async () => ({ error: { code: 'over_sms_send_rate_limit' } }), verifyOtp: async () => ({ error: null }) };
  assert.deepEqual(await requestPhoneChange(limited, '+92300'), { ok: false, key: 'auth.errors.tooManyRequests' });
  const down = {
    updateUser: async () => {
      throw new TypeError('Network request failed');
    },
    verifyOtp: async () => ({ error: null }),
  };
  assert.deepEqual(await requestPhoneChange(down, '+92300'), { ok: false, key: 'auth.errors.network' });
});
