"""Unit tests for analytical UR5e inverse kinematics solver and waypoint planner.

Validates:
- DH-parameter forward kinematics and DexterousPalm TCP offset (0.108m).
- Pure-Python analytical UR5e closed-form IK solver.
- Vertical downward normal constraint.
- Sub-millimeter Cartesian positional accuracy (<1mm).
- Reachability boundary enforcement (0.20m <= R <= 0.85m).
- Minimal Euclidean angular displacement branch selection in [-pi, pi].
- Deterministic 10-step pick-and-place waypoint trajectory generator.
"""

import math
import random
import pytest

from domain import CANONICAL_POSES, PoseName
from edge_node.kinematics import (
    DEFAULT_DOWNWARD_ORIENTATION,
    DEFAULT_SPINDLE_TOWER_COORDS,
    DEFAULT_TCP_OFFSET_M,
    MAX_REACH_M,
    MIN_REACH_M,
    KinematicsError,
    OutOfReachError,
    PickAndPlaceTrajectoryGenerator,
    UR5eKinematics,
    WaypointStep,
)


@pytest.fixture
def solver() -> UR5eKinematics:
    return UR5eKinematics(tcp_offset=DEFAULT_TCP_OFFSET_M)


class TestForwardKinematics:
    def test_forward_kinematics_home_pose(self, solver: UR5eKinematics) -> None:
        q_home = CANONICAL_POSES[PoseName.HOME]
        T_flange = solver.forward_kinematics(q_home, with_tcp=False)

        # In HOME pose [0, -pi/2, 0, -pi/2, 0, 0]:
        # URDF tool0 pos is approx [0.0, -0.2329, 1.0794]
        assert abs(T_flange[0][3] - 0.0) < 1e-3
        assert abs(T_flange[1][3] - (-0.2329)) < 1e-3
        assert abs(T_flange[2][3] - 1.0794) < 1e-3

        # Rotation matrix check
        assert abs(T_flange[0][0] - (-1.0)) < 1e-3
        assert abs(T_flange[1][2] - (-1.0)) < 1e-3
        assert abs(T_flange[2][1] - (-1.0)) < 1e-3

    def test_forward_kinematics_with_tcp_offset(self, solver: UR5eKinematics) -> None:
        q_inspect = CANONICAL_POSES[PoseName.INSPECT_POSE]
        T_flange = solver.forward_kinematics(q_inspect, with_tcp=False)
        T_tcp = solver.forward_kinematics(q_inspect, with_tcp=True)

        # Tool orientation in INSPECT_POSE has Z-axis pointing downward [0, 0, -1]
        z_axis = [T_flange[0][2], T_flange[1][2], T_flange[2][2]]
        assert abs(z_axis[0]) < 1e-3
        assert abs(z_axis[1]) < 1e-3
        assert abs(z_axis[2] - (-1.0)) < 1e-3

        # TCP offset is applied along tool Z-axis: P_tcp = P_flange + 0.108 * z_axis
        expected_x = T_flange[0][3] + DEFAULT_TCP_OFFSET_M * z_axis[0]
        expected_y = T_flange[1][3] + DEFAULT_TCP_OFFSET_M * z_axis[1]
        expected_z = T_flange[2][3] + DEFAULT_TCP_OFFSET_M * z_axis[2]

        assert abs(T_tcp[0][3] - expected_x) < 1e-5
        assert abs(T_tcp[1][3] - expected_y) < 1e-5
        assert abs(T_tcp[2][3] - expected_z) < 1e-5
        # In vertical downward, TCP is 0.108m lower than flange
        assert abs((T_flange[2][3] - T_tcp[2][3]) - DEFAULT_TCP_OFFSET_M) < 1e-5


class TestInverseKinematics:
    def test_round_trip_random_poses_under_1mm(self, solver: UR5eKinematics) -> None:
        """Asserts analytical IK recovers target position with <1mm (0.001m) accuracy."""
        random.seed(1337)
        tested = 0
        for _ in range(100):
            q_rand = [random.uniform(-math.pi + 0.3, math.pi - 0.3) for _ in range(6)]
            T_target = solver.forward_kinematics(q_rand, with_tcp=False)
            solutions = solver.solve_ik_matrix(T_target)
            assert len(solutions) > 0

            # Find matching configuration
            best_sol = solver.select_minimal_displacement(solutions, q_rand)
            T_sol = solver.forward_kinematics(best_sol, with_tcp=False)

            dx = T_sol[0][3] - T_target[0][3]
            dy = T_sol[1][3] - T_target[1][3]
            dz = T_sol[2][3] - T_target[2][3]
            cartesian_error_m = math.sqrt(dx * dx + dy * dy + dz * dz)

            # Assert strict sub-millimeter (< 1mm = 0.001m) accuracy
            assert cartesian_error_m < 0.001, f"Error {cartesian_error_m*1000:.3f}mm exceeds 1mm"
            tested += 1

        assert tested == 100

    def test_solve_cartesian_downward_normal_constraint(self, solver: UR5eKinematics) -> None:
        """Asserts solve_ik enforces vertical downward normal orientation."""
        test_points = [
            (0.40, -0.30, 0.0),   # SpindleTower base
            (0.40, -0.30, 0.10),  # SpindleTower approach
            (0.35, 0.15, 0.0),    # Workcell table pickup
            (0.50, -0.10, 0.05),  # Intermediate workspace point
        ]

        for x, y, z in test_points:
            q_sol = solver.solve_ik(x, y, z, apply_tcp_offset=True)
            assert len(q_sol) == 6
            for angle in q_sol:
                assert -math.pi <= angle <= math.pi

            # Check forward kinematics of TCP
            T_tcp = solver.forward_kinematics(q_sol, with_tcp=True)
            tcp_x, tcp_y, tcp_z = T_tcp[0][3], T_tcp[1][3], T_tcp[2][3]

            assert abs(tcp_x - x) < 0.001, f"X error: got {tcp_x}, expected {x}"
            assert abs(tcp_y - y) < 0.001, f"Y error: got {tcp_y}, expected {y}"
            assert abs(tcp_z - z) < 0.001, f"Z error: got {tcp_z}, expected {z}"

            # Tool Z-axis must point straight down [0, 0, -1]
            z_col = [T_tcp[0][2], T_tcp[1][2], T_tcp[2][2]]
            assert abs(z_col[0]) < 1e-3
            assert abs(z_col[1]) < 1e-3
            assert abs(z_col[2] - (-1.0)) < 1e-3

    def test_tcp_offset_application(self, solver: UR5eKinematics) -> None:
        """Asserts tool flange is located 0.108m above TCP target."""
        x, y, z = 0.40, -0.20, 0.0
        q_sol = solver.solve_ik(x, y, z, apply_tcp_offset=True)

        T_flange = solver.forward_kinematics(q_sol, with_tcp=False)
        T_tcp = solver.forward_kinematics(q_sol, with_tcp=True)

        # Flange Z should be exactly z + 0.108m
        assert abs(T_flange[2][3] - (z + DEFAULT_TCP_OFFSET_M)) < 0.001
        assert abs(T_tcp[2][3] - z) < 0.001

    def test_minimal_euclidean_displacement_selection(self, solver: UR5eKinematics) -> None:
        """Asserts solution selector chooses branch closest to current joint configuration."""
        q_current = [0.5, -1.8, -1.9, 2.3, -1.5708, 0.5]
        sols = solver.solve_ik_all(0.40, 0.10, 0.0)
        assert len(sols) >= 4

        best = solver.select_minimal_displacement(sols, q_current)
        dist_best = solver.angular_distance(best, q_current)

        for other in sols:
            dist_other = solver.angular_distance(other, q_current)
            assert dist_best <= dist_other + 1e-9

    def test_minimal_displacement_avoids_multi_revolution_flips(self, solver: UR5eKinematics) -> None:
        """Asserts angular distance accounts for 2*pi wrapping."""
        q_near_pi = [3.10, 0.0, 0.0, 0.0, 0.0, 0.0]
        cand1 = [-3.14, 0.0, 0.0, 0.0, 0.0, 0.0]  # angular diff ~ 0.04 rad
        cand2 = [0.0, 0.0, 0.0, 0.0, 0.0, 0.0]    # angular diff ~ 3.10 rad

        best = solver.select_minimal_displacement([cand1, cand2], q_near_pi)
        assert best == cand1


class TestReachabilityBoundaries:
    def test_reachability_within_boundaries_passes(self, solver: UR5eKinematics) -> None:
        solver.check_reachability(0.40, 0.30, 0.0)   # R = 0.50m
        solver.check_reachability(0.25, 0.0, 0.0)    # R = 0.25m
        solver.check_reachability(0.80, 0.0, 0.0)    # R = 0.80m

    def test_inner_radius_out_of_reach_raises_error(self, solver: UR5eKinematics) -> None:
        # R = 0.1414m < 0.20m
        with pytest.raises(OutOfReachError) as exc_info:
            solver.check_reachability(0.10, 0.10, 0.0)
        assert "out-of-reach" in str(exc_info.value).lower()
        assert "0.2" in str(exc_info.value)

        # Also via solve_ik
        with pytest.raises(OutOfReachError):
            solver.solve_ik(0.10, 0.10, 0.0)

    def test_outer_radius_out_of_reach_raises_error(self, solver: UR5eKinematics) -> None:
        # R = 0.90m > 0.85m
        with pytest.raises(OutOfReachError) as exc_info:
            solver.check_reachability(0.90, 0.0, 0.0)
        assert "out-of-reach" in str(exc_info.value).lower()
        assert "0.85" in str(exc_info.value)

        # Also via solve_ik
        with pytest.raises(OutOfReachError):
            solver.solve_ik(0.90, 0.0, 0.0)

    def test_boundary_values(self, solver: UR5eKinematics) -> None:
        with pytest.raises(OutOfReachError):
            solver.check_reachability(0.199, 0.0, 0.0)

        with pytest.raises(OutOfReachError):
            solver.check_reachability(0.851, 0.0, 0.0)

    def test_floor_boundary_rejection(self, solver: UR5eKinematics) -> None:
        with pytest.raises(OutOfReachError) as exc_info:
            solver.check_reachability(0.40, 0.10, -0.05)
        assert "penetrates table surface" in str(exc_info.value)

        with pytest.raises(OutOfReachError):
            solver.solve_ik(0.40, 0.10, -0.01)

    def test_angular_distance_vector_length(self, solver: UR5eKinematics) -> None:
        with pytest.raises(ValueError):
            solver.angular_distance([0.0, 0.0, 0.0], [0.0, 0.0, 0.0, 0.0, 0.0, 0.0])


class TestPickAndPlaceTrajectoryGenerator:
    def test_10_step_sequence_generation(self) -> None:
        generator = PickAndPlaceTrajectoryGenerator()
        pick = (0.35, 0.15, 0.0)
        drop = (0.40, -0.30, 0.0)

        steps = generator.generate_trajectory(pick_coords=pick, drop_coords=drop)
        assert len(steps) == 10

        expected_names = [
            "approach_pick",
            "pick",
            "grasp",
            "lift",
            "tower_approach",
            "tower_drop",
            "release",
            "tower_retreat",
            "home",
            "complete",
        ]
        actual_names = [s.name for s in steps]
        assert actual_names == expected_names

        # Step indices
        assert [s.step_number for s in steps] == list(range(1, 11))

        # Check heights & grasp state
        # 1. approach_pick: z_pick + 0.10m, not grasped
        assert abs(steps[0].cartesian_position[2] - (pick[2] + 0.10)) < 1e-4
        assert not steps[0].is_grasped
        assert steps[0].pause_duration_s == 0.0

        # 2. pick: z_pick, not grasped
        assert abs(steps[1].cartesian_position[2] - pick[2]) < 1e-4
        assert not steps[1].is_grasped
        assert steps[1].pause_duration_s == 0.0

        # 3. grasp: z_pick, is_grasped=True, 200ms pause
        assert abs(steps[2].cartesian_position[2] - pick[2]) < 1e-4
        assert steps[2].is_grasped
        assert steps[2].pause_duration_s == 0.2
        assert steps[2].joint_positions == steps[1].joint_positions

        # 4. lift: z_pick + 0.10m, is_grasped=True
        assert abs(steps[3].cartesian_position[2] - (pick[2] + 0.10)) < 1e-4
        assert steps[3].is_grasped
        assert steps[3].pause_duration_s == 0.0

        # 5. tower_approach: z_drop + 0.10m, is_grasped=True
        assert abs(steps[4].cartesian_position[2] - (drop[2] + 0.10)) < 1e-4
        assert steps[4].is_grasped
        assert steps[4].pause_duration_s == 0.0

        # 6. tower_drop: z_drop, is_grasped=True
        assert abs(steps[5].cartesian_position[2] - drop[2]) < 1e-4
        assert steps[5].is_grasped
        assert steps[5].pause_duration_s == 0.0

        # 7. release: z_drop, is_grasped=False, 200ms pause
        assert abs(steps[6].cartesian_position[2] - drop[2]) < 1e-4
        assert not steps[6].is_grasped
        assert steps[6].pause_duration_s == 0.2
        assert steps[6].joint_positions == steps[5].joint_positions

        # 8. tower_retreat: z_drop + 0.10m, is_grasped=False
        assert abs(steps[7].cartesian_position[2] - (drop[2] + 0.10)) < 1e-4
        assert not steps[7].is_grasped
        assert steps[7].pause_duration_s == 0.0

        # 9. home: CANONICAL_POSES[HOME]
        assert steps[8].joint_positions == CANONICAL_POSES[PoseName.HOME]
        assert not steps[8].is_grasped

        # 10. complete: CANONICAL_POSES[HOME]
        assert steps[9].joint_positions == CANONICAL_POSES[PoseName.HOME]
        assert not steps[9].is_grasped

    def test_default_drop_is_spindle_tower(self) -> None:
        generator = PickAndPlaceTrajectoryGenerator()
        pick = (0.45, 0.10, 0.0)
        steps = generator.generate_trajectory(pick_coords=pick, drop_coords=None)
        assert len(steps) == 10
        # drop position should match DEFAULT_SPINDLE_TOWER_COORDS
        assert abs(steps[5].cartesian_position[0] - DEFAULT_SPINDLE_TOWER_COORDS[0]) < 1e-4
        assert abs(steps[5].cartesian_position[1] - DEFAULT_SPINDLE_TOWER_COORDS[1]) < 1e-4
        assert abs(steps[5].cartesian_position[2] - DEFAULT_SPINDLE_TOWER_COORDS[2]) < 1e-4

    def test_stack_slot_height(self) -> None:
        generator = PickAndPlaceTrajectoryGenerator()
        pick = (0.40, 0.10, 0.0)
        # Drop at slot 4 (z = 4 * 0.02 = 0.08m)
        drop = (0.40, -0.30, 0.08)
        steps = generator.generate_trajectory(pick_coords=pick, drop_coords=drop)
        assert abs(steps[5].cartesian_position[2] - 0.08) < 1e-4
        assert abs(steps[4].cartesian_position[2] - 0.18) < 1e-4

    def test_trajectory_rejects_unreachable_coordinates(self) -> None:
        generator = PickAndPlaceTrajectoryGenerator()
        # Unreachable pick (R = 0.10 < 0.20)
        with pytest.raises(OutOfReachError):
            generator.generate_trajectory(pick_coords=(0.10, 0.0, 0.0))

        # Unreachable drop (R = 0.90 > 0.85)
        with pytest.raises(OutOfReachError):
            generator.generate_trajectory(
                pick_coords=(0.40, 0.10, 0.0),
                drop_coords=(0.90, 0.0, 0.0),
            )

    def test_waypoint_fk_accuracy(self) -> None:
        """Asserts each Cartesian waypoint produces FK within <1mm of target position."""
        generator = PickAndPlaceTrajectoryGenerator()
        pick = (0.38, 0.20, 0.0)
        drop = (0.40, -0.30, 0.04)
        steps = generator.generate_trajectory(pick_coords=pick, drop_coords=drop)

        # For the Cartesian motion steps (1, 2, 4, 5, 6, 8):
        cartesian_step_indices = [0, 1, 3, 4, 5, 7]
        for idx in cartesian_step_indices:
            step = steps[idx]
            T_tcp = generator.solver.forward_kinematics(step.joint_positions, with_tcp=True)
            dx = T_tcp[0][3] - step.cartesian_position[0]
            dy = T_tcp[1][3] - step.cartesian_position[1]
            dz = T_tcp[2][3] - step.cartesian_position[2]
            err = math.sqrt(dx * dx + dy * dy + dz * dz)
            assert err < 0.001, f"Step {step.name} FK error {err*1000:.3f}mm exceeds 1mm limit"
