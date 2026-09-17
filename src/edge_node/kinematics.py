"""Analytical UR5e inverse kinematics solver and waypoint planner.

Implements closed-form analytical UR5e inverse kinematics in pure Python per ADR 0003:
- Denavit-Hartenberg parameters for standard Universal Robots UR5e.
- Vertical downward suction tool orientation constraint (Z-down normal).
- Explicit DexterousPalm Tool Center Point (TCP) offset (0.108m).
- Deterministic minimal Euclidean angular displacement solution selection in [-pi, pi].
- Workspace reachability validation (0.20m <= R <= 0.85m).
- Deterministic 10-step pick-and-place waypoint trajectory generator.
"""

from dataclasses import dataclass
import math
from typing import Optional

from domain import CANONICAL_POSES, PoseName

# Standard UR5e Denavit-Hartenberg Parameters (meters and radians)
UR5E_DH_D: list[float] = [0.1625, 0.0, 0.0, 0.1333, 0.0997, 0.0996]
UR5E_DH_A: list[float] = [0.0, -0.425, -0.3922, 0.0, 0.0, 0.0]
UR5E_DH_ALPHA: list[float] = [
    math.pi / 2.0,
    0.0,
    0.0,
    math.pi / 2.0,
    -math.pi / 2.0,
    0.0,
]

# Workcell Geometry & Physical Tool Parameters
DEFAULT_TCP_OFFSET_M: float = 0.108  # DexterousPalm tool center point offset (baseplate + rod + nozzle)
MIN_REACH_M: float = 0.20           # Inner reachability limit / base clearance boundary
MAX_REACH_M: float = 0.85           # Outer operational boundary / reach limit
DEFAULT_SPINDLE_TOWER_COORDS: tuple[float, float, float] = (0.40, -0.30, 0.0)
APPROACH_LIFT_OFFSET_M: float = 0.10  # Vertical approach and lift clearance offset

# Canonical downward suction cup orientation matrix: tool Z-axis points along -Z_base [0, 0, -1]
DEFAULT_DOWNWARD_ORIENTATION: list[list[float]] = [
    [0.0, 1.0, 0.0],
    [1.0, 0.0, 0.0],
    [0.0, 0.0, -1.0],
]


class KinematicsError(Exception):
    """Base exception for kinematics errors."""


class OutOfReachError(KinematicsError):
    """Raised when target coordinates fall outside robot reach boundaries."""


UnreachableTargetError = OutOfReachError


class KinematicSingularityError(KinematicsError):
    """Raised when target pose is near a kinematic singularity with no valid solution."""


def normalize_angle(angle: float) -> float:
    """Wraps an angular value in radians into the range [-pi, pi]."""
    return (angle + math.pi) % (2.0 * math.pi) - math.pi


def _dh_matrix(theta: float, d: float, a: float, alpha: float) -> list[list[float]]:
    """Computes standard Denavit-Hartenberg 4x4 homogeneous transformation matrix."""
    ct = math.cos(theta)
    st = math.sin(theta)
    ca = math.cos(alpha)
    sa = math.sin(alpha)
    return [
        [ct, -st * ca, st * sa, a * ct],
        [st, ct * ca, -ct * sa, a * st],
        [0.0, sa, ca, d],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _invert_rigid_transform(t: list[list[float]]) -> list[list[float]]:
    """Inverts an orthonormal 4x4 rigid transformation matrix: [R, p]^-1 = [R^T, -R^T * p]."""
    r_inv = [[t[j][i] for j in range(3)] for i in range(3)]
    p = [t[i][3] for i in range(3)]
    p_inv = [
        -(r_inv[i][0] * p[0] + r_inv[i][1] * p[1] + r_inv[i][2] * p[2])
        for i in range(3)
    ]
    return [
        [r_inv[0][0], r_inv[0][1], r_inv[0][2], p_inv[0]],
        [r_inv[1][0], r_inv[1][1], r_inv[1][2], p_inv[1]],
        [r_inv[2][0], r_inv[2][1], r_inv[2][2], p_inv[2]],
        [0.0, 0.0, 0.0, 1.0],
    ]


def _matmul_4x4(a: list[list[float]], b: list[list[float]]) -> list[list[float]]:
    """Multiplies two 4x4 matrices in pure Python."""
    return [
        [sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)]
        for i in range(4)
    ]


class UR5eKinematics:
    """Analytical forward and inverse kinematics solver for the UR5e manipulator."""

    def __init__(
        self,
        tcp_offset: float = DEFAULT_TCP_OFFSET_M,
        d: Optional[list[float]] = None,
        a: Optional[list[float]] = None,
        alpha: Optional[list[float]] = None,
    ) -> None:
        self.tcp_offset = tcp_offset
        self.d = list(d if d is not None else UR5E_DH_D)
        self.a = list(a if a is not None else UR5E_DH_A)
        self.alpha = list(alpha if alpha is not None else UR5E_DH_ALPHA)

    def forward_kinematics(
        self, joint_positions: list[float], with_tcp: bool = False
    ) -> list[list[float]]:
        """Computes 4x4 homogeneous transformation matrix from robot base to tool0 or TCP."""
        if len(joint_positions) != 6:
            raise ValueError(f"Expected 6 joint angles, received {len(joint_positions)}")

        t = [[1.0 if i == j else 0.0 for j in range(4)] for i in range(4)]
        for i in range(6):
            t = _matmul_4x4(
                t,
                _dh_matrix(
                    joint_positions[i],
                    self.d[i],
                    self.a[i],
                    self.alpha[i],
                ),
            )

        if with_tcp and self.tcp_offset != 0.0:
            # Offset along tool Z-axis (column 2 of rotation matrix)
            t_tcp_offset = [
                [1.0, 0.0, 0.0, 0.0],
                [0.0, 1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, self.tcp_offset],
                [0.0, 0.0, 0.0, 1.0],
            ]
            t = _matmul_4x4(t, t_tcp_offset)

        return t

    def forward_kinematics_position(
        self, joint_positions: list[float], with_tcp: bool = True
    ) -> tuple[float, float, float]:
        """Returns Cartesian coordinates (x, y, z) of the tool center point or flange."""
        t = self.forward_kinematics(joint_positions, with_tcp=with_tcp)
        return (t[0][3], t[1][3], t[2][3])

    def check_reachability(self, x: float, y: float, z: float = 0.0) -> None:
        """Validates that Cartesian coordinates fall within the robot's physical reach."""
        if z < 0.0:
            raise OutOfReachError(
                f"Target coordinates ({x:.3f}, {y:.3f}, {z:.3f}) are out-of-reach: "
                f"Z={z:.3f}m penetrates table surface (Z < 0.0m)"
            )
        r_planar = math.hypot(x, y)
        if r_planar < MIN_REACH_M:
            raise OutOfReachError(
                f"Target coordinates ({x:.3f}, {y:.3f}, {z:.3f}) are out-of-reach: "
                f"radial distance R={r_planar:.3f}m is within minimum boundary ({MIN_REACH_M:.2f}m)"
            )
        if r_planar > MAX_REACH_M:
            raise OutOfReachError(
                f"Target coordinates ({x:.3f}, {y:.3f}, {z:.3f}) are out-of-reach: "
                f"radial distance R={r_planar:.3f}m exceeds maximum reach ({MAX_REACH_M:.2f}m)"
            )
        r_spherical = math.sqrt(x * x + y * y + z * z)
        if r_spherical > MAX_REACH_M:
            raise OutOfReachError(
                f"Target coordinates ({x:.3f}, {y:.3f}, {z:.3f}) are out-of-reach: "
                f"spherical distance {r_spherical:.3f}m exceeds maximum reach ({MAX_REACH_M:.2f}m)"
            )

    def solve_ik_matrix(self, t06: list[list[float]]) -> list[list[float]]:
        """Closed-form analytical solution of UR5e 8 kinematic branches for a target tool0 matrix."""
        solutions: list[list[float]] = []

        # Step 1: Wrist Center P05 = P06 - d6 * Z_tool
        p05x = t06[0][3] - self.d[5] * t06[0][2]
        p05y = t06[1][3] - self.d[5] * t06[1][2]

        r_xy = math.hypot(p05x, p05y)
        if r_xy < self.d[3]:
            return solutions

        psi = math.atan2(p05y, p05x)
        ratio1 = max(-1.0, min(1.0, self.d[3] / r_xy))
        phi1 = math.acos(ratio1)
        th1_options = [
            normalize_angle(psi + math.pi / 2.0 + phi1),
            normalize_angle(psi + math.pi / 2.0 - phi1),
        ]

        for th1 in th1_options:
            # Step 2: Solve theta 5
            val = t06[0][3] * math.sin(th1) - t06[1][3] * math.cos(th1) - self.d[3]
            ratio5 = val / self.d[5]
            if abs(ratio5) > 1.000001:
                continue
            phi5 = math.acos(max(-1.0, min(1.0, ratio5)))
            th5_options = (
                [normalize_angle(phi5)]
                if abs(phi5) < 1e-6
                else [normalize_angle(phi5), normalize_angle(-phi5)]
            )

            t01 = _dh_matrix(th1, self.d[0], self.a[0], self.alpha[0])
            t10 = _invert_rigid_transform(t01)
            t16 = _matmul_4x4(t10, t06)

            for th5 in th5_options:
                # Step 3: Solve theta 6
                s5 = math.sin(th5)
                if abs(s5) < 1e-6:
                    th6 = 0.0
                else:
                    th6 = normalize_angle(math.atan2(-t16[2][1] / s5, t16[2][0] / s5))

                t45 = _dh_matrix(th5, self.d[4], self.a[4], self.alpha[4])
                t56 = _dh_matrix(th6, self.d[5], self.a[5], self.alpha[5])
                t46 = _matmul_4x4(t45, t56)
                t14 = _matmul_4x4(t16, _invert_rigid_transform(t46))

                # Step 4: Planar 2-link solution for theta 2 and theta 3
                x14 = t14[0][3]
                y14 = t14[1][3]
                r2 = x14 * x14 + y14 * y14

                ratio3 = (r2 - self.a[1] ** 2 - self.a[2] ** 2) / (
                    2.0 * self.a[1] * self.a[2]
                )
                if abs(ratio3) > 1.000001:
                    continue
                phi3 = math.acos(max(-1.0, min(1.0, ratio3)))
                th3_options = (
                    [normalize_angle(phi3)]
                    if abs(phi3) < 1e-6
                    else [normalize_angle(phi3), normalize_angle(-phi3)]
                )

                for th3 in th3_options:
                    k1 = self.a[1] + self.a[2] * math.cos(th3)
                    k2 = self.a[2] * math.sin(th3)
                    th2 = normalize_angle(math.atan2(y14, x14) - math.atan2(k2, k1))

                    # Step 5: Solve theta 4 from planar orientation
                    phi14 = math.atan2(t14[1][0], t14[0][0])
                    th4 = normalize_angle(phi14 - th2 - th3)

                    solutions.append([th1, th2, th3, th4, th5, th6])

        return solutions

    def angular_distance(self, q1: list[float], q2: list[float]) -> float:
        """Calculates Euclidean angular distance avoiding multi-revolution flips."""
        if len(q1) != 6 or len(q2) != 6:
            raise ValueError(
                f"Expected 6-DoF joint vectors; received lengths {len(q1)} and {len(q2)}"
            )
        diff_sq = 0.0
        for i in range(6):
            d = normalize_angle(q1[i] - q2[i])
            diff_sq += d * d
        return math.sqrt(diff_sq)

    def select_minimal_displacement(
        self, solutions: list[list[float]], current_joints: list[float]
    ) -> list[float]:
        """Deterministically selects solution configuration with minimal Euclidean distance."""
        if not solutions:
            raise KinematicSingularityError("No inverse kinematics solutions available")

        best_sol: Optional[list[float]] = None
        best_dist = float("inf")

        for sol in solutions:
            dist = self.angular_distance(sol, current_joints)
            if dist < best_dist:
                best_dist = dist
                best_sol = sol

        assert best_sol is not None
        return best_sol

    def solve_ik_all(
        self,
        x: float,
        y: float,
        z: float,
        rotation_matrix: Optional[list[list[float]]] = None,
        apply_tcp_offset: bool = True,
    ) -> list[list[float]]:
        """Solves all valid analytical IK branches for a Cartesian target."""
        self.check_reachability(x, y, z)

        rot = rotation_matrix if rotation_matrix is not None else DEFAULT_DOWNWARD_ORIENTATION
        tool_z_axis = [rot[0][2], rot[1][2], rot[2][2]]

        offset = self.tcp_offset if apply_tcp_offset else 0.0
        # P_flange = P_tcp - offset * tool_z_axis
        flange_x = x - offset * tool_z_axis[0]
        flange_y = y - offset * tool_z_axis[1]
        flange_z = z - offset * tool_z_axis[2]

        t06 = [
            [rot[0][0], rot[0][1], rot[0][2], flange_x],
            [rot[1][0], rot[1][1], rot[1][2], flange_y],
            [rot[2][0], rot[2][1], rot[2][2], flange_z],
            [0.0, 0.0, 0.0, 1.0],
        ]

        return self.solve_ik_matrix(t06)

    def solve_ik(
        self,
        x: float,
        y: float,
        z: float,
        current_joints: Optional[list[float]] = None,
        rotation_matrix: Optional[list[list[float]]] = None,
        apply_tcp_offset: bool = True,
    ) -> list[float]:
        """Solves IK for Cartesian target and selects branch with minimal angular displacement."""
        solutions = self.solve_ik_all(
            x,
            y,
            z,
            rotation_matrix=rotation_matrix,
            apply_tcp_offset=apply_tcp_offset,
        )
        if not solutions:
            raise OutOfReachError(
                f"No kinematically reachable configuration found for ({x:.3f}, {y:.3f}, {z:.3f})"
            )

        reference = (
            current_joints
            if current_joints is not None
            else CANONICAL_POSES[PoseName.HOME]
        )
        return self.select_minimal_displacement(solutions, reference)


@dataclass(frozen=True)
class WaypointStep:
    """Single discrete step in the pick-and-place waypoint sequence.

    Note for downstream trajectory interpolators (e.g. 30 Hz EdgeNode motion):
    Joint angles are bounded in [-pi, pi]. Interpolators should apply shortest-arc
    interpolation on S^1 (q_curr + normalize_angle(q_target - q_curr) * alpha)
    to prevent multi-revolution unwrapping flips across the +/-pi boundary.
    """

    step_number: int
    name: str
    cartesian_position: tuple[float, float, float]
    joint_positions: list[float]
    is_grasped: bool = False
    pause_duration_s: float = 0.0

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
        1. approach_pick: (x_pick, y_pick, z_pick + 0.10m)
        2. pick: (x_pick, y_pick, z_pick)
        3. grasp: Grasp actuation (suction on, 200ms pause)
        4. lift: (x_pick, y_pick, z_pick + 0.10m)
        5. tower_approach: (x_drop, y_drop, z_drop + 0.10m)
        6. tower_drop: (x_drop, y_drop, z_drop)
        7. release: Release actuation (suction off, 200ms pause)
        8. tower_retreat: (x_drop, y_drop, z_drop + 0.10m)
        9. home: CANONICAL_POSES[PoseName.HOME]
        10. complete: CANONICAL_POSES[PoseName.HOME]
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
            else list(CANONICAL_POSES[PoseName.HOME])
        )

        # 1. Approach pick
        pos_app_pick = (x_pick, y_pick, z_pick + APPROACH_LIFT_OFFSET_M)
        q_app_pick = self.solver.solve_ik(
            pos_app_pick[0],
            pos_app_pick[1],
            pos_app_pick[2],
            current_joints=q_ref,
            rotation_matrix=rotation_matrix,
        )

        # 2. Pick
        pos_pick = (x_pick, y_pick, z_pick)
        q_pick = self.solver.solve_ik(
            pos_pick[0],
            pos_pick[1],
            pos_pick[2],
            current_joints=q_app_pick,
            rotation_matrix=rotation_matrix,
        )

        # 3. Grasp Actuation (suction on, 200ms pause at pick position)
        q_grasp = list(q_pick)

        # 4. Lift
        pos_lift = (x_pick, y_pick, z_pick + APPROACH_LIFT_OFFSET_M)
        q_lift = self.solver.solve_ik(
            pos_lift[0],
            pos_lift[1],
            pos_lift[2],
            current_joints=q_grasp,
            rotation_matrix=rotation_matrix,
        )

        # 5. Tower approach
        pos_app_drop = (x_drop, y_drop, z_drop + APPROACH_LIFT_OFFSET_M)
        q_app_drop = self.solver.solve_ik(
            pos_app_drop[0],
            pos_app_drop[1],
            pos_app_drop[2],
            current_joints=q_lift,
            rotation_matrix=rotation_matrix,
        )

        # 6. Tower drop
        pos_drop = (x_drop, y_drop, z_drop)
        q_drop = self.solver.solve_ik(
            pos_drop[0],
            pos_drop[1],
            pos_drop[2],
            current_joints=q_app_drop,
            rotation_matrix=rotation_matrix,
        )

        # 7. Release Actuation (suction off, 200ms pause at drop position)
        q_release = list(q_drop)

        # 8. Tower retreat
        pos_retreat = (x_drop, y_drop, z_drop + APPROACH_LIFT_OFFSET_M)
        q_retreat = self.solver.solve_ik(
            pos_retreat[0],
            pos_retreat[1],
            pos_retreat[2],
            current_joints=q_release,
            rotation_matrix=rotation_matrix,
        )

        # 9. Home & 10. Complete
        q_home = list(CANONICAL_POSES[PoseName.HOME])
        home_pos = self.solver.forward_kinematics_position(q_home, with_tcp=True)

        return [
            WaypointStep(
                step_number=1,
                name="approach_pick",
                cartesian_position=pos_app_pick,
                joint_positions=q_app_pick,
                is_grasped=False,
                pause_duration_s=0.0,
            ),
            WaypointStep(
                step_number=2,
                name="pick",
                cartesian_position=pos_pick,
                joint_positions=q_pick,
                is_grasped=False,
                pause_duration_s=0.0,
            ),
            WaypointStep(
                step_number=3,
                name="grasp",
                cartesian_position=pos_pick,
                joint_positions=q_grasp,
                is_grasped=True,
                pause_duration_s=0.2,
            ),
            WaypointStep(
                step_number=4,
                name="lift",
                cartesian_position=pos_lift,
                joint_positions=q_lift,
                is_grasped=True,
                pause_duration_s=0.0,
            ),
            WaypointStep(
                step_number=5,
                name="tower_approach",
                cartesian_position=pos_app_drop,
                joint_positions=q_app_drop,
                is_grasped=True,
                pause_duration_s=0.0,
            ),
            WaypointStep(
                step_number=6,
                name="tower_drop",
                cartesian_position=pos_drop,
                joint_positions=q_drop,
                is_grasped=True,
                pause_duration_s=0.0,
            ),
            WaypointStep(
                step_number=7,
                name="release",
                cartesian_position=pos_drop,
                joint_positions=q_release,
                is_grasped=False,
                pause_duration_s=0.2,
            ),
            WaypointStep(
                step_number=8,
                name="tower_retreat",
                cartesian_position=pos_retreat,
                joint_positions=q_retreat,
                is_grasped=False,
                pause_duration_s=0.0,
            ),
            WaypointStep(
                step_number=9,
                name="home",
                cartesian_position=home_pos,
                joint_positions=list(q_home),
                is_grasped=False,
                pause_duration_s=0.0,
            ),
            WaypointStep(
                step_number=10,
                name="complete",
                cartesian_position=home_pos,
                joint_positions=list(q_home),
                is_grasped=False,
                pause_duration_s=0.0,
            ),
        ]
