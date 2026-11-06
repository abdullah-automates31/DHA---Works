import { JobsView } from '@/features/jobs/JobsView';

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ status?: string; phase?: string; cat?: string; today?: string; q?: string; page?: string }> }) {
  return <JobsView params={await searchParams} />;
}
