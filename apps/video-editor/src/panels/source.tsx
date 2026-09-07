import { useState } from 'react';
import type { EditorState } from '../hooks/use-editor';
import { PanelHeader } from '../components/ui';
export function SourcePanel({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const [path, setPath] = useState('');
  return (
    <>
      <PanelHeader
        title="Video source"
        detail={state.project!.revision.document.source.kind}
        onClose={onClose}
      />
      <div className="source-content assets-content">
        <p>Edit the working files to update this video. Each accepted save becomes a version.</p>
        <code style={{ overflowWrap: 'anywhere' }}>{state.project?.source?.directory}</code>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void state.importSource(path);
          }}
        >
          <label className="field">
            Project directory or video file
            <input
              aria-label="Source path"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/absolute/path/to/project"
            />
          </label>
          <button className="secondary-button" disabled={state.saving || !path.trim()}>
            Import source
          </button>
        </form>
        <label className="field">
          Replace with a video
          <input
            aria-label="Replace video"
            type="file"
            accept="video/mp4,video/webm"
            disabled={state.saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void state.replaceMedia(file);
              event.target.value = '';
            }}
          />
        </label>
        <p>
          Import Hyperframes or Remotion source, or an MP4 / WebM. Imports copy files into this
          workspace; earlier versions remain available.
        </p>
      </div>
    </>
  );
}
