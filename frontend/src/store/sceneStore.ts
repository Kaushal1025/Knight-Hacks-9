import { create } from 'zustand';

export interface SceneObject {
  id: string;
  shape: 'sphere' | 'cube' | 'cylinder' | 'cone';
  position: [number, number, number];
  scale: number;
  color: string;
}

interface SceneStore {
  objects: SceneObject[];
  addObject: (obj: SceneObject) => void;
  moveObject: (id: string, position: [number, number, number]) => void;
  scaleObject: (id: string, scale: number) => void;
  deleteObject: (id: string) => void;
  changeColor: (id: string, color: string) => void;
}

export const useSceneStore = create<SceneStore>((set) => ({
  objects: [],
  addObject: (obj) => set((s) => ({ objects: [...s.objects, obj] })),
  moveObject: (id, position) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, position } : o)),
    })),
  scaleObject: (id, scale) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, scale } : o)),
    })),
  deleteObject: (id) =>
    set((s) => ({ objects: s.objects.filter((o) => o.id !== id) })),
  changeColor: (id, color) =>
    set((s) => ({
      objects: s.objects.map((o) => (o.id === id ? { ...o, color } : o)),
    })),
}));