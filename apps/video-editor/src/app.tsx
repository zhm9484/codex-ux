import { useEffect, useState } from 'react';
import type { Workspace } from '@codex-ux/protocol';
import type { BrowserAppInstance } from '@codex-ux/sdk';
import { api, post } from './lib/api';
import { AppInstanceContext } from './lib/app-instance';
import { Editor } from './editor/editor';

const selectedWorkspace = () =>
  /^\/apps\/video-editor\/w\/([\w-]+)$/.exec(location.pathname)?.[1] ?? null;

export function App({ instance }: { instance: BrowserAppInstance }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState<string | null>(selectedWorkspace);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void api<Workspace[]>('/workspaces')
      .then((list) => {
        setWorkspaces(list);
        setLoaded(true);
      })
      .catch((error: unknown) =>
        setError(error instanceof Error ? error.message : 'Could not load workspaces.'),
      );
    const pop = () => {
      const id = selectedWorkspace();
      instance.select(id);
      setActive(id);
    };
    instance.select(selectedWorkspace());
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [instance]);
  function select(id: string) {
    instance.select(id);
    history.pushState(null, '', `/apps/video-editor/w/${id}`);
    setActive(id);
  }
  async function create() {
    setCreating(true);
    setError('');
    try {
      const workspace = await post<Workspace>('/workspaces', { name });
      setWorkspaces((items) => [workspace, ...items]);
      select(workspace.id);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not create the workspace.');
    } finally {
      setCreating(false);
    }
  }
  const exists = workspaces.some((workspace) => workspace.id === active);
  return (
    <AppInstanceContext value={instance}>
      {loaded && active && exists ? (
        <Editor key={active} id={active} workspaces={workspaces} onSelect={select} />
      ) : (
        <main className="workspace-picker">
          <span className="brand-word">Video Editor</span>
          <h1>Choose a workspace</h1>
          {active && loaded && !exists && (
            <p role="alert">This workspace was not found. Choose another workspace.</p>
          )}
          {error && <p role="alert">{error}</p>}
          {!loaded && !error && <p>Loading workspaces…</p>}
          <div className="workspace-list">
            {workspaces.map((workspace) => (
              <button
                className="secondary-button"
                key={workspace.id}
                onClick={() => select(workspace.id)}
              >
                {workspace.name}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label className="field">
              Workspace name
              <input
                value={name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
            <button className="primary-button" disabled={!name.trim() || creating}>
              {creating ? 'Creating…' : 'Create workspace'}
            </button>
          </form>
        </main>
      )}
    </AppInstanceContext>
  );
}
