import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

// "/" has no screen of its own: send people to the sign-in flow or the signed-in area.
export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/home' : '/sign-in'} />;
}
