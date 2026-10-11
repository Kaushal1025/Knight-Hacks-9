
import type { HandData, ScalingData } from './hooks/useHandTracking';

type Props = {
  hands: HandData[];
  connected: boolean;
  error: string;
  scaling: ScalingData | null;
  selectedObject: string | null;
  snapKind?: 'grid' | 'object' | null;
  twoHand?: { mode: 'pending' | 'scale' | 'rotate'; degrees: number; scale: number } | null;
};

export default function HandTrackingStatus({
  hands,
  connected,
  error,
  scaling,
  selectedObject,
  snapKind = null,
  twoHand = null,
}: Props) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 20,
        left: 20,
        zIndex: 1000,
        padding: 16,
        background: 'rgba(0, 0, 0, 0.85)',
        color: 'white',
        borderRadius: 10,
        fontFamily: 'Arial',
        pointerEvents: 'none',
      }}
    >
      <h3>ShapeShift CV</h3>

      <p>
        Backend: {
          connected ? 'Connected' : 'Disconnected'
        }
      </p>

      <p>Hands detected: {hands.length}</p>

      {hands.map((hand, index) => (
        <p key={index}>
          {hand.hand}: {hand.gesture}
        </p>
      ))}

      <p>Selected: {selectedObject ?? 'none'}</p>

      {snapKind && (
        <p style={{ color: '#4cc9f0' }}>
          Snapping to {snapKind === 'object' ? 'object' : 'grid'}
        </p>
      )}

      {twoHand?.mode === 'pending' && (
        <p style={{ color: '#ffd166' }}>Two hands: spread to scale, twist to rotate</p>
      )}

      {twoHand?.mode === 'rotate' && (
        <p style={{ color: '#ffd166' }}>Rotating: {twoHand.degrees}°</p>
      )}

      {scaling?.active && !twoHand && (
        <p style={{ color: '#ffd166' }}>Pinch an object first to select it</p>
      )}

      {twoHand?.mode === 'scale' && (
        <p style={{ color: '#ffd166' }}>Scaling: {twoHand.scale.toFixed(2)}×</p>
      )}

      {error && (
        <p style={{ color: '#ff5555' }}>
          Error: {error}
        </p>
      )}
    </div>
  );
}
