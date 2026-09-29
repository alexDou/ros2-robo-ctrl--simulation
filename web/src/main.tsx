import { render } from 'preact';
import { TeleopClient } from '@components/TeleopClient';
import { getAllParams } from '@utils/url';
import { DEFAULT_ROBOT_ID } from '@contracts';

export { DEFAULT_ROBOT_ID };

export function App() {
  const params = getAllParams();
  const robotId = params.robot_id?.trim() || DEFAULT_ROBOT_ID;

  // Test knobs: a fixed deck/belt seed and a belt time scale (no effect when absent).
  const seed = params.seed ? Number(params.seed) : undefined;
  const timeScale = params.time_scale ? Number(params.time_scale) : undefined;

  return (
    <main>
      <TeleopClient robotId={robotId} seed={seed} timeScale={timeScale} />
    </main>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
