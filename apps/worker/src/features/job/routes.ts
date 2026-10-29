import type { Href } from 'expo-router';

// Links to the job screens. Built as plain paths (/job/<id> and /job/<id>/quote) so they do not depend on the
// generated route-type file, which lags behind new screens until the dev server regenerates it.
const SAFE_ID = /^[0-9a-fA-F-]{8,64}$/;

/** Only a uuid-looking id becomes a link; anything else falls back to the job list. */
export function jobHref(id: string): Href {
  return (SAFE_ID.test(id) ? `/job/${id}` : '/open-jobs') as Href;
}

export function quoteHref(id: string): Href {
  return (SAFE_ID.test(id) ? `/job/${id}/quote` : '/open-jobs') as Href;
}
