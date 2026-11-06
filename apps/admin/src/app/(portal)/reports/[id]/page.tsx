import { ReportCase } from '@/features/reports/ReportCase';

export default async function ReportCasePage({ params }: { params: Promise<{ id: string }> }) {
  return <ReportCase id={(await params).id} />;
}
