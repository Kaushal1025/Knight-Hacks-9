import { io } from 'socket.io-client';
import { useSceneStore } from '../store/sceneStore';

const GESTURE_SERVER_URL = 'http://localhost:5000';

const SCALE_X = 6;
const SCALE_Y = 4;
const SCENE_Y_OFFSET = 1;

function mapToWorldPosition(pos: { x: number; y: number; z: number }): [number, number, number] {
  const worldX = (0.5 - pos.x) * SCALE_X;
  const worldY = (0.5 - pos.y) * SCALE_Y + SCENE_Y_OFFSET;
  const worldZ = -pos.z * SCALE_X;
  return [worldX, worldY, worldZ];
}

function distance(a: [number, number, number], b: [number, number, number]) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

const GRAB_RADIUS = 1.5;
const grabbedObjectByHand: Record<string, string | null> = {};

export function startGestureControl() {
  const socket = io(GESTURE_SERVER_URL);

  socket.on('connect', () => console.log('Connected to gesture server'));

  socket.on('hand_data', (data: { timestamp: number; hands: any[] }) => {
    const store = useSceneStore.getState();

    for (const hand of data.hands) {
      const worldPos = mapToWorldPosition(hand.position);
      const handLabel = hand.hand;

      if (hand.gesture === 'grab_start') {
        let nearestId: string | null = null;
        let nearestDist = GRAB_RADIUS;
        for (const obj of store.objects) {
          const d = distance(worldPos, obj.position);
          if (d < nearestDist) {
            nearestDist = d;
            nearestId = obj.id;
          }
        }
        grabbedObjectByHand[handLabel] = nearestId;
      }

      if (hand.gesture === 'grabbing') {
        const grabbedId = grabbedObjectByHand[handLabel];
        if (grabbedId) store.moveObject(grabbedId, worldPos);
      }

      if (hand.gesture === 'grab_end') {
        grabbedObjectByHand[handLabel] = null;
      }
    }
  });

  socket.on('disconnect', () => console.log('Disconnected from gesture server'));

  return socket;
}