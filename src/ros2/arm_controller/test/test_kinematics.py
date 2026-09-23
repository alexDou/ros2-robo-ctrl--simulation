"""Pure kinematics solver and waypoint trajectory tests (no ROS2 nodes)."""

import math
import time

import pytest

from arm_controller.kinematics import (
    ActionPhase,
    AnalyticalInverseKinematics,
    CANONICAL_UR5E_JOINTS,
    DEFAULT_TCP_OFFSET_M,
    OutOfReachError,
    PickAndPlaceTrajectoryGenerator,
)


def test_analytical_ik_solve_time_and_precision():
    """Asserts AnalyticalInverseKinematics solves in <0.2ms with <1mm Cartesian accuracy."""
    solver = AnalyticalInverseKinematics(tcp_offset=DEFAULT_TCP_OFFSET_M)

    # Warm-up
    for _ in range(50):
        solver.solve_ik(0.40, -0.30, 0.0)

    # Benchmark average solve time
    N = 1000
    t0 = time.perf_counter()
    for _ in range(N):
        solver.solve_ik(0.40, -0.30, 0.0)
    avg_solve_time_ms = (time.perf_counter() - t0) * 1000.0 / N

    assert avg_solve_time_ms < 0.20, f"Average solve time {avg_solve_time_ms:.4f}ms exceeds 0.2ms limit"

    # Positional accuracy test
    test_coords = [
        (0.40, -0.30, 0.0),
        (0.35, 0.15, 0.02),
        (0.50, -0.20, 0.10),
        (0.45, 0.10, 0.05),
    ]
    for x, y, z in test_coords:
        q = solver.solve_ik(x, y, z)
        assert len(q) == 6
        for angle in q:
            assert -math.pi <= angle <= math.pi

        T_tcp = solver.forward_kinematics(q, with_tcp=True)
        dx = T_tcp[0][3] - x
        dy = T_tcp[1][3] - y
        dz = T_tcp[2][3] - z
        err = math.sqrt(dx * dx + dy * dy + dz * dz)
        assert err < 0.001, f"Cartesian FK error {err*1000:.3f}mm exceeds 1mm limit at ({x}, {y}, {z})"

def test_downward_orientation_and_tcp_offset():
    """Asserts downward tool orientation and 0.108m TCP offset."""
    solver = AnalyticalInverseKinematics(tcp_offset=DEFAULT_TCP_OFFSET_M)
    x, y, z = 0.40, -0.25, 0.0
    q = solver.solve_ik(x, y, z, apply_tcp_offset=True)

    T_flange = solver.forward_kinematics(q, with_tcp=False)
    T_tcp = solver.forward_kinematics(q, with_tcp=True)

    # Flange Z should be exactly z + 0.108m
    assert abs(T_flange[2][3] - (z + DEFAULT_TCP_OFFSET_M)) < 0.001
    assert abs(T_tcp[2][3] - z) < 0.001

    # Tool Z-axis points straight downward [0, 0, -1]
    z_axis = [T_tcp[0][2], T_tcp[1][2], T_tcp[2][2]]
    assert abs(z_axis[0]) < 1e-3
    assert abs(z_axis[1]) < 1e-3
    assert abs(z_axis[2] - (-1.0)) < 1e-3

def test_reachability_boundary_enforcement():
    """Asserts out-of-reach coordinates raise OutOfReachError."""
    solver = AnalyticalInverseKinematics()

    # Inner boundary: R = 0.10m < 0.20m
    with pytest.raises(OutOfReachError):
        solver.check_reachability(0.10, 0.0, 0.0)

    # Outer boundary: R = 0.90m > 0.85m
    with pytest.raises(OutOfReachError):
        solver.check_reachability(0.90, 0.0, 0.0)

    # Table penetration: Z < 0.0m
    with pytest.raises(OutOfReachError):
        solver.check_reachability(0.40, 0.10, -0.05)

def test_angular_unwrapping_continuity():
    """Asserts consecutive waypoints do not suffer multi-revolution S^1 -> R boundary flips."""
    gen = PickAndPlaceTrajectoryGenerator()
    pick = (0.35, 0.15, 0.0)
    drop = (0.40, -0.30, 0.04)

    steps = gen.generate_trajectory(pick_coords=pick, drop_coords=drop)
    for i in range(1, len(steps)):
        q_prev = steps[i - 1].joint_positions
        q_curr = steps[i].joint_positions
        for j in range(6):
            delta = abs(q_curr[j] - q_prev[j])
            assert delta < math.pi + 0.1, (
                f"Joint {CANONICAL_UR5E_JOINTS[j]} between Step {steps[i-1].name} and "
                f"Step {steps[i].name} experienced discontinuity: {delta:.3f} rad > pi"
            )

def test_10_step_waypoint_sequence_and_action_phases():
    """Asserts 10-step trajectory generation with proper phases and percent_complete."""
    gen = PickAndPlaceTrajectoryGenerator()
    pick = (0.35, 0.15, 0.0)
    drop = (0.40, -0.30, 0.04)

    steps = gen.generate_trajectory(pick_coords=pick, drop_coords=drop)
    assert len(steps) == 10

    expected_phases = [
        ActionPhase.APPROACHING.value,
        ActionPhase.PICKING.value,
        ActionPhase.GRASPING.value,
        ActionPhase.LIFTING.value,
        ActionPhase.TRANSFERRING.value,
        ActionPhase.DROPPING.value,
        ActionPhase.RELEASING.value,
        ActionPhase.RETREATING.value,
        ActionPhase.HOMING.value,
        ActionPhase.COMPLETED.value,
    ]
    assert [s.phase for s in steps] == expected_phases
    assert [s.percent_complete for s in steps] == [10.0 * i for i in range(1, 11)]

    # Pauses and grasp states
    assert steps[2].is_grasped is True and steps[2].pause_duration_s == 0.2  # grasp
    assert steps[3].is_grasped is True                                      # lift
    assert steps[4].is_grasped is True                                      # transfer
    assert steps[5].is_grasped is True                                      # drop
    assert steps[6].is_grasped is False and steps[6].pause_duration_s == 0.2 # release
    assert steps[8].is_grasped is False and steps[8].name == "home"

    # Verify URDF forward kinematics matches positive X workcell coordinate frame (+X forward)
    # Forward kinematics in DH frame gives (-x, -y, z), which in base_link (URDF) is (+x, +y, z)
    T_dh_pick = gen.solver.forward_kinematics(steps[1].joint_positions, with_tcp=True)
    urdf_pick_xyz = (-T_dh_pick[0][3], -T_dh_pick[1][3], T_dh_pick[2][3])
    assert abs(urdf_pick_xyz[0] - pick[0]) < 1e-3
    assert abs(urdf_pick_xyz[1] - pick[1]) < 1e-3
    assert abs(urdf_pick_xyz[2] - pick[2]) < 1e-3

    T_dh_drop = gen.solver.forward_kinematics(steps[5].joint_positions, with_tcp=True)
    urdf_drop_xyz = (-T_dh_drop[0][3], -T_dh_drop[1][3], T_dh_drop[2][3])
    assert abs(urdf_drop_xyz[0] - drop[0]) < 1e-3
    assert abs(urdf_drop_xyz[1] - drop[1]) < 1e-3
    assert abs(urdf_drop_xyz[2] - drop[2]) < 1e-3
