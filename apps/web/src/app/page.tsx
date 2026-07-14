import { currentUser } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';

export default async function Home() {
  const user = await currentUser();

  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>BearBoard — Coach Command Center</h1>
        <UserButton />
      </header>
      <p>Signed in as {user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? 'unknown'}.</p>
      <p style={{ color: '#666' }}>Auth is wired. Next: team create/join, then the plan grid.</p>
    </main>
  );
}
