import { QueueView } from '@/features/verification/QueueView';

export default async function WorkersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <QueueView role="worker" params={await searchParams} />;
}
