import { useRef, useState } from 'react';
import { Upload, Image, Music2, Film, Type } from 'lucide-react';
import type { Asset, VideoDocument } from '@codex-ux/video-domain';
import { EmptyState, PanelHeader } from '../components/ui';

export function AssetsPanel({
  workspaceId,
  document,
  disabled,
  onClose,
  onUpload,
}: {
  workspaceId: string;
  document: VideoDocument;
  disabled: boolean;
  onClose: () => void;
  onUpload: (file: File) => Promise<Asset>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const upload = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(files)) await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <>
      <PanelHeader
        title="Assets"
        detail="Drop files here or anywhere on the canvas."
        onClose={onClose}
      />
      <div className="assets-content">
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,audio/*,.woff2,.woff,.ttf,.otf"
          onChange={(e) => void upload(e.target.files)}
        />
        <button
          className={`asset-drop ${over ? 'drag-over' : ''}`}
          disabled={busy || disabled}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.stopPropagation();
            e.preventDefault();
            setOver(false);
            if (!busy && !disabled) void upload(e.dataTransfer.files);
          }}
        >
          <Upload size={21} />
          <strong>{busy ? 'Bringing it in…' : 'Drop something here'}</strong>
          <span>Images, video, audio, or fonts · up to 100 MB</span>
        </button>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {!document.assets.length ? (
          <EmptyState icon={<Image size={24} />} title="Bring something in">
            Import files for your agent to use in this video.
          </EmptyState>
        ) : (
          <div className="asset-list">
            {document.assets.map((a) => (
              <article className="asset-card" key={a.id}>
                <div className="asset-preview">
                  {a.mime.startsWith('image/') ? (
                    <img src={`/media/video-editor/assets/${workspaceId}/${a.file}`} alt={a.name} />
                  ) : a.mime.startsWith('audio/') ? (
                    <Music2 size={20} />
                  ) : a.mime.startsWith('font/') ? (
                    <Type size={20} />
                  ) : (
                    <Film size={20} />
                  )}
                </div>
                <div className="asset-info">
                  <strong title={a.name}>{a.name}</strong>
                  <span>{(a.size / 1024 / 1024).toFixed(1)} MB · Ready for the agent</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
