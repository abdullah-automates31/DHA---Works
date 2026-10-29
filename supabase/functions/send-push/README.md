# send-push (Expo push dispatcher)

Status: **implemented and tested locally, NOT deployed.** Deployment waits for
the user's go-ahead, the secret and a scheduler (0014 is on hosted DEV).

## What it does

Reads `notifications` rows with `push_sent_at is null` (created in the last 24
h), finds the owner's rows in `device_tokens`, sends them through the Expo push
service (`https://exp.host/--/api/v2/push/send`, batches of 100) and sets
`push_sent_at`. The `notifications` table already stores every alert, so a
failed push loses nothing.

## How it is called

Server to server only (pg_cron + pg_net, or a database webhook), `POST` with
header `x-push-secret: <PUSH_DISPATCH_SECRET>` and an optional body
`{"limit": 1..100}`. No other input is accepted. Apps never call it. The
schedule/webhook is not created yet (it needs a migration and a deployed
function).

## Security

- Shared-secret check, constant time, fails closed if the secret is unset.
  `verify_jwt = false` in `config.toml` because the callers are not users; the
  secret is the gate.
- Recipients are never taken from the request. They come from
  `notifications.user_id`; only that user's own tokens are used. A body naming
  `user_id`, `to`, tokens etc. is rejected with 400.
- Rows are claimed one by one (`update ... where push_sent_at is null`), so two
  runs never send the same notification twice. After an Expo outage
  (5xx/429/network) the rows are released for retry; a 400 is not retried.
- `DeviceNotRegistered` tokens are deleted. Tokens that do not look like Expo
  tokens are never forwarded. Suspended accounts get no push.
- Push text uses only the job title (cleaned, 60 characters). No phone, plot
  number, name or amount. Unknown notification types get a generic message.
- Responses and logs contain counts only: no tokens, user ids or message text.
  The service-role key stays inside the function environment.

## Secrets (set with `supabase secrets set`, never committed)

`PUSH_DISPATCH_SECRET` (required, long random), `EXPO_ACCESS_TOKEN` (optional,
enables Expo enhanced security). `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
are injected by Supabase.

## Database privileges

Migration `20261029000014_send_push_grants.sql` gives `service_role` exactly
what the queries in `index.ts` use, column by column: read the push columns of
`notifications` (not `read_at`) and update only `push_sent_at`; read `user_id`
and `push_token` of `device_tokens` and delete rows; read `id` and
`account_status` of `profiles`. Nothing for `anon` or `authenticated`.
`supabase/tests/service_role_grants.test.sql` pins these privileges. If the
function starts using another column, add a grant in a new migration and update
that test. 0014 is applied on hosted DEV (29 Oct).

## Tests

- `deno test` in this folder: 23 unit tests (authorization, validation,
  recipients, tokens, failures, privacy).
- `bash supabase/functions/send-push/integration/run.sh` from the repo root with
  the local stack running: 12 end-to-end checks against the real local database
  and a mock Expo server. Then `supabase db reset`.
- `supabase/tests/notifications_privacy.test.sql` (pgTAP): who can read or
  change notifications and device tokens.
- `supabase/tests/service_role_grants.test.sql` (pgTAP): the exact privileges
  from migration 0014.

## Not covered

Expo push receipts (delivery confirmation after the fact), a scheduler, and a
real push to a physical phone (needs the apps and an Expo project id).
