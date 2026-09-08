import { useState } from 'react';
import type { LibraryReference } from '@codex-ux/protocol';
import type { WorkspaceLibrary } from '@codex-ux/sdk';
import { FileIcon } from './file-icon';

export function AttachmentList({
  library,
  items,
  onRemove,
  expanded = false,
}: {
  library: WorkspaceLibrary;
  items: LibraryReference[];
  onRemove?: (id: string) => void;
  expanded?: boolean;
}) {
  const [preview, setPreview] = useState<LibraryReference | null>(
    expanded ? (items[0] ?? null) : null,
  );
  const [unavailable, setUnavailable] = useState<string[]>([]);
  return (
    <>
      <div className="ux-attachments">
        {items.map((item) => (
          <div
            className={`ux-attachment ${unavailable.includes(item.id) ? 'unavailable' : ''}`}
            key={item.id}
          >
            <button
              type="button"
              className="ux-attachment-open"
              title={item.path}
              onClick={() => setPreview(item)}
            >
              {/^image\/(png|jpeg|webp|gif|avif)$/.test(item.mime) &&
              !unavailable.includes(item.id) ? (
                <img
                  src={library.content(item)}
                  alt=""
                  onError={() => setUnavailable((ids) => [...ids, item.id])}
                />
              ) : (
                <FileIcon name={item.name} mime={item.mime} kind={item.kind} size={28} />
              )}
              <span>
                {item.name}
                <small>
                  {unavailable.includes(item.id)
                    ? 'Unavailable · choose again'
                    : item.kind === 'directory'
                      ? 'Folder reference'
                      : `${Math.max(1, Math.round(item.size / 1024))} KB`}
                </small>
              </span>
            </button>
            {onRemove && (
              <button
                type="button"
                className="ux-remove"
                aria-label={`Remove ${item.name}`}
                onClick={() => onRemove(item.id)}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {preview && (
        <div className="ux-attachment-preview" role="region" aria-label={`Preview ${preview.name}`}>
          <div className="ux-preview-heading">
            <strong>{preview.name}</strong>
            <button
              type="button"
              className="ux-remove"
              aria-label="Close attachment preview"
              onClick={() => setPreview(null)}
            >
              ×
            </button>
          </div>
          {/^image\/(png|jpeg|webp|gif|avif)$/.test(preview.mime) ? (
            <img
              src={library.content(preview)}
              alt={preview.name}
              onError={() => setUnavailable((ids) => [...ids, preview.id])}
            />
          ) : /^video\/(mp4|webm)$/.test(preview.mime) ? (
            <video controls src={library.content(preview)} />
          ) : preview.mime.startsWith('audio/') ? (
            <audio controls src={library.content(preview)} />
          ) : (
            <FileIcon name={preview.name} mime={preview.mime} kind={preview.kind} size={44} />
          )}
          <code>{preview.path}</code>
          {unavailable.includes(preview.id) && (
            <p role="alert">This file is unavailable or changed. Choose it again.</p>
          )}
        </div>
      )}
    </>
  );
}
