import { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, TransformControls, useGLTF, Line } from '@react-three/drei';
import SnapPanel from './SnapPanel';
import ActionsPanel from './ActionsPanel';
import ExtrudeTool, { buildExtrudeGeometry } from './ExtrudeTool';

import {
  MathUtils,
  Mesh,
  Plane,
  Raycaster,
  Spherical,
  Vector2,
  Vector3,
  Box3,
  type Camera,
} from 'three';

import { useSceneStore, type SceneObject } from './store/sceneStore';
import { sendChatMessage } from './lib/aiChat';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { handUiTargetAt, pressWithHand, setHandHover } from './lib/handUI';

import HandTrackingStatus from './HandTrackingStatus';
import HandSkeletons from './HandSkeletons';
import Inspector from './Inspector';
import { useHandTracking } from './hooks/useHandTracking';
import type { HandData, ScalingData } from './hooks/useHandTracking';

// ==========================================
// TWO-HAND SCALING SETTINGS
// ==========================================

const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const SCALE_SMOOTHING = 0.35;

// ==========================================
// TWO-HAND TWIST TO ROTATE
// With both hands pinching on a selected object, the first clear movement
// picks the mode for that pinch: spread/squeeze = SCALE, steering-wheel
// twist = ROTATE (around the vertical axis, like a turntable).
// ==========================================

/** Size change (from the backend's scale factor) that locks SCALE mode. */
const SCALE_LOCK_THRESHOLD = 0.15;
/** Twist angle that locks ROTATE mode. */
const ROTATE_LOCK_THRESHOLD = MathUtils.degToRad(15);
/** Rotation snaps to these steps (also hides tracking wobble). */
const ROTATE_STEP = MathUtils.degToRad(15);
/** Flip to -1 if twisting clockwise turns objects the wrong way. */
const ROTATE_DIRECTION = 1;
const ROTATE_SMOOTHING = 0.35;

type TwoHandMode = 'pending' | 'scale' | 'rotate';
type TwoHandInfo = { mode: TwoHandMode; degrees: number } | null;

/** Angle of the line from the left hand to the right hand, in screen space. */
function twoHandAngle(hands: HandData[]): number | null {
  const left = hands.find((h) => h.hand === 'Left') ?? hands[0];
  const right = hands.find((h) => h.hand === 'Right' && h !== left) ?? hands.find((h) => h !== left);
  if (!left || !right) return null;
  return Math.atan2(
    right.position.y - left.position.y,
    (right.position.x - left.position.x) * WEBCAM_ASPECT,
  );
}

/** Smallest signed difference between two angles, in [-PI, PI]. */
function angleDelta(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}
const SELECTED_EMISSIVE = '#ffd166';

// ==========================================
// BOUNDS: objects stay on the ground plane
// (not below the floor, not past its edges)
// ==========================================

/** Height of the ground/grid. Nothing may extend below this. */
const FLOOR_Y = 0;
/** Half the ground plane's width: the plane is 20 x 20, centred on the origin. */
const FLOOR_HALF_SIZE = 10;
const BOUNDS_EPSILON = 1e-4;

/** How far to shift [min, max] so it fits inside [-limit, limit] (centres it if too big). */
function shiftInto(min: number, max: number, limit: number): number {
  if (max - min >= 2 * limit) return -(min + max) / 2;
  if (min < -limit) return -limit - min;
  if (max > limit) return limit - max;
  return 0;
}

/**
 * Move the object the smallest amount needed so all of it is above the floor
 * and inside the ground's edges. Returns true if it moved.
 */
function keepInsideBounds(mesh: Mesh, box: Box3): boolean {
  box.setFromObject(mesh);
  if (box.isEmpty()) return false;

  const dy = Math.max(0, FLOOR_Y - box.min.y);
  const dx = shiftInto(box.min.x, box.max.x, FLOOR_HALF_SIZE);
  const dz = shiftInto(box.min.z, box.max.z, FLOOR_HALF_SIZE);

  if (
    Math.abs(dx) <= BOUNDS_EPSILON &&
    dy <= BOUNDS_EPSILON &&
    Math.abs(dz) <= BOUNDS_EPSILON
  ) {
    return false;
  }
  mesh.position.x += dx;
  mesh.position.y += dy;
  mesh.position.z += dz;
  return true;
}

// ==========================================
// DEPTH: push/pull a grabbed object with your hand
// Moving your hand toward the camera makes it look bigger; that pushes the
// object deeper into the scene. Pulling your hand back brings it closer.
// ==========================================

/** Scene units moved per 100% change in apparent hand size. */
const DEPTH_GAIN = 6;
/** Ignore hand-size changes smaller than this (filters tracking jitter). */
const DEPTH_DEADZONE = 0.08;
/** Furthest an object can be pushed/pulled from where it was grabbed. */
const DEPTH_MAX = 8;
/** 0-1 per frame; lower = smoother but laggier depth. */
const DEPTH_SMOOTHING = 0.2;
/** Flip to -1 if pushing your hand forward should bring objects closer instead. */
const DEPTH_DIRECTION = 1;
/** Webcam aspect ratio (640x480) so hand size is measured in square units. */
const WEBCAM_ASPECT = 640 / 480;

/** Apparent hand size: wrist to middle-finger base, in normalized image units. */
function handSize(hand: HandData): number | null {
  const wrist = hand.landmarks[0];
  const middleBase = hand.landmarks[9];
  if (!wrist || !middleBase) return null;
  const size = Math.hypot((middleBase.x - wrist.x) * WEBCAM_ASPECT, middleBase.y - wrist.y);
  return size > 0.01 ? size : null;
}

/** Hand-size ratio -> how far to move the drag plane away from the camera. */
function depthFromHandSize(ratio: number): number {
  const change = ratio - 1;
  if (Math.abs(change) <= DEPTH_DEADZONE) return 0;
  const beyond = change - Math.sign(change) * DEPTH_DEADZONE;
  return MathUtils.clamp(beyond * DEPTH_GAIN * DEPTH_DIRECTION, -DEPTH_MAX, DEPTH_MAX);
}

// ==========================================
// PINCH TYPES
//  - Thumb + INDEX pinch: grab with snapping. Near another object it snaps flush
//    against it (stack on top / side by side); otherwise it snaps to the grid.
//  - Thumb + MIDDLE pinch: grab and move freely (no snapping).
// ==========================================

/** Same thresholds the CV backend uses for the index pinch (distance / hand size). */
const SNAP_PINCH_START = 0.35;
const SNAP_PINCH_END = 0.48;
/** Grid spacing objects snap to (matches the grid's small cells). */
const SNAP_GRID = 0.5;
/** How close (scene units) a face must be to another object's face to snap to it. */
const SNAP_OBJECT_DISTANCE = 0.6;
/** Centres within this distance get lined up too (neater stacks). */
const SNAP_ALIGN_DISTANCE = 0.35;

type SnapKind = 'grid' | 'object' | null;

/** Thumb-tip to middle-tip distance relative to hand size (mirrors the backend's index check). */
function middlePinchRatio(hand: HandData): number | null {
  const lm = hand.landmarks;
  if (lm.length < 13) return null;
  const handLen = Math.hypot(lm[5].x - lm[0].x, lm[5].y - lm[0].y);
  if (handLen < 0.001) return null;
  return Math.hypot(lm[4].x - lm[12].x, lm[4].y - lm[12].y) / handLen;
}

const AXES = ['x', 'y', 'z'] as const;
const snapBoxA = new Box3();
const snapBoxB = new Box3();
const snapBestBox = new Box3();
const snapShift = new Vector3();
const snapCenterA = new Vector3();
const snapCenterB = new Vector3();

/**
 * Where should `mesh` go if the hand wants it at `desired`? Writes the snapped
 * position into `out` and returns what it snapped to.
 */
function snapPosition(mesh: Mesh, desired: Vector3, others: Mesh[], out: Vector3): SnapKind {
  out.copy(desired);
  // The object's bounding box as if it were already at `desired`
  snapBoxA.setFromObject(mesh);
  if (snapBoxA.isEmpty()) return null;
  snapBoxA.translate(snapShift.copy(desired).sub(mesh.position));

  // 1) Snap flush against the nearest face of another object
  let bestAxis: (typeof AXES)[number] | null = null;
  let bestShift = Infinity;
  for (const other of others) {
    snapBoxB.setFromObject(other);
    if (snapBoxB.isEmpty()) continue;
    for (const axis of AXES) {
      // Only faces that actually face each other (overlap on the other two axes)
      const facing = AXES.every(
        (a) =>
          a === axis ||
          (snapBoxA.max[a] > snapBoxB.min[a] - SNAP_ALIGN_DISTANCE &&
            snapBoxA.min[a] < snapBoxB.max[a] + SNAP_ALIGN_DISTANCE),
      );
      if (!facing) continue;
      for (const shift of [snapBoxB.max[axis] - snapBoxA.min[axis], snapBoxB.min[axis] - snapBoxA.max[axis]]) {
        if (Math.abs(shift) < SNAP_OBJECT_DISTANCE && Math.abs(shift) < Math.abs(bestShift)) {
          bestShift = shift;
          bestAxis = axis;
          snapBestBox.copy(snapBoxB);
        }
      }
    }
  }

  if (bestAxis) {
    out[bestAxis] += bestShift;
    // Line up centres on the other axes when they're already close
    snapBoxA.getCenter(snapCenterA);
    snapBestBox.getCenter(snapCenterB);
    for (const a of AXES) {
      if (a === bestAxis) continue;
      const d = snapCenterB[a] - snapCenterA[a];
      if (Math.abs(d) < SNAP_ALIGN_DISTANCE) out[a] += d;
    }
    return 'object';
  }

  // 2) Otherwise snap to the grid: centre on grid points, bottom on a grid height
  out.x = Math.round(desired.x / SNAP_GRID) * SNAP_GRID;
  out.z = Math.round(desired.z / SNAP_GRID) * SNAP_GRID;
  const bottom = snapBoxA.min.y;
  out.y += Math.round(bottom / SNAP_GRID) * SNAP_GRID - bottom;
  return 'grid';
}

// ==========================================
// SCALING WITHOUT OVERLAP: an object being scaled up pushes itself out of
// other objects (along the shortest way out), the way the floor pushes it up.
// ==========================================

const sepBoxA = new Box3();
const sepBoxB = new Box3();
const sepCenterA = new Vector3();
const sepCenterB = new Vector3();
const SEPARATION_PASSES = 4;
const SEPARATION_EPSILON = 1e-3;

/** Is `mesh` currently overlapping `other` (bounding boxes)? */
function overlaps(mesh: Mesh, other: Mesh): boolean {
  sepBoxA.setFromObject(mesh);
  sepBoxB.setFromObject(other);
  if (sepBoxA.isEmpty() || sepBoxB.isEmpty()) return false;
  sepBoxA.expandByScalar(-SEPARATION_EPSILON);
  return sepBoxA.intersectsBox(sepBoxB);
}

/**
 * Move `mesh` the shortest distance needed so it no longer overlaps any of
 * `others`. Never pushes downward (the floor is below). Returns true if moved.
 */
function pushOutOfObjects(mesh: Mesh, others: Mesh[]): boolean {
  let moved = false;
  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    let changed = false;
    for (const other of others) {
      sepBoxA.setFromObject(mesh);
      sepBoxB.setFromObject(other);
      if (sepBoxA.isEmpty() || sepBoxB.isEmpty()) continue;
      if (!sepBoxA.clone().expandByScalar(-SEPARATION_EPSILON).intersectsBox(sepBoxB)) continue;

      sepBoxA.getCenter(sepCenterA);
      sepBoxB.getCenter(sepCenterB);

      // Penetration depth along each axis; push out along the smallest one.
      let bestAxis: 'x' | 'y' | 'z' | null = null;
      let bestMove = Infinity;
      for (const axis of ['x', 'y', 'z'] as const) {
        const towardPositive = sepCenterA[axis] >= sepCenterB[axis];
        const move = towardPositive
          ? sepBoxB.max[axis] - sepBoxA.min[axis] // push in + direction
          : -(sepBoxA.max[axis] - sepBoxB.min[axis]); // push in - direction
        if (axis === 'y' && move < 0) continue; // never push into the floor
        if (Math.abs(move) < Math.abs(bestMove)) {
          bestMove = move;
          bestAxis = axis;
        }
      }
      if (bestAxis) {
        mesh.position[bestAxis] += bestMove;
        changed = true;
        moved = true;
      }
    }
    if (!changed) break;
  }
  return moved;
}

// ==========================================
// CAMERA: pinch empty space and hold to move the view.
//  - Move the hand left/right/up/down: rotate the view around the scene.
//  - Push the hand toward the screen: zoom in. Pull it back: zoom out.
// ==========================================

/** Radians of rotation per full-screen hand movement. */
const ROTATE_SPEED = 3.2;
/** How strongly hand-size changes zoom (1 = 50% bigger hand -> ~1.4x closer). */
const ZOOM_GAIN = 1.0;
const CAMERA_MIN_DISTANCE = 2;
const CAMERA_MAX_DISTANCE = 40;

/** Hand-size ratio -> zoom multiplier (>1 = closer). Same deadzone as object depth. */
function zoomFromHandSize(ratio: number): number {
  const change = ratio - 1;
  if (Math.abs(change) <= DEPTH_DEADZONE) return 1;
  const beyond = change - Math.sign(change) * DEPTH_DEADZONE;
  return Math.max(0.2, 1 + beyond * ZOOM_GAIN * DEPTH_DIRECTION);
}

type OrbitLike = { target: Vector3; update: () => void };
const camOffset = new Vector3();
const camSpherical = new Spherical();

/**
 * Rotate the view around the scene by a hand movement (dx, dy in normalized
 * screen units) and set the camera's distance from the scene (zoom).
 */
function rotateAndZoomCamera(
  camera: Camera,
  controls: OrbitLike,
  dx: number,
  dy: number,
  distance: number,
) {
  camOffset.copy(camera.position).sub(controls.target);
  camSpherical.setFromVector3(camOffset);
  camSpherical.theta -= dx * ROTATE_SPEED;
  camSpherical.phi = MathUtils.clamp(camSpherical.phi - dy * ROTATE_SPEED, 0.15, Math.PI / 2 - 0.05);
  camSpherical.radius = MathUtils.clamp(distance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);
  camOffset.setFromSpherical(camSpherical);
  camera.position.copy(controls.target).add(camOffset);
  camera.lookAt(controls.target);
  controls.update();
}

/** Update an object's stored position without adding an undo step. */
function syncStoredPosition(id: string, mesh: Mesh) {
  const { x, y, z } = mesh.position;
  useSceneStore.setState((s) => ({
    objects: s.objects.map((o) => (o.id === id ? { ...o, position: [x, y, z] } : o)),
  }));
}

// ==========================================
// GROUND
// ==========================================

function Ground({ onPointerDown }: { onPointerDown?: (e: any) => void }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onPointerDown={onPointerDown}>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#1a1d24" />
    </mesh>
  );
}

// ========================================
// GENERATED MODEL (AI text-to-3D via Fal)
// ========================================

function GeneratedModel({
  obj,
  commonProps,
}: {
  obj: SceneObject;
  commonProps: any;
}) {
  const { scene } = useGLTF(obj.modelUrl!);

  const size = useMemo(() => {
    const box = new Box3().setFromObject(scene);
    const dims = new Vector3();
    box.getSize(dims);
    return [
      dims.x || 1,
      dims.y || 1,
      dims.z || 1,
    ] as [number, number, number];
  }, [scene]);

  return (
    <mesh
      ref={commonProps.ref}
      position={commonProps.position}
      rotation={commonProps.rotation}
      scale={commonProps.scale}
      castShadow={commonProps.castShadow}
      onPointerOver={commonProps.onPointerOver}
      onPointerOut={commonProps.onPointerOut}
      onClick={commonProps.onClick}
    >
      <boxGeometry args={size} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      <primitive object={scene} />
    </mesh>
  );
}
// ==========================================
// DYNAMIC OBJECT (AI-created, chat-driven, booleans)
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
    rotation: obj.rotation,
    scale: obj.scale,
    castShadow: true,
    onPointerOver: () => setHovered(true),
    onPointerOut: () => setHovered(false),
    onClick: (e: any) => {
      if (e.shiftKey) {
        e.stopPropagation();
        useSceneStore.getState().toggleSelected(obj.id);
      }
    },
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
    case 'generated':
        return obj.modelUrl ? (
          <GeneratedModel obj={obj} commonProps={commonProps} />
        ) : null;
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
    case 'torus':
      return (
        <mesh {...commonProps}>
          <torusGeometry args={[0.5, 0.2, 16, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      );
    case 'custom':
      return obj.geometry ? (
        <mesh {...commonProps} geometry={obj.geometry}>
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
      ) : null;
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

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setInput(text); // show what's being sent (useful for voice)
    setLoading(true);
    try {
      const message = await sendChatMessage(text);
      setReply(message);
    } catch (err) {
      setReply('Error reaching AI backend. Is it running on localhost:3001?');
      console.error(err);
    } finally {
      setInput('');
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  // Voice: speak a command, it's sent exactly like a typed one
  const voice = useSpeechRecognition((transcript) => {
    void send(transcript);
  });

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
      {voice.error && (
        <div
          style={{
            background: 'rgba(60,20,24,0.9)',
            color: '#ffb4b4',
            padding: '6px 12px',
            borderRadius: 8,
            marginBottom: 8,
            fontSize: 13,
          }}
        >
          {voice.error}
        </div>
      )}
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
          value={voice.listening ? voice.interim : input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={voice.listening ? 'Listening…' : 'e.g. Create a red cube'}
          disabled={loading || voice.listening}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #444',
            background: '#1a1d24',
            color: '#fff',
          }}
        />
        {voice.supported && (
          <button
            type="button"
            onClick={voice.listening ? voice.stop : voice.start}
            disabled={loading}
            title={voice.listening ? 'Stop listening' : 'Speak a command'}
            aria-label={voice.listening ? 'Stop listening' : 'Speak a command'}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: 'none',
              background: voice.listening ? '#e94560' : '#2a2f3a',
              color: '#fff',
              cursor: loading ? 'default' : 'pointer',
              boxShadow: voice.listening ? '0 0 12px #e94560' : 'none',
            }}
          >
            {voice.listening ? '■' : '🎤'}
          </button>
        )}
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

function targetKey(target: GrabTarget): string {
  return target.type === 'dynamic' ? target.id : target.type;
}

type ScaleSession = {
  target: GrabTarget;
  initialScale: number;
  /** Undecided until the first clear spread or twist */
  mode: TwoHandMode;
  startAngle: number | null;
  initialRotationY: number;
  /** Backend scale factor at the moment SCALE locked (so it doesn't jump) */
  scaleFactorAtLock: number;
  /** Last reported rotation step, to avoid re-rendering every frame */
  reportedDegrees: number;
  /** Rotation the object is heading to (exact step), applied on release */
  targetRotationY: number;
  /** Objects it was already overlapping when scaling began (left alone, e.g. for booleans) */
  alreadyOverlapping: Set<Mesh>;
};

function Scene({
  hands,
  scaling,
  selectedObject,
  onSelectedChange,
  onSnapChange,
  onTwoHandChange,
  transformMode,
  extrudeActive,
  extrudePoints,
  onExtrudePoint,
}: {
  hands: HandData[];
  scaling: ScalingData | null;
  selectedObject: string | null;
  onSelectedChange: (key: string | null) => void;
  onSnapChange: (kind: SnapKind) => void;
  onTwoHandChange: (info: TwoHandInfo) => void;
  transformMode: 'translate' | 'rotate' | 'scale';
  extrudeActive: boolean;
  extrudePoints: [number, number][];
  onExtrudePoint: (pt: [number, number]) => void;
}) {
  const { camera, gl } = useThree();

  const objects = useSceneStore((s) => s.objects);
  const moveObject = useSceneStore((s) => s.moveObject);
  const scaleObject = useSceneStore((s) => s.scaleObject);
  const rotateObject = useSceneStore((s) => s.rotateObject);
  const snap = useSceneStore((s) => s.snap);

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
    | (GrabTarget & {
        handLabel: string;
        plane: Plane;
        offset: Vector3;
        /** Depth control: hand size and plane position when the grab started */
        startHandSize: number | null;
        smoothedHandSize: number | null;
        startPlaneConstant: number;
        /** Grabbed with the thumb + middle finger snap pinch */
        snap: boolean;
      })
    | null
  >(null);

  const selected = useRef<GrabTarget | null>(null);
  const scaleSession = useRef<ScaleSession | null>(null);
  const waitForRelease = useRef(false);
  const orbitRef = useRef<any>(null);
  const emptyPinch = useRef<{
    handLabel: string;
    lastX: number;
    lastY: number;
    /** Zoom: hand size and camera distance when the pinch started */
    startHandSize: number | null;
    smoothedHandSize: number | null;
    startDistance: number;
  } | null>(null);

  const [grabbedObject, setGrabbedObject] = useState<string | null>(null);
  const [isScaling, setIsScaling] = useState(false);

  // Floor guard state
  const floorBox = useRef(new Box3());
  const needsFloorSync = useRef(new Set<string>());
  const gizmoDragging = useRef(false);

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

  // Snap gesture state
  const middlePinching = useRef(false);
  const snapKind = useRef<SnapKind>(null);
  const snapTarget = useRef(new Vector3());

  const setSnapKind = (kind: SnapKind) => {
    if (snapKind.current === kind) return;
    snapKind.current = kind;
    onSnapChange(kind);
  };

  const releaseGrab = () => {
    if (!activeGrab.current) return;
    activeGrab.current = null;
    setGrabbedObject(null);
    setSnapKind(null);
  };

  const endScaling = () => {
    const session = scaleSession.current;
    if (!session) return;
    scaleSession.current = null;
    setIsScaling(false);
    onTwoHandChange(null);

    if (session.target.type === 'dynamic') {
      const mesh = session.target.mesh;
      if (session.mode === 'scale') {
        scaleObject(session.target.id, mesh.scale.x);
        // Scaling may have pushed it out of other objects: save where it ended up
        syncStoredPosition(session.target.id, mesh);
      } else if (session.mode === 'rotate') {
        mesh.rotation.y = session.targetRotationY; // land exactly on the step
        rotateObject(session.target.id, [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z]);
      }
    }
  };

  useFrame(() => {
    const currentHands = handsRef.current;
    const currentScaling = scalingRef.current;

    const sel = selected.current;
    if (sel?.type === 'dynamic' && !dynamicMeshRefs.current.has(sel.id)) {
      if (scaleSession.current?.target === sel) {
        scaleSession.current = null;
        setIsScaling(false);
      }
      select(null);
    }

    const scalingActive = currentScaling?.active === true && currentHands.length >= 2;

    if (scalingActive) {
      releaseGrab();
      waitForRelease.current = true;

      if (!scaleSession.current && selected.current) {
        const scalingMesh = selected.current.mesh;
        scaleSession.current = {
          target: selected.current,
          initialScale: scalingMesh.scale.x,
          mode: 'pending',
          startAngle: twoHandAngle(currentHands),
          initialRotationY: scalingMesh.rotation.y,
          scaleFactorAtLock: 1,
          reportedDegrees: 0,
          targetRotationY: scalingMesh.rotation.y,
          alreadyOverlapping: new Set(
            Array.from(dynamicMeshRefs.current.values()).filter(
              (m) => m !== scalingMesh && overlaps(scalingMesh, m),
            ),
          ),
        };
        setIsScaling(true);
        onTwoHandChange({ mode: 'pending', degrees: 0 });
      }

      const session = scaleSession.current;
      const factor = currentScaling.scale_factor;
      const angle = twoHandAngle(currentHands);
      const twist =
        session && session.startAngle !== null && angle !== null
          ? angleDelta(angle, session.startAngle)
          : 0;

      // Decide the mode from whichever movement clearly happens first
      if (session && session.mode === 'pending' && Number.isFinite(factor) && factor > 0) {
        if (Math.abs(twist) >= ROTATE_LOCK_THRESHOLD) {
          session.mode = 'rotate';
        } else if (Math.abs(factor - 1) >= SCALE_LOCK_THRESHOLD) {
          session.mode = 'scale';
          session.scaleFactorAtLock = factor;
        }
        if (session.mode !== 'pending') onTwoHandChange({ mode: session.mode, degrees: 0 });
      }

      if (session && session.mode === 'rotate') {
        const steps = Math.round(twist / ROTATE_STEP);
        const targetY = session.initialRotationY - steps * ROTATE_STEP * ROTATE_DIRECTION;
        const mesh = session.target.mesh;
        session.targetRotationY = targetY;
        mesh.rotation.y = MathUtils.lerp(mesh.rotation.y, targetY, ROTATE_SMOOTHING);
        const degrees = Math.round(MathUtils.radToDeg(steps * ROTATE_STEP));
        if (degrees !== session.reportedDegrees) {
          session.reportedDegrees = degrees;
          onTwoHandChange({ mode: 'rotate', degrees });
        }
      }

      if (session && session.mode === 'scale' && Number.isFinite(factor) && factor > 0) {
        const targetScale = MathUtils.clamp(
          session.initialScale * (factor / session.scaleFactorAtLock),
          MIN_SCALE,
          MAX_SCALE,
        );
        const mesh = session.target.mesh;
        mesh.scale.setScalar(MathUtils.lerp(mesh.scale.x, targetScale, SCALE_SMOOTHING));

        // Growing into another object pushes this one out instead of overlapping
        const others = Array.from(dynamicMeshRefs.current.values()).filter(
          (m) => m !== mesh && !session.alreadyOverlapping.has(m),
        );
        pushOutOfObjects(mesh, others);
      }

      previousPinching.current = true;
      return;
    }

    endScaling();

    const grab = activeGrab.current;

    // Which hand drives one-hand gestures? While grabbing: the grabbing hand.
    // Otherwise: whichever hand is pinching (so either hand works while both are
    // visible), keeping the same hand if it's still pinching; else the right hand.
    const isPinchingAny = (h: HandData) => {
      if (h.pinching) return true;
      const r = middlePinchRatio(h);
      return r !== null && r < SNAP_PINCH_START;
    };
    const hand = grab
      ? currentHands.find((h) => h.hand === grab.handLabel)
      : (currentHands.find((h) => h.hand === previousHandLabel.current && isPinchingAny(h)) ??
        currentHands.find(isPinchingAny) ??
        currentHands.find((h) => h.hand === 'Right') ??
        currentHands[0]);

    if (!hand) {
      releaseGrab();
      setHandHover(null);
      previousPinching.current = false;
      previousHandLabel.current = null;
      waitForRelease.current = false;
      return;
    }

    // Thumb + middle finger pinch (with hysteresis, like the backend's index pinch)
    const middleRatio = middlePinchRatio(hand);
    middlePinching.current =
      middleRatio !== null &&
      middleRatio < (middlePinching.current ? SNAP_PINCH_END : SNAP_PINCH_START);
    const middlePinch = middlePinching.current && !hand.pinching;

    const pinching = hand.pinching || middlePinch;
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

    // Hand-pressable UI: highlight the button under the hand; a pinch presses it.
    // Pinching over any panel never grabs or orbits the 3D scene behind it.
    const ui = activeGrab.current || emptyPinch.current
      ? null
      : handUiTargetAt(position.x, position.y, gl.domElement);
    setHandHover(ui?.clickable ?? null);

    if (ui?.overUi && pinchStarted) {
      if (ui.clickable) pressWithHand(ui.clickable);
      waitForRelease.current = true; // one press per pinch
      previousPinching.current = pinching;
      previousHandLabel.current = hand.hand;
      return;
    }

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
        // Offset from where the ray meets the drag plane (not the surface hit point),
        // so the object doesn't jump when it's grabbed.
        const planeHit = ray.intersectPlane(plane, new Vector3()) ?? hit.point.clone();
        const offset = planeHit.sub(mesh.position);

        let target: GrabTarget;
        if (mesh === cubeRef.current) {
          target = { type: 'cube', mesh };
        } else if (mesh === sphereRef.current) {
          target = { type: 'sphere', mesh };
        } else {
          const found = dynamicEntries.find(([, m]) => m === mesh);
          target = { type: 'dynamic', id: found![0], mesh };
        }

        const size = handSize(hand);
        activeGrab.current = {
          ...target,
          handLabel: hand.hand,
          plane,
          offset,
          startHandSize: size,
          smoothedHandSize: size,
          startPlaneConstant: plane.constant,
          snap: hand.pinching, // index pinch snaps; middle pinch moves freely
        };

        setGrabbedObject(targetKey(target));
        select(target);
      } else {
        // Pinched empty space: move the camera instead (rotate + zoom).
        const size = handSize(hand);
        const controls = orbitRef.current;
        emptyPinch.current = {
          handLabel: hand.hand,
          lastX: position.x,
          lastY: position.y,
          startHandSize: size,
          smoothedHandSize: size,
          startDistance: controls ? camera.position.distanceTo(controls.target) : 8,
        };
      }
    }

    // While holding empty space: move the hand to rotate the view,
    // push it toward the screen to zoom in, pull it back to zoom out.
    if (emptyPinch.current && pinching && hand.hand === emptyPinch.current.handLabel) {
      const held = emptyPinch.current;
      const dx = position.x - held.lastX;
      const dy = position.y - held.lastY;
      held.lastX = position.x;
      held.lastY = position.y;

      const controls = orbitRef.current;
      if (controls) {
        let zoom = 1;
        const size = handSize(hand);
        if (size !== null && held.startHandSize !== null) {
          held.smoothedHandSize = MathUtils.lerp(held.smoothedHandSize ?? size, size, DEPTH_SMOOTHING);
          zoom = zoomFromHandSize(held.smoothedHandSize / held.startHandSize);
        }
        rotateAndZoomCamera(camera, controls, dx, dy, held.startDistance / zoom);
      }
    } else if (!pinching) {
      emptyPinch.current = null;
    }

    if (activeGrab.current && pinching) {
      const currentGrab = activeGrab.current;

      // Depth: slide the camera-facing drag plane toward/away from the camera
      // based on how much bigger/smaller the hand looks than at grab start.
      const size = handSize(hand);
      if (size !== null && currentGrab.startHandSize !== null) {
        currentGrab.smoothedHandSize = MathUtils.lerp(
          currentGrab.smoothedHandSize ?? size,
          size,
          DEPTH_SMOOTHING,
        );
        const depth = depthFromHandSize(currentGrab.smoothedHandSize / currentGrab.startHandSize);
        // plane.normal points away from the camera, so lowering the constant moves it away
        currentGrab.plane.constant = currentGrab.startPlaneConstant - depth;
      }

      const intersection = new Vector3();
      const hasIntersection = ray.intersectPlane(currentGrab.plane, intersection);

      if (hasIntersection) {
        let target = intersection.sub(currentGrab.offset);
        if (currentGrab.snap) {
          const others = Array.from(dynamicMeshRefs.current.values()).filter(
            (m) => m !== currentGrab.mesh,
          );
          setSnapKind(snapPosition(currentGrab.mesh, target, others, snapTarget.current));
          target = snapTarget.current;
        }
        currentGrab.mesh.position.lerp(target, 0.35);
        keepInsideBounds(currentGrab.mesh, floorBox.current); // slide along floor/edges, never through

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

  // Bounds guard. Registered after the main useFrame so it runs after this frame's
  // drag/scale updates and before rendering: anything below the floor or past the
  // ground's edges is pushed back inside (dragging into an edge slides along it).
  useFrame(() => {
    const draggedMesh = activeGrab.current?.mesh;
    const scalingMesh = scaleSession.current?.target.mesh;

    for (const [id, mesh] of dynamicMeshRefs.current) {
      if (keepInsideBounds(mesh, floorBox.current)) {
        needsFloorSync.current.add(id);
      }

      // Save the corrected height once nothing is actively moving the object
      // (hand drag, two-hand scale, gizmo), so Undo/Save/AI see where it really is.
      const busy =
        mesh === draggedMesh ||
        mesh === scalingMesh ||
        (gizmoDragging.current && id === selectedObject);
      if (!busy && needsFloorSync.current.has(id)) {
        needsFloorSync.current.delete(id);
        syncStoredPosition(id, mesh);
      }
    }
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


      <Ground
        onPointerDown={
          extrudeActive
            ? (e: any) => {
                e.stopPropagation();
                onExtrudePoint([e.point.x, e.point.z]);
              }
            : undefined
        }
      />
      <Grid
        position={[0, 0.001, 0]}
        args={[20, 20]}
        cellColor="#2a2f3a"
        sectionColor="#3d4455"
        fadeDistance={25}
        infiniteGrid
      />

      {extrudePoints.map((p, i) => (
        <mesh key={i} position={[p[0], 0.05, p[1]]}>
          <sphereGeometry args={[0.08, 12, 12]} />
          <meshBasicMaterial color="#4cc9f0" />
        </mesh>
      ))}
      {extrudePoints.length > 1 && (
        <Line
          points={extrudePoints.map((p) => [p[0], 0.05, p[1]] as [number, number, number])}
          color="#4cc9f0"
          lineWidth={2}
        />
      )}

      {objects.map((obj) => (
        <DynamicObject
          key={obj.id}
          obj={obj}
          grabbed={grabbedObject === obj.id}
          selected={selectedObject === obj.id}
          registerRef={registerDynamicRef}
        />
      ))}
            {selectedObject &&
        selectedObject !== 'cube' &&
        selectedObject !== 'sphere' &&
        dynamicMeshRefs.current.get(selectedObject) && (
          <TransformControls
            object={dynamicMeshRefs.current.get(selectedObject)!}
            mode={transformMode}
            translationSnap={snap.enabled ? snap.translateSnap : null}
            rotationSnap={snap.enabled ? snap.rotateSnap : null}
            scaleSnap={snap.enabled ? snap.scaleSnap : null}
            onMouseDown={() => {
              gizmoDragging.current = true;
              if (orbitRef.current) orbitRef.current.enabled = false;
            }}
            onMouseUp={() => {
              gizmoDragging.current = false;
              if (orbitRef.current) orbitRef.current.enabled = true;
              const mesh = dynamicMeshRefs.current.get(selectedObject!);
              if (mesh) {
                moveObject(selectedObject!, [mesh.position.x, mesh.position.y, mesh.position.z]);
                rotateObject(selectedObject!, [mesh.rotation.x, mesh.rotation.y, mesh.rotation.z]);
                scaleObject(selectedObject!, mesh.scale.x);
              }
            }}
          />
        )}

      <OrbitControls ref={orbitRef} makeDefault enabled={grabbedObject === null && !isScaling} />
    </>
  );
}

// ==========================================
// MAIN APP
// ==========================================

export default function App() {
  const { hands, connected, error, scaling } = useHandTracking();
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [snapKind, setSnapKind] = useState<SnapKind>(null);
  const [twoHand, setTwoHand] = useState<TwoHandInfo>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const objects = useSceneStore((s) => s.objects);
  const addObject = useSceneStore((s) => s.addObject);

  const [extrudeActive, setExtrudeActive] = useState(false);
  const [extrudePoints, setExtrudePoints] = useState<[number, number][]>([]);
  const [extrudeHeight, setExtrudeHeight] = useState(3);

  const handleExtrudeFinish = () => {
    const geometry = buildExtrudeGeometry(extrudePoints, extrudeHeight);
    if (geometry) {
      addObject({
        id: crypto.randomUUID(),
        shape: 'custom',
        position: [0, 0, 0],
        scale: 1,
        color: '#c084fc',
        geometry,
      });
    }
    setExtrudePoints([]);
    setExtrudeActive(false);
  };

  const handleExtrudeCancel = () => {
    setExtrudePoints([]);
    setExtrudeActive(false);
  };


  const selectedLabel =
    selectedObject === null || selectedObject === 'cube' || selectedObject === 'sphere'
      ? selectedObject
      : (objects.find((o) => o.id === selectedObject)?.shape ?? null);

  const inspectorId =
    selectedObject !== 'cube' && selectedObject !== 'sphere' ? selectedObject : null;

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <HandTrackingStatus
        hands={hands}
        connected={connected}
        error={error}
        scaling={scaling}
        selectedObject={selectedLabel}
        snapKind={snapKind}
        twoHand={twoHand}
      />

      <HandSkeletons hands={hands} scaling={scaling} />

      <Canvas shadows camera={{ position: [4, 3, 5], fov: 50 }}>
        <Scene
          hands={hands}
          scaling={scaling}
          selectedObject={selectedObject}
          onSelectedChange={setSelectedObject}
          onSnapChange={setSnapKind}
          onTwoHandChange={setTwoHand}
          transformMode={transformMode}
          extrudeActive={extrudeActive}
          extrudePoints={extrudePoints}
          onExtrudePoint={(pt) => setExtrudePoints((pts) => [...pts, pt])}
        />
      </Canvas>

      <div style={{ position: 'absolute', bottom: 20, left: 20, zIndex: 10, display: 'flex', gap: 6 }}>
        <button onClick={() => setTransformMode('translate')}>Move</button>
        <button onClick={() => setTransformMode('rotate')}>Rotate</button>
        <button onClick={() => setTransformMode('scale')}>Scale</button>
      </div>

      <Inspector selectedId={inspectorId} />

      <SnapPanel />
      <ActionsPanel selectedId={inspectorId} onSelectedChange={setSelectedObject} />
      <ExtrudeTool
        active={extrudeActive}
        onToggle={() => setExtrudeActive((v) => !v)}
        pointCount={extrudePoints.length}
        height={extrudeHeight}
        onHeightChange={setExtrudeHeight}
        onFinish={handleExtrudeFinish}
        onCancel={handleExtrudeCancel}
        onUndoPoint={() => setExtrudePoints((pts) => pts.slice(0, -1))}
      />

      <ChatBox />
    </div>
  );
}