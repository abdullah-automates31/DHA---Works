import assert from 'node:assert/strict';
import { test } from 'node:test';

import { requestPhoneOtp, verifyPhoneOtp, type OtpClient } from './otp.ts';

function client(overrides: Partial<OtpClient> = {}): OtpClient {
  return {
    signInWithOtp: async () => ({ error: null }),
    verifyOtp: async () => ({ error: null }),
    ...overrides,
  };
}

test('requestPhoneOtp asks for a WhatsApp code and creates a user', async () => {
  let seen: Parameters<OtpClient['signInWithOtp']>[0] | undefined;
  const result = await requestPhoneOtp(
    client({
      signInWithOtp: async (credentials) => {
        seen = credentials;
        return { error: null };
      },
    }),
    '+923214567890',
  );

  assert.deepEqual(result, { ok: true });
  assert.equal(seen?.phone, '+923214567890');
  assert.equal(seen?.options.shouldCreateUser, true);
  assert.equal(seen?.options.channel, 'whatsapp');
});

test('requestPhoneOtp can ask for the code by SMS', async () => {
  let seen: Parameters<OtpClient['signInWithOtp']>[0] | undefined;
  await requestPhoneOtp(
    client({
      signInWithOtp: async (credentials) => {
        seen = credentials;
        return { error: null };
      },
    }),
    '+923214567890',
    'sms',
  );
  assert.equal(seen?.options.channel, 'sms');
});

test('verifyPhoneOtp verifies a phone OTP with type sms', async () => {
  let seen: Parameters<OtpClient['verifyOtp']>[0] | undefined;
  const result = await verifyPhoneOtp(
    client({
      verifyOtp: async (credentials) => {
        seen = credentials;
        return { error: null };
      },
    }),
    '+923214567890',
    '123456',
  );

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(seen, { phone: '+923214567890', token: '123456', type: 'sms' });
});

test('OTP failures are mapped to translation keys', async () => {
  const send = await requestPhoneOtp(
    client({ signInWithOtp: async () => ({ error: { code: 'sms_send_failed' } }) }),
    '+923214567890',
  );
  const verify = await verifyPhoneOtp(
    client({ verifyOtp: async () => ({ error: { code: 'otp_expired' } }) }),
    '+923214567890',
    '000000',
  );

  assert.deepEqual(send, { ok: false, key: 'auth.errors.sendFailed' });
  assert.deepEqual(verify, { ok: false, key: 'auth.errors.wrongOrExpiredCode' });
});

test('a thrown request is treated as a network failure', async () => {
  const result = await requestPhoneOtp(
    client({
      signInWithOtp: async () => {
        throw new TypeError('Network request failed');
      },
    }),
    '+923214567890',
  );

  assert.deepEqual(result, { ok: false, key: 'auth.errors.network' });
});
