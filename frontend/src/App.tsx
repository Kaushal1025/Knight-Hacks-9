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

import { useSceneStore, type SceneObject } from './store/sceneStore';
import { sendChatMessage } from './lib/aiChat';

import HandTrackingStatus from './HandTrackingStatus';
import { useHandTracking } from './hooks/useHandTracking';
import type { HandData } from './hooks/useHandTracking';

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

function Cube({ position, color, meshRef, grabbed }: ShapeProps) {
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
        color={grabbed ? '#00ff88' : hovered ? '#ffffff' : color}
      />
    </mesh>
  );
}

// ==========================================
// SPHERE
// ==========================================

function Sphere({ position, color, meshRef, grabbed }: ShapeProps) {
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
        color={grabbed ? '#00ff88' : hovered ? '#ffffff' : color}
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
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#1a1d24" />
    </mesh>
  );
}

// ==========================================
// DYNAMIC OBJECT (AI-created, chat-driven)
// ==========================================

function DynamicObject({
  obj,
  grabbed,
  registerRef,
}: {
  obj: SceneObject;
  grabbed: boolean;
  registerRef: (id: string, mesh: Mesh | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = grabbed ? '#00ff88' : hovered ? '#ffffff' : obj.color;

  const commonProps = {
    ref: (mesh: Mesh | null) => registerRef(obj.id, mesh),
    position: obj.position,
    scale: obj.scale,
    castShadow: true,
    onPointerOver: () => setHovered(true),
    onPointerOut: () => setHovered(false),
  };

  switch (obj.shape) {
    case 'cube':
      return (
        <mesh {...commonProps}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    case 'sphere':
      return (
        <mesh {...commonProps}>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
        </mesh>
      );
    case 'cylinder':
      return (
        <mesh {...commonProps}>
          <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    case 'cone':
      return (
        <mesh {...commonProps}>
          <coneGeometry args={[0.6, 1.2, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    default:
      return null;
  }
}

// ==========================================
// CHAT BOX
// ==========================================

function ChatBox() {
  const [input, setInput] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    setLoading(true);
    try {
      const message = await sendChatMessage(input);
      setReply(message);
    } catch (err) {
      setReply('Error reaching AI backend. Is it running on localhost:3001?');
      console.error(err);
    } finally {
      setInput('');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        zIndex: 10,
        width: 360,
        fontFamily: 'sans-serif',
      }}
    >
      {reply && (
        <div
          style={{
            background: 'rgba(20,22,28,0.85)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 8,
            marginBottom: 8,
            fontSize: 14,
          }}
        >
          {reply}
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Create a red cube"
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #444',
            background: '#1a1d24',
            color: '#fff',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#4cc9f0',
            color: '#0f1115',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {loading ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

// ==========================================
// THREE.JS SCENE
// ==========================================

type GrabTarget =
  | { type: 'cube'; mesh: Mesh }
  | { type: 'sphere'; mesh: Mesh }
  | { type: 'dynamic'; id: string; mesh: Mesh };

function Scene({ hands }: { hands: HandData[] }) {
  const { camera } = useThree();

  const objects = useSceneStore((s) => s.objects);
  const moveObject = useSceneStore((s) => s.moveObject);

  const cubeRef = useRef<Mesh>(null);
  const sphereRef = useRef<Mesh>(null);
  const dynamicMeshRefs = useRef(new Map<string, Mesh>());

  const registerDynamicRef = (id: string, mesh: Mesh | null) => {
    if (mesh) {
      dynamicMeshRefs.current.set(id, mesh);
    } else {
      dynamicMeshRefs.current.delete(id);
    }
  };

  const handsRef = useRef(hands);
  const raycaster = useRef(new Raycaster());
  const cursor = useRef(new Vector2());

  const previousPinching = useRef(false);
  const previousHandLabel = useRef<string | null>(null);

  const activeGrab = useRef<
    (GrabTarget & { handLabel: string; plane: Plane; offset: Vector3 }) | null
  >(null);

  const [grabbedObject, setGrabbedObject] = useState<string | null>(null);

  useEffect(() => {
    handsRef.current = hands;
  }, [hands]);

  useFrame((_, delta) => {
    if (cubeRef.current && activeGrab.current?.mesh !== cubeRef.current) {
      cubeRef.current.rotation.x += delta * 0.4;
      cubeRef.current.rotation.y += delta * 0.6;
    }

    const currentHands = handsRef.current;
    const grab = activeGrab.current;

    const hand = grab
      ? currentHands.find((h) => h.hand === grab.handLabel)
      : currentHands.find((h) => h.hand === 'Right') ?? currentHands[0];

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

    cursor.current.set(position.x * 2 - 1, 1 - position.y * 2);
    raycaster.current.setFromCamera(cursor.current, camera);
    const ray = raycaster.current.ray;

    if (activeGrab.current && !pinching) {
      activeGrab.current = null;
      setGrabbedObject(null);
    }

    const sameHand = previousHandLabel.current === hand.hand;
    const pinchStarted = pinching && (!previousPinching.current || !sameHand);

    if (pinchStarted && !activeGrab.current) {
      const dynamicEntries = Array.from(dynamicMeshRefs.current.entries());
      const meshes = [
        cubeRef.current,
        sphereRef.current,
        ...dynamicEntries.map(([, mesh]) => mesh),
      ].filter((mesh): mesh is Mesh => mesh !== null);

      const intersections = raycaster.current.intersectObjects(meshes, false);

      if (intersections.length > 0) {
        const hit = intersections[0];
        const mesh = hit.object as Mesh;

        const normal = camera.getWorldDirection(new Vector3());
        const plane = new Plane();
        plane.setFromNormalAndCoplanarPoint(normal, mesh.position);
        const offset = hit.point.clone().sub(mesh.position);

        let target: GrabTarget;
        if (mesh === cubeRef.current) {
          target = { type: 'cube', mesh };
        } else if (mesh === sphereRef.current) {
          target = { type: 'sphere', mesh };
        } else {
          const found = dynamicEntries.find(([, m]) => m === mesh);
          target = { type: 'dynamic', id: found![0], mesh };
        }

        activeGrab.current = {
          ...target,
          handLabel: hand.hand,
          plane,
          offset,
        };

        setGrabbedObject(
          target.type === 'dynamic' ? target.id : target.type
        );
      }
    }

    if (activeGrab.current && pinching) {
      const currentGrab = activeGrab.current;
      const intersection = new Vector3();
      const hasIntersection = ray.intersectPlane(currentGrab.plane, intersection);

      if (hasIntersection) {
        const target = intersection.sub(currentGrab.offset);
        currentGrab.mesh.position.lerp(target, 0.35);

        if (currentGrab.type === 'dynamic') {
          moveObject(currentGrab.id, [
            currentGrab.mesh.position.x,
            currentGrab.mesh.position.y,
            currentGrab.mesh.position.z,
          ]);
        }
      }
    }

    previousPinching.current = pinching;
    previousHandLabel.current = hand.hand;
  });

  return (
    <>
      <color attach="background" args={['#0f1115']} />

      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <pointLight position={[-4, 3, -2]} intensity={0.5} color="#7aa2ff" />
      <Environment preset="city" />

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

      {/* AI-created objects, also grabbable via hand gestures */}
      {objects.map((obj) => (
        <DynamicObject
          key={obj.id}
          obj={obj}
          grabbed={grabbedObject === obj.id}
          registerRef={registerDynamicRef}
        />
      ))}

      <OrbitControls makeDefault enabled={grabbedObject === null} />
    </>
  );
}

// ==========================================
// MAIN APP
// ==========================================

export default function App() {
  const { hands, connected, error } = useHandTracking();

  const hand = hands.find((h) => h.hand === 'Right') ?? hands[0];

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <HandTrackingStatus hands={hands} connected={connected} error={error} />

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
            background: hand.pinching ? '#00ff88' : '#ffffff',
            border: '2px solid #111',
            boxShadow: '0 0 14px #00ff88',
            pointerEvents: 'none',
            zIndex: 999,
          }}
        />
      )}

      <Canvas shadows camera={{ position: [4, 3, 5], fov: 50 }}>
        <Scene hands={hands} />
      </Canvas>

      <ChatBox />
    </div>
  );
}