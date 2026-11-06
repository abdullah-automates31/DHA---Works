import Link from 'next/link';
import { signOutAction } from '@/app/signin/actions';
import { initials } from '@/features/verification/rules';
import { Avatar, Icon, ICONS } from './ui';

type Item = { href: string; label: string; icon: keyof typeof ICONS; badge?: number; red?: boolean };

export function Sidebar({ active, name, workers, residents }: { active: string; name: string | null; workers: number; residents: number }) {
  const groups: { title?: string; items: Item[] }[] = [
    { items: [{ href: '/dashboard', label: 'Dashboard', icon: 'dashboard' }] },
    {
      title: 'Verification',
      items: [
        { href: '/workers', label: 'Workers', icon: 'workers', badge: workers },
        { href: '/residents', label: 'Residents', icon: 'residents', badge: residents },
      ],
    },
    {
      title: 'Operations',
      items: [
        { href: '/jobs', label: 'Jobs', icon: 'jobs' },
        { href: '/reports', label: 'Reports', icon: 'reports' },
        { href: '/helpline', label: 'Helpline log', icon: 'helpline' },
        { href: '/reviews', label: 'Reviews', icon: 'reviews' },
      ],
    },
    {
      title: 'Manage',
      items: [
        { href: '/users', label: 'Users', icon: 'users' },
        { href: '/settings', label: 'Settings', icon: 'settings' },
      ],
    },
  ];

  return (
    <aside className="nav">
      <div className="brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="crest" src="/dha-crest.png" alt="DHA Karachi" />
        <div>
          <b>DHA Works</b>
          <span>Admin portal</span>
        </div>
      </div>
      {groups.map((g, i) => (
        <div key={g.title ?? i} style={{ display: 'contents' }}>
          {g.title ? <div className="sep">{g.title}</div> : null}
          {g.items.map((it) => (
            <Link key={it.href} className={`ni${active === it.href ? ' on' : ''}`} href={it.href} aria-current={active === it.href ? 'page' : undefined}>
              <Icon>{ICONS[it.icon]}</Icon>
              {it.label}
              {it.badge ? <span className={`n${it.red ? ' r' : ''}`}>{it.badge}</span> : null}
            </Link>
          ))}
        </div>
      ))}
      <div className="me">
        <Avatar initials={initials(name)} seed={name ?? 'staff'} />
        <div>
          <b>{name ?? 'Staff member'}</b>
          <span>DHA staff</span>
        </div>
        <form action={signOutAction} style={{ marginLeft: 'auto' }}>
          <button type="submit" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: '#B9D3C4', fontWeight: 700, fontSize: 12, fontFamily: 'inherit' }}>
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
