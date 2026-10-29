import { useRouter } from 'expo-router';

import { TempScreen } from '@/components/TempScreen';
import { t } from '@/i18n';

// Temporary: the profile (W16) is not built yet. It already offers the areas screen and sign out.
export default function ProfilePlaceholder() {
  const router = useRouter();
  return (
    <TempScreen
      title={t('soon.profileTitle')}
      body={t('soon.profileBody')}
      action={{ label: t('soon.changeAreas'), onPress: () => router.push('/areas') }}
    />
  );
}
