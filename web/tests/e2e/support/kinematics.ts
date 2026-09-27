/**
 * Analytical UR5e inverse kinematics solver and waypoint trajectory planner for MockGateway.
 * Matches ROS2 arm_controller/kinematics.py analytical implementation.
 */

export const UR5E_DH_D: readonly number[] = [0.1625, 0.0, 0.0, 0.1333, 0.0997, 0.0996];
export const UR5E_DH_A: readonly number[] = [0.0, -0.425, -0.3922, 0.0, 0.0, 0.0];
export const UR5E_DH_ALPHA: readonly number[] = [
  Math.PI / 2.0,
  0.0,
  0.0,
  Math.PI / 2.0,
  -Math.PI / 2.0,
  0.0,
];

export const DEFAULT_TCP_OFFSET_M = 0.108;
export const MIN_REACH_M = 0.20;
export const MAX_REACH_M = 0.85;
export const DEFAULT_SPINDLE_TOWER_COORDS: [number, number, number] = [0.40, -0.30, 0.0];
export const APPROACH_LIFT_OFFSET_M = 0.10;

export const HOME_JOINT_POSITIONS: readonly number[] = [0.0, -1.5708, 0.0, -1.5708, 0.0, 0.0];

export const DEFAULT_DOWNWARD_ORIENTATION: readonly (readonly number[])[] = [
  [0.0, 1.0, 0.0],
  [1.0, 0.0, 0.0],
  [0.0, 0.0, -1.0],
];

export const ActionPhase = {
  APPROACHING: 'APPROACHING',
  PICKING: 'PICKING',
  GRASPING: 'GRASPING',
  LIFTING: 'LIFTING',
  TRANSFERRING: 'TRANSFERRING',
  DROPPING: 'DROPPING',
  RELEASING: 'RELEASING',
  RETREATING: 'RETREATING',
  HOMING: 'HOMING',
  COMPLETED: 'COMPLETED',
} as const;

export type ActionPhase = (typeof ActionPhase)[keyof typeof ActionPhase];

export interface WaypointStep {
  stepNumber: number;
  name: string;
  phase: string;
  cartesianPosition: [number, number, number];
  jointPositions: number[];
  isGrasped: boolean;
  pauseDurationS: number;
  percentComplete: number;
}

export function normalizeAngle(angle: number): number {
  return ((angle + Math.PI) % (2.0 * Math.PI) + 2.0 * Math.PI) % (2.0 * Math.PI) - Math.PI;
}

export function unwrapJointAngles(qTarget: readonly number[], qReference: readonly number[]): number[] {
  return qTarget.map((targetVal, i) => qReference[i] + normalizeAngle(targetVal - qReference[i]));
}

function dhMatrix(theta: number, d: number, a: number, alpha: number): number[][] {
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const ca = Math.cos(alpha);
  const sa = Math.sin(alpha);
  return [
    [ct, -st * ca, st * sa, a * ct],
    [st, ct * ca, -ct * sa, a * st],
    [0.0, sa, ca, d],
    [0.0, 0.0, 0.0, 1.0],
  ];
}

function invertRigidTransform(t: readonly (readonly number[])[]): number[][] {
  const rInv: number[][] = [
    [t[0][0], t[1][0], t[2][0]],
    [t[0][1], t[1][1], t[2][1]],
    [t[0][2], t[1][2], t[2][2]],
  ];
  const p = [t[0][3], t[1][3], t[2][3]];
  const pInv = [
    -(rInv[0][0] * p[0] + rInv[0][1] * p[1] + rInv[0][2] * p[2]),
    -(rInv[1][0] * p[0] + rInv[1][1] * p[1] + rInv[1][2] * p[2]),
    -(rInv[2][0] * p[0] + rInv[2][1] * p[1] + rInv[2][2] * p[2]),
  ];
  return [
    [rInv[0][0], rInv[0][1], rInv[0][2], pInv[0]],
    [rInv[1][0], rInv[1][1], rInv[1][2], pInv[1]],
    [rInv[2][0], rInv[2][1], rInv[2][2], pInv[2]],
    [0.0, 0.0, 0.0, 1.0],
  ];
}

function matmul4x4(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): number[][] {
  const res: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[i][k] * b[k][j];
      }
      res[i][j] = sum;
    }
  }
  return res;
}

export class UR5eKinematics {
  readonly tcpOffset: number;
  readonly d: readonly number[];
  readonly a: readonly number[];
  readonly alpha: readonly number[];

  constructor(
    tcpOffset = DEFAULT_TCP_OFFSET_M,
    d = UR5E_DH_D,
    a = UR5E_DH_A,
    alpha = UR5E_DH_ALPHA
  ) {
    this.tcpOffset = tcpOffset;
    this.d = d;
    this.a = a;
    this.alpha = alpha;
  }

  checkReachability(x: number, y: number, z = 0.0): void {
    if (z < 0.0) {
      throw new Error(`Target coordinates (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)}) penetrate table`);
    }
    const rPlanar = Math.hypot(x, y);
    if (rPlanar < MIN_REACH_M) {
      throw new Error(`Target within minimum reach ${MIN_REACH_M}`);
    }
    if (rPlanar > MAX_REACH_M) {
      throw new Error(`Target exceeds maximum reach ${MAX_REACH_M}`);
    }
    const rSpherical = Math.hypot(x, y, z);
    if (rSpherical > MAX_REACH_M) {
      throw new Error(`Target exceeds spherical reach ${MAX_REACH_M}`);
    }
  }

  forwardKinematics(jointPositions: readonly number[], withTcp = false): number[][] {
    let t: number[][] = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
      [0, 0, 0, 1],
    ];
    for (let i = 0; i < 6; i++) {
      t = matmul4x4(t, dhMatrix(jointPositions[i], this.d[i], this.a[i], this.alpha[i]));
    }
    if (withTcp && this.tcpOffset !== 0.0) {
      const tTcp = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, this.tcpOffset],
        [0, 0, 0, 1],
      ];
      t = matmul4x4(t, tTcp);
    }
    return t;
  }

  forwardKinematicsPosition(jointPositions: readonly number[], withTcp = true): [number, number, number] {
    const t = this.forwardKinematics(jointPositions, withTcp);
    return [t[0][3], t[1][3], t[2][3]];
  }

  solveIkMatrix(t06: readonly (readonly number[])[]): number[][] {
    const solutions: number[][] = [];
    const p05x = t06[0][3] - this.d[5] * t06[0][2];
    const p05y = t06[1][3] - this.d[5] * t06[1][2];

    const rXy = Math.hypot(p05x, p05y);
    if (rXy < this.d[3]) {
      return solutions;
    }

    const psi = Math.atan2(p05y, p05x);
    const ratio1 = Math.max(-1.0, Math.min(1.0, this.d[3] / rXy));
    const phi1 = Math.acos(ratio1);
    const th1Options = [
      normalizeAngle(psi + Math.PI / 2.0 + phi1),
      normalizeAngle(psi + Math.PI / 2.0 - phi1),
    ];

    for (const th1 of th1Options) {
      const val = t06[0][3] * Math.sin(th1) - t06[1][3] * Math.cos(th1) - this.d[3];
      const ratio5 = val / this.d[5];
      if (Math.abs(ratio5) > 1.000001) continue;
      const phi5 = Math.acos(Math.max(-1.0, Math.min(1.0, ratio5)));
      const th5Options = Math.abs(phi5) < 1e-6 ? [normalizeAngle(phi5)] : [normalizeAngle(phi5), normalizeAngle(-phi5)];

      const t01 = dhMatrix(th1, this.d[0], this.a[0], this.alpha[0]);
      const t10 = invertRigidTransform(t01);
      const t16 = matmul4x4(t10, t06);

      for (const th5 of th5Options) {
        const s5 = Math.sin(th5);
        const th6 = Math.abs(s5) < 1e-6 ? 0.0 : normalizeAngle(Math.atan2(-t16[2][1] / s5, t16[2][0] / s5));

        const t45 = dhMatrix(th5, this.d[4], this.a[4], this.alpha[4]);
        const t56 = dhMatrix(th6, this.d[5], this.a[5], this.alpha[5]);
        const t46 = matmul4x4(t45, t56);
        const t14 = matmul4x4(t16, invertRigidTransform(t46));

        const x14 = t14[0][3];
        const y14 = t14[1][3];
        const r2 = x14 * x14 + y14 * y14;

        const ratio3 = (r2 - this.a[1] ** 2 - this.a[2] ** 2) / (2.0 * this.a[1] * this.a[2]);
        if (Math.abs(ratio3) > 1.000001) continue;
        const phi3 = Math.acos(Math.max(-1.0, Math.min(1.0, ratio3)));
        const th3Options = Math.abs(phi3) < 1e-6 ? [normalizeAngle(phi3)] : [normalizeAngle(phi3), normalizeAngle(-phi3)];

        for (const th3 of th3Options) {
          const k1 = this.a[1] + this.a[2] * Math.cos(th3);
          const k2 = this.a[2] * Math.sin(th3);
          const th2 = normalizeAngle(Math.atan2(y14, x14) - Math.atan2(k2, k1));
          const phi14 = Math.atan2(t14[1][0], t14[0][0]);
          const th4 = normalizeAngle(phi14 - th2 - th3);

          solutions.push([th1, th2, th3, th4, th5, th6]);
        }
      }
    }
    return solutions;
  }

  angularDistance(q1: readonly number[], q2: readonly number[]): number {
    let diffSq = 0.0;
    for (let i = 0; i < 6; i++) {
      const d = normalizeAngle(q1[i] - q2[i]);
      diffSq += d * d;
    }
    return Math.sqrt(diffSq);
  }

  selectMinimalDisplacement(solutions: readonly number[][], currentJoints: readonly number[]): number[] {
    if (!solutions || solutions.length === 0) {
      throw new Error('No inverse kinematics solutions available');
    }
    let bestSol = solutions[0];
    let bestDist = Infinity;
    for (const sol of solutions) {
      const dist = this.angularDistance(sol, currentJoints);
      if (dist < bestDist) {
        bestDist = dist;
        bestSol = sol;
      }
    }
    return bestSol;
  }

  solveIk(
    x: number,
    y: number,
    z: number,
    currentJoints?: readonly number[],
    rotationMatrix?: readonly (readonly number[])[],
    applyTcpOffset = true
  ): number[] {
    this.checkReachability(x, y, z);
    const rot = rotationMatrix ?? DEFAULT_DOWNWARD_ORIENTATION;
    const toolZAxis = [rot[0][2], rot[1][2], rot[2][2]];
    const offset = applyTcpOffset ? this.tcpOffset : 0.0;
    const flangeX = x - offset * toolZAxis[0];
    const flangeY = y - offset * toolZAxis[1];
    const flangeZ = z - offset * toolZAxis[2];

    const t06 = [
      [rot[0][0], rot[0][1], rot[0][2], flangeX],
      [rot[1][0], rot[1][1], rot[1][2], flangeY],
      [rot[2][0], rot[2][1], rot[2][2], flangeZ],
      [0.0, 0.0, 0.0, 1.0],
    ];

    const solutions = this.solveIkMatrix(t06);
    const ref = currentJoints ?? HOME_JOINT_POSITIONS;
    return this.selectMinimalDisplacement(solutions, ref);
  }
}

export class PickAndPlaceTrajectoryGenerator {
  readonly solver: UR5eKinematics;

  constructor(solver?: UR5eKinematics) {
    this.solver = solver ?? new UR5eKinematics();
  }

  generateTrajectory(
    pickCoords: [number, number, number],
    dropCoords?: [number, number, number],
    currentJoints?: readonly number[]
  ): WaypointStep[] {
    const [xPick, yPick, zPick] = pickCoords;
    const [xDrop, yDrop, zDrop] = dropCoords ?? DEFAULT_SPINDLE_TOWER_COORDS;

    this.solver.checkReachability(xPick, yPick, zPick);
    this.solver.checkReachability(xPick, yPick, zPick + APPROACH_LIFT_OFFSET_M);
    this.solver.checkReachability(xDrop, yDrop, zDrop);
    this.solver.checkReachability(xDrop, yDrop, zDrop + APPROACH_LIFT_OFFSET_M);

    // Workcell (base_link) to UR5e DH frame (base_link_inertia) transformation:
    // ur5e.urdf defines base_link_inertia rotated by Math.PI (180 deg) around Z.
    // Therefore (x_dh, y_dh) = (-x_base, -y_base).
    const qRef = currentJoints ? [...currentJoints] : [...HOME_JOINT_POSITIONS];

    // 1. Approach pick
    const posAppPick: [number, number, number] = [xPick, yPick, zPick + APPROACH_LIFT_OFFSET_M];
    const qAppPickRaw = this.solver.solveIk(-posAppPick[0], -posAppPick[1], posAppPick[2], qRef);
    const qAppPick = unwrapJointAngles(qAppPickRaw, qRef);

    // 2. Pick
    const posPick: [number, number, number] = [xPick, yPick, zPick];
    const qPickRaw = this.solver.solveIk(-posPick[0], -posPick[1], posPick[2], qAppPick);
    const qPick = unwrapJointAngles(qPickRaw, qAppPick);

    // 3. Grasp
    const qGrasp = [...qPick];

    // 4. Lift
    const posLift: [number, number, number] = [xPick, yPick, zPick + APPROACH_LIFT_OFFSET_M];
    const qLiftRaw = this.solver.solveIk(-posLift[0], -posLift[1], posLift[2], qGrasp);
    const qLift = unwrapJointAngles(qLiftRaw, qGrasp);

    // 5. Tower approach
    const posAppDrop: [number, number, number] = [xDrop, yDrop, zDrop + APPROACH_LIFT_OFFSET_M];
    const qAppDropRaw = this.solver.solveIk(-posAppDrop[0], -posAppDrop[1], posAppDrop[2], qLift);
    const qAppDrop = unwrapJointAngles(qAppDropRaw, qLift);

    // 6. Tower drop
    const posDrop: [number, number, number] = [xDrop, yDrop, zDrop];
    const qDropRaw = this.solver.solveIk(-posDrop[0], -posDrop[1], posDrop[2], qAppDrop);
    const qDrop = unwrapJointAngles(qDropRaw, qAppDrop);

    // 7. Release
    const qRelease = [...qDrop];

    // 8. Tower retreat
    const posRetreat: [number, number, number] = [xDrop, yDrop, zDrop + APPROACH_LIFT_OFFSET_M];
    const qRetreatRaw = this.solver.solveIk(-posRetreat[0], -posRetreat[1], posRetreat[2], qRelease);
    const qRetreat = unwrapJointAngles(qRetreatRaw, qRelease);

    // 9. Home & 10. Complete
    const qHome = unwrapJointAngles(HOME_JOINT_POSITIONS, qRetreat);
    const homePos = this.solver.forwardKinematicsPosition(qHome, true);
    const homePosBase: [number, number, number] = [-homePos[0], -homePos[1], homePos[2]];

    return [
      {
        stepNumber: 1,
        name: 'approach_pick',
        phase: ActionPhase.APPROACHING,
        cartesianPosition: posAppPick,
        jointPositions: qAppPick,
        isGrasped: false,
        pauseDurationS: 0.0,
        percentComplete: 10.0,
      },
      {
        stepNumber: 2,
        name: 'pick',
        phase: ActionPhase.PICKING,
        cartesianPosition: posPick,
        jointPositions: qPick,
        isGrasped: false,
        pauseDurationS: 0.0,
        percentComplete: 20.0,
      },
      {
        stepNumber: 3,
        name: 'grasp',
        phase: ActionPhase.GRASPING,
        cartesianPosition: posPick,
        jointPositions: qGrasp,
        isGrasped: true,
        pauseDurationS: 0.2,
        percentComplete: 30.0,
      },
      {
        stepNumber: 4,
        name: 'lift',
        phase: ActionPhase.LIFTING,
        cartesianPosition: posLift,
        jointPositions: qLift,
        isGrasped: true,
        pauseDurationS: 0.0,
        percentComplete: 40.0,
      },
      {
        stepNumber: 5,
        name: 'tower_approach',
        phase: ActionPhase.TRANSFERRING,
        cartesianPosition: posAppDrop,
        jointPositions: qAppDrop,
        isGrasped: true,
        pauseDurationS: 0.0,
        percentComplete: 50.0,
      },
      {
        stepNumber: 6,
        name: 'tower_drop',
        phase: ActionPhase.DROPPING,
        cartesianPosition: posDrop,
        jointPositions: qDrop,
        isGrasped: true,
        pauseDurationS: 0.0,
        percentComplete: 60.0,
      },
      {
        stepNumber: 7,
        name: 'release',
        phase: ActionPhase.RELEASING,
        cartesianPosition: posDrop,
        jointPositions: qRelease,
        isGrasped: false,
        pauseDurationS: 0.2,
        percentComplete: 70.0,
      },
      {
        stepNumber: 8,
        name: 'tower_retreat',
        phase: ActionPhase.RETREATING,
        cartesianPosition: posRetreat,
        jointPositions: qRetreat,
        isGrasped: false,
        pauseDurationS: 0.0,
        percentComplete: 80.0,
      },
      {
        stepNumber: 9,
        name: 'home',
        phase: ActionPhase.HOMING,
        cartesianPosition: homePosBase,
        jointPositions: qHome,
        isGrasped: false,
        pauseDurationS: 0.0,
        percentComplete: 90.0,
      },
      {
        stepNumber: 10,
        name: 'complete',
        phase: ActionPhase.COMPLETED,
        cartesianPosition: homePosBase,
        jointPositions: qHome,
        isGrasped: false,
        pauseDurationS: 0.0,
        percentComplete: 100.0,
      },
    ];
  }
}
