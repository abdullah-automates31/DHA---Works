import Link from 'next/link';
import { ActionForm } from '@/components/FormKit';
import { EmptyRow } from '@/components/ListBits';
import { Chip } from '@/components/ui';
import { dateOnly } from '@/lib/format';
import { setReviewHiddenAction } from './actions';
import { starsOf, type ReviewRow } from './parse';

export function Stars({ score }: { score: number }) {
  const n = starsOf(score);
  return (
    <span aria-label={`${n} out of 5 stars`} style={{ letterSpacing: 2, whiteSpace: 'nowrap' }}>
      <span style={{ color: '#E0A800' }}>{'★'.repeat(n)}</span>
      <span style={{ color: '#D5E0D9' }}>{'★'.repeat(5 - n)}</span>
    </span>
  );
}

/** The review table of A15 and of the reviews tab on a worker's page. */
export function ReviewsTable({ rows, showWorker = true, empty }: { rows: ReviewRow[]; showWorker?: boolean; empty: string }) {
  return (
    <div className="tw">
      <table className="tbl">
        <thead>
          <tr>{showWorker ? <th>Worker</th> : null}<th>Rating</th><th>Review</th><th>Resident</th><th>Job</th><th>Date</th><th /></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={showWorker ? 7 : 6} text={empty} /> : null}
          {rows.map((r) => (
            <tr key={r.id} style={r.hiddenAt ? { opacity: 0.65 } : r.score < 2.5 ? { background: '#FDF1EF' } : undefined}>
              {showWorker ? <td><Link href={`/users/${r.workerId}`} className="xb" style={{ color: 'var(--g)', textDecoration: 'none' }}>{r.workerName}</Link><div className="mut" style={{ fontSize: 12.5 }}>{r.category ?? ''}</div></td> : null}
              <td>
                <Stars score={r.score} />
                <div className="mut" style={{ fontSize: 12 }}>Behaviour {r.behaviour} · Complete {r.completeness} · Quality {r.quality}{r.hireAgain ? ' · Would hire again' : ''}</div>
              </td>
              <td style={{ maxWidth: 360 }}>
                {r.comment ?? <span className="mut">No comment</span>}
                {r.hiddenAt ? <div style={{ marginTop: 4 }}><Chip tone="gray">Hidden</Chip> <span className="mut" style={{ fontSize: 12.5 }}>{r.hiddenReason}</span></div> : null}
              </td>
              <td>{r.residentName}</td>
              <td><Link href={`/jobs/${r.jobId}`} className="xb" style={{ color: 'var(--g)', textDecoration: 'none' }}>{r.jobCode}</Link></td>
              <td>{dateOnly(r.createdAt)}</td>
              <td style={{ minWidth: 190 }}>
                <details>
                  <summary className="btn out sm" style={{ cursor: 'pointer', display: 'inline-flex' }}>{r.hiddenAt ? 'Show again' : 'Hide'}</summary>
                  <div style={{ marginTop: 8 }}>
                    <ActionForm action={setReviewHiddenAction} hidden={{ reviewId: r.id, hide: r.hiddenAt ? '0' : '1' }} submit={r.hiddenAt ? 'Show this review' : 'Hide this review'} tone={r.hiddenAt ? 'soft' : 'red'} fields={[{ name: 'reason', kind: 'text', placeholder: 'Reason (kept in the record)', required: true, maxLength: 500 }]} />
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
