"""Deterministic 10-step pick-and-place waypoint generator."""

from dataclasses import dataclass

from arm_controller.kinematics.angles import unwrap_joint_angles_within_limits
from arm_controller.kinematics.constants import (
    APPROACH_LIFT_OFFSET_M,
    DEFAULT_SPINDLE_TOWER_COORDS,
    HOME_JOINT_POSITIONS,
    RELEASE_HEIGHT_M,
    TRANSFER_HEIGHT_M,
    UR5E_JOINT_LIMITS,
)
from arm_controller.kinematics.phases import ActionPhase
from arm_controller.kinematics.solver import UR5eKinematics


@dataclass(frozen=True)
class WaypointStep:
    """Single discrete step in the pick-and-place waypoint sequence."""

    step_number: int
    name: str
    phase: str
    cartesian_position: tuple[float, float, float]
    joint_positions: list[float]
    is_grasped: bool = False
    pause_duration_s: float = 0.0
    percent_complete: float = 0.0

    @property
    def suction_on(self) -> bool:
        """Alias indicating whether end-effector suction is active."""
        return self.is_grasped


class PickAndPlaceTrajectoryGenerator:
    """Generates deterministic 10-step Cartesian and joint waypoint trajectories."""

    def __init__(self, solver: UR5eKinematics | None = None) -> None:
        self.solver = solver if solver is not None else UR5eKinematics()

    def generate_trajectory(
        self,
        pick_coords: tuple[float, float, float],
        drop_coords: tuple[float, float, float] | None = None,
        current_joints: list[float] | None = None,
        rotation_matrix: list[list[float]] | None = None,
    ) -> list[WaypointStep]:
        """Generates standard 10-step pick-and-place waypoint sequence.

        Sequence:
        1. approach_pick: (x_pick, y_pick, z_pick + 0.15m) -> APPROACHING (10%)
        2. pick: (x_pick, y_pick, z_pick)                 -> PICKING (20%)
        3. grasp: Grasp actuation pause (suction on)       -> GRASPING (30%)
        4. lift: (x_pick, y_pick, z_pick + 0.15m)         -> LIFTING (40%)
        5. tower_approach: (x_drop, y_drop, z_travel)     -> TRANSFERRING (50%)
        6. tower_drop: (x_drop, y_drop, z_release)        -> DROPPING (60%)
        7. release: Release actuation pause (suction off)  -> RELEASING (70%)
        8. tower_retreat: (x_drop, y_drop, z_travel)      -> RETREATING (80%)

        z_travel keeps the carried Gearwheel above every SpindleTower pin (D37): the transfer
        climbs to it on the way to the stand (the belt has no pins, and a full-height lift at the
        far PickZone corner would need a branch switch), crosses at it, and lowers straight down
        until the Gearwheel is threaded
        on its pin's tip (z_release). Released there, it slides down the pin to its slot z_drop.
        9. home: HOME pose                                 -> HOMING (90%)
        10. complete: HOME pose                            -> COMPLETED (100%)
        """
        x_pick, y_pick, z_pick = pick_coords
        drop = drop_coords if drop_coords is not None else DEFAULT_SPINDLE_TOWER_COORDS
        x_drop, y_drop, z_drop = drop
        z_release = max(RELEASE_HEIGHT_M, z_drop)
        z_travel = max(TRANSFER_HEIGHT_M, z_pick + APPROACH_LIFT_OFFSET_M, z_release)

        # Validate reachability before computation
        self.solver.check_reachability(x_pick, y_pick, z_pick)
        self.solver.check_reachability(x_pick, y_pick, z_pick + APPROACH_LIFT_OFFSET_M)
        self.solver.check_reachability(x_drop, y_drop, z_release)
        self.solver.check_reachability(x_drop, y_drop, z_travel)

        q_ref = list(current_joints) if current_joints is not None else list(HOME_JOINT_POSITIONS)

        # Coordinate frame transformation: UR5e URDF base_link is REP-103 (+X forward),
        # but base_link_inertia is rotated by pi around Z (UR controller / DH convention).
        # To reach target (x, y, z) in base_link, DH solver solves for (-x, -y, z).
        # Similarly, downward tool orientation in DH frame is rotated by pi around Z:
        # R_dh = R_z(pi) @ R_workcell = [[0, -1, 0], [-1, 0, 0], [0, 0, -1]].
        ik_rot = (
            rotation_matrix
            if rotation_matrix is not None
            else [
                [0.0, -1.0, 0.0],
                [-1.0, 0.0, 0.0],
                [0.0, 0.0, -1.0],
            ]
        )
        x_pick_dh, y_pick_dh = -x_pick, -y_pick
        x_drop_dh, y_drop_dh = -x_drop, -y_drop

        def solve(dh_xyz: tuple[float, float, float], q_prev: list[float]) -> list[float]:
            nonlocal configuration
            q_raw, solved = self.solver.solve_ik_configured(
                dh_xyz[0],
                dh_xyz[1],
                dh_xyz[2],
                current_joints=q_prev,
                configuration=configuration,
                rotation_matrix=ik_rot,
            )
            # A degenerate (0) sign locked at approach_pick is pinned by the first definite one.
            configuration = tuple(c or d for c, d in zip(configuration, solved, strict=True))
            return unwrap_joint_angles_within_limits(q_raw, q_prev, UR5E_JOINT_LIMITS)

        # 1. Approach pick. Its branch (shoulder/elbow/wrist) is locked for the whole cycle so the
        # arm never flips configuration mid-motion (e.g. at high tower slots).
        pos_app_pick = (x_pick, y_pick, z_pick + APPROACH_LIFT_OFFSET_M)
        q_app_pick_raw, configuration = self.solver.solve_ik_configured(
            x_pick_dh,
            y_pick_dh,
            z_pick + APPROACH_LIFT_OFFSET_M,
            current_joints=q_ref,
            rotation_matrix=ik_rot,
        )
        q_app_pick = unwrap_joint_angles_within_limits(q_app_pick_raw, q_ref, UR5E_JOINT_LIMITS)

        # 2. Pick
        pos_pick = (x_pick, y_pick, z_pick)
        q_pick = solve((x_pick_dh, y_pick_dh, z_pick), q_app_pick)

        # 3. Grasp Actuation (suction on, 200ms pause at pick position)
        q_grasp = list(q_pick)

        # 4. Lift
        pos_lift = (x_pick, y_pick, z_pick + APPROACH_LIFT_OFFSET_M)
        q_lift = solve((x_pick_dh, y_pick_dh, z_pick + APPROACH_LIFT_OFFSET_M), q_grasp)

        # 5. Tower approach / transfer
        pos_app_drop = (x_drop, y_drop, z_travel)
        q_app_drop = solve((x_drop_dh, y_drop_dh, z_travel), q_lift)

        # 6. Tower drop
        pos_drop = (x_drop, y_drop, z_release)
        q_drop = solve((x_drop_dh, y_drop_dh, z_release), q_app_drop)

        # 7. Release Actuation (suction off, 200ms pause at drop position)
        q_release = list(q_drop)

        # 8. Tower retreat
        pos_retreat = (x_drop, y_drop, z_travel)
        q_retreat = solve((x_drop_dh, y_drop_dh, z_travel), q_release)

        # 9. Home & 10. Complete: HOME is an absolute posture, never unwrapped relative to the
        # retreat pose. Unwrapping it added a 2*pi turn to wrist_1 whenever the retreat pose had
        # wrist_1 > pi/2 (outer towers, slot >= 1); fed back via /joint_states, the turns
        # accumulated cycle over cycle past the URDF limits.
        q_home = list(HOME_JOINT_POSITIONS)
        home_pos = self.solver.forward_kinematics_position(q_home, with_tcp=True)

        return [
            WaypointStep(
                step_number=1,
                name="approach_pick",
                phase=ActionPhase.APPROACHING.value,
                cartesian_position=pos_app_pick,
                joint_positions=q_app_pick,
                is_grasped=False,
                pause_duration_s=0.0,
                percent_complete=10.0,
            ),
            WaypointStep(
                step_number=2,
                name="pick",
                phase=ActionPhase.PICKING.value,
                cartesian_position=pos_pick,
                joint_positions=q_pick,
                is_grasped=False,
                pause_duration_s=0.0,
                percent_complete=20.0,
            ),
            WaypointStep(
                step_number=3,
                name="grasp",
                phase=ActionPhase.GRASPING.value,
                cartesian_position=pos_pick,
                joint_positions=q_grasp,
                is_grasped=True,
                pause_duration_s=0.2,
                percent_complete=30.0,
            ),
            WaypointStep(
                step_number=4,
                name="lift",
                phase=ActionPhase.LIFTING.value,
                cartesian_position=pos_lift,
                joint_positions=q_lift,
                is_grasped=True,
                pause_duration_s=0.0,
                percent_complete=40.0,
            ),
            WaypointStep(
                step_number=5,
                name="tower_approach",
                phase=ActionPhase.TRANSFERRING.value,
                cartesian_position=pos_app_drop,
                joint_positions=q_app_drop,
                is_grasped=True,
                pause_duration_s=0.0,
                percent_complete=50.0,
            ),
            WaypointStep(
                step_number=6,
                name="tower_drop",
                phase=ActionPhase.DROPPING.value,
                cartesian_position=pos_drop,
                joint_positions=q_drop,
                is_grasped=True,
                pause_duration_s=0.0,
                percent_complete=60.0,
            ),
            WaypointStep(
                step_number=7,
                name="release",
                phase=ActionPhase.RELEASING.value,
                cartesian_position=pos_drop,
                joint_positions=q_release,
                is_grasped=False,
                pause_duration_s=0.2,
                percent_complete=70.0,
            ),
            WaypointStep(
                step_number=8,
                name="tower_retreat",
                phase=ActionPhase.RETREATING.value,
                cartesian_position=pos_retreat,
                joint_positions=q_retreat,
                is_grasped=False,
                pause_duration_s=0.0,
                percent_complete=80.0,
            ),
            WaypointStep(
                step_number=9,
                name="home",
                phase=ActionPhase.HOMING.value,
                cartesian_position=home_pos,
                joint_positions=list(q_home),
                is_grasped=False,
                pause_duration_s=0.0,
                percent_complete=90.0,
            ),
            WaypointStep(
                step_number=10,
                name="complete",
                phase=ActionPhase.COMPLETED.value,
                cartesian_position=home_pos,
                joint_positions=list(q_home),
                is_grasped=False,
                pause_duration_s=0.0,
                percent_complete=100.0,
            ),
        ]
