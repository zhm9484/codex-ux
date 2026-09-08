import type { AgentSessionRef, AppInstance, CollaborationTarget } from '@codex-ux/protocol';
import { InstanceConnections } from './connections.ts';
export { InstanceConnections } from './connections.ts';

interface InstanceState {
  instance: AppInstance;
  bindings: Record<string, AgentSessionRef>;
}

/** One browser page owns an instance; only its own reload/history may restore bindings. */
export class BrowserAppInstance {
  private state: InstanceState;
  private key: string;
  private listeners = new Set<() => void>();
  connections: InstanceConnections | null = null;
  enableConnections(apiBase = '/api') {
    this.connections ??= new InstanceConnections(this, apiBase);
    return this.connections;
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  notify() {
    for (const listener of this.listeners) listener();
  }
  constructor(state: InstanceState, key: string) {
    this.state = state;
    this.key = key;
    this.persist();
  }
  get context(): AppInstance {
    return { ...this.state.instance };
  }
  select(workspaceId: string | null) {
    this.state.instance.workspaceId = workspaceId;
    this.persist();
  }
  session(workspaceId: string): AgentSessionRef | null {
    const session = this.state.bindings[workspaceId];
    return session ? { ...session } : null;
  }
  bind(workspaceId: string, session: AgentSessionRef | null) {
    if (workspaceId !== this.state.instance.workspaceId)
      throw new Error('Select the workspace before connecting an agent session.');
    if (session) this.state.bindings[workspaceId] = { ...session };
    else delete this.state.bindings[workspaceId];
    this.persist();
  }
  target(workspaceId: string): CollaborationTarget {
    if (workspaceId !== this.state.instance.workspaceId)
      throw new Error('The application has switched workspaces.');
    const session = this.session(workspaceId);
    if (!session) throw new Error('Connect an agent session before sending feedback.');
    return { instanceId: this.state.instance.id, session };
  }
  private persist() {
    sessionStorage.setItem(this.key, JSON.stringify(this.state));
    this.notify();
  }
}

function restored(key: string, appId: string): InstanceState | null {
  const navigation = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  if (navigation?.type !== 'reload' && navigation?.type !== 'back_forward') return null;
  try {
    const data = JSON.parse(sessionStorage.getItem(key) ?? 'null') as InstanceState | null;
    if (
      !data ||
      data.instance?.appId !== appId ||
      typeof data.instance.id !== 'string' ||
      !data.bindings ||
      typeof data.bindings !== 'object'
    )
      return null;
    if (data.instance.workspaceId !== null && typeof data.instance.workspaceId !== 'string')
      return null;
    for (const session of Object.values(data.bindings)) {
      if (!session || typeof session.provider !== 'string' || typeof session.sessionId !== 'string')
        return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function claim(id: string): Promise<boolean> {
  // A copied tab must not restore an instance still owned by another live page.
  if (!navigator.locks) return false;
  return new Promise<boolean>((resolve, reject) => {
    void navigator.locks
      .request(`codex-ux:instance:${id}`, { ifAvailable: true }, (lock) => {
        if (!lock) {
          resolve(false);
          return;
        }
        resolve(true);
        return new Promise<void>((release) =>
          window.addEventListener('pagehide', () => release(), { once: true }),
        );
      })
      .catch(reject);
  });
}

export async function openAppInstance(appId: string): Promise<BrowserAppInstance> {
  const key = `codex-ux:app-instance:${appId}`;
  const saved = restored(key, appId);
  if (saved && (await claim(saved.instance.id))) return new BrowserAppInstance(saved, key);
  const state: InstanceState = {
    instance: { id: crypto.randomUUID(), appId, workspaceId: null },
    bindings: {},
  };
  await claim(state.instance.id);
  return new BrowserAppInstance(state, key);
}

export { WorkspaceLibrary } from './library.ts';
export type { LocalDirectory } from './library.ts';
