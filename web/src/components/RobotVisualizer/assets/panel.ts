import * as THREE from 'three';
import { disposeMaterial } from '@/utils/three/dispose';
import { DISPLAY_PANEL_COORDS, PALLET_CAPACITY } from '@/components/RobotVisualizer/constants';
import type { GearColor } from '@contracts';

export interface PanelValues {
  feederRemaining: number;
  binCount: number;
  palletCounts: Record<GearColor, number>;
}

export interface DisplayPanelAssets {
  group: THREE.Group;
  setValues: (values: PanelValues) => void;
  /** The text currently shown, one line per reading. */
  getText: () => string[];
  dispose: () => void;
}

const POST_HEIGHT = 0.5;
const PANEL_W = 0.4;
const PANEL_H = 0.24;
const CANVAS_W = 512;
const CANVAS_H = 307;

export function panelLines(v: PanelValues): string[] {
  return [
    `FEEDER  ${v.feederRemaining}`,
    `BIN  ${v.binCount}`,
    `WHITE  ${v.palletCounts.WHITE}/${PALLET_CAPACITY}`,
    `GREEN  ${v.palletCounts.GREEN}/${PALLET_CAPACITY}`,
    `BLUE  ${v.palletCounts.BLUE}/${PALLET_CAPACITY}`,
  ];
}

/** Post-mounted counts display; text is painted on a canvas texture, redrawn only on change. */
export function createDisplayPanel(): DisplayPanelAssets {
  const group = new THREE.Group();
  group.name = 'display-panel';
  group.position.set(DISPLAY_PANEL_COORDS.x, DISPLAY_PANEL_COORDS.y, DISPLAY_PANEL_COORDS.z);

  const postGeom = new THREE.CylinderGeometry(0.015, 0.015, POST_HEIGHT, 12);
  postGeom.rotateX(Math.PI / 2); // cylinder axis Y -> Z (up in REP-103)
  const postMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6 });
  const post = new THREE.Mesh(postGeom, postMat);
  post.name = 'display-panel-post';
  post.position.z = POST_HEIGHT / 2;
  group.add(post);

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  const screenGeom = new THREE.PlaneGeometry(PANEL_W, PANEL_H);
  const screenMat = new THREE.MeshBasicMaterial({ map: texture });
  const screen = new THREE.Mesh(screenGeom, screenMat);
  screen.name = 'display-panel-screen';
  screen.rotation.x = Math.PI / 2; // plane normal +Z -> -Y: faces the default camera
  screen.position.z = POST_HEIGHT + PANEL_H / 2;
  group.add(screen);

  let lines: string[] = [];
  const setValues = (values: PanelValues) => {
    const next = panelLines(values);
    if (next.join('\n') === lines.join('\n')) return;
    lines = next;
    if (!ctx) return;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#4ade80';
    ctx.font = 'bold 48px monospace';
    ctx.textBaseline = 'middle';
    const step = CANVAS_H / (next.length + 1);
    next.forEach((line, i) => ctx.fillText(line, 24, step * (i + 1)));
    texture.needsUpdate = true;
  };
  setValues({ feederRemaining: 0, binCount: 0, palletCounts: { WHITE: 0, GREEN: 0, BLUE: 0 } });

  return {
    group,
    setValues,
    getText: () => [...lines],
    dispose: () => {
      postGeom.dispose();
      screenGeom.dispose();
      texture.dispose();
      disposeMaterial(postMat);
      disposeMaterial(screenMat);
    },
  };
}
