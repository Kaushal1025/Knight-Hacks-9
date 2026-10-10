import type { HandData, ScalingData } from './hooks/useHandTracking';

// MediaPipe hand landmark connections (same list the CV backend draws with)
const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], // thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // index
  [5, 9], [9, 10], [10, 11], [11, 12], // middle
  [9, 13], [13, 14], [14, 15], [15, 16], // ring
  [13, 17], [17, 18], [18, 19], [19, 20], // pinky
  [0, 17], // palm edge
];

const THUMB_TIP = 4;
const INDEX_TIP = 8;

/** Cursor color per hand label (labels can swap if hands cross; color is cosmetic only). */
const HAND_COLORS: Record<string, string> = {
  Right: '#00ff88',
  Left: '#c084fc',
};
const SKELETON_COLOR = '#8fa8ff';
const SCALING_COLOR = '#ffd166';

type Props = {
  hands: HandData[];
  scaling: ScalingData | null;
};

/**
 * Draws each tracked hand as a line skeleton over the scene, with a cursor
 * sitting exactly between the thumb tip and index fingertip.
 * Coordinates are the backend's normalized (already mirrored) webcam coords.
 */
export default function HandSkeletons({ hands, scaling }: Props) {
  const scalingActive = scaling?.active === true;

  return (
    <>
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        style={{
          position: 'fixed',
          inset: 0,
          width: '100vw',
          height: '100vh',
          pointerEvents: 'none',
          zIndex: 998,
        }}
      >
        {hands.map((hand, h) =>
          hand.landmarks.length >= 21 ? (
            <g
              key={h}
              stroke={SKELETON_COLOR}
              strokeOpacity={hand.pinching ? 0.95 : 0.6}
              strokeWidth={hand.pinching ? 3 : 2}
              strokeLinecap="round"
            >
              {CONNECTIONS.map(([a, b]) => (
                <line
                  key={`${a}-${b}`}
                  x1={hand.landmarks[a].x}
                  y1={hand.landmarks[a].y}
                  x2={hand.landmarks[b].x}
                  y2={hand.landmarks[b].y}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ) : null,
        )}
      </svg>

      {hands.map((hand, h) => {
        // Midpoint between thumb tip and index tip, from the same frame as the
        // skeleton so the dot sits right between the pinching fingers.
        const hasTips = hand.landmarks.length > INDEX_TIP;
        const x = hasTips
          ? (hand.landmarks[THUMB_TIP].x + hand.landmarks[INDEX_TIP].x) / 2
          : hand.position.x;
        const y = hasTips
          ? (hand.landmarks[THUMB_TIP].y + hand.landmarks[INDEX_TIP].y) / 2
          : hand.position.y;

        const color = scalingActive ? SCALING_COLOR : (HAND_COLORS[hand.hand] ?? '#ffffff');
        const size = hand.pinching ? 16 : 12;

        return (
          <div
            key={h}
            style={{
              position: 'fixed',
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              width: size,
              height: size,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: hand.pinching ? color : 'transparent',
              border: `2px solid ${color}`,
              boxShadow: `0 0 10px ${color}`,
              pointerEvents: 'none',
              zIndex: 999,
            }}
          />
        );
      })}
    </>
  );
}
