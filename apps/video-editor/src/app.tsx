import { Film } from 'lucide-react';
import { WorkspacePicker } from '@codex-ux/editor-ui';
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
        <WorkspacePicker
          appName="Video Editor"
          icon={<Film size={21} />}
          description="Review a video, refine a moment, and collaborate with your agent."
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
      )}
    </AppInstanceContext>
  );
}
