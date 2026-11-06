import { UsersView } from '@/features/users/UsersView';

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string; state?: string; phase?: string; q?: string; page?: string }> }) {
  return <UsersView params={await searchParams} />;
}
