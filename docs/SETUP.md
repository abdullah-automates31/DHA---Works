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
