// All UI text lives here (English first, Urdu later). Add keys per screen as screens are built.
export const en = {
  app: {
    name: 'DHA Works',
    workerSuffix: 'Worker',
    tagline: 'Home for Defenders',
  },
  common: {
    continue: 'Continue',
    back: 'Back',
    cancel: 'Cancel',
    retry: 'Try again',
    loading: 'Loading',
  },
  foundation: {
    title: 'Worker app',
    signedOut: 'Not signed in',
    signedIn: 'Signed in',
    envMissing: 'Supabase is not configured. Copy apps/worker/.env.example to .env.',
  },
} as const;

export type EnglishMessages = typeof en;
