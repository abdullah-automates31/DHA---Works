import { ReviewView } from '@/features/verification/ReviewView';

export default async function WorkerReviewPage({ params }: { params: Promise<{ id: string }> }) {
  return <ReviewView role="worker" id={(await params).id} />;
}
