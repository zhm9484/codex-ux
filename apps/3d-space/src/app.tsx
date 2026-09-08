import { useEffect, useState } from 'react';
import type { Workspace } from '@codex-ux/protocol';
import type { BrowserAppInstance } from '@codex-ux/sdk';
import { ArrowRight, Box, FolderOpen, LoaderCircle } from 'lucide-react';
import { api, errorMessage } from './api';
import { Editor } from './editor';

const selectedWorkspace = () =>
  /^\/apps\/3d-space\/w\/([\w-]+)$/.exec(location.pathname)?.[1] ?? null;
export function App({ instance }: { instance: BrowserAppInstance }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState<string | null>(selectedWorkspace);
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void api<Workspace[]>('/workspaces')
      .then((list) => {
        if (alive) {
          setWorkspaces(list);
          setLoaded(true);
        }
      })
      .catch((error: unknown) => {
        if (alive) setError(errorMessage(error));
      });
    const pop = () => {
      const id = selectedWorkspace();
      instance.select(id);
      setActive(id);
    };
    instance.select(selectedWorkspace());
    window.addEventListener('popstate', pop);
    return () => {
      alive = false;
      window.removeEventListener('popstate', pop);
    };
  }, [instance]);
  function select(id: string | null) {
    instance.select(id);
    history.pushState(null, '', `/apps/3d-space/${id ? `w/${id}` : ''}`);
    setActive(id);
  }
  async function create() {
    setCreating(true);
    setError('');
    try {
      const workspace = await api<Workspace>('/workspaces', { name: name.trim() });
      setWorkspaces((list) => [workspace, ...list]);
      select(workspace.id);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }
  if (loaded && active && workspaces.some((workspace) => workspace.id === active))
    return (
      <Editor
        key={active}
        id={active}
        instance={instance}
        workspaces={workspaces}
        onSelect={select}
        onLeave={() => select(null)}
      />
    );
  return (
    <main className="workspace-page">
      <div className="workspace-wordmark">
        <Box size={21} strokeWidth={1.5} />
        3D Space<span>by Codex UX</span>
      </div>
      <div className="workspace-art" aria-hidden="true">
        <div className="art-orbit" />
        <div className="art-sphere" />
        <div className="art-block" />
      </div>
      <section className="workspace-card">
        <p className="eyebrow">A SPACE FOR YOUR IDEAS</p>
        <h1>Make a little world.</h1>
        <p className="workspace-intro">
          Bring things in. Move them around.
          <br />
          Create something together with your agent.
        </p>
        {error && (
          <p className="picker-error" role="alert">
            {error}
          </p>
        )}
        {active && loaded && !workspaces.some((workspace) => workspace.id === active) && (
          <p className="picker-error" role="alert">
            That workspace was not found. Choose another or create one.
          </p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <label htmlFor="workspace-name">Start a new space</label>
          <div className="workspace-input">
            <input
              id="workspace-name"
              placeholder="Give your workspace a name"
              value={name}
              maxLength={100}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <button aria-label="Create workspace" disabled={!name.trim() || creating}>
              {creating ? <LoaderCircle className="spin" size={18} /> : <ArrowRight size={19} />}
            </button>
          </div>
        </form>
        {!loaded && !error && <p className="panel-caption">Loading workspaces…</p>}
        {!!workspaces.length && (
          <div className="recent-workspaces">
            <span className="section-caption">OR PICK UP WHERE YOU LEFT OFF</span>
            {workspaces.map((workspace) => (
              <button key={workspace.id} onClick={() => select(workspace.id)}>
                <FolderOpen size={16} />
                <span>{workspace.name}</span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
