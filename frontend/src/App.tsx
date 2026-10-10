import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import type { Mesh } from 'three';
import { useSceneStore, type SceneObject } from './store/sceneStore';
import { sendChatMessage } from './lib/aiChat';

type ShapeProps = {
  position: [number, number, number];
  color: string;
};

function Cube({ position, color }: ShapeProps) {
  const ref = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.x += delta * 0.4;
      ref.current.rotation.y += delta * 0.6;
    }
  });

  return (
    <mesh
      ref={ref}
      position={position}
      castShadow
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? '#ffffff' : color} />
    </mesh>
  );
}

function Sphere({ position, color }: ShapeProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <mesh
      position={position}
      castShadow
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <sphereGeometry args={[0.6, 32, 32]} />
      <meshStandardMaterial
        color={hovered ? '#ffffff' : color}
        roughness={0.3}
        metalness={0.2}
      />
    </mesh>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[20, 20]} />
      <meshStandardMaterial color="#1a1d24" />
    </mesh>
  );
}

// Renders any AI-created object based on its shape type
function DynamicObject({ obj }: { obj: SceneObject }) {
  const [hovered, setHovered] = useState(false);
  const position = obj.position;
  const color = hovered ? '#ffffff' : obj.color;
  const scale = obj.scale;

  const commonProps = {
    position,
    scale,
    castShadow: true,
    onPointerOver: () => setHovered(true),
    onPointerOut: () => setHovered(false),
  };

  switch (obj.shape) {
    case 'cube':
      return (
        <mesh {...commonProps}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    case 'sphere':
      return (
        <mesh {...commonProps}>
          <sphereGeometry args={[0.6, 32, 32]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.2} />
        </mesh>
      );
    case 'cylinder':
      return (
        <mesh {...commonProps}>
          <cylinderGeometry args={[0.5, 0.5, 1, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    case 'cone':
      return (
        <mesh {...commonProps}>
          <coneGeometry args={[0.6, 1.2, 32]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
    default:
      return null;
  }
}

function ChatBox() {
  const [input, setInput] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    setLoading(true);
    try {
      const message = await sendChatMessage(input);
      setReply(message);
    } catch (err) {
      setReply('Error reaching AI backend. Is it running on localhost:3001?');
      console.error(err);
    } finally {
      setInput('');
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        left: 20,
        zIndex: 10,
        width: 360,
        fontFamily: 'sans-serif',
      }}
    >
      {reply && (
        <div
          style={{
            background: 'rgba(20,22,28,0.85)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 8,
            marginBottom: 8,
            fontSize: 14,
          }}
        >
          {reply}
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Create a red cube"
          disabled={loading}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #444',
            background: '#1a1d24',
            color: '#fff',
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 16px',
            borderRadius: 8,
            border: 'none',
            background: '#4cc9f0',
            color: '#0f1115',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {loading ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const objects = useSceneStore((s) => s.objects);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh' }}>
      <Canvas shadows camera={{ position: [4, 3, 5], fov: 50 }}>
        <color attach="background" args={['#0f1115']} />

        {/* Lighting */}
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[5, 8, 5]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <pointLight position={[-4, 3, -2]} intensity={0.5} color="#7aa2ff" />
        <Environment preset="city" />

        {/* Scene objects */}
        <Cube position={[-1.2, 0.5, 0]} color="#e94560" />
        <Sphere position={[1.2, 0.6, 0]} color="#4cc9f0" />
        <Ground />
        <Grid
          position={[0, 0.001, 0]}
          args={[20, 20]}
          cellColor="#2a2f3a"
          sectionColor="#3d4455"
          fadeDistance={25}
          infiniteGrid
        />

        {/* AI-created objects */}
        {objects.map((obj) => (
          <DynamicObject key={obj.id} obj={obj} />
        ))}

        {/* Mouse controls (placeholder until gesture input is wired in) */}
        <OrbitControls makeDefault />
      </Canvas>

      <ChatBox />
    </div>
  );
}