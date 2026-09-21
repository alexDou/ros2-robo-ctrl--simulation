import pytest


def test_import_robot_control_interfaces():
    from robot_control_interfaces.action import PickAndPlace
    from robot_control_interfaces.srv import ClearWorkspace, GetDropSlot
    from geometry_msgs.msg import Point

    # Test PickAndPlace Goal
    goal = PickAndPlace.Goal()
    assert hasattr(goal, "pick_coords")
    assert hasattr(goal, "drop_coords")
    assert hasattr(goal, "use_custom_drop")
    assert hasattr(goal, "command_id")
    assert isinstance(goal.pick_coords, Point)
    assert isinstance(goal.drop_coords, Point)
    assert isinstance(goal.use_custom_drop, bool)
    assert isinstance(goal.command_id, str)

    # Test PickAndPlace Result
    result = PickAndPlace.Result()
    assert hasattr(result, "success")
    assert hasattr(result, "message")
    assert isinstance(result.success, bool)
    assert isinstance(result.message, str)

    # Test PickAndPlace Feedback
    feedback = PickAndPlace.Feedback()
    assert hasattr(feedback, "phase")
    assert hasattr(feedback, "percent_complete")
    assert isinstance(feedback.phase, str)
    assert isinstance(feedback.percent_complete, float)

    # Test GetDropSlot Request & Response
    get_slot_req = GetDropSlot.Request()
    assert isinstance(get_slot_req, GetDropSlot.Request)
    get_slot_res = GetDropSlot.Response(
        drop_coords=Point(x=0.4, y=-0.3, z=0.08),
        slot_index=4,
        overflow_occurred=False,
    )
    assert hasattr(get_slot_res, "drop_coords")
    assert hasattr(get_slot_res, "slot_index")
    assert hasattr(get_slot_res, "overflow_occurred")
    assert isinstance(get_slot_res, GetDropSlot.Response)
    assert isinstance(get_slot_res.drop_coords, Point)
    assert get_slot_res.drop_coords.x == 0.4
    assert get_slot_res.drop_coords.y == -0.3
    assert get_slot_res.drop_coords.z == 0.08
    assert isinstance(get_slot_res.slot_index, int)
    assert get_slot_res.slot_index == 4
    assert isinstance(get_slot_res.overflow_occurred, bool)
    assert get_slot_res.overflow_occurred is False

    # Test ClearWorkspace Request & Response
    clear_req = ClearWorkspace.Request()
    assert isinstance(clear_req, ClearWorkspace.Request)
    clear_res = ClearWorkspace.Response(success=True, message="workspace reset")
    assert hasattr(clear_res, "success")
    assert hasattr(clear_res, "message")
    assert isinstance(clear_res.success, bool)
    assert clear_res.success is True
    assert isinstance(clear_res.message, str)
    assert clear_res.message == "workspace reset"

    # Test SpawnObject Request & Response
    from robot_control_interfaces.srv import SpawnObject
    spawn_req = SpawnObject.Request(coords=Point(x=0.5, y=0.1, z=0.0), object_type="GEAR")
    assert hasattr(spawn_req, "coords")
    assert hasattr(spawn_req, "object_type")
    assert isinstance(spawn_req.coords, Point)
    assert spawn_req.coords.x == 0.5
    assert spawn_req.object_type == "GEAR"

    spawn_res = SpawnObject.Response(success=True, message="Object spawned", gear_id="gear-1")
    assert hasattr(spawn_res, "success")
    assert hasattr(spawn_res, "message")
    assert hasattr(spawn_res, "gear_id")
    assert spawn_res.success is True
    assert spawn_res.message == "Object spawned"
    assert spawn_res.gear_id == "gear-1"

    # Test MarkGrasped Request & Response (id-free, empty request)
    from robot_control_interfaces.srv import CommitDrop, MarkGrasped
    grasp_req = MarkGrasped.Request()
    assert isinstance(grasp_req, MarkGrasped.Request)
    grasp_res = MarkGrasped.Response(success=True, message="grasped")
    assert hasattr(grasp_res, "success")
    assert hasattr(grasp_res, "message")
    assert grasp_res.success is True
    assert grasp_res.message == "grasped"

    # Test CommitDrop Request & Response (id-free; response carries drop coords)
    drop_res = CommitDrop.Response(
        success=True,
        message="dropped",
        drop_coords=Point(x=0.4, y=-0.3, z=0.08),
        slot_index=4,
        overflow_occurred=False,
    )
    assert hasattr(drop_res, "drop_coords")
    assert hasattr(drop_res, "slot_index")
    assert hasattr(drop_res, "overflow_occurred")
    assert isinstance(drop_res.drop_coords, Point)
    assert drop_res.drop_coords.x == 0.4
    assert drop_res.slot_index == 4
    assert drop_res.overflow_occurred is False


