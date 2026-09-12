"""CLI Entrypoint for EdgeNode process."""

import argparse
import os
import sys
from pathlib import Path

# Ensure src root is in sys.path for direct script execution
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import rclpy
from rclpy.executors import SingleThreadedExecutor

from domain import DEFAULT_ROBOT_ID
from edge_node.node import EdgeNode


def main(args: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="CLI Entrypoint for EdgeNode process")
    parser.add_argument(
        "--robot-id",
        default=os.environ.get("ROBOT_ID", DEFAULT_ROBOT_ID),
        help=f"Robot ID (default: {DEFAULT_ROBOT_ID} or ROBOT_ID env var)",
    )
    parsed, ros_args = parser.parse_known_args(args if args is not None else sys.argv[1:])

    robot_id = parsed.robot_id
    print(f"Starting EdgeNode for {robot_id}...")
    rclpy.init(args=ros_args)
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
