import { Clock3, Check, ArrowUpLeft, Columns2 } from 'lucide-react';
import type { Revision, VideoProject } from '@codex-ux/video-domain';
import { api } from '../lib/api';
import { useState } from 'react';

export function HistoryPanel({
  project,
  disabled,
  onCompare,
  onRestore,
}: {
  project: VideoProject;
  disabled: boolean;
  onCompare: (revision: Revision) => void;
  onRestore: (revision: Revision) => Promise<unknown>;
}) {
  const [error, setError] = useState('');
  const revision = async (id: string, action: (r: Revision) => void | Promise<unknown>) => {
    setError('');
    try {
      const r = await api<Revision>(
        `/workspaces/${project.workspaceId}/apps/video-editor/revisions/${id}`,
      );
      await action(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load version.');
    }
  };
  return (
    <>
      <div className="history-content">
        {error && (
          <p role="alert" className="inline-error">
            {error}
          </p>
        )}
        {project.history.map((r, i) => (
          <article
            className={`history-entry ${r.id === project.revisionId ? 'current' : ''}`}
            key={r.id}
          >
            <div className="history-marker">
              {r.id === project.revisionId ? <Check size={12} /> : <Clock3 size={12} />}
            </div>
            <div className="history-body">
              <div className="history-topline">
                <span>Version {project.history.length - i}</span>
                {r.id === project.revisionId && <span className="current-label">Current</span>}
              </div>
              <strong>{r.label}</strong>
              <p>
                {r.author === 'agent' ? 'Codex' : 'You'} ·{' '}
                {new Date(r.createdAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              {r.id !== project.revisionId && (
                <div className="history-actions">
                  <button className="text-button" onClick={() => void revision(r.id, onCompare)}>
                    <Columns2 size={13} />
                    Compare
                  </button>
                  <button
                    className="text-button"
                    disabled={disabled}
                    onClick={() => void revision(r.id, onRestore)}
                  >
                    <ArrowUpLeft size={13} />
                    Restore
                  </button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
