import { render } from 'preact';
import { TeleopClient } from '@components/TeleopClient';
import { getAllParams } from '@utils/url';
import { DEFAULT_ROBOT_ID } from '@contracts';

export { DEFAULT_ROBOT_ID };

export function App() {
  const params = getAllParams();
  const robotId = params.robot_id?.trim() || DEFAULT_ROBOT_ID;

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
