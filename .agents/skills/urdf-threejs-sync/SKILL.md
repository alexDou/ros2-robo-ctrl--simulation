---
name: "urdf-threejs-sync"
description: "Loading URDF/SDF assets, mapping ROS package meshes, and streaming 60 FPS joint updates via WebSocket in Three.js."
triggers:
  - "web/**/*.{ts,tsx}"
  - "sim/**/*.urdf"
  - "sim/**/*.sdf"
---

# URDF & Three.js Web Synchronization

## Architecture Overview
* **Model Loading:** Use `urdf-loader` alongside Three.js loaders (`STLLoader`, `GLTFLoader`).
* **Transport:** Connect via WebSocket to `rosbridge_server` (default port: `9090`).
* **Render Decoupling:** Decouple incoming network packets from WebGL draw calls using an in-memory joint cache.

## 1. URDF Loading & Mesh Path Resolution
Map `package://<pkg_name>/` URIs to the local HTTP asset directory:

```typescript
import { LoadingManager } from 'three';
import URDFLoader, { URDFRobot } from 'urdf-loader';

export function createRobotLoader(assetBaseUrl: string): URDFLoader {
  const manager = new LoadingManager();
  const loader = new URDFLoader(manager);

  // Map ROS package names to static asset directories
  loader.packages = {
    my_robot_description: `${assetBaseUrl}/models/my_robot_description`,
  };

  return loader;
}
