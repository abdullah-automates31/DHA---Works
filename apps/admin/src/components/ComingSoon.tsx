import { PortalFrame } from '@/components/PortalFrame';
import { requireAdmin } from '@/lib/auth';

/** A screen from the design that is built in a later phase. It still checks the session, so it is not an open door. */
export async function ComingSoon({ href, title, text }: { href: string; title: string; text: string }) {
  const { supabase, user } = await requireAdmin();
  return (
    <PortalFrame supabase={supabase} user={user} active={href} title={title}>
      <div className="card col" style={{ maxWidth: 560 }}>
        <h2 className="h2">Not built yet</h2>
        <div className="mut">{text}</div>
      </div>
    </PortalFrame>
  );
}
