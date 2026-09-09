import { SceneStore } from './store.ts';
import { SceneProjects } from './projects.ts';
import { SceneCollaboration } from './collaboration.ts';
import type { LibraryStore } from '../storage/library.ts';
import type { WorkspaceStore } from '../storage/workspaces.ts';
export function createScene(origin: string, workspaces: WorkspaceStore, library: LibraryStore) {
  const store = new SceneStore(workspaces);
  const projects = new SceneProjects(store);
  return {
    services: { projects, collaboration: new SceneCollaboration(projects, origin, library) },
    close: () => store.close(),
  };
}
