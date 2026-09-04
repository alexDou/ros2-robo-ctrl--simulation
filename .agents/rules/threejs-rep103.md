---
apply_to: "web/**/*.{ts,tsx,js}"
---
# REP 103 to Three.js Frame Alignment

## Coordinate Conventions
* **ROS2 / Gazebo (REP 103):** Right-handed. $+X$ is forward, $+Y$ is left, $+Z$ is up.
* **Three.js / WebGL:** Right-handed. $+X$ is right, $+Y$ is up, $+Z$ is backward (towards camera).

## Position Translation
Convert ROS Cartesian vectors $(x_{ros}, y_{ros}, z_{ros})$ to Three.js coordinates $(x_{three}, y_{three}, z_{three})$ using:
$$x_{three} = -y_{ros}$$
$$y_{three} = z_{ros}$$
$$z_{three} = -x_{ros}$$

## Rotation and URDF Alignment Rules
* **Avoid manual quaternion component swizzling.** Raw component swaps (e.g., swapping $x$ and $z$) break quaternion normalization and chirality.
* **Scene Root Rotation:** When using `urdf-loader`, keep the loaded `URDFRobot` inside a parent `THREE.Group`. Apply an initial $-90^\circ$ rotation about the $X$-axis on the root group:
  ```typescript
  robotGroup.rotation.x = -Math.PI / 2;
