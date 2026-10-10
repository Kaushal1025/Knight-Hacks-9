import { useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment } from '@react-three/drei';
import type { Mesh } from 'three';

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

export default function App() {
  return (
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

      {/* Mouse controls (placeholder until gesture input is wired in) */}
      <OrbitControls makeDefault />
    </Canvas>
  );
}