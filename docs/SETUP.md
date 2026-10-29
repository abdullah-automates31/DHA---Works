# Developer Setup (planned)

Nothing here is installed or created yet. This describes what M0 will set up on a Windows 11 machine with no Mac.

## Prerequisites

- Node.js (LTS) and pnpm
- Git
- An Android phone with **Expo Go** (or an Android emulator)
- Docker Desktop (only if running the local Supabase stack)
- A Supabase account (project created only with explicit approval)
- Expo account for EAS Build

## First-time setup (at M0)

```bash
pnpm install
cp .env.example .env     # fill values locally; never commit .env
pnpm dev                 # runs apps through Turborepo
```

## Environment variables (names only)

| Variable | Where | Notes |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | mobile apps | public |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | mobile apps | publishable key only |
| `NEXT_PUBLIC_SUPABASE_URL` | admin | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | admin | publishable key only |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side / Edge Functions only | **never** in an app or browser |
| `EXPO_ACCESS_TOKEN` | CI / Edge Functions | push and builds |

## Conventions

- TypeScript everywhere; shared types in `packages/shared`.
- Database changes only as migration files in `supabase/migrations`.
- Separate Supabase projects for development, staging and production.
- Conventional, small commits.
- No secrets in the repository.

## Build and release

- Preview builds: EAS preview (APK for testers).
- Production: EAS production build to the Play Store.
- Admin: Vercel preview and production.

## Supabase CLI workflow (as used, 28 Oct)

- Windows: Supabase CLI 2.109.1 and Docker Desktop. Local stack: `supabase start`, `supabase db reset` (applies all migrations), `supabase test db` (pgTAP), `supabase db lint --local`.
- Hosted project (production-like, free tier): ref `xiozwoocisesgmegewww`, eu-west-1, Postgres 17, account `dhaworks.developments@gmail.com`. The user runs `supabase login`, `supabase link --project-ref xiozwoocisesgmegewww` and `supabase db push` themselves in their own PowerShell. Check with `supabase migration list --linked` and `supabase db lint --linked`.
- A leftover Relay project (another product, other account) may auto-start in Docker; never touch it. Stop with `supabase stop --project-id Relay`.
- Concurrency check: `bash supabase/tests/concurrency/accept_race.sh` then `supabase db reset`.
- The `pg-delta` "failed to cache migrations catalog" warning after `db push` is harmless.
- Full session handover: [HANDOVER.md](HANDOVER.md).

## Environments and branches (set 28 Oct)

GitHub: `https://github.com/abdullah-automates31/DHA---Works.git`

| Environment | Git branch | Supabase project | Status |
| --- | --- | --- | --- |
| **Dev** | `dev` | `xiozwoocisesgmegewww` (the currently linked project) | Active. All work goes here. |
| **Production** | `main` | not created yet | The user creates it later (new project, own ref, own keys) and links it only at release time. |

Rules:
- All work happens on `dev` (or short branches off `dev`). Nothing is pushed to `main` or to a production Supabase project until the user says so.
- Release = merge `dev` into `main`, then the user runs `supabase link --project-ref <prod ref>` and `supabase db push` against production. Link back to the dev ref afterwards.
- Migrations are the same files in both environments; never edit either database by hand.
- Keep separate keys per environment in untracked `.env` files; only `.env.example` is committed.

## Push Edge Function (built 29 Oct, not deployed)

`supabase/functions/send-push`, see its README. Local checks: `cd supabase/functions/send-push && deno test`, and `bash supabase/functions/send-push/integration/run.sh` (then `supabase db reset`). Deploying needs: migration `20261029000014_send_push_grants.sql` applied to the target project (on DEV since 29 Oct), `supabase secrets set PUSH_DISPATCH_SECRET=...`, `supabase functions deploy send-push`, and a scheduler call. Types: `packages/supabase/database.types.ts` was generated from DEV with `supabase gen types typescript --linked`.
