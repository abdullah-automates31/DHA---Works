// All UI text lives here (English first, Urdu later). Add keys per screen as screens are built.
export const en = {
  app: {
    name: 'DHA Works',
    workerSuffix: 'Worker',
    tagline: 'Home for Defenders',
    crestLabel: 'Pakistan Defence Officers Housing Authority crest',
  },
  common: {
    continue: 'Continue',
    back: 'Back',
    cancel: 'Cancel',
    retry: 'Try again',
    loading: 'Loading',
  },
  auth: {
    // W01 (copy from worker/screens/Main.dc.html)
    brandSub: 'For verified workers',
    headlineLead: 'Get jobs from verified ',
    headlineAccent: 'DHA homes.',
    heroBody: 'Set your own price, get paid in cash, and work only in the phases you choose.',
    chipPrice: 'Your price',
    chipVerified: 'DHA - Verified',
    chipPhases: 'Your phases',
    signInTitle: 'Sign in or apply',
    emailLabel: 'Email',
    emailPlaceholder: 'name@example.com',
    continueWithEmail: 'Continue with email',
    terms: 'By continuing you agree to the DHA Works worker terms. You collect cash directly from the customer.',
    // Code step: not in the approved designs yet (see docs/OPEN-QUESTIONS.md)
    codeTitle: 'Enter your code',
    codeSent: 'We sent a 6-digit code to {email}.',
    codeLabel: 'Code',
    codePlaceholder: '000000',
    verify: 'Verify and continue',
    resend: 'Send a new code',
    resendIn: 'Send a new code in {seconds}s',
    resent: 'A new code is on its way.',
    changeEmail: 'Use a different email',
    errors: {
      invalidEmail: 'Enter a valid email address.',
      invalidCode: 'Enter the 6-digit code from your email.',
      tooManyRequests: 'Too many attempts. Please wait a few minutes and try again.',
      wrongOrExpiredCode: 'That code is wrong or has expired. Check it or ask for a new one.',
      network: 'Could not reach the server. Check your internet connection and try again.',
      generic: 'Something went wrong. Please try again.',
    },
  },
  home: {
    // Temporary signed-in screen until onboarding (W02) and the feed exist.
    signedInAs: 'Signed in as {email}',
    comingNext: 'Your profile setup comes next.',
    signOut: 'Sign out',
  },
  foundation: {
    envMissing: 'Supabase is not configured. Copy apps/worker/.env.example to .env.',
  },
} as const;

export type EnglishMessages = typeof en;
