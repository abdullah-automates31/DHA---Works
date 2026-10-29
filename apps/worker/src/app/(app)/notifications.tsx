import { useRouter } from 'expo-router';

import { TempScreen } from '@/components/TempScreen';
import { t } from '@/i18n';

// Temporary: notifications (W15) are not built yet.
export default function NotificationsPlaceholder() {
  const router = useRouter();
  return (
    <TempScreen
      title={t('soon.notificationsTitle')}
      body={t('soon.notificationsBody')}
      action={{ label: t('common.back'), onPress: () => router.back() }}
      noSignOut
    />
  );
}
