import { en, type EnglishMessages } from './en';
import { translate, type KeyPaths, type Params } from './translate';

export type TranslationKey = KeyPaths<EnglishMessages>;

/** Only English exists; add a locale map and a language setting when Urdu is written. */
export function t(key: TranslationKey, params?: Params): string {
  return translate(en, key, params);
}
