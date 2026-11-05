// The .ts extensions let the pure rules files (features/*/rules.ts) import this under `node --test` as well as in the app.
import { en, type EnglishMessages } from './en.ts';
import { translate, type KeyPaths, type Params } from './translate.ts';

export type TranslationKey = KeyPaths<EnglishMessages>;

/** Only English exists; add a locale map and a language setting when Urdu is written. */
export function t(key: TranslationKey, params?: Params): string {
  return translate(en, key, params);
}
