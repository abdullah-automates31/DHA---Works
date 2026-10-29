import { Image } from 'expo-image';

import { t } from '@/i18n';

// The approved DHA crest (DHA-Works-UI/assets/dha-crest.png), shown whole (object-fit: contain) as in the designs.
const source = require('../../assets/images/crest.png');

export function Crest({ size = 96, round = false }: { size?: number; round?: boolean }) {
  return (
    <Image
      source={source}
      contentFit="contain"
      style={{ width: size, height: size, borderRadius: round ? size / 2 : 0 }}
      accessibilityLabel={t('app.crestLabel')}
    />
  );
}
