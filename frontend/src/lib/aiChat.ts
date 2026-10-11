import { useSceneStore } from '../store/sceneStore';

const DEG = Math.PI / 180;

/** Read a number from a tool input, or 0 if it's missing/invalid. */
function deg(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * @param selectedId the object the user last grabbed/selected, so the AI can
 *   resolve "it" / "this" (e.g. "turn it left 45 degrees").
 */
export async function sendChatMessage(message: string, selectedId: string | null = null): Promise<string> {
  const store = useSceneStore.getState();

  const scene = store.objects.map((o) => ({
    id: o.id,
    shape: o.shape,
    position: o.position,
    // Degrees, so the AI can reason about "rotate it 45 more"
    rotation: o.rotation.map((r) => Math.round(r / DEG)),
    scale: o.scale,
    color: o.color,
    ...(o.id === selectedId ? { selected: true } : {}),
  }));

  const res = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, scene }),
  });
  const data = await res.json();

  for (const call of data.toolCalls ?? []) {
    switch (call.name) {
      case 'create_object':
        store.addObject({
          id: crypto.randomUUID(),
          shape: call.input.shape,
          position: [call.input.x, call.input.y, call.input.z],
          scale: call.input.size ?? 1,
          color: call.input.color ?? '#ffffff',
        });
        break;
      case 'move_object':
        store.moveObject(call.input.object_id, [call.input.x, call.input.y, call.input.z]);
        break;
      case 'rotate_object': {
        // Degrees to rotate BY (relative to the current rotation)
        const obj = useSceneStore.getState().objects.find((o) => o.id === call.input.object_id);
        if (!obj) break;
        store.rotateObject(obj.id, [
          obj.rotation[0] + deg(call.input.rx) * DEG,
          obj.rotation[1] + deg(call.input.ry) * DEG,
          obj.rotation[2] + deg(call.input.rz) * DEG,
        ]);
        break;
      }
      case 'scale_object':
        store.scaleObject(call.input.object_id, call.input.scale);
        break;
      case 'delete_object':
        store.deleteObject(call.input.object_id);
        break;
      case 'change_color':
        store.changeColor(call.input.object_id, call.input.color);
        break;
      case 'generate_model':
        if (call.input.error) {
          console.error('Model generation failed:', call.input.error);
          break;
        }
        if (call.input.modelUrl) {
          store.addObject({
            id: crypto.randomUUID(),
            shape: 'generated',
            position: [call.input.x, call.input.y, call.input.z],
            scale: call.input.size ?? 1,
            color: '#ffffff',
            modelUrl: call.input.modelUrl,
          });
        }
        break;
    }
  }

  return data.message ?? '';
}