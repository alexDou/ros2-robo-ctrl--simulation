"""CLI Entrypoint for EdgeNode process."""

import os
import rclpy
from rclpy.executors import SingleThreadedExecutor

from edge_node.node import EdgeNode


def main() -> None:
    robot_id = os.environ.get("ROBOT_ID", "arm-ur5")
    print(f"Starting EdgeNode for {robot_id}...")
    rclpy.init()
    node = EdgeNode(robot_id=robot_id, auto_connect=True)
    executor = SingleThreadedExecutor()
    executor.add_node(node.ros2_node)

    try:
        executor.spin()
    except (KeyboardInterrupt, Exception):
        pass
    finally:
        print("Shutting down EdgeNode...")
        node.close()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()
