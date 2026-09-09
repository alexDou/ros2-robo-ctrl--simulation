import { render } from 'preact';
import { TeleopClient } from './TeleopClient';

export function App() {
  return (
    <main>
      <TeleopClient robotId="robot-0" />
    </main>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
