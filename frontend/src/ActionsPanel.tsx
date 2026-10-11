import { useSceneStore } from './store/sceneStore';

export default function ActionsPanel({
  selectedId,
  onSelectedChange,
}: {
  selectedId: string | null;
  onSelectedChange: (id: string | null) => void;
}) {
  const undo = useSceneStore((s) => s.undo);
  const deleteObject = useSceneStore((s) => s.deleteObject);

  const handleDelete = () => {
    if (!selectedId) return;
    deleteObject(selectedId);
    onSelectedChange(null);
  };

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
        bottom: 180,
        right: 20,
        zIndex: 10,
        display: 'flex',
        gap: 8,
      }}
    >
      <button onClick={undo} style={buttonStyle}>
        Undo
      </button>
      <button
        onClick={handleDelete}
        style={{ ...buttonStyle, opacity: selectedId ? 1 : 0.5 }}
        disabled={!selectedId}
      >
        Delete
      </button>
    </div>
  );
}