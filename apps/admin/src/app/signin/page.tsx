import { SignInShell } from '@/components/SignInShell';
import { SignInForm } from './SignInForm';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <SignInShell>
      <SignInForm notAdmin={e === 'notadmin'} />
    </SignInShell>
  );
}
