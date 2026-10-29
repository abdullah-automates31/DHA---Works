// Pure translation core (no React Native imports) so it can be unit tested with node --test.
export type Messages = { readonly [key: string]: string | Messages };

export type KeyPaths<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${KeyPaths<T[K]>}`;
}[keyof T & string];

export type Params = Record<string, string | number>;

function lookup(messages: Messages, key: string): string | undefined {
  let node: string | Messages | undefined = messages;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** Fills `{name}` placeholders. A missing key returns the key itself so gaps are visible, not blank. */
export function translate(messages: Messages, key: string, params?: Params): string {
  const template = lookup(messages, key);
  if (template === undefined) return key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}
