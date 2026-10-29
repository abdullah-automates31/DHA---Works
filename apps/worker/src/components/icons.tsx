import Svg, { Circle, Path, Rect } from 'react-native-svg';

// Paths copied from the approved W01 design (worker/screens/Main.dc.html and dww.css .ic).
type IconProps = { size?: number; color?: string; strokeWidth?: number };

function Icon({
  size = 22,
  color = '#000',
  strokeWidth = 2,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </Svg>
  );
}

export const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="3" y="5" width="18" height="14" rx="2" />
    <Path d="M3 7l9 6 9-6" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const CashIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="3" y="7" width="18" height="10" rx="2" />
    <Circle cx="12" cy="12" r="2.5" />
  </Icon>
);

export const ShieldCheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
    <Path d="M9 12l2 2 4-4" />
  </Icon>
);

export const PinIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M12 21s7-6 7-12a7 7 0 0 0-14 0c0 6 7 12 7 12z" />
    <Circle cx="12" cy="9" r="2.5" />
  </Icon>
);
