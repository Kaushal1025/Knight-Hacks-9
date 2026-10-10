import { useMemo, useState } from 'react';
import { useSceneStore } from './store/sceneStore';

export default function BooleanPanel() {
  const objects = useSceneStore((s) => s.objects);
  const booleanOp = useSceneStore((s) => s.booleanOp);

  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');

  const options = useMemo(
    () => objects.map((o) => ({ id: o.id, label: `${o.shape} (${o.id.slice(0, 4)})` })),
    [objects],
  );

  const run = (op: 'union' | 'subtract' | 'intersect') => {
    if (!aId || !bId || aId === bId) return;
    booleanOp(aId, bId, op);
    setAId('');
    setBId('');
  };

  const selectStyle: React.CSSProperties = {
    padding: '4px 6px',
    borderRadius: 6,
    border: '1px solid #444',
    background: '#1a1d24',
    color: '#fff',
    fontSize: 12,
  };

  const buttonStyle: React.CSSProperties = {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #444',
    background: '#2a2f3a',
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        zIndex: 10,
        background: 'rgba(20,22,28,0.9)',
        border: '1px solid #2a2f3a',
        borderRadius: 10,
        padding: 12,
        fontFamily: 'sans-serif',
        color: '#fff',
        fontSize: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ fontWeight: 600 }}>Boolean</div>

      <div style={{ display: 'flex', gap: 8 }}>
        <select value={aId} onChange={(e) => setAId(e.target.value)} style={selectStyle}>
          <option value="">A</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={bId} onChange={(e) => setBId(e.target.value)} style={selectStyle}>
          <option value="">B</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button disabled={!aId || !bId} onClick={() => run('union')} style={buttonStyle}>
          Union
        </button>
        <button disabled={!aId || !bId} onClick={() => run('subtract')} style={buttonStyle}>
          Subtract
        </button>
        <button disabled={!aId || !bId} onClick={() => run('intersect')} style={buttonStyle}>
          Intersect
        </button>
      </div>
    </div>
  );
}