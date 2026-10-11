import { useRef } from 'react';
import { useSceneStore } from './store/sceneStore';
import { loadSceneFromFile, saveSceneToFile } from './lib/sceneFile';

export default function ActionsPanel({
  selectedId,
  onSelectedChange,
}: {
  selectedId: string | null;
  onSelectedChange: (id: string | null) => void;
}) {
  const undo = useSceneStore((s) => s.undo);
  const deleteObject = useSceneStore((s) => s.deleteObject);

  const fileInput = useRef<HTMLInputElement>(null);

  const handleLoad = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow loading the same file again
    if (!file) return;
    try {
      await loadSceneFromFile(file);
      onSelectedChange(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not load that file.');
    }
  };

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
      <button onClick={saveSceneToFile} style={buttonStyle} title="Download this scene as a file">
        Save
      </button>
      <button
        onClick={() => fileInput.current?.click()}
        style={buttonStyle}
        title="Open a saved scene file"
      >
        Load
      </button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        onChange={handleLoad}
        style={{ display: 'none' }}
      />
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