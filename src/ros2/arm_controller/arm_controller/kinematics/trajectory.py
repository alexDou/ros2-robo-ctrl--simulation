"""Deterministic 10-step pick-and-place waypoint generator."""

from dataclasses import dataclass
from typing import Optional

from arm_controller.kinematics.phases import ActionPhase
from arm_controller.kinematics.solver import UR5eKinematics
from arm_controller.kinematics.angles import unwrap_joint_angles

from arm_controller.kinematics.constants import (
    UR5E_DH_D,
    UR5E_DH_A,
    UR5E_DH_ALPHA,
    DEFAULT_TCP_OFFSET_M,
    MIN_REACH_M,
    MAX_REACH_M,
    DEFAULT_SPINDLE_TOWER_COORDS,
    APPROACH_LIFT_OFFSET_M,
    CANONICAL_UR5E_JOINTS,
    HOME_JOINT_POSITIONS,
    READY_JOINT_POSITIONS,
    INSPECT_JOINT_POSITIONS,
    DEFAULT_DOWNWARD_ORIENTATION,
)


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

    def __init__(self, solver: Optional[UR5eKinematics] = None) -> None:
        self.solver = solver if solver is not None else UR5eKinematics()

    def generate_trajectory(
        self,
        pick_coords: tuple[float, float, float],
        drop_coords: Optional[tuple[float, float, float]] = None,
        current_joints: Optional[list[float]] = None,
        rotation_matrix: Optional[list[list[float]]] = None,
    ) -> list[WaypointStep]:
        """Generates standard 10-step pick-and-place waypoint sequence.

        Sequence:
        1. approach_pick: (x_pick, y_pick, z_pick + 0.10m) -> APPROACHING (10%)
        2. pick: (x_pick, y_pick, z_pick)                 -> PICKING (20%)
        3. grasp: Grasp actuation pause (suction on)       -> GRASPING (30%)
        4. lift: (x_pick, y_pick, z_pick + 0.10m)         -> LIFTING (40%)
        5. tower_approach: (x_drop, y_drop, z_drop + 0.10m)-> TRANSFERRING (50%)
        6. tower_drop: (x_drop, y_drop, z_drop)           -> DROPPING (60%)
        7. release: Release actuation pause (suction off)  -> RELEASING (70%)
        8. tower_retreat: (x_drop, y_drop, z_drop + 0.10m) -> RETREATING (80%)
        9. home: HOME pose                                 -> HOMING (90%)
        10. complete: HOME pose                            -> COMPLETED (100%)
        """
        x_pick, y_pick, z_pick = pick_coords
        drop = (
            drop_coords
            if drop_coords is not None
            else DEFAULT_SPINDLE_TOWER_COORDS
        )
        x_drop, y_drop, z_drop = drop

        # Validate reachability before computation
        self.solver.check_reachability(x_pick, y_pick, z_pick)
        self.solver.check_reachability(x_pick, y_pick, z_pick + APPROACH_LIFT_OFFSET_M)
        self.solver.check_reachability(x_drop, y_drop, z_drop)
        self.solver.check_reachability(x_drop, y_drop, z_drop + APPROACH_LIFT_OFFSET_M)

        q_ref = (
            list(current_joints)
            if current_joints is not None
            else list(HOME_JOINT_POSITIONS)
        )

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

        # 1. Approach pick
        pos_app_pick = (x_pick, y_pick, z_pick + APPROACH_LIFT_OFFSET_M)
        pos_app_pick_dh = (x_pick_dh, y_pick_dh, z_pick + APPROACH_LIFT_OFFSET_M)
        q_app_pick_raw = self.solver.solve_ik(
            pos_app_pick_dh[0],
            pos_app_pick_dh[1],
            pos_app_pick_dh[2],
            current_joints=q_ref,
            rotation_matrix=ik_rot,
        )
        q_app_pick = unwrap_joint_angles(q_app_pick_raw, q_ref)

        # 2. Pick
        pos_pick = (x_pick, y_pick, z_pick)
        pos_pick_dh = (x_pick_dh, y_pick_dh, z_pick)
        q_pick_raw = self.solver.solve_ik(
            pos_pick_dh[0],
            pos_pick_dh[1],
            pos_pick_dh[2],
            current_joints=q_app_pick,
            rotation_matrix=ik_rot,
        )
        q_pick = unwrap_joint_angles(q_pick_raw, q_app_pick)

        # 3. Grasp Actuation (suction on, 200ms pause at pick position)
        q_grasp = list(q_pick)

        # 4. Lift
        pos_lift = (x_pick, y_pick, z_pick + APPROACH_LIFT_OFFSET_M)
        pos_lift_dh = (x_pick_dh, y_pick_dh, z_pick + APPROACH_LIFT_OFFSET_M)
        q_lift_raw = self.solver.solve_ik(
            pos_lift_dh[0],
            pos_lift_dh[1],
            pos_lift_dh[2],
            current_joints=q_grasp,
            rotation_matrix=ik_rot,
        )
        q_lift = unwrap_joint_angles(q_lift_raw, q_grasp)

        # 5. Tower approach / transfer
        pos_app_drop = (x_drop, y_drop, z_drop + APPROACH_LIFT_OFFSET_M)
        pos_app_drop_dh = (x_drop_dh, y_drop_dh, z_drop + APPROACH_LIFT_OFFSET_M)
        q_app_drop_raw = self.solver.solve_ik(
            pos_app_drop_dh[0],
            pos_app_drop_dh[1],
            pos_app_drop_dh[2],
            current_joints=q_lift,
            rotation_matrix=ik_rot,
        )
        q_app_drop = unwrap_joint_angles(q_app_drop_raw, q_lift)

        # 6. Tower drop
        pos_drop = (x_drop, y_drop, z_drop)
        pos_drop_dh = (x_drop_dh, y_drop_dh, z_drop)
        q_drop_raw = self.solver.solve_ik(
            pos_drop_dh[0],
            pos_drop_dh[1],
            pos_drop_dh[2],
            current_joints=q_app_drop,
            rotation_matrix=ik_rot,
        )
        q_drop = unwrap_joint_angles(q_drop_raw, q_app_drop)

        # 7. Release Actuation (suction off, 200ms pause at drop position)
        q_release = list(q_drop)

        # 8. Tower retreat
        pos_retreat = (x_drop, y_drop, z_drop + APPROACH_LIFT_OFFSET_M)
        pos_retreat_dh = (x_drop_dh, y_drop_dh, z_drop + APPROACH_LIFT_OFFSET_M)
        q_retreat_raw = self.solver.solve_ik(
            pos_retreat_dh[0],
            pos_retreat_dh[1],
            pos_retreat_dh[2],
            current_joints=q_release,
            rotation_matrix=ik_rot,
        )
        q_retreat = unwrap_joint_angles(q_retreat_raw, q_release)

        # 9. Home & 10. Complete
        q_home_canonical = list(HOME_JOINT_POSITIONS)
        q_home = unwrap_joint_angles(q_home_canonical, q_retreat)
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
