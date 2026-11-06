import Link from 'next/link';
import type { ReactNode } from 'react';
import { Suspense } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dha/supabase';
import { loadReportCounts } from '@/features/reports/queries';
import { loadCounts } from '@/features/verification/queries';
import { Icon, ICONS } from './ui';
import { Sidebar } from './Sidebar';

type Props = {
  supabase: SupabaseClient<Database>;
  user: { id: string };
  active: string;
  title: string;
  sub?: string;
  back?: { href: string; label: string };
  right?: ReactNode;
  children: ReactNode;
};

/** The sidebar numbers (people waiting, open reports) load on their own so they never hold up the page itself. */
async function SidebarWithCounts({ supabase, userId, active }: { supabase: SupabaseClient<Database>; userId: string; active: string }) {
  const [profile, workers, residents, reports] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    loadCounts(supabase, 'worker'),
    loadCounts(supabase, 'resident'),
    loadReportCounts(supabase),
  ]);
  return <Sidebar active={active} name={profile.data?.full_name ?? null} workers={workers.pending ?? 0} residents={residents.pending ?? 0} reports={reports.open} />;
}

/** The sidebar, header and content area of every portal screen. Pages call requireAdmin() first and pass the client in. */
export function PortalFrame({ supabase, user, active, title, sub, back, right, children }: Props) {
  return (
    <div className="app">
      <Suspense fallback={<Sidebar active={active} name={null} workers={0} residents={0} reports={0} />}>
        <SidebarWithCounts supabase={supabase} userId={user.id} active={active} />
      </Suspense>
      <div className="main">
        <div className="top">
          {back ? (
            <Link className="btn soft sm" href={back.href}>
              <Icon size={16}>{ICONS.back}</Icon>
              {back.label}
            </Link>
          ) : null}
          <div className="fx">
            <h1>{title}</h1>
            {sub ? <div className="sub">{sub}</div> : null}
          </div>
          {right}
        </div>
        <div className="ct">{children}</div>
      </div>
    </div>
  );
}
