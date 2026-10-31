import type { OtpChannel } from './otp.ts';

/**
 * Where the login code is sent. WhatsApp is the product; SMS exists so the code can be tried for real on the local
 * stack with a Twilio trial account (set EXPO_PUBLIC_OTP_CHANNEL=sms in apps/worker/.env). Not a secret.
 */
export const OTP_CHANNEL: OtpChannel = process.env.EXPO_PUBLIC_OTP_CHANNEL === 'sms' ? 'sms' : 'whatsapp';

/** Word for the channel in screen text. */
export const OTP_CHANNEL_NAME = OTP_CHANNEL === 'sms' ? 'SMS' : 'WhatsApp';
