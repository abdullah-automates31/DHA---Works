import { Image } from 'expo-image';

// The approved DHA crest (DHA-Works-UI/assets/dha-crest.png).
const source = require('../../assets/images/crest.png');

export function Crest({ size = 96 }: { size?: number }) {
  return (
    <Image
      source={source}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      accessibilityLabel="Pakistan Defence Officers Housing Authority crest"
    />
  );
}
