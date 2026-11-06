import { CancellationsView } from '@/features/jobs/CancellationsView';

export default async function CancellationsPage({ searchParams }: { searchParams: Promise<{ show?: string; page?: string }> }) {
  return <CancellationsView params={await searchParams} />;
}
