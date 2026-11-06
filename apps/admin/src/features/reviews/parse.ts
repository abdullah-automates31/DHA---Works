// Worker reviews (migration 0042).
import { bool, int, isUuid, num, obj, page, str } from '../../lib/json.ts';

export type ReviewRow = {
  id: string; createdAt: string; comment: string | null; hireAgain: boolean; behaviour: number; completeness: number; quality: number; score: number;
  hiddenAt: string | null; hiddenReason: string | null; workerId: string; workerName: string; category: string | null; residentName: string; jobId: string; jobCode: string;
};

export function parseReviews(json: unknown) {
  const o = obj(json);
  const p = page<ReviewRow>(json, (r) => {
    if (!isUuid(r.id) || !isUuid(r.worker_id) || !str(r.created_at)) return null;
    return {
      id: r.id, createdAt: r.created_at as string, comment: str(r.comment), hireAgain: bool(r.hire_again), behaviour: int(r.behaviour), completeness: int(r.completeness),
      quality: int(r.quality), score: num(r.score) ?? 0, hiddenAt: str(r.hidden_at), hiddenReason: str(r.hidden_reason), workerId: r.worker_id,
      workerName: str(r.worker_name) ?? 'Unknown', category: str(r.category), residentName: str(r.resident_name) ?? 'Unknown', jobId: str(r.job_id) ?? '', jobCode: str(r.job_code) ?? '',
    };
  });
  return { ...p, hidden: int(o?.hidden), all: int(o?.all) };
}

/** Stars shown for a review: the average of the three scores, rounded (4.5 and above is five stars). */
export function starsOf(score: number): number {
  return Math.min(5, Math.max(0, Math.round(score)));
}
