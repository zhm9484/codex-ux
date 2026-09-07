import { useEffect, useState } from 'react';
import type { WorkspaceSummary } from '@codex-ux/video-domain';
import { api } from './lib/api';
import { Editor } from './editor/editor';

export function App() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [active, setActive] = useState<string | null>(
    () => /^\/w\/([\w-]+)/.exec(location.pathname)?.[1] ?? null,
  );
  const [error, setError] = useState('');
  useEffect(() => {
    void api<WorkspaceSummary[]>('/workspaces')
      .then((list) => {
        setWorkspaces(list);
        setActive((id) =>
          list.some((workspace) => workspace.id === id) ? id : (list[0]?.id ?? null),
        );
      })
      .catch((error: unknown) =>
        setError(
          error instanceof Error ? error.message : 'Could not connect to the local service.',
        ),
      );
    const pop = () => setActive(/^\/w\/([\w-]+)/.exec(location.pathname)?.[1] ?? null);
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  function select(id: string) {
    setActive(id);
    history.pushState(null, '', `/w/${id}`);
  }
  const workspaceId = active ?? workspaces[0]?.id;
  if (!workspaceId)
    return (
      <main className="app-loading">
        <span className="brand-word">video-editor</span>
        <h1>A little room to create.</h1>
        <p>{error || 'Opening your local workspace…'}</p>
        {error && (
          <button className="secondary-button" onClick={() => location.reload()}>
            Try again
          </button>
        )}
      </main>
    );
  return <Editor key={workspaceId} id={workspaceId} workspaces={workspaces} onSelect={select} />;
}
