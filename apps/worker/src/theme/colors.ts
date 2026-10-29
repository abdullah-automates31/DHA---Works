// Tokens from DHA-Works-UI/SPEC.md and worker/screens/dww.css. Do not invent new colours here.
export const colors = {
  green: '#0E5A3A',
  greenDark: '#0A3D28',
  greenMid: '#17704A',
  gold: '#E0B43A',
  goldOnDark: '#EBCB62',
  background: '#EEF4F1',
  surface: '#FFFFFF',
  ink: '#10261C',
  muted: '#4F6A5C',
  line: '#DCE6E0',
  mint: '#DCEBE2',
  onGreenMuted: '#BFDACB',
  placeholder: '#CFE0D6',
  // Status chips: background / text
  chip: {
    wait: { bg: '#F6E7B4', fg: '#5C4300' },
    scheduled: { bg: '#D6E6F7', fg: '#17406B' },
    inProgress: { bg: '#E5DDF5', fg: '#44297A' },
    done: { bg: '#C9E8D5', fg: '#0A5530' },
    declined: { bg: '#FADCDA', fg: '#99191A' },
  },
  // Sign-in screen (worker/screens/Main.dc.html) uses its own values.
  signIn: {
    paper: '#F7F8F4',
    hero: '#0F4F31',
    heroSubtitle: '#B9D3C4',
    heroBody: '#D3E4D9',
    heroRing: 'rgba(224,180,58,0.3)',
    chipBg: 'rgba(255,255,255,0.08)',
    chipBorder: 'rgba(255,255,255,0.22)',
    fieldBorder: '#C9CFCB',
    fieldText: '#33453B',
    footnote: '#6A7A71',
  },
} as const;
