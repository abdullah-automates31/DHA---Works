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

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d='M15 5l-7 7 7 7' />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x='5' y='11' width='14' height='9' rx='2' />
    <Path d='M8 11V8a4 4 0 0 1 8 0v3' />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d='M12 5v14M5 12h14' />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d='M5 12l5 5 9-10' />
  </Icon>
);

export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <Rect x="9" y="3" width="6" height="11" rx="3" />
    <Path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Icon>
);

export const PlayIcon = ({ size = 22, color = '#000' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M8 5v14l11-7z" fill={color} />
  </Svg>
);

export const PauseIcon = ({ size = 22, color = '#000' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="6" y="5" width="4" height="14" rx="1" fill={color} />
    <Rect x="14" y="5" width="4" height="14" rx="1" fill={color} />
  </Svg>
);

export const StopIcon = ({ size = 22, color = '#000' }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Rect x="6" y="6" width="12" height="12" rx="2" fill={color} />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <Circle cx="12" cy="12" r="9" />
    <Path d="M12 7v5l3 2" />
  </Icon>
);

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <Path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  </Icon>
);
