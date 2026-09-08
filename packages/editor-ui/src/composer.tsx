import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { ChevronDown, GripVertical, X } from 'lucide-react';
import { FileIcon, MentionInput } from '@codex-ux/library-react';
import type { LibraryReference } from '@codex-ux/protocol';
import { IconButton } from './ui';
import { Modal } from './modal';

export function Composer({
  context,
  secondaryAction,
  primaryAction,
  error,
  onClose,
  closeLabel = 'Close chat',
  submitLabel = 'send',
  status,
  ...input
}: Omit<ComponentProps<typeof MentionInput>, 'actions'> & {
  context?: ReactNode;
  secondaryAction?: ReactNode;
  primaryAction: ReactNode;
  error?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  submitLabel?: string;
  status?: ReactNode;
}) {
  const [preview, setPreview] = useState<LibraryReference | null>(null);
  const [previewError, setPreviewError] = useState(false);
  return (
    <div className="feedback-composer">
      <div className="composer-header">
        {context}
        <button
          type="button"
          className="composer-grip"
          aria-label="Move composer"
          title="Drag to move · arrow keys when focused"
          data-floating-drag
        >
          <GripVertical size={14} />
        </button>
        <IconButton label={closeLabel} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
      <MentionInput
        {...input}
        imagePreviews
        onPreview={(reference) => {
          setPreviewError(false);
          setPreview(reference);
        }}
        actions={
          <div className="composer-actions">
            <span
              className="composer-shortcut"
              title={`Enter for a new line · ⌘/Ctrl+Enter to ${submitLabel}`}
            >
              <kbd>⌘ / Ctrl ↵</kbd>
            </span>
            {secondaryAction}
            {primaryAction}
          </div>
        }
      />
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {!error && status && (
        <p role="status" className="composer-status">
          {status}
        </p>
      )}
      {preview && (
        <Modal title={preview.name} onClose={() => setPreview(null)}>
          <div className="composer-file-preview">
            {/^image\/(png|jpeg|webp|gif|avif)$/.test(preview.mime) ? (
              <img
                src={input.library.content(preview)}
                alt={preview.name}
                onError={() => setPreviewError(true)}
              />
            ) : /^video\/(mp4|webm)$/.test(preview.mime) ? (
              <video
                controls
                src={input.library.content(preview)}
                onError={() => setPreviewError(true)}
              />
            ) : preview.mime.startsWith('audio/') ? (
              <audio
                controls
                src={input.library.content(preview)}
                onError={() => setPreviewError(true)}
              />
            ) : (
              <FileIcon name={preview.name} mime={preview.mime} kind={preview.kind} size={48} />
            )}
            <p>
              {preview.kind === 'directory'
                ? 'Folder reference'
                : `${Math.max(1, Math.round(preview.size / 1024))} KB`}{' '}
              · {preview.name}
            </p>
            {previewError && (
              <p role="alert">This file is unavailable or changed. Choose it again.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The captured context stays small until the author asks to inspect or replace it. */
export function ComposerContext({
  title,
  subtitle,
  image,
  children,
}: {
  title: string;
  subtitle: string;
  image?: string | undefined;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return (
    <div className="composer-context">
      <button
        type="button"
        className="composer-context-toggle"
        aria-label="Draft context"
        aria-expanded={expanded}
        aria-controls={id}
        onClick={() => setExpanded(!expanded)}
      >
        {image && <img src={image} alt="" className="composer-context-thumb" />}
        <span className="composer-context-label">
          <span>{title}</span>
          <small>{subtitle}</small>
        </span>
        <ChevronDown size={14} className={expanded ? 'expanded' : ''} />
      </button>
      <div id={id} className="composer-context-details" hidden={!expanded}>
        {image && <img src={image} alt="Captured view" className="composer-context-preview" />}
        {children}
      </div>
    </div>
  );
}
