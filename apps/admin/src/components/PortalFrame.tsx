import Link from 'next/link';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@dha/supabase';
import { Icon, ICONS } from './ui';

type Props = {
  // supabase, user and active are kept so existing pages compile; the sidebar now lives in (portal)/layout.tsx.
  supabase?: SupabaseClient<Database>;
  user?: { id: string };
  active?: string;
  title: string;
  sub?: string;
  back?: { href: string; label: string };
  right?: ReactNode;
  children: ReactNode;
};

/** The header and content area of every portal screen. The sidebar is in the shared layout so it never reloads. */
export function PortalFrame({ title, sub, back, right, children }: Props) {
  return (
    <>
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
    </>
  );
}
