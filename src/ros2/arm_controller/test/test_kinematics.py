"""Pure kinematics solver and waypoint trajectory tests (no ROS2 nodes)."""

import math
import time

import pytest
from arm_controller.kinematics import (
    CANONICAL_UR5E_JOINTS,
    DEFAULT_TCP_OFFSET_M,
    HOME_JOINT_POSITIONS,
    ActionPhase,
    AnalyticalInverseKinematics,
    JointLimitError,
    OutOfReachError,
    PickAndPlaceTrajectoryGenerator,
    unwrap_joint_angles_within_limits,
)

from domain import (
    BELT_X_RANGE,
    BLUE_TOWER,
    GREEN_TOWER,
    PICK_ZONE_Y_RANGE,
    STACK_STEP_M,
    WHITE_TOWER,
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

    assert avg_solve_time_ms < 0.20, (
        f"Average solve time {avg_solve_time_ms:.4f}ms exceeds 0.2ms limit"
    )

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
        assert err < 0.001, (
            f"Cartesian FK error {err * 1000:.3f}mm exceeds 1mm limit at ({x}, {y}, {z})"
        )


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
                f"Joint {CANONICAL_UR5E_JOINTS[j]} between Step {steps[i - 1].name} and "
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
    assert steps[3].is_grasped is True  # lift
    assert steps[4].is_grasped is True  # transfer
    assert steps[5].is_grasped is True  # drop
    assert steps[6].is_grasped is False and steps[6].pause_duration_s == 0.2  # release
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


# --- Multi-cycle joint wind-up & branch stability (Unit 7 outer-tower regression) ---

_TWO_PI = 2.0 * math.pi
_URDF_LIMITS = [
    (-_TWO_PI, _TWO_PI),  # shoulder_pan
    (-_TWO_PI, _TWO_PI),  # shoulder_lift
    (-math.pi, math.pi),  # elbow
    (-_TWO_PI, _TWO_PI),  # wrist_1
    (-_TWO_PI, _TWO_PI),  # wrist_2
    (-_TWO_PI, _TWO_PI),  # wrist_3
]
_TOWERS = {
    "WHITE": tuple(WHITE_TOWER[:2]),
    "GREEN": tuple(GREEN_TOWER[:2]),
    "BLUE": tuple(BLUE_TOWER[:2]),
    "SCRAP": (0.40, 0.28),
}
_PICKS = [
    (0.45, -0.15, 0.0),
    (0.42, 0.10, 0.0),
    (0.50, 0.0, 0.0),
    (0.58, 0.18, 0.0),
    (0.55, -0.20, 0.0),
]


def _assert_within_urdf_limits(steps, context):
    for s in steps:
        for j, (lo, hi) in enumerate(_URDF_LIMITS):
            q = s.joint_positions[j]
            assert lo <= q <= hi, (
                f"{context}: {CANONICAL_UR5E_JOINTS[j]}={q:.3f} rad at step '{s.name}' "
                f"exceeds URDF limits [{lo:.3f}, {hi:.3f}]"
            )


def test_consecutive_cycles_do_not_wind_up_joints():
    """Feeding each cycle's final joints into the next plan (as /joint_states does) must never
    accumulate 2*pi turns: every waypoint stays inside URDF limits and every cycle ends at HOME."""
    gen = PickAndPlaceTrajectoryGenerator()
    q = list(HOME_JOINT_POSITIONS)
    fill = {name: 0 for name in _TOWERS}
    for cycle in range(40):
        name = list(_TOWERS)[cycle % len(_TOWERS)]
        tx, ty = _TOWERS[name]
        drop = (tx, ty, (fill[name] % 4) * 0.02)  # slots 0..3: wind-up starts at slot >= 1
        fill[name] += 1
        pick = _PICKS[cycle % len(_PICKS)]

        steps = gen.generate_trajectory(pick_coords=pick, drop_coords=drop, current_joints=q)

        _assert_within_urdf_limits(steps, f"cycle {cycle} -> {name} {drop}")
        assert steps[-1].joint_positions == list(HOME_JOINT_POSITIONS), (
            f"cycle {cycle}: final pose {steps[-1].joint_positions} is not canonical HOME"
        )
        q = steps[-1].joint_positions


def test_plan_from_wound_up_seed_recovers_canonical_home():
    """A seed already carrying an extra turn (e.g. wrist_1 = -pi/2 + 2*pi) must still yield an
    in-limit plan that returns to the canonical HOME values."""
    gen = PickAndPlaceTrajectoryGenerator()
    seed = list(HOME_JOINT_POSITIONS)
    seed[3] += _TWO_PI

    steps = gen.generate_trajectory(
        pick_coords=(0.50, 0.0, 0.0), drop_coords=(*BLUE_TOWER[:2], 0.04), current_joints=seed
    )

    _assert_within_urdf_limits(steps, "wound seed")
    assert steps[-1].joint_positions == list(HOME_JOINT_POSITIONS)


@pytest.mark.parametrize("tower", ["WHITE", "GREEN", "BLUE"])
@pytest.mark.parametrize("slot", range(10))
def test_pick_to_retreat_keeps_one_arm_configuration(tower, slot):
    """approach_pick .. tower_retreat must stay on one IK branch: elbow and wrist_2 keep their
    sign and shoulder_pan never swings by ~pi (the signature of a shoulder-side flip).
    A slot the locked branch cannot reach must be rejected (OutOfReachError), never flipped."""
    gen = PickAndPlaceTrajectoryGenerator()
    tx, ty = _TOWERS[tower]
    for pick in _PICKS:
        try:
            steps = gen.generate_trajectory(
                pick_coords=pick,
                drop_coords=(tx, ty, slot * STACK_STEP_M),
                current_joints=list(HOME_JOINT_POSITIONS),
            )
        except OutOfReachError:
            continue
        ik_steps = steps[:8]  # approach_pick .. tower_retreat
        context = f"{tower} slot {slot} pick {pick}"
        for joint in (2, 4):  # elbow_joint, wrist_2_joint: sign encodes the branch
            signs = {math.copysign(1.0, math.sin(s.joint_positions[joint])) for s in ik_steps}
            assert len(signs) == 1, f"{context}: {CANONICAL_UR5E_JOINTS[joint]} changes branch"
        for prev, curr in zip(ik_steps, ik_steps[1:], strict=False):
            pan_swing = abs(curr.joint_positions[0] - prev.joint_positions[0])
            # Rear-stand towers need a real sweep across the base; a flip is a swing much larger
            # than the azimuth change between the two Cartesian waypoints.
            azimuth_change = abs(
                math.remainder(
                    math.atan2(curr.cartesian_position[1], curr.cartesian_position[0])
                    - math.atan2(prev.cartesian_position[1], prev.cartesian_position[0]),
                    2.0 * math.pi,
                )
            )
            assert pan_swing <= azimuth_change + 0.2, (
                f"{context}: shoulder_pan swings {pan_swing:.3f} rad from '{prev.name}' to "
                f"'{curr.name}' (shoulder flip)"
            )


@pytest.mark.parametrize("tower", ["WHITE", "GREEN", "BLUE"])
@pytest.mark.parametrize("slot", range(10))
def test_every_rear_stand_tower_drop_solves(tower, slot):
    """Unit 8.0a: every tower drop, bottom to top slot, is reachable from every pick position."""
    gen = PickAndPlaceTrajectoryGenerator()
    tx, ty = _TOWERS[tower]
    assert tx < 0.0, "towers live on the rear stand behind the arm"
    for pick in _PICKS:
        steps = gen.generate_trajectory(
            pick_coords=pick,
            drop_coords=(tx, ty, slot * STACK_STEP_M),
            current_joints=list(HOME_JOINT_POSITIONS),
        )
        _assert_within_urdf_limits(steps, f"{tower} slot {slot} pick {pick}")


@pytest.mark.parametrize("x", BELT_X_RANGE)
@pytest.mark.parametrize("y", PICK_ZONE_Y_RANGE)
@pytest.mark.parametrize("tower", ["WHITE", "GREEN", "BLUE"])
def test_every_pick_zone_corner_solves_at_pick_and_approach(x, y, tower):
    """Unit 8.0b: each PickZone corner is reachable at pick height and at the approach/lift height
    (generate_trajectory solves both and raises on failure), for the bottom and top tower slots."""
    gen = PickAndPlaceTrajectoryGenerator()
    tx, ty = _TOWERS[tower]
    for slot in (0, 9):
        steps = gen.generate_trajectory(
            pick_coords=(x, y, 0.0),
            drop_coords=(tx, ty, slot * STACK_STEP_M),
            current_joints=list(HOME_JOINT_POSITIONS),
        )
        _assert_within_urdf_limits(steps, f"corner ({x}, {y}) -> {tower} slot {slot}")


def test_drop_reachable_only_by_branch_switch_is_rejected():
    """(0.70, 0.16) at slot 9 is only reachable with a flipped wrist from a mat pick: the planner
    must refuse the goal instead of swinging the arm through a different configuration."""
    gen = PickAndPlaceTrajectoryGenerator()
    with pytest.raises(OutOfReachError, match="branch switch"):
        gen.generate_trajectory(
            pick_coords=(0.50, 0.0, 0.0),
            drop_coords=(0.70, 0.16, 0.18),
            current_joints=list(HOME_JOINT_POSITIONS),
        )


def test_unwrap_within_limits_prefers_in_limit_turn():
    """Shortest-arc unwrap must pick the 2*pi representative that lies inside the joint limits."""
    ref = [0.0, 0.0, 0.0, 6.0, 0.0, 0.0]
    target = [0.0, 0.0, 0.0, 1.0, 0.0, 0.0]  # shortest arc from 6.0 is 1.0 + 2*pi = 7.28 (> 2*pi)
    q = unwrap_joint_angles_within_limits(target, ref, _URDF_LIMITS)
    assert q[3] == pytest.approx(1.0)


def test_unwrap_within_limits_raises_when_no_turn_fits():
    """A target with no 2*pi representative inside the limits is a JointLimitError, not a clamp."""
    narrow = [(-0.5, 0.5)] * 6
    with pytest.raises(JointLimitError):
        unwrap_joint_angles_within_limits([0.0, 0.0, 0.0, 2.0, 0.0, 0.0], [0.0] * 6, narrow)
