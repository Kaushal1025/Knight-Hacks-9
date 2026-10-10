import { useSceneStore } from '../store/sceneStore';

export async function sendChatMessage(message: string): Promise<string> {
  const store = useSceneStore.getState();

  const scene = store.objects.map((o) => ({
    id: o.id,
    shape: o.shape,
    position: o.position,
    color: o.color,
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
      case 'scale_object':
        store.scaleObject(call.input.object_id, call.input.scale);
        break;
      case 'delete_object':
        store.deleteObject(call.input.object_id);
        break;
      case 'change_color':
        store.changeColor(call.input.object_id, call.input.color);
        break;
    }
  }

  return data.message ?? '';
}