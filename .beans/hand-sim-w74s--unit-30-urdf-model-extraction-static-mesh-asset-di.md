---
# hand-sim-w74s
title: 'Unit 3.0: URDF Model Extraction & Static Mesh Asset Distribution'
status: completed
type: task
priority: normal
tags:
    - ready-for-agent
created_at: 2026-09-12T13:20:32Z
updated_at: 2026-09-12T13:53:05Z
parent: hand-sim-liyi
---

## Parent

hand-sim-liyi

## What to build

Extract the canonical UR5e visual-only URDF model from the upstream ROS2 environment and bundle official Universal Robots Collada (`.dae`) visual meshes as static assets in `web/public/models/ur_description/meshes/ur5e/visual/`. Create a robust robot loading utility (`web/src/utils/robotLoader.ts`) wrapping `urdf-loader` and Three.js `ColladaLoader` that intercepts and resolves `package://ur_description/` URIs directly to the static public asset directory. Parse visual meshes once upon initial load into static `BufferGeometry` uploaded to GPU VRAM with zero runtime XML decoding or memory reallocation during streaming. Provide comprehensive offline Vitest unit tests verifying URDF asset loading, link hierarchy generation, canonical joint sequence extraction, and mesh URI resolution.

## Acceptance criteria

- [x] Canonical UR5e visual URDF extracted and verified without physics, transmissions, or Gazebo simulator tags.
- [x] Official Collada (`.dae`) visual meshes for all UR5e links bundled into `web/public/models/ur_description/meshes/ur5e/visual/`.
- [x] `robotLoader` utility resolves `package://ur_description/` URIs and loads the URDF into a Three.js `URDFRobot` object.
- [x] Meshes parse once into static `BufferGeometry` with zero runtime XML decoding overhead during streaming.
- [x] Vitest unit tests verify URDF parsing, canonical joint identification, link tree structure, and asset resolution hermetically.

## Blocked by

None (can start immediately).
