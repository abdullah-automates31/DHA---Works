import { ReviewsView } from '@/features/reviews/ReviewsView';

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ stars?: string; cat?: string; q?: string; page?: string }> }) {
  return <ReviewsView params={await searchParams} />;
}
