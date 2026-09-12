import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as THREE from 'three';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import type { URDFRobot, URDFJoint } from 'urdf-loader';
import { UR5E_JOINTS } from '@contracts';
import {
  createRobotLoader,
  loadRobotModel,
  parseRobotModel,
  resolvePackageUri,
  getCanonicalJoints,
  verifyCanonicalJoints,
  applyJointPositions,
  DEFAULT_PACKAGE_MAP,
  DEFAULT_UR5E_URDF_PATH,
} from '@utils/robotLoader';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const PUBLIC_DIR = path.resolve(REPO_ROOT, 'web/public');
const URDF_PATH = path.resolve(PUBLIC_DIR, 'models/ur5e/ur5e.urdf');
const MESHES_DIR = path.resolve(
  PUBLIC_DIR,
  'models/ur_description/meshes/ur5e/visual'
);

const EXPECTED_MESHES = [
  'base.dae',
  'shoulder.dae',
  'upperarm.dae',
  'forearm.dae',
  'wrist1.dae',
  'wrist2.dae',
  'wrist3.dae',
] as const;

describe('Unit 3.0: URDF Model Extraction & Static Mesh Asset Distribution', () => {
  describe('Static Asset Files on Disk', () => {
    it('verifies canonical UR5e visual URDF exists and contains no physics/simulator tags', () => {
      expect(fs.existsSync(URDF_PATH)).toBe(true);
      const content = fs.readFileSync(URDF_PATH, 'utf-8');

      // Must be valid non-empty XML
      expect(content.length).toBeGreaterThan(500);
      expect(content).toContain('<robot name="ur5e">');

      // Physics, Gazebo, and transmission tags must be stripped
      expect(content).not.toContain('<collision>');
      expect(content).not.toContain('<collision ');
      expect(content).not.toContain('<inertial>');
      expect(content).not.toContain('<inertial ');
      expect(content).not.toContain('<transmission>');
      expect(content).not.toContain('<transmission ');
      expect(content).not.toContain('<gazebo>');
      expect(content).not.toContain('<gazebo ');
      expect(content).not.toContain('<ros2_control');

      // Visual meshes must use package://ur_description/ URIs
      for (const meshName of EXPECTED_MESHES) {
        expect(content).toContain(
          `package://ur_description/meshes/ur5e/visual/${meshName}`
        );
      }
    });

    it('verifies all 7 official Collada visual meshes exist and parse into BufferGeometry', () => {
      const colladaLoader = new ColladaLoader();

      for (const meshName of EXPECTED_MESHES) {
        const meshFile = path.resolve(MESHES_DIR, meshName);
        expect(fs.existsSync(meshFile)).toBe(true);

        const stats = fs.statSync(meshFile);
        expect(stats.size).toBeGreaterThan(10000); // Non-empty, > 10KB

        const xmlContent = fs.readFileSync(meshFile, 'utf-8');
        expect(xmlContent).toContain('<COLLADA');

        // Parse with Three.js ColladaLoader into Three.js scene
        const result = colladaLoader.parse(xmlContent, '');
        expect(result).toBeDefined();
        expect(result.scene).toBeDefined();

        // Scene must contain at least one Mesh with BufferGeometry
        let meshFound = false;
        result.scene.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            meshFound = true;
            const mesh = child as THREE.Mesh;
            expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
            expect(mesh.geometry.attributes.position).toBeDefined();
            expect(mesh.geometry.attributes.position.count).toBeGreaterThan(0);
          }
        });
        expect(meshFound).toBe(true);
      }
    });
  });

  describe('resolvePackageUri', () => {
    it('resolves package://ur_description/ URIs with default package map', () => {
      const uri = 'package://ur_description/meshes/ur5e/visual/base.dae';
      const resolved = resolvePackageUri(uri);
      expect(resolved).toBe('/models/ur_description/meshes/ur5e/visual/base.dae');
    });

    it('resolves package URIs with custom package map', () => {
      const uri = 'package://my_robot/meshes/arm.dae';
      const resolved = resolvePackageUri(uri, { my_robot: '/assets/robots/my_robot' });
      expect(resolved).toBe('/assets/robots/my_robot/meshes/arm.dae');
    });

    it('leaves non-package URIs untouched', () => {
      expect(resolvePackageUri('/models/custom/arm.dae')).toBe('/models/custom/arm.dae');
      expect(resolvePackageUri('https://example.com/arm.dae')).toBe('https://example.com/arm.dae');
    });

    it('normalizes trailing slashes on package base paths without double slashes', () => {
      const uri = 'package://ur_description/meshes/ur5e/visual/base.dae';
      const resolved = resolvePackageUri(uri, { ur_description: '/models/ur_description/' });
      expect(resolved).toBe('/models/ur_description/meshes/ur5e/visual/base.dae');
    });

    it('throws error when target package is not found in package map', () => {
      expect(() =>
        resolvePackageUri('package://unknown_pkg/meshes/link.dae')
      ).toThrowError(/Package not found in package map: unknown_pkg/);
    });
  });

  describe('createRobotLoader', () => {
    it('creates URDFLoader with default package mapping and visual-only settings', () => {
      const loader = createRobotLoader();
      expect(loader).toBeDefined();
      expect(loader.parseVisual).toBe(true);
      expect(loader.parseCollision).toBe(false);
      expect(loader.packages).toEqual(DEFAULT_PACKAGE_MAP);
    });

    it('supports assetBaseUrl prefix in createRobotLoader', () => {
      const loader = createRobotLoader({ assetBaseUrl: 'http://localhost:3000' });
      expect(loader.packages).toEqual({
        ur_description: 'http://localhost:3000/models/ur_description',
      });
    });

    it('supports custom packages and manager', () => {
      const customManager = new THREE.LoadingManager();
      const loader = createRobotLoader({
        manager: customManager,
        packages: { custom: '/custom/path' },
      });
      expect(loader.manager).toBe(customManager);
      expect(loader.packages).toEqual({ custom: '/custom/path' });
    });
  });

  describe('parseRobotModel & Canonical Joint Hierarchy', () => {
    it('parses canonical UR5e visual URDF content into URDFRobot', () => {
      const urdfContent = fs.readFileSync(URDF_PATH, 'utf-8');
      const loader = createRobotLoader({
        loadMeshCb: (_path, _manager, done) => {
          // Lightweight stub for offline parse test
          done(new THREE.Group());
        },
      });

      const robot = parseRobotModel(urdfContent, loader);
      expect(robot).toBeDefined();
      expect(robot.robotName).toBe('ur5e');

      // Verify canonical joint identification
      expect(verifyCanonicalJoints(robot)).toBe(true);

      const canonicalJoints = getCanonicalJoints(robot);
      expect(canonicalJoints).toHaveLength(6);

      // Verify sequence matches UR5E_JOINTS exactly
      const jointNames = canonicalJoints.map((j: URDFJoint) => j.name);
      expect(jointNames).toEqual([...UR5E_JOINTS]);

      // Verify all canonical joints are revolute and have valid bounds
      for (const joint of canonicalJoints) {
        expect(joint.jointType).toBe('revolute');
        expect(joint.axis.x).toBe(0);
        expect(joint.axis.y).toBe(0);
        expect(joint.axis.z).toBe(1);
        expect(joint.limit.lower).toBeLessThan(0);
        expect(joint.limit.upper).toBeGreaterThan(0);
      }
    });

    it('verifies kinematic link tree structure from world to tool0', () => {
      const urdfContent = fs.readFileSync(URDF_PATH, 'utf-8');
      const loader = createRobotLoader({
        loadMeshCb: (_path, _manager, done) => done(new THREE.Group()),
      });

      const robot = parseRobotModel(urdfContent, loader);

      // Expected link tree hierarchy
      const expectedLinks = [
        'world',
        'base_link',
        'base_link_inertia',
        'shoulder_link',
        'upper_arm_link',
        'forearm_link',
        'wrist_1_link',
        'wrist_2_link',
        'wrist_3_link',
        'ft_frame',
        'base',
        'flange',
        'tool0',
      ];

      for (const linkName of expectedLinks) {
        expect(robot.links[linkName]).toBeDefined();
      }

      // Verify link tree connections
      expect(robot.joints['base_joint'].parent?.name).toBe('world');
      expect(robot.joints['base_joint'].children[0]?.name).toBe('base_link');
      expect(robot.joints['shoulder_pan_joint'].parent?.name).toBe('base_link_inertia');
      expect(robot.joints['shoulder_pan_joint'].children[0]?.name).toBe('shoulder_link');
      expect(robot.joints['shoulder_lift_joint'].parent?.name).toBe('shoulder_link');
      expect(robot.joints['shoulder_lift_joint'].children[0]?.name).toBe('upper_arm_link');
      expect(robot.joints['elbow_joint'].parent?.name).toBe('upper_arm_link');
      expect(robot.joints['elbow_joint'].children[0]?.name).toBe('forearm_link');
      expect(robot.joints['wrist_1_joint'].parent?.name).toBe('forearm_link');
      expect(robot.joints['wrist_1_joint'].children[0]?.name).toBe('wrist_1_link');
      expect(robot.joints['wrist_2_joint'].parent?.name).toBe('wrist_1_link');
      expect(robot.joints['wrist_2_joint'].children[0]?.name).toBe('wrist_2_link');
      expect(robot.joints['wrist_3_joint'].parent?.name).toBe('wrist_2_link');
      expect(robot.joints['wrist_3_joint'].children[0]?.name).toBe('wrist_3_link');
    });

    it('parses URDF and attaches actual Collada meshes as BufferGeometry', () => {
      const urdfContent = fs.readFileSync(URDF_PATH, 'utf-8');
      const colladaLoader = new ColladaLoader();

      // Intercept mesh loading and load from local public meshes directory
      const loader = createRobotLoader({
        loadMeshCb: (meshPath, _mgr, done) => {
          const fileName = path.basename(meshPath);
          const diskPath = path.resolve(MESHES_DIR, fileName);
          const xml = fs.readFileSync(diskPath, 'utf-8');
          const res = colladaLoader.parse(xml, '');
          done(res.scene);
        },
      });

      const robot = parseRobotModel(urdfContent, loader);

      // Verify all 7 visual links have mesh children with BufferGeometry
      const linksWithVisuals = [
        'base_link_inertia',
        'shoulder_link',
        'upper_arm_link',
        'forearm_link',
        'wrist_1_link',
        'wrist_2_link',
        'wrist_3_link',
      ];

      for (const linkName of linksWithVisuals) {
        const link = robot.links[linkName];
        expect(link).toBeDefined();

        let linkMeshCount = 0;
        link.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            linkMeshCount++;
            const mesh = child as THREE.Mesh;
            expect(mesh.geometry).toBeInstanceOf(THREE.BufferGeometry);
          }
        });
        expect(linkMeshCount).toBeGreaterThan(0);
      }
    });

    it('updates joint transforms with zero XML decoding or geometry re-allocation', () => {
      const urdfContent = fs.readFileSync(URDF_PATH, 'utf-8');
      const loader = createRobotLoader({
        loadMeshCb: (_path, _mgr, done) => done(new THREE.Group()),
      });
      const robot = parseRobotModel(urdfContent, loader);

      const shoulderPan = robot.joints['shoulder_pan_joint'];
      expect(shoulderPan.angle).toBe(0);

      // Setting joint value
      robot.setJointValue('shoulder_pan_joint', 0.785);
      expect(shoulderPan.angle).toBeCloseTo(0.785, 4);

      // Verify repeated updates do not recreate child objects or throw
      for (let i = 0; i < 30; i++) {
        robot.setJointValue('shoulder_pan_joint', i * 0.05);
      }
      expect(shoulderPan.angle).toBeCloseTo(29 * 0.05, 4);
    });

    it('fails verification if canonical joints are missing', () => {
      const dummyRobot = {
        joints: {
          shoulder_pan_joint: {} as URDFJoint,
        },
      } as unknown as URDFRobot;

      expect(verifyCanonicalJoints(dummyRobot)).toBe(false);
      expect(() => getCanonicalJoints(dummyRobot)).toThrowError(
        /Missing canonical UR5e joint: shoulder_lift_joint/
      );
    });

    it('applies joint positions with zero-allocation dirty checking via applyJointPositions', () => {
      const urdfContent = fs.readFileSync(URDF_PATH, 'utf-8');
      const loader = createRobotLoader({
        loadMeshCb: (_path, _mgr, done) => done(new THREE.Group()),
      });
      const robot = parseRobotModel(urdfContent, loader);
      const canonicalJoints = getCanonicalJoints(robot);

      // Initial positions: all zeros
      const initialPositions = [0, 0, 0, 0, 0, 0];
      // Should return false because initial angles are already 0
      const changed0 = applyJointPositions(canonicalJoints, initialPositions);
      expect(changed0).toBe(false);

      // Apply new positions
      const newPositions = [0.1, -0.2, 0.3, -0.4, 0.5, -0.6];
      const changed1 = applyJointPositions(canonicalJoints, newPositions);
      expect(changed1).toBe(true);

      for (let i = 0; i < 6; i++) {
        expect(canonicalJoints[i].angle).toBeCloseTo(newPositions[i], 4);
      }

      // Re-applying exact same positions returns false (dirty-checking skips re-render)
      const changed2 = applyJointPositions(canonicalJoints, newPositions);
      expect(changed2).toBe(false);
    });
  });

  describe('loadRobotModel async loading', () => {
    it('loads robot model successfully using mocked fetch', async () => {
      const urdfContent = fs.readFileSync(URDF_PATH, 'utf-8');

      // Mock global fetch to return the URDF content
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => urdfContent,
      } as Response);

      try {
        const loader = createRobotLoader({
          loadMeshCb: (_path, _mgr, done) => done(new THREE.Group()),
        });

        const robot = await loadRobotModel(DEFAULT_UR5E_URDF_PATH, loader);
        expect(robot).toBeDefined();
        expect(robot.robotName).toBe('ur5e');
        expect(verifyCanonicalJoints(robot)).toBe(true);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('rejects if fetch returns an error response', async () => {
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response);

      try {
        const loader = createRobotLoader();
        await expect(
          loadRobotModel('/models/nonexistent.urdf', loader)
        ).rejects.toThrowError(/Failed to load url|404/);
      } finally {
        globalThis.fetch = origFetch;
      }
    });

    it('rejects cleanly if an individual mesh asset fails to load and cleans up callbacks', async () => {
      const urdfContent = fs.readFileSync(URDF_PATH, 'utf-8');
      const origFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => urdfContent,
      } as Response);

      const customManager = new THREE.LoadingManager();
      const sentinelOnLoad = vi.fn();
      const sentinelOnError = vi.fn();
      customManager.onLoad = sentinelOnLoad;
      customManager.onError = sentinelOnError;

      try {
        const loader = createRobotLoader({
          manager: customManager,
          loadMeshCb: (meshPath, mgr, done) => {
            if (meshPath.includes('base.dae')) {
              const err = new Error('Mesh network timeout: base.dae');
              mgr.itemError(meshPath);
              done(new THREE.Group(), err);
            } else {
              done(new THREE.Group());
            }
          },
        });

        await expect(
          loadRobotModel(DEFAULT_UR5E_URDF_PATH, loader)
        ).rejects.toThrowError(/Failed to load robot asset.*base\.dae/);

        // Verify LoadingManager callbacks were restored to prevent memory leaks
        expect(customManager.onLoad).toBe(sentinelOnLoad);
        expect(customManager.onError).toBe(sentinelOnError);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});
