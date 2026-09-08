import type { ReactNode } from 'react';
import type { Workspace } from '@codex-ux/protocol';
import { ArrowRight, FolderOpen } from 'lucide-react';

export function WorkspacePicker({
  appName,
  icon,
  description,
  workspaces,
  loaded,
  error,
  missing,
  name,
  onName,
  creating,
  onCreate,
  onSelect,
}: {
  appName: string;
  icon: ReactNode;
  description: string;
  workspaces: Workspace[];
  loaded: boolean;
  error: string;
  missing: boolean;
  name: string;
  onName: (name: string) => void;
  creating: boolean;
  onCreate: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <main className="workspace-picker">
      <div className="workspace-wordmark">
        {icon}
        <span>{appName}</span>
        <small>by Codex UX</small>
      </div>
      <h1>Choose a workspace</h1>
      <p className="workspace-intro">{description}</p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      {missing && <p role="alert">This workspace was not found. Choose another or create one.</p>}
      {!loaded && !error && <p role="status">Loading workspaces…</p>}
      <div className="workspace-list">
        {workspaces.map((workspace) => (
          <button
            className="secondary-button"
            key={workspace.id}
            onClick={() => onSelect(workspace.id)}
          >
            <FolderOpen size={16} />
            <span>{workspace.name}</span>
            <ArrowRight size={15} />
          </button>
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate();
        }}
      >
        <label className="field">
          Workspace name
          <input
            value={name}
            maxLength={100}
            onChange={(event) => onName(event.target.value)}
            required
            placeholder="Give your workspace a name"
          />
        </label>
        <button className="primary-button" disabled={!name.trim() || creating}>
          {creating ? 'Creating…' : 'Create workspace'}
        </button>
      </form>
    </main>
  );
}
