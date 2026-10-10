import { useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import {
  MathUtils,
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
import HandSkeletons from './HandSkeletons';
import { useHandTracking } from './hooks/useHandTracking';
import type { HandData, ScalingData } from './hooks/useHandTracking';

// ==========================================
// TWO-HAND SCALING SETTINGS
// ==========================================

/** Smallest / largest uniform scale a gesture can produce. */
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
/** 0–1 per frame. Higher = snappier, lower = smoother. */
const SCALE_SMOOTHING = 0.35;
/** Glow on the selected object (the one two-hand scaling will resize). */
const SELECTED_EMISSIVE = '#ffd166';

// ==========================================
// SHAPE PROPS
// ==========================================

type ShapeProps = {
  position: [number, number, number];
  color: string;
  meshRef: RefObject<Mesh | null>;
  grabbed: boolean;
  selected: boolean;
};

// ==========================================
// CUBE
// ==========================================

function Cube({ position, color, meshRef, grabbed, selected }: ShapeProps) {
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
        emissive={selected ? SELECTED_EMISSIVE : '#000000'}
        emissiveIntensity={selected ? 0.35 : 0}
      />
    </mesh>
  );
}

// ==========================================
// SPHERE
// ==========================================

function Sphere({ position, color, meshRef, grabbed, selected }: ShapeProps) {
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
        emissive={selected ? SELECTED_EMISSIVE : '#000000'}
        emissiveIntensity={selected ? 0.35 : 0}
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
  selected,
  registerRef,
}: {
  obj: SceneObject;
  grabbed: boolean;
  selected: boolean;
  registerRef: (id: string, mesh: Mesh | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = grabbed ? '#00ff88' : hovered ? '#ffffff' : obj.color;
  const emissive = selected ? SELECTED_EMISSIVE : '#000000';
  const emissiveIntensity = selected ? 0.35 : 0;

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
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      );
    case 'sphere':
      return (
        <mesh {...commonProps}>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            roughness={0.3}
            metalness={0.2}
          />
        </mesh>
      );
    case 'cylinder':
      return (
        <mesh {...commonProps}>
          <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      );
    case 'cone':
      return (
        <mesh {...commonProps}>
          <coneGeometry args={[0.6, 1.2, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
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

/** 'cube', 'sphere', or the AI object's id — used for highlighting and the status overlay. */
function targetKey(target: GrabTarget): string {
  return target.type === 'dynamic' ? target.id : target.type;
}

type ScaleSession = {
  target: GrabTarget;
  /** The object's uniform scale when both hands started pinching. */
  initialScale: number;
};

function Scene({
  hands,
  scaling,
  selectedObject,
  onSelectedChange,
}: {
  hands: HandData[];
  scaling: ScalingData | null;
  selectedObject: string | null;
  onSelectedChange: (key: string | null) => void;
}) {
  const { camera } = useThree();

  const objects = useSceneStore((s) => s.objects);
  const moveObject = useSceneStore((s) => s.moveObject);
  const scaleObject = useSceneStore((s) => s.scaleObject);

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
  const scalingRef = useRef(scaling);
  const raycaster = useRef(new Raycaster());
  const cursor = useRef(new Vector2());

  const previousPinching = useRef(false);
  const previousHandLabel = useRef<string | null>(null);

  const activeGrab = useRef<
    (GrabTarget & { handLabel: string; plane: Plane; offset: Vector3 }) | null
  >(null);

  // The object two-hand scaling resizes. Set by a one-hand pinch on an object;
  // stays selected after the pinch is released.
  const selected = useRef<GrabTarget | null>(null);
  const scaleSession = useRef<ScaleSession | null>(null);
  // After two-hand scaling ends, the hand that is still pinching must open
  // before it can start a new grab (otherwise it would grab immediately).
  const waitForRelease = useRef(false);

  const [grabbedObject, setGrabbedObject] = useState<string | null>(null);
  const [isScaling, setIsScaling] = useState(false);

  useEffect(() => {
    handsRef.current = hands;
  }, [hands]);

  useEffect(() => {
    scalingRef.current = scaling;
  }, [scaling]);

  const select = (target: GrabTarget | null) => {
    selected.current = target;
    onSelectedChange(target ? targetKey(target) : null);
  };

  const releaseGrab = () => {
    if (!activeGrab.current) return;
    activeGrab.current = null;
    setGrabbedObject(null);
  };

  const endScaling = () => {
    const session = scaleSession.current;
    if (!session) return;
    scaleSession.current = null;
    setIsScaling(false);

    // Keep the new size. Cube/sphere keep it on the mesh; AI objects
    // also save it to the store so the AI sees the real size.
    if (session.target.type === 'dynamic') {
      scaleObject(session.target.id, session.target.mesh.scale.x);
    }
  };

  useFrame((_, delta) => {
    const scalingMesh = scaleSession.current?.target.mesh;

    if (
      cubeRef.current &&
      activeGrab.current?.mesh !== cubeRef.current &&
      scalingMesh !== cubeRef.current
    ) {
      cubeRef.current.rotation.x += delta * 0.4;
      cubeRef.current.rotation.y += delta * 0.6;
    }

    const currentHands = handsRef.current;
    const currentScaling = scalingRef.current;

    // Drop the selection if its AI object was deleted.
    const sel = selected.current;
    if (sel?.type === 'dynamic' && !dynamicMeshRefs.current.has(sel.id)) {
      if (scaleSession.current?.target === sel) {
        scaleSession.current = null;
        setIsScaling(false);
      }
      select(null);
    }

    // ------------------------------------------
    // TWO-HAND SCALING (takes priority over one-hand drag)
    // ------------------------------------------

    const scalingActive = currentScaling?.active === true && currentHands.length >= 2;

    if (scalingActive) {
      // One-hand dragging must not fight with scaling.
      releaseGrab();
      waitForRelease.current = true;

      if (!scaleSession.current && selected.current) {
        scaleSession.current = {
          target: selected.current,
          initialScale: selected.current.mesh.scale.x,
        };
        setIsScaling(true);
      }

      const session = scaleSession.current;
      const factor = currentScaling.scale_factor;

      if (session && Number.isFinite(factor) && factor > 0) {
        const targetScale = MathUtils.clamp(
          session.initialScale * factor,
          MIN_SCALE,
          MAX_SCALE,
        );
        const mesh = session.target.mesh;
        mesh.scale.setScalar(MathUtils.lerp(mesh.scale.x, targetScale, SCALE_SMOOTHING));
      }

      previousPinching.current = true;
      return;
    }

    // Scaling ended (active: false, a hand left, or the backend disconnected).
    endScaling();

    // ------------------------------------------
    // ONE-HAND GRAB / DRAG / RELEASE (unchanged behavior)
    // ------------------------------------------

    const grab = activeGrab.current;

    const hand = grab
      ? currentHands.find((h) => h.hand === grab.handLabel)
      : currentHands.find((h) => h.hand === 'Right') ?? currentHands[0];

    if (!hand) {
      releaseGrab();
      previousPinching.current = false;
      previousHandLabel.current = null;
      waitForRelease.current = false;
      return;
    }

    const pinching = hand.pinching;
    const position = hand.position;

    if (waitForRelease.current && !pinching) {
      waitForRelease.current = false;
    }

    cursor.current.set(position.x * 2 - 1, 1 - position.y * 2);
    raycaster.current.setFromCamera(cursor.current, camera);
    const ray = raycaster.current.ray;

    if (activeGrab.current && !pinching) {
      releaseGrab();
    }

    const sameHand = previousHandLabel.current === hand.hand;
    const pinchStarted =
      pinching && (!previousPinching.current || !sameHand) && !waitForRelease.current;

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

        setGrabbedObject(targetKey(target));
        select(target); // grabbing an object also selects it for scaling
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
        selected={selectedObject === 'cube'}
      />
      <Sphere
        meshRef={sphereRef}
        position={[1.2, 0.6, 0]}
        color="#4cc9f0"
        grabbed={grabbedObject === 'sphere'}
        selected={selectedObject === 'sphere'}
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
          selected={selectedObject === obj.id}
          registerRef={registerDynamicRef}
        />
      ))}

      <OrbitControls makeDefault enabled={grabbedObject === null && !isScaling} />
    </>
  );
}

// ==========================================
// MAIN APP
// ==========================================

export default function App() {
  const { hands, connected, error, scaling } = useHandTracking();
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const objects = useSceneStore((s) => s.objects);

  // Friendly name for the overlay (AI objects show their shape, not their id)
  const selectedLabel =
    selectedObject === null || selectedObject === 'cube' || selectedObject === 'sphere'
      ? selectedObject
      : (objects.find((o) => o.id === selectedObject)?.shape ?? null);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <HandTrackingStatus
        hands={hands}
        connected={connected}
        error={error}
        scaling={scaling}
        selectedObject={selectedLabel}
      />

      {/* Hand skeletons + a cursor between thumb and index of each hand */}
      <HandSkeletons hands={hands} scaling={scaling} />

      <Canvas shadows camera={{ position: [4, 3, 5], fov: 50 }}>
        <Scene
          hands={hands}
          scaling={scaling}
          selectedObject={selectedObject}
          onSelectedChange={setSelectedObject}
        />
      </Canvas>

      <ChatBox />
    </div>
  );
}
