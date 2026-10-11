import { Shape, ExtrudeGeometry } from 'three';

export function buildExtrudeGeometry(points: [number, number][], height: number) {
  if (points.length < 3) return null;

  const shape = new Shape();
  shape.moveTo(points[0][0], -points[0][1]);
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], -points[i][1]);
  }
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2); // stand it up: extrusion becomes world Y (height)
  return geometry;
}

export default function ExtrudeTool({
  active,
  onToggle,
  pointCount,
  height,
  onHeightChange,
  onFinish,
  onCancel,
  onUndoPoint,
}: {
  active: boolean;
  onToggle: () => void;
  pointCount: number;
  height: number;
  onHeightChange: (h: number) => void;
  onFinish: () => void;
  onCancel: () => void;
  onUndoPoint: () => void;
}) {
  const buttonStyle: React.CSSProperties = {
    padding: '6px 14px',
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
        top: 20,
        right: 20,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        background: 'rgba(20,22,28,0.85)',
        padding: 12,
        borderRadius: 10,
        width: 200,
        fontFamily: 'sans-serif',
        color: '#fff',
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>Extrude Tool</div>

      <button
        onClick={onToggle}
        style={{
          ...buttonStyle,
          background: active ? '#4cc9f0' : '#2a2f3a',
          color: active ? '#0f1115' : '#fff',
        }}
      >
        {active ? 'Drawing… (click ground)' : 'Draw Footprint'}
      </button>

      {active && (
        <>
          <div style={{ fontSize: 12, opacity: 0.8 }}>Points placed: {pointCount}</div>

          <label style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Height
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={height}
              onChange={(e) => onHeightChange(parseFloat(e.target.value) || 0.1)}
              style={{
                padding: '4px 8px',
                borderRadius: 6,
                border: '1px solid #444',
                background: '#1a1d24',
                color: '#fff',
              }}
            />
          </label>

          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onUndoPoint} style={buttonStyle} disabled={pointCount === 0}>
              Undo Pt
            </button>
            <button onClick={onCancel} style={buttonStyle}>
              Cancel
            </button>
          </div>

          <button
            onClick={onFinish}
            disabled={pointCount < 3}
            style={{ ...buttonStyle, opacity: pointCount < 3 ? 0.5 : 1, background: '#e94560' }}
          >
            Finish &amp; Extrude
          </button>
        </>
      )}
    </div>
  );
}