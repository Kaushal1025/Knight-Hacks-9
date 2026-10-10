
import type { HandData } from './hooks/useHandTracking';

type Props = {
  hands: HandData[];
  connected: boolean;
  error: string;
};

export default function HandTrackingStatus({
  hands,
  connected,
  error,
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

      {error && (
        <p style={{ color: '#ff5555' }}>
          Error: {error}
        </p>
      )}
    </div>
  );
}
