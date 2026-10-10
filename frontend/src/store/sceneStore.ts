import { create } from 'zustand';
import { BufferGeometry, BoxGeometry, SphereGeometry, CylinderGeometry, ConeGeometry, TorusGeometry } from 'three';
import { Evaluator, Brush, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';

export type ShapeType = 'sphere' | 'cube' | 'cylinder' | 'cone' | 'torus' | 'custom';

export interface SceneObject {
  id: string;
  shape: ShapeType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  color: string;
  geometry?: BufferGeometry;
}

interface SnapSettings {
  enabled: boolean;
  translateSnap: number;
  rotateSnap: number;
  scaleSnap: number;
}

interface SceneStore {
  objects: SceneObject[];
  selectedIds: string[];
  snap: SnapSettings;
  addObject: (obj: Omit<SceneObject, 'rotation'> & { rotation?: [number, number, number] }) => void;
  moveObject: (id: string, position: [number, number, number]) => void;
  rotateObject: (id: string, rotation: [number, number, number]) => void;
  scaleObject: (id: string, scale: number) => void;
  deleteObject: (id: string) => void;
  changeColor: (id: string, color: string) => void;
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  toggleSnap: (enabled: boolean) => void;
  setSnap: (partial: Partial<SnapSettings>) => void;
  booleanOp: (idA: string, idB: string, op: 'union' | 'subtract' | 'intersect') => void;
}

function applySnap(value: number, increment: number, enabled: boolean) {
  if (!enabled || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

export const useSceneStore = create<SceneStore>((set, get) => ({
  objects: [],
  selectedIds: [],
  snap: { enabled: false, translateSnap: 0.5, rotateSnap: 0.1, scaleSnap: 0.1 },

  addObject: (obj) =>
    set((s) => ({
      objects: [...s.objects, { rotation: [0, 0, 0], ...obj }],
    })),

  moveObject: (id, position) =>
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === id
          ? {
              ...o,
              position: position.map((v) =>
                applySnap(v, s.snap.translateSnap, s.snap.enabled),
              ) as [number, number, number],
            }
          : o,
      ),
    })),

  rotateObject: (id, rotation) =>
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === id
          ? {
              ...o,
              rotation: rotation.map((v) =>
                applySnap(v, s.snap.rotateSnap, s.snap.enabled),
              ) as [number, number, number],
            }
          : o,
      ),
    })),

  scaleObject: (id, scale) =>
    set((s) => ({
      objects: s.objects.map((o) =>
        o.id === id
          ? { ...o, scale: applySnap(scale, s.snap.scaleSnap, s.snap.enabled) }
          : o,
      ),
    })),

  deleteObject: (id) =>
    set((s) => ({
      objects: s.objects.filter((o) => o.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    })),

  changeColor: (id, color) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, color } : o)),
    })),

  setSelected: (ids) => set({ selectedIds: ids }),

  toggleSelected: (id) =>
    set((s) => ({
      selectedIds: s.selectedIds.includes(id)
        ? s.selectedIds.filter((sid) => sid !== id)
        : [...s.selectedIds, id],
    })),

  toggleSnap: (enabled) => set((s) => ({ snap: { ...s.snap, enabled } })),
  setSnap: (partial) => set((s) => ({ snap: { ...s.snap, ...partial } })),

  booleanOp: (idA, idB, op) => {
    const a = get().objects.find((o) => o.id === idA);
    const b = get().objects.find((o) => o.id === idB);
    if (!a || !b) return;

    const geometryFor = (o: SceneObject) => {
      if (o.shape === 'custom' && o.geometry) return o.geometry;
      switch (o.shape) {
        case 'cube':
          return new BoxGeometry(1, 1, 1);
        case 'sphere':
          return new SphereGeometry(0.6, 32, 32);
        case 'cylinder':
          return new CylinderGeometry(0.5, 0.5, 1, 32);
        case 'cone':
          return new ConeGeometry(0.6, 1.2, 32);
        case 'torus':
          return new TorusGeometry(0.5, 0.2, 16, 32);
        default:
          return new BoxGeometry(1, 1, 1);
      }
    };

    const brushA = new Brush(geometryFor(a));
    brushA.position.set(...a.position);
    brushA.rotation.set(...a.rotation);
    brushA.scale.setScalar(a.scale);
    brushA.updateMatrixWorld(true);

    const brushB = new Brush(geometryFor(b));
    brushB.position.set(...b.position);
    brushB.rotation.set(...b.rotation);
    brushB.scale.setScalar(b.scale);
    brushB.updateMatrixWorld(true);

    const opMap = { union: ADDITION, subtract: SUBTRACTION, intersect: INTERSECTION };
    const evaluator = new Evaluator();
    const result = evaluator.evaluate(brushA, brushB, opMap[op]);

    const resultId = crypto.randomUUID();
    set((s) => ({
      objects: [
        ...s.objects.filter((o) => o.id !== idA && o.id !== idB),
        {
          id: resultId,
          shape: 'custom',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: 1,
          color: a.color,
          geometry: result.geometry,
        },
      ],
      selectedIds: [resultId],
    }));
  },
}));