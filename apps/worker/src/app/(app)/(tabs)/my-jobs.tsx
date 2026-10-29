import { TempScreen } from '@/components/TempScreen';
import { t } from '@/i18n';

// Temporary: My jobs (W11) is not built yet.
export default function MyJobsPlaceholder() {
  return <TempScreen title={t('soon.myJobsTitle')} body={t('soon.myJobsBody')} noSignOut />;
}
