import * as THREE from 'three';
import type { URDFRobot } from 'urdf-loader';
import { UR5E_JOINTS } from '@contracts';
import { getLatestPositions } from '@/utils/three/positions';
import type { TelemetryBufferLike } from '@/components/RobotVisualizer/types';
import { JOINT_LERP_ALPHA, JOINT_SNAP_EPS } from '@/components/RobotVisualizer/constants';
import { setJointOnRobot } from '@/components/RobotVisualizer/scene/robot';
import { readSnapshot, reconcileSnapshotGears, type SnapshotStore } from '@/components/RobotVisualizer/interaction/snapshot';
import type { TableProceduralAssets } from '@/components/RobotVisualizer/assets/table';
import type { PalmProceduralAssets } from '@/components/RobotVisualizer/assets/palm';

export interface FrameState {
  lastRendered: Float64Array;
  interp: Float64Array;
  wasGrasped: boolean;
}

export function createFrameState(): FrameState {
  return {
    lastRendered: new Float64Array(6).fill(NaN),
    // Joint interpolation. Sparse telemetry (10 Hz edge timer)
    // -> smooth 60 fps arm. current eases toward target each rAF;
    // snap on first frame / NaN so tests + initial HOME stay exact.
    interp: new Float64Array(6).fill(NaN),
    wasGrasped: false,
  };
}

export interface FrameArgs {
  frame: FrameState;
  loadedRobot: URDFRobot | null;
  jointPositionsRef?: { current?: readonly number[] | null } | null;
  bufferRef?: TelemetryBufferLike;
  palmAssets: PalmProceduralAssets | null;
  store: SnapshotStore;
  robotGroup: THREE.Group;
  mountLink: THREE.Object3D | null;
  tableAssets: TableProceduralAssets | null;
  controls?: { update?: () => boolean };
  onDirty: () => void;
}

export function stepFrame(args: FrameArgs): void {
  // Check OrbitControls camera activity
  if (args.controls && typeof args.controls.update === 'function') {
    if (args.controls.update()) {
      args.onDirty();
    }
  }

  // Synchronize 6 canonical revolute joints with dirty checking
  const positions = getLatestPositions(args.jointPositionsRef, args.bufferRef);

  if (args.loadedRobot && positions) {
    let jointsChanged = false;
    const count = Math.min(UR5E_JOINTS.length, positions.length);
    for (let i = 0; i < count; i++) {
      const jointName = UR5E_JOINTS[i];
      const pos = positions[i];
      if (typeof pos !== 'number' || !Number.isFinite(pos)) continue;
      let next: number;
      if (Number.isNaN(args.frame.interp[i])) {
        next = pos; // first frame: snap exact
      } else {
        next = args.frame.interp[i] + (pos - args.frame.interp[i]) * JOINT_LERP_ALPHA;
        if (Math.abs(pos - next) < JOINT_SNAP_EPS) next = pos;
      }
      args.frame.interp[i] = next;
      if (Number.isNaN(args.frame.lastRendered[i]) || args.frame.lastRendered[i] !== next) {
        setJointOnRobot(args.loadedRobot, jointName, next);
        args.frame.lastRendered[i] = next;
        jointsChanged = true;
      }
    }
    if (jointsChanged) {
      args.loadedRobot.updateMatrixWorld(true);
      args.onDirty();
    }
  }

  // Synchronize Dexterous Palm grasp state with dirty-checking
  const currentGrasped = Boolean(args.bufferRef?.current?.palmState?.is_grasped);
  if (args.palmAssets && currentGrasped !== args.frame.wasGrasped) {
    args.frame.wasGrasped = currentGrasped;
    if (currentGrasped) {
      args.palmAssets.nozzleMesh.material.emissive.setHex(0x10b981);
      args.palmAssets.nozzleMesh.material.emissiveIntensity = 0.8;
    } else {
      args.palmAssets.nozzleMesh.material.emissive.setHex(0x000000);
      args.palmAssets.nozzleMesh.material.emissiveIntensity = 0.0;
    }
    args.onDirty();
  }

  // Workcell-authority pure render: gears follow snapshot buckets only.
  // No grasp-bit cases, no phase gates, no IDLE safety net here.
  reconcileSnapshotGears(
    args.store,
    readSnapshot(args.bufferRef),
    {
      robotGroup: args.robotGroup,
      mountLink: args.mountLink,
      tableAssets: args.tableAssets,
      onDirty: args.onDirty,
    },
  );
}
