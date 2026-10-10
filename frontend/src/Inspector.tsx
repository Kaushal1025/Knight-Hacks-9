import { useSceneStore } from './store/sceneStore';

const fieldStyle: React.CSSProperties = {
  width: 64,
  padding: '4px 6px',
  borderRadius: 6,
  border: '1px solid #444',
  background: '#1a1d24',
  color: '#fff',
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#9aa2b1',
  display: 'block',
  marginBottom: 2,
};

function Vec3Row({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  onChange: (next: [number, number, number]) => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: '#cfd3dc', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {(['X', 'Y', 'Z'] as const).map((axis, i) => (
          <div key={axis}>
            <label style={labelStyle}>{axis}</label>
            <input
              type="number"
              step={0.1}
              value={value[i]}
              onChange={(e) => {
                const next = [...value] as [number, number, number];
                next[i] = parseFloat(e.target.value) || 0;
                onChange(next);
              }}
              style={fieldStyle}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Inspector({ selectedId }: { selectedId: string | null }) {
  const objects = useSceneStore((s) => s.objects);
  const moveObject = useSceneStore((s) => s.moveObject);
  const rotateObject = useSceneStore((s) => s.rotateObject);
  const scaleObject = useSceneStore((s) => s.scaleObject);
  const changeColor = useSceneStore((s) => s.changeColor);

  const obj = objects.find((o) => o.id === selectedId);
  if (!obj) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 10,
        width: 220,
        background: 'rgba(20,22,28,0.9)',
        border: '1px solid #2a2f3a',
        borderRadius: 10,
        padding: 14,
        fontFamily: 'sans-serif',
        color: '#fff',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: 10, fontSize: 14 }}>Inspector</div>

      <div style={{ fontSize: 12, color: '#9aa2b1', marginBottom: 10 }}>
        Shape: <span style={{ color: '#fff' }}>{obj.shape}</span>
      </div>

      <Vec3Row label="Position" value={obj.position} onChange={(v) => moveObject(obj.id, v)} />
      <Vec3Row label="Rotation (rad)" value={obj.rotation} onChange={(v) => rotateObject(obj.id, v)} />

      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Scale</label>
        <input
          type="number"
          step={0.1}
          value={obj.scale}
          onChange={(e) => scaleObject(obj.id, parseFloat(e.target.value) || 1)}
          style={{ ...fieldStyle, width: '100%' }}
        />
      </div>

      <div>
        <label style={labelStyle}>Color</label>
        <input
          type="color"
          value={obj.color}
          onChange={(e) => changeColor(obj.id, e.target.value)}
          style={{ width: '100%', height: 28, border: 'none', borderRadius: 6, background: 'none' }}
        />
      </div>
    </div>
  );
}