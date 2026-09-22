import type { JointPositionsRefLike, TelemetryBufferLike } from '@/components/RobotVisualizer/types';

export function getLatestPositions(
  jointPositionsRef?: { current?: readonly number[] | null } | null,
  telemetryBufferRef?: { current?: { jointPositions?: readonly number[] } | null } | null,
): readonly number[] | null {
  if (jointPositionsRef?.current && Array.isArray(jointPositionsRef.current)) {
    return jointPositionsRef.current;
  }
  if (
    telemetryBufferRef?.current?.jointPositions &&
    Array.isArray(telemetryBufferRef.current.jointPositions)
  ) {
    return telemetryBufferRef.current.jointPositions;
  }
  return null;
}

export type { JointPositionsRefLike, TelemetryBufferLike };
