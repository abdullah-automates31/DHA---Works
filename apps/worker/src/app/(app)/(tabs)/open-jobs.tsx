import { TempScreen } from '@/components/TempScreen';
import { t } from '@/i18n';

// Temporary: the job feed (W07) is built next.
export default function OpenJobsPlaceholder() {
  return <TempScreen title={t('soon.openJobsTitle')} body={t('soon.openJobsBody')} noSignOut />;
}
