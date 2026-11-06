import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@dha/supabase';
import { loadCounts } from '@/features/verification/queries';
import { Icon, ICONS } from './ui';
import { Sidebar } from './Sidebar';

type Props = {
  supabase: SupabaseClient<Database>;
  user: User;
  active: string;
  title: string;
  sub?: string;
  back?: { href: string; label: string };
  right?: ReactNode;
  children: ReactNode;
};

/** The sidebar, header and content area of every portal screen. Pages call requireAdmin() first and pass the client in. */
export async function PortalFrame({ supabase, user, active, title, sub, back, right, children }: Props) {
  const [profile, workers, residents] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
    loadCounts(supabase, 'worker'),
    loadCounts(supabase, 'resident'),
  ]);
  return (
    <div className="app">
      <Sidebar active={active} name={profile.data?.full_name ?? null} workers={workers.pending ?? 0} residents={residents.pending ?? 0} />
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
