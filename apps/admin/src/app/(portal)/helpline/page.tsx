import { HelplineView } from '@/features/helpline/HelplineView';

export default async function HelplinePage({ searchParams }: { searchParams: Promise<{ range?: string; cb?: string; q?: string; page?: string }> }) {
  return <HelplineView params={await searchParams} />;
}
