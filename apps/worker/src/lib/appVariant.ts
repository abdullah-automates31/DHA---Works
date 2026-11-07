// Which backend and identity a build uses. Fixed when the build is made (APP_VARIANT), never at runtime.
// Unset means development, so a local run can never be mistaken for the production app.
export type AppVariant = 'development' | 'production';

export function resolveVariant(raw: string | undefined): AppVariant {
  return raw === 'production' ? 'production' : 'development';
}

export type VariantIdentity = {
  name: string;
  scheme: string;
  androidPackage: string;
  iosBundleId: string;
};

const BASE = { name: 'DHA Works Worker', scheme: 'dhaworksworker', id: 'pk.dhaworks.worker' };

// Development gets its own ids so a tester can keep both apps on one phone.
export function identityFor(variant: AppVariant): VariantIdentity {
  if (variant === 'production') {
    return { name: BASE.name, scheme: BASE.scheme, androidPackage: BASE.id, iosBundleId: BASE.id };
  }
  return {
    name: `${BASE.name} (Dev)`,
    scheme: `${BASE.scheme}dev`,
    androidPackage: `${BASE.id}.dev`,
    iosBundleId: `${BASE.id}.dev`,
  };
}
