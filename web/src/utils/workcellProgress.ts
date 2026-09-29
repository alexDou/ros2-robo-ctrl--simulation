/** The workcell snapshot buckets the conveyor cares about (the single authority on progress). */
export interface WorkcellBuckets {
  spawned?: readonly unknown[];
  inProgress?: readonly unknown[];
}

export const spawnedCount = (snap: WorkcellBuckets | undefined): number =>
  snap?.spawned?.length ?? 0;

/** A pick is finished when the arm is IDLE again and no gear is left spawned or in flight. */
export const isPickSettled = (robotState: string | null, snap: WorkcellBuckets | undefined) =>
  robotState === 'IDLE' && spawnedCount(snap) === 0 && (snap?.inProgress?.length ?? 0) === 0;

const AT_POSE_TOLERANCE_RAD = 0.05;

/** True when every reported joint is within tolerance of the target pose. */
export const isAtPose = (
  joints: readonly number[] | undefined,
  pose: readonly number[],
  tolerance = AT_POSE_TOLERANCE_RAD,
): boolean =>
  joints !== undefined &&
  joints.length === pose.length &&
  joints.every((j, i) => Math.abs(j - pose[i]) <= tolerance);
