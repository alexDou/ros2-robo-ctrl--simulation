import { render } from 'preact';
import { TeleopClient } from '@components/TeleopClient';
import { getParam } from '@utils/url';

export function App() {
  let robotId: string;
  try {
    robotId = getParam('robot_id');
  } catch (err) {
    return (
      <div
        data-testid="error-banner"
        style={{
          maxWidth: '800px',
          margin: '2rem auto',
          padding: '1.5rem',
          fontFamily: 'sans-serif',
          backgroundColor: '#fee2e2',
          border: '1px solid #ef4444',
          borderRadius: '0.5rem',
          color: '#b91c1c',
        }}
      >
        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>Configuration Error</h2>
        <p style={{ margin: 0 }}>{(err as Error).message}</p>
      </div>
    );
  }

  return (
    <main>
      <TeleopClient robotId={robotId} />
    </main>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
