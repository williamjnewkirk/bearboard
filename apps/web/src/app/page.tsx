import { DAY_TYPES } from '@bearboard/shared';

export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Bearboard â Coach Command Center</h1>
      <p>Placeholder. The plan grid, roster, and dashboards live here.</p>
      <p style={{ color: '#666' }}>
        Shared types wired up: {DAY_TYPES.length} day types available.
      </p>
    </main>
  );
}
