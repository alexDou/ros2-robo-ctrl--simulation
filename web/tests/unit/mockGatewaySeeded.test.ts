import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { MockGateway } from '../e2e/support/mock_gateway';
import { DEFAULT_ROBOT_ID, WHITE_TOWER, GREEN_TOWER, SCRAP_BIN, STACK_STEP_M } from '../../domain/contracts';

function wsUrl(gateway: MockGateway): string { return `ws://127.0.0.1:${gateway.port}/ws/teleop/robot/${DEFAULT_ROBOT_ID}`; }
function sendSpawn(ws: WebSocket, id: string, x = 0.5, y = 0.0): void { ws.send(JSON.stringify({ command_id: id, sender_id: 'ui-test', timestamp_ns: Date.now() * 1_000_000, type: 'SPAWN_OBJECT', payload: { x, y, z: 0.0, object_type: 'GEAR' } })); }
function sendClear(ws: WebSocket, id: string): void { ws.send(JSON.stringify({ command_id: id, sender_id: 'ui-test', timestamp_ns: Date.now() * 1_000_000, type: 'CLEAR_WORKSPACE', payload: {} })); }
async function openWs(gateway: MockGateway): Promise<WebSocket> { const ws = new WebSocket(wsUrl(gateway)); await new Promise<void>((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); }); return ws; }
async function waitFor(cond: () => boolean, timeoutMs = 10000, stepMs = 50): Promise<void> { const deadline = Date.now() + timeoutMs; for (;;) { if (cond()) return; if (Date.now() > deadline) throw new Error('waitFor timed out'); await new Promise((r) => setTimeout(r, stepMs)); } }

describe('Unit 7.4: MockGateway seeded hermetic classification', () => {
  let gateway: MockGateway;
  beforeEach(async () => { gateway = new MockGateway({ port: 0, host: '127.0.0.1' }); await gateway.start(); });
  afterEach(async () => { await gateway.close(); });
  it('replays seeded sequence exactly and wraps around', async () => {
    gateway.setAutoExecutePickAndPlace(false);
    gateway.setClassificationSequence([{ color: 'GREEN', intact: true }, { color: 'BLUE', intact: false }, { color: 'WHITE', intact: true }]);
    const ws = await openWs(gateway);
    try {
      const seen: Array<[string, boolean]> = [];
      let prevId: string | null = null;
      for (let k = 0; k < 4; k++) { sendSpawn(ws, `seq-${k}`); await waitFor(() => gateway.getWorkcellSnapshot().spawned.length === 1 && gateway.getWorkcellSnapshot().spawned[0].id !== prevId); const e = gateway.getWorkcellSnapshot().spawned[0]; prevId = e.id; seen.push([e.color, e.intact]); }
      expect(seen).toEqual([['GREEN', true], ['BLUE', false], ['WHITE', true], ['GREEN', true]]);
    } finally { ws.close(); }
  });
  it('defaults to WHITE sound when no sequence set', async () => {
    gateway.setAutoExecutePickAndPlace(false);
    const ws = await openWs(gateway);
    try { sendSpawn(ws, 'default-1'); await waitFor(() => gateway.getWorkcellSnapshot().spawned.length === 1); const e = gateway.getWorkcellSnapshot().spawned[0]; expect(e.color).toBe('WHITE'); expect(e.intact).toBe(true); } finally { ws.close(); }
  });
  it('sound GREEN deposits at green tower with label GREEN', async () => {
    gateway.setClassificationSequence([{ color: 'GREEN', intact: true }]);
    const ws = await openWs(gateway);
    const labels: string[] = [];
    ws.on('message', (data) => { const f = JSON.parse(data.toString()); if (f.robot_state && f.inference_metrics?.detected_object) labels.push(f.inference_metrics.detected_object); });
    try { sendSpawn(ws, 'stack-1'); await waitFor(() => gateway.getRobotState() === 'IDLE' && gateway.getWorkcellSnapshot().processed.length === 1); const e = gateway.getWorkcellSnapshot().processed[0]; expect(e.x).toBeCloseTo(GREEN_TOWER[0], 4); expect(e.y).toBeCloseTo(GREEN_TOWER[1], 4); expect(e.color).toBe('GREEN'); expect(labels).toContain('GREEN'); } finally { ws.close(); }
  });
  it('defective BLUE deposits at scrap bin with label DEFECTIVE', async () => {
    gateway.setClassificationSequence([{ color: 'BLUE', intact: false }]);
    const ws = await openWs(gateway);
    const labels: string[] = [];
    ws.on('message', (data) => { const f = JSON.parse(data.toString()); if (f.robot_state && f.inference_metrics?.detected_object) labels.push(f.inference_metrics.detected_object); });
    try { sendSpawn(ws, 'bin-1'); await waitFor(() => gateway.getRobotState() === 'IDLE' && gateway.getWorkcellSnapshot().processed.length === 1); const e = gateway.getWorkcellSnapshot().processed[0]; expect(e.x).toBeCloseTo(SCRAP_BIN[0], 4); expect(e.y).toBeCloseTo(SCRAP_BIN[1], 4); expect(e.intact).toBe(false); expect(labels).toContain('DEFECTIVE'); } finally { ws.close(); }
  });
  it('per-tower FIFO at 10: 11th WHITE evicts oldest', async () => {
    const tower = Array.from({ length: 10 }, (_, k) => ({ id: `white-${k}`, x: WHITE_TOWER[0], y: WHITE_TOWER[1], z: k * STACK_STEP_M, color: 'WHITE' as const, intact: true as const, origin_x: 0.5, origin_y: 0.0, origin_z: 0 }));
    const sibling = { id: 'green-0', x: GREEN_TOWER[0], y: GREEN_TOWER[1], z: 0, color: 'GREEN' as const, intact: true as const, origin_x: 0.5, origin_y: 0.0, origin_z: 0 };
    gateway.seedProcessed([...tower, sibling]);
    gateway.setClassificationSequence([{ color: 'WHITE', intact: true }]);
    const ws = await openWs(gateway);
    try { sendSpawn(ws, 'fifo-1'); await waitFor(() => gateway.getRobotState() === 'IDLE' && gateway.getWorkcellSnapshot().processed.length === 11 && gateway.getWorkcellSnapshot().processed.every((e) => e.id !== 'white-0')); const snap = gateway.getWorkcellSnapshot(); const whites = snap.processed.filter((e) => e.color === 'WHITE' && e.intact); expect(whites).toHaveLength(10); expect(whites.map((e) => e.id)).not.toContain('white-0'); expect(snap.processed.map((e) => e.id)).toContain('green-0'); const top = whites.reduce((a, b) => (a.z > b.z ? a : b)); expect(top.z).toBeCloseTo(9 * STACK_STEP_M, 6); expect(top.x).toBeCloseTo(WHITE_TOWER[0], 6); } finally { ws.close(); }
  });
  it('clear wipes towers plus bin', async () => {
    gateway.setClassificationSequence([{ color: 'GREEN', intact: false }]);
    const ws = await openWs(gateway);
    try { sendSpawn(ws, 'clear-1'); await waitFor(() => gateway.getWorkcellSnapshot().processed.length === 1); sendClear(ws, 'clear-2'); await waitFor(() => gateway.getWorkcellSnapshot().processed.length === 0 && gateway.getWorkcellSnapshot().spawned.length === 0); const snap = gateway.getWorkcellSnapshot(); expect(snap.inProgress).toEqual([]); expect(snap.activeId).toBeNull(); } finally { ws.close(); }
  });
  it('click-to-echo latency under 50ms over the wire', async () => {
    gateway.setAutoExecutePickAndPlace(false);
    gateway.setClassificationSequence([{ color: 'WHITE', intact: true }]);
    const ws = await openWs(gateway);
    try { const t0 = Date.now(); const echoed = await new Promise<number>((resolve, reject) => { const timer = setTimeout(() => reject(new Error('no echo within 5s')), 5000); ws.on('message', (data) => { const f = JSON.parse(data.toString()); if (f.robot_state && Array.isArray(f.workcell_state?.spawned) && f.workcell_state.spawned.length === 1) { clearTimeout(timer); resolve(Date.now() - t0); } }); sendSpawn(ws, 'lat-1'); }); expect(echoed).toBeLessThan(50); } finally { ws.close(); }
  });
  it('bin cap-100 sharp-cut recycle: 101st defective wraps to z=0, towers untouched', async () => {
    const tower = { id: 'white-keep', x: WHITE_TOWER[0], y: WHITE_TOWER[1], z: 0, color: 'WHITE' as const, intact: true as const, origin_x: 0.5, origin_y: 0.0, origin_z: 0 };
    const bin = Array.from({ length: 100 }, (_, k) => ({ id: `def-${k}`, x: SCRAP_BIN[0], y: SCRAP_BIN[1], z: k * STACK_STEP_M, color: 'GREEN' as const, intact: false as const, origin_x: 0.5, origin_y: 0.0, origin_z: 0 }));
    gateway.seedProcessed([tower, ...bin]);
    gateway.setClassificationSequence([{ color: 'BLUE', intact: false }]);
    const ws = await openWs(gateway);
    try { sendSpawn(ws, 'bin-cap-1'); await waitFor(() => gateway.getRobotState() === 'IDLE' && gateway.getWorkcellSnapshot().processed.some((e) => !e.intact && e.z === 0 && e.id !== 'def-0')); const snap = gateway.getWorkcellSnapshot(); const rejects = snap.processed.filter((e) => !e.intact); expect(rejects).toHaveLength(1); expect(rejects[0].z).toBeCloseTo(0, 6); expect(snap.processed.map((e) => e.id)).toContain('white-keep'); } finally { ws.close(); }
  });
  it('first defective arrival flips scrap-bin icon state via snapshot reconcile', async () => {
    const { reconcileSnapshotGears, createSnapshotStore } = await import('../../src/components/RobotVisualizer/interaction/snapshot');
    const store = createSnapshotStore();
    const group = { add: () => {}, remove: () => {} } as any;
    const dirty = { n: 0 };
    const ctx = { robotGroup: group, mountLink: null, tableAssets: null, scrapBin: { hasItems: false, setHasItems(v: boolean) { (this as any).hasItems = v; } }, onDirty: () => { dirty.n++; } } as any;
    reconcileSnapshotGears(store, { spawned: [], inProgress: [], processed: [], activeId: null }, ctx);
    expect(ctx.scrapBin.hasItems).toBe(false);
    gateway.setClassificationSequence([{ color: 'GREEN', intact: false }]);
    const ws = await openWs(gateway);
    try { sendSpawn(ws, 'icon-1'); await waitFor(() => gateway.getRobotState() === 'IDLE' && gateway.getWorkcellSnapshot().processed.length === 1); const snap = gateway.getWorkcellSnapshot(); reconcileSnapshotGears(store, { spawned: snap.spawned, inProgress: snap.inProgress, processed: snap.processed, activeId: snap.activeId }, ctx); expect(ctx.scrapBin.hasItems).toBe(true); } finally { ws.close(); }
  });
});
