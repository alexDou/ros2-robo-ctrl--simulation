#!/usr/bin/env python3
"""Extract canonical UR5e visual URDF and bundle official Collada meshes into web/public assets."""

from __future__ import annotations

import os
from pathlib import Path
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET

CANONICAL_JOINTS = [
    "shoulder_pan_joint",
    "shoulder_lift_joint",
    "elbow_joint",
    "wrist_1_joint",
    "wrist_2_joint",
    "wrist_3_joint",
]

VISUAL_MESHES = [
    "base.dae",
    "shoulder.dae",
    "upperarm.dae",
    "forearm.dae",
    "wrist1.dae",
    "wrist2.dae",
    "wrist3.dae",
]


def find_ros_package_share(pkg_name: str) -> Path:
    ros_distro = os.environ.get("ROS_DISTRO", "jazzy")
    candidates = [
        Path(f"/opt/ros/{ros_distro}/share/{pkg_name}"),
        Path(f"/opt/ros/jazzy/share/{pkg_name}"),
    ]
    for c in candidates:
        if c.is_dir():
            return c
    raise FileNotFoundError(f"Could not find share directory for package '{pkg_name}'")


def generate_raw_urdf(ur_description_share: Path) -> str:
    xacro_file = ur_description_share / "urdf" / "ur.urdf.xacro"
    if not xacro_file.is_file():
        raise FileNotFoundError(f"Xacro file not found: {xacro_file}")

    cmd = [
        "xacro",
        str(xacro_file),
        "name:=ur5e",
        "ur_type:=ur5e",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return res.stdout


def strip_physics_and_clean_urdf(raw_urdf_text: str) -> str:
    root = ET.fromstring(raw_urdf_text)

    # Strip physics/collision/inertial from links
    for link in root.findall("link"):
        for coll in link.findall("collision"):
            link.remove(coll)
        for inert in link.findall("inertial"):
            link.remove(inert)

    # Strip transmissions and gazebo tags
    for tag in ["transmission", "gazebo", "ros2_control"]:
        for el in root.findall(tag):
            root.remove(el)

    # Verify canonical joints
    joint_names = {j.get("name") for j in root.findall("joint")}
    for cj in CANONICAL_JOINTS:
        if cj not in joint_names:
            raise ValueError(f"Missing canonical joint: {cj}")

    # Format cleanly
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ", level=0)
    return ET.tostring(root, encoding="utf-8", xml_declaration=True).decode("utf-8")


def main() -> int:
    repo_root = Path(__file__).resolve().parent.parent
    web_public = repo_root / "web" / "public"
    mesh_dest = web_public / "models" / "ur_description" / "meshes" / "ur5e" / "visual"
    urdf_dest_1 = web_public / "models" / "ur5e" / "ur5e.urdf"
    urdf_dest_2 = web_public / "models" / "ur_description" / "urdf" / "ur5e.urdf"

    ur_description_share = find_ros_package_share("ur_description")
    mesh_source = ur_description_share / "meshes" / "ur5e" / "visual"

    print(f"[extract_urdf_assets] Found ur_description at {ur_description_share}")

    # 1. Copy Collada visual meshes
    mesh_dest.mkdir(parents=True, exist_ok=True)
    for mesh_name in VISUAL_MESHES:
        src = mesh_source / mesh_name
        dst = mesh_dest / mesh_name
        if not src.is_file():
            raise FileNotFoundError(f"Source mesh missing: {src}")
        shutil.copy2(src, dst)
        print(f"  Copied mesh: {mesh_name} ({dst.stat().st_size} bytes)")

    # 2. Extract and clean URDF
    raw_urdf = generate_raw_urdf(ur_description_share)
    clean_urdf = strip_physics_and_clean_urdf(raw_urdf)

    # 3. Write URDF destinations
    urdf_dest_1.parent.mkdir(parents=True, exist_ok=True)
    urdf_dest_1.write_text(clean_urdf, encoding="utf-8")
    print(f"  Wrote clean URDF: {urdf_dest_1} ({urdf_dest_1.stat().st_size} bytes)")

    urdf_dest_2.parent.mkdir(parents=True, exist_ok=True)
    urdf_dest_2.write_text(clean_urdf, encoding="utf-8")
    print(f"  Wrote clean URDF: {urdf_dest_2} ({urdf_dest_2.stat().st_size} bytes)")

    print("[extract_urdf_assets] Successfully extracted visual URDF and meshes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
