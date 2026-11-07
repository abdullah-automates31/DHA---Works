import type { ExpoConfig } from 'expo/config';
import base from './app.base.json';
import { identityFor, resolveVariant } from './src/lib/appVariant.ts';

// One codebase, two builds. APP_VARIANT is set by the build profile in eas.json
// (development or production); unset means development. The backend (Supabase URL and key)
// comes from EXPO_PUBLIC_* values of the same environment. See docs/ENVIRONMENTS.md.
const variant = resolveVariant(process.env.APP_VARIANT);
const id = identityFor(variant);

const config: ExpoConfig = {
  ...(base.expo as ExpoConfig),
  name: id.name,
  scheme: id.scheme,
  android: { ...(base.expo.android as ExpoConfig['android']), package: id.androidPackage },
  ios: {
    bundleIdentifier: id.iosBundleId,
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  extra: { appVariant: variant },
};

export default config;
