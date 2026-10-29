import { TempScreen } from '@/components/TempScreen';
import { t } from '@/i18n';

// Temporary: areas (W05) and the job feed (W07) are not built yet. Reached only by approved workers.
export default function ApprovedPlaceholder() {
  return <TempScreen title={t('temp.approvedTitle')} body={t('temp.approvedBody')} />;
}
