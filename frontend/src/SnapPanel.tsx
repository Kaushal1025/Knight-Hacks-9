import { useSceneStore } from './store/sceneStore';

export default function SnapPanel() {
  const snap = useSceneStore((s) => s.snap);
  const toggleSnap = useSceneStore((s) => s.toggleSnap);
  const setSnap = useSceneStore((s) => s.setSnap);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 400,
        zIndex: 10,
        background: 'rgba(20,22,28,0.9)',
        border: '1px solid #2a2f3a',
        borderRadius: 10,
        padding: 12,
        fontFamily: 'sans-serif',
        color: '#fff',
        fontSize: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="checkbox"
          checked={snap.enabled}
          onChange={(e) => toggleSnap(e.target.checked)}
        />
        Snap
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        Move
        <input
          type="number"
          step={0.1}
          value={snap.translateSnap}
          onChange={(e) => setSnap({ translateSnap: parseFloat(e.target.value) || 0 })}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        Rotate
        <input
          type="number"
          step={0.01}
          value={snap.rotateSnap}
          onChange={(e) => setSnap({ rotateSnap: parseFloat(e.target.value) || 0 })}
          style={inputStyle}
        />
      </label>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        Scale
        <input
          type="number"
          step={0.01}
          value={snap.scaleSnap}
          onChange={(e) => setSnap({ scaleSnap: parseFloat(e.target.value) || 0 })}
          style={inputStyle}
        />
      </label>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: 56,
  padding: '3px 5px',
  borderRadius: 6,
  border: '1px solid #444',
  background: '#1a1d24',
  color: '#fff',
  fontSize: 12,
};