import { render } from 'preact';

export function App() {
  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>ROS2 Robot Simulation Visualizer</h1>
      <p>Status: Disconnected / Ready for Phase 1 stream</p>
    </div>
  );
}

const root = document.getElementById('app');
if (root) {
  render(<App />, root);
}
