// Plus Jakarta Sans, weights 400-800 (SPEC.md). Sizes follow dww.css.
export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const textStyles = {
  h1: { fontFamily: fontFamily.extrabold, fontSize: 28, lineHeight: 32, letterSpacing: -0.56 },
  h2: { fontFamily: fontFamily.extrabold, fontSize: 18, lineHeight: 24 },
  h3: { fontFamily: fontFamily.extrabold, fontSize: 15, lineHeight: 20 },
  body: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  bodyBold: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 20 },
  small: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  caption: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16 },
  button: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 20 },
} as const;

export type TextVariant = keyof typeof textStyles;
