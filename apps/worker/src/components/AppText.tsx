import { Text, type TextProps } from 'react-native';

import { colors, textStyles, type TextVariant } from '@/theme';

type Props = TextProps & { variant?: TextVariant; color?: string };

export function AppText({ variant = 'body', color = colors.ink, style, ...rest }: Props) {
  return <Text {...rest} style={[textStyles[variant], { color }, style]} />;
}
