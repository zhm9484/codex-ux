import { WorkspacePicker } from '@codex-ux/editor-ui';
import { useEffect, useState } from 'react';
import type { Workspace } from '@codex-ux/protocol';
import type { BrowserAppInstance } from '@codex-ux/sdk';
import { Box } from 'lucide-react';
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
      />
    );
  return (
    <WorkspacePicker
      appName="3D Space"
      icon={<Box size={21} />}
      description="Bring objects into a space and shape it with your agent."
      workspaces={workspaces}
      loaded={loaded}
      error={error}
      missing={!!active && loaded && !workspaces.some((w) => w.id === active)}
      name={name}
      onName={setName}
      creating={creating}
      onCreate={() => void create()}
      onSelect={select}
    />
  );
}
