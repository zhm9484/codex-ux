import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Check, X, Film } from 'lucide-react';
import { durationOf, formatTime, type ExportJob, type VideoProject } from '@codex-ux/video-domain';
import { api, post } from '../lib/api';
import { IconButton } from '../components/ui';

export function ExportDialog({ project, onClose }: { project: VideoProject; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    if (!job || job.state !== 'rendering') return;
    const timer = setInterval(() => {
      void api<ExportJob>(`/workspaces/${project.workspaceId}/apps/video-editor/exports/${job.id}`)
        .then(setJob)
        .catch((error: unknown) => {
          setError(error instanceof Error ? error.message : 'Could not check export.');
        });
    }, 2000);
    return () => clearInterval(timer);
  }, [job, project.workspaceId]);

  async function start() {
    setBusy(true);
    setError('');
    try {
      setJob(
        await post<ExportJob>(`/workspaces/${project.workspaceId}/apps/video-editor/exports`, {
          revisionId: project.revisionId,
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not start export.');
    } finally {
      setBusy(false);
    }
  }

  const document = project.revision.document;
  return (
    <dialog
      ref={dialog}
      className="export-dialog"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-top">
        <span className="section-caption">THE FINISHING TOUCH</span>
        <IconButton label="Close export" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </div>
      <div className="export-symbol">
        {job?.state === 'complete' ? <Check size={26} /> : <Film size={26} />}
      </div>
      <h2>{job?.state === 'complete' ? 'Ready to share.' : 'Take it with you.'}</h2>
      <p className="dialog-description">A finished video, from this exact version.</p>
      <div className="export-specs">
        <span>{project.name}</span>
        <span>
          {document.width} × {document.height}
        </span>
        <span>
          {formatTime(durationOf(document))} · {document.fps} fps · MP4
        </span>
      </div>
      {(error || job?.error) && (
        <p className="inline-error" role="alert">
          {error || job?.error}
        </p>
      )}
      {job?.state === 'complete' ? (
        <a className="primary-button full-width" href={job.url} download={`${project.name}.mp4`}>
          <ArrowDownToLine size={15} />
          Download video
        </a>
      ) : (
        <button
          className="primary-button full-width"
          disabled={busy || job?.state === 'rendering'}
          onClick={() => void start()}
        >
          {job?.state === 'rendering' ? (
            <>
              <span className="loading-dot" />
              Rendering your video…
            </>
          ) : busy ? (
            'Starting…'
          ) : (
            'Export video'
          )}
        </button>
      )}
      <p className="panel-footnote">Rendered locally with HyperFrames.</p>
    </dialog>
  );
}
