
import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import {
  Mesh,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from 'three';
import type { RefObject } from 'react';

import HandTrackingStatus from './HandTrackingStatus';
import {
  useHandTracking,
} from './hooks/useHandTracking';
import type {
  HandData,
} from './hooks/useHandTracking';

// ==========================================
// SHAPE PROPS
// ==========================================

type ShapeProps = {
  position: [number, number, number];
  color: string;
  meshRef: RefObject<Mesh | null>;
  grabbed: boolean;
};

// ==========================================
// CUBE
// ==========================================

function Cube({
  position,
  color,
  meshRef,
  grabbed,
}: ShapeProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <mesh
      ref={meshRef}
      position={position}
      castShadow
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        color={
          grabbed
            ? '#00ff88'
            : hovered
              ? '#ffffff'
              : color
        }
      />
    </mesh>
  );
}

// ==========================================
// SPHERE
// ==========================================

function Sphere({
  position,
  color,
  meshRef,
  grabbed,
}: ShapeProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <mesh
      ref={meshRef}
      position={position}
      castShadow
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[0.6, 32, 32]} />
      <meshStandardMaterial
        color={
          grabbed
            ? '#00ff88'
            : hovered
              ? '#ffffff'
              : color
        }
        roughness={0.3}
        metalness={0.2}
      />
    </mesh>
  );
}

// ==========================================
// GROUND
// ==========================================

function Ground() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#1a1d24" />
    </mesh>
  );
}

// ==========================================
// THREE.JS SCENE
// ==========================================

function Scene({
  hands,
}: {
  hands: HandData[];
}) {
  const { camera } = useThree();

  const cubeRef = useRef<Mesh>(null);
  const sphereRef = useRef<Mesh>(null);

  const handsRef = useRef(hands);
  const raycaster = useRef(new Raycaster());
  const cursor = useRef(new Vector2());

  const previousPinching = useRef(false);
  const previousHandLabel = useRef<string | null>(null);

  const activeGrab = useRef<{
    mesh: Mesh;
    handLabel: string;
    plane: Plane;
    offset: Vector3;
  } | null>(null);

  const [grabbedObject, setGrabbedObject] = useState<
    'cube' | 'sphere' | null
  >(null);

  // Keep the latest tracking data available to useFrame
  useEffect(() => {
    handsRef.current = hands;
  }, [hands]);

  useFrame((_, delta) => {
    // Rotate cube when it is not being grabbed
    if (
      cubeRef.current &&
      activeGrab.current?.mesh !== cubeRef.current
    ) {
      cubeRef.current.rotation.x += delta * 0.4;
      cubeRef.current.rotation.y += delta * 0.6;
    }

    const currentHands = handsRef.current;
    const grab = activeGrab.current;

    // When grabbing, keep tracking that same hand.
    // Otherwise, prefer Right, then the first visible hand.
    const hand = grab
      ? currentHands.find(
          (h) => h.hand === grab.handLabel
        )
      : (
          currentHands.find((h) => h.hand === 'Right') ??
          currentHands[0]
        );

    if (!hand) {
      if (activeGrab.current) {
        activeGrab.current = null;
        setGrabbedObject(null);
      }

      previousPinching.current = false;
      previousHandLabel.current = null;
      return;
    }

    const pinching = hand.pinching;

    const position = hand.position;

    // Convert MediaPipe coordinates to Three.js NDC
    cursor.current.set(
      position.x * 2 - 1,
      1 - position.y * 2
    );

    raycaster.current.setFromCamera(
      cursor.current,
      camera
    );

    const ray = raycaster.current.ray;

    // Release an object when the pinch ends
    if (activeGrab.current && !pinching) {
      activeGrab.current = null;
      setGrabbedObject(null);
    }

    // Detect the beginning of a pinch
    const sameHand =
      previousHandLabel.current === hand.hand;

    const pinchStarted =
      pinching &&
      (
        !previousPinching.current ||
        !sameHand
      );

    if (
      pinchStarted &&
      !activeGrab.current
    ) {
      const meshes = [
        cubeRef.current,
        sphereRef.current,
      ].filter((mesh): mesh is Mesh => mesh !== null);

      // Only the cube and sphere are selectable
      const intersections =
        raycaster.current.intersectObjects(
          meshes,
          false
        );

      if (intersections.length > 0) {
        const hit = intersections[0];
        const mesh = hit.object as Mesh;

        // Drag in a plane facing the camera
        const normal = camera.getWorldDirection(
          new Vector3()
        );

        const plane = new Plane();

        plane.setFromNormalAndCoplanarPoint(
          normal,
          mesh.position
        );

        // Preserve the original grab offset
        const offset = hit.point
          .clone()
          .sub(mesh.position);

        activeGrab.current = {
          mesh,
          handLabel: hand.hand,
          plane,
          offset,
        };

        if (mesh === cubeRef.current) {
          setGrabbedObject('cube');
        } else {
          setGrabbedObject('sphere');
        }
      }
    }

    // Move grabbed object
    if (activeGrab.current && pinching) {
      const currentGrab = activeGrab.current;

      const intersection = new Vector3();

      const hasIntersection = ray.intersectPlane(
        currentGrab.plane,
        intersection
      );

      if (hasIntersection) {
        const target = intersection.sub(
          currentGrab.offset
        );

        // Smooth the movement
        currentGrab.mesh.position.lerp(
          target,
          0.35
        );
      }
    }

    previousPinching.current = pinching;
    previousHandLabel.current = hand.hand;
  });

  return (
    <>
      <color
        attach="background"
        args={['#0f1115']}
      />

      {/* Lighting */}
      <ambientLight intensity={0.4} />

      <directionalLight
        position={[5, 8, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />

      <pointLight
        position={[-4, 3, -2]}
        intensity={0.5}
        color="#7aa2ff"
      />

      <Environment preset="city" />

      {/* Scene objects */}
      <Cube
        meshRef={cubeRef}
        position={[-1.2, 0.5, 0]}
        color="#e94560"
        grabbed={grabbedObject === 'cube'}
      />

      <Sphere
        meshRef={sphereRef}
        position={[1.2, 0.6, 0]}
        color="#4cc9f0"
        grabbed={grabbedObject === 'sphere'}
      />

      <Ground />

      <Grid
        position={[0, 0.001, 0]}
        args={[20, 20]}
        cellColor="#2a2f3a"
        sectionColor="#3d4455"
        fadeDistance={25}
        infiniteGrid
      />

      {/* Disable orbit while grabbing */}
      <OrbitControls
        makeDefault
        enabled={grabbedObject === null}
      />
    </>
  );
}

// ==========================================
// MAIN APP
// ==========================================

export default function App() {
  const {
    hands,
    connected,
    error,
  } = useHandTracking();

  const hand = (
    hands.find((h) => h.hand === 'Right') ??
    hands[0]
  );

  return (
    <>
      <HandTrackingStatus
        hands={hands}
        connected={connected}
        error={error}
      />

      {/* Visual hand cursor */}
      {hand && (
        <div
          style={{
            position: 'fixed',
            left: `${hand.position.x * 100}%`,
            top: `${hand.position.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: hand.pinching ? 28 : 18,
            height: hand.pinching ? 28 : 18,
            borderRadius: '50%',
            background: hand.pinching
              ? '#00ff88'
              : '#ffffff',
            border: '2px solid #111',
            boxShadow: '0 0 14px #00ff88',
            pointerEvents: 'none',
            zIndex: 999,
          }}
        />
      )}

      <Canvas
        shadows
        camera={{
          position: [4, 3, 5],
          fov: 50,
        }}
      >
        <Scene hands={hands} />
      </Canvas>
    </>
  );
}
