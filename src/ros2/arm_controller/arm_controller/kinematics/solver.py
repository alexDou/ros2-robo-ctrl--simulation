"""Analytical UR5e forward/inverse kinematics solver."""

import math
from typing import Optional

from arm_controller.kinematics.angles import normalize_angle
from arm_controller.kinematics.errors import KinematicSingularityError, OutOfReachError
from arm_controller.kinematics.matrices import (
    _dh_matrix,
    _invert_rigid_transform,
    _matmul_4x4,
)

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
                s5 = math.sin(th5)
                if abs(s5) < 1e-6:
                    th6 = 0.0
                else:
                    th6 = normalize_angle(math.atan2(-t16[2][1] / s5, t16[2][0] / s5))

                t45 = _dh_matrix(th5, self.d[4], self.a[4], self.alpha[4])
                t56 = _dh_matrix(th6, self.d[5], self.a[5], self.alpha[5])
                t46 = _matmul_4x4(t45, t56)
                t14 = _matmul_4x4(t16, _invert_rigid_transform(t46))

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
            else HOME_JOINT_POSITIONS
        )
        return self.select_minimal_displacement(solutions, reference)


# AnalyticalInverseKinematics alias per AC & architectural spec
AnalyticalInverseKinematics = UR5eKinematics
