import { VideoStore } from './store.ts';
import { VideoProjects } from '../sources/projects.ts';
import { VideoCollaboration } from './collaboration.ts';
import { RenderJobs } from './jobs.ts';
import { Thumbnails } from './thumbnails.ts';
import type { LibraryStore } from '../storage/library.ts';
import type { WorkspaceStore } from '../storage/workspaces.ts';
export function createVideo(
  root: string,
  origin: string,
  workspaces: WorkspaceStore,
  library: LibraryStore,
) {
  const store = new VideoStore(workspaces);
  const projects = new VideoProjects(root, store);
  const services = {
    library,
    store,
    projects,
    root,
    collaboration: new VideoCollaboration(store, root, origin, projects, library),
    jobs: new RenderJobs(root),
  };
  const thumbnails = new Thumbnails(root, origin);
  return {
    services,
    thumbnails,
    close: async () => {
      await thumbnails.close();
      store.close();
    },
  };
}
