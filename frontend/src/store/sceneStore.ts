import { create } from 'zustand';
import type { BufferGeometry } from 'three';

export type ShapeType = 'sphere' | 'cube' | 'cylinder' | 'cone' | 'torus' | 'custom' | 'generated';

export interface SceneObject {
  id: string;
  shape: ShapeType;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  color: string;
  geometry?: BufferGeometry;
  modelUrl?: string;
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
  history: SceneObject[][];
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
  undo: () => void;
}

function applySnap(value: number, increment: number, enabled: boolean) {
  if (!enabled || increment <= 0) return value;
  return Math.round(value / increment) * increment;
}

const MAX_HISTORY = 50;

export const useSceneStore = create<SceneStore>((set) => ({
  objects: [],
  selectedIds: [],
  snap: { enabled: false, translateSnap: 0.5, rotateSnap: 0.1, scaleSnap: 0.1 },
  history: [],

  addObject: (obj) =>
    set((s) => ({
      history: [...s.history.slice(-MAX_HISTORY + 1), s.objects],
      objects: [...s.objects, { rotation: [0, 0, 0], ...obj }],
    })),

  moveObject: (id, position) =>
    set((s) => ({
      history: [...s.history.slice(-MAX_HISTORY + 1), s.objects],
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
      history: [...s.history.slice(-MAX_HISTORY + 1), s.objects],
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
      history: [...s.history.slice(-MAX_HISTORY + 1), s.objects],
      objects: s.objects.map((o) =>
        o.id === id
          ? { ...o, scale: applySnap(scale, s.snap.scaleSnap, s.snap.enabled) }
          : o,
      ),
    })),

  deleteObject: (id) =>
    set((s) => ({
      history: [...s.history.slice(-MAX_HISTORY + 1), s.objects],
      objects: s.objects.filter((o) => o.id !== id),
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
    })),

  changeColor: (id, color) =>
    set((s) => ({
      history: [...s.history.slice(-MAX_HISTORY + 1), s.objects],
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

  undo: () =>
    set((s) => {
      if (s.history.length === 0) return s;
      const previous = s.history[s.history.length - 1];
      return {
        objects: previous,
        history: s.history.slice(0, -1),
        selectedIds: [],
      };
    }),
}));