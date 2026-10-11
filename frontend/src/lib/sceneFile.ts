import { BufferGeometryLoader } from 'three';
import { useSceneStore, type SceneObject, type ShapeType } from '../store/sceneStore';

// ==========================================
// Save / load ShapeShift scenes (no database needed)
//  - Save: downloads a .json file
//  - Load: reads a .json file back into the scene
// ==========================================

const FILE_APP = 'shapeshift';
const FILE_VERSION = 1;

const SHAPES: ShapeType[] = ['sphere', 'cube', 'cylinder', 'cone', 'torus', 'custom', 'generated'];

type Vec3 = [number, number, number];

interface SavedObject {
  id: string;
  shape: ShapeType;
  position: Vec3;
  rotation: Vec3;
  scale: number;
  color: string;
  modelUrl?: string;
  /** Boolean-operation results: BufferGeometry.toJSON() output */
  geometry?: unknown;
}

interface SceneFile {
  app: typeof FILE_APP;
  version: number;
  savedAt: string;
  objects: SavedObject[];
}

// ---------- Serialize ----------

function serialize(objects: SceneObject[]): SceneFile {
  return {
    app: FILE_APP,
    version: FILE_VERSION,
    savedAt: new Date().toISOString(),
    objects: objects.map((o) => ({
      id: o.id,
      shape: o.shape,
      position: o.position,
      rotation: o.rotation,
      scale: o.scale,
      color: o.color,
      ...(o.modelUrl ? { modelUrl: o.modelUrl } : {}),
      ...(o.geometry ? { geometry: o.geometry.toJSON() } : {}),
    })),
  };
}

// ---------- Deserialize (defensive: files may be hand-edited or old) ----------

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function vec3(v: unknown, fallback: Vec3): Vec3 {
  return Array.isArray(v) && v.length === 3
    ? [num(v[0], fallback[0]), num(v[1], fallback[1]), num(v[2], fallback[2])]
    : fallback;
}

const geometryLoader = new BufferGeometryLoader();

function deserialize(data: unknown): SceneObject[] {
  if (
    typeof data !== 'object' ||
    data === null ||
    (data as SceneFile).app !== FILE_APP ||
    !Array.isArray((data as SceneFile).objects)
  ) {
    throw new Error('Not a ShapeShift scene file.');
  }

  const result: SceneObject[] = [];
  for (const raw of (data as SceneFile).objects) {
    if (typeof raw !== 'object' || raw === null) continue;
    const shape = SHAPES.includes(raw.shape) ? raw.shape : null;
    if (!shape) continue;

    const obj: SceneObject = {
      id: typeof raw.id === 'string' ? raw.id : crypto.randomUUID(),
      shape,
      position: vec3(raw.position, [0, 0.5, 0]),
      rotation: vec3(raw.rotation, [0, 0, 0]),
      scale: num(raw.scale, 1),
      color: typeof raw.color === 'string' ? raw.color : '#ffffff',
    };

    if (shape === 'generated') {
      if (typeof raw.modelUrl !== 'string') continue; // nothing to load
      obj.modelUrl = raw.modelUrl;
    }

    if (shape === 'custom') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        obj.geometry = geometryLoader.parse(raw.geometry as any);
      } catch {
        continue; // corrupt boolean result: skip it rather than fail the whole load
      }
    }

    result.push(obj);
  }
  return result;
}

// ---------- Apply to the store ----------

/** Replace the scene. Pushes the old scene to history so Undo brings it back. */
function replaceScene(objects: SceneObject[]) {
  useSceneStore.setState((s) => ({
    history: [...s.history.slice(-49), s.objects],
    objects,
    selectedIds: [],
  }));
}

// ---------- Save / load files ----------

export function saveSceneToFile() {
  const file = serialize(useSceneStore.getState().objects);
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const a = document.createElement('a');
  a.href = url;
  a.download = `shapeshift-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Returns the number of objects loaded. Throws with a readable message on bad files. */
export async function loadSceneFromFile(file: File): Promise<number> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  const objects = deserialize(data);
  replaceScene(objects);
  return objects.length;
}
