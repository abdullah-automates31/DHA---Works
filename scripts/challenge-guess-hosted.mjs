// Brute-force drill against hosted DEV ONLY (ref xiozwoocisesgmegewww). Sends wrong one-time codes for a number that
// does not exist: no SMS or WhatsApp is sent and no account is touched. It reveals the real "token verifications"
// limit (Authentication > Rate Limits). Needs HOSTED_ANON_KEY in the environment (the public anon key).
// Warning: after it runs, this address cannot verify any code for about 5 minutes.
const REF = 'xiozwoocisesgmegewww';
const anon = process.env.HOSTED_ANON_KEY;
if (!anon) throw new Error('set HOSTED_ANON_KEY (public anon key of the DEV project)');
const WANT = 10;
let blockedAt = null;
for (let i = 1; i <= 60; i++) {
  const res = await fetch(`https://${REF}.supabase.co/auth/v1/verify`, {
    method: 'POST',
    headers: { apikey: anon, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'sms', phone: '923009990000', token: String(100000 + i * 7919).slice(0, 6) }),
  });
  if (res.status === 429) { blockedAt = i; break; }
}
const limit = blockedAt === null ? null : blockedAt - 1;
const ok = limit !== null && limit <= WANT;
console.log(ok
  ? `PASS  guessing is cut off after ${limit} wrong codes per 5 minutes`
  : `FAIL  guessing is allowed ${limit === null ? '60+' : limit} wrong codes per 5 minutes; wanted ${WANT} or fewer. Set Authentication > Rate Limits > token verifications to ${WANT}.`);
process.exit(ok ? 0 : 1);
