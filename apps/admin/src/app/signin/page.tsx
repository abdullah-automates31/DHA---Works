import { SignInShell } from '@/components/SignInShell';
import { SignInForm } from './SignInForm';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <SignInShell>
      {e === 'invited' ? <div className="note g" role="status" style={{ marginBottom: 12 }}>Your account is ready. Sign in with your email and password. A code is emailed to you on the next step.</div> : null}
      <SignInForm notAdmin={e === 'notadmin'} />
    </SignInShell>
  );
}
