import { useLocalSearchParams, useRouter } from 'expo-router';

import { TempScreen } from '@/components/TempScreen';
import { t } from '@/i18n';

// Temporary: job detail (W08) is built next. It exists so the arrow on a feed card opens a real route
// (/job/<id>) and the route guard and back navigation can be tested now.
export default function JobDetailPlaceholder() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  void id;
  return (
    <TempScreen
      title={t('soon.jobTitle')}
      body={t('soon.jobBody')}
      action={{ label: t('common.back'), onPress: () => router.back() }}
      noSignOut
    />
  );
}
