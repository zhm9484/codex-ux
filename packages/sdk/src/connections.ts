import type { AgentSessionRef, Connection } from '@codex-ux/protocol';
import type { BrowserAppInstance } from './index.ts';

const equal = (a: AgentSessionRef | null, b: AgentSessionRef | null) =>
  a?.provider === b?.provider && a?.sessionId === b?.sessionId;

/** Browser-side pairing shared by all apps. A receipt is accepted only by the intended page. */
export class InstanceConnections {
  private instance: BrowserAppInstance;
  private base: string;
  private storageKey: string;
  private busy = false;
  private pending: Promise<unknown> = Promise.resolve();
  private invitation: string | null;
  connection: Connection | null = null;
  error = '';
  constructor(instance: BrowserAppInstance, base: string) {
    this.instance = instance;
    this.base = base;
    this.storageKey = `codex-ux:connection:${instance.context.id}`;
    this.invitation = new URLSearchParams(location.hash.slice(1)).get('connect');
    if (this.invitation)
      history.replaceState(history.state, '', location.pathname + location.search);
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(this.storageKey) ?? 'null',
      ) as Connection | null;
      if (saved?.instanceId === instance.context.id && /^[\w-]{24}$/.test(saved.code))
        this.connection = saved;
    } catch {
      /* A malformed receipt does not restore a connection. */
    }
    instance.subscribe(() => {
      void this.poll();
    });
    const timer = window.setInterval(() => {
      void this.poll();
    }, 2000);
    window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
  }
  offer() {
    return this.exclusive(() => this.createOffer());
  }
  private exclusive<T>(work: () => Promise<T>) {
    const task = this.pending.catch(() => {}).then(work);
    this.pending = task;
    return task;
  }
  private async createOffer() {
    const { id, appId, workspaceId } = this.instance.context;
    if (!workspaceId) throw new Error('Select a workspace first.');
    const current = this.instance.session(workspaceId);
    const connection = await this.request('/connections', {
      appId,
      workspaceId,
      instanceId: id,
      previousSession: current,
    });
    if (
      workspaceId !== this.instance.context.workspaceId ||
      !equal(current, this.instance.session(workspaceId))
    )
      throw new Error('The page changed. Create a new connection code.');
    await this.release();
    this.connection = connection;
    this.error = '';
    this.save();
    return connection;
  }
  private async request(path: string, body?: unknown): Promise<Connection> {
    const response = await fetch(this.base + path, {
      signal: AbortSignal.timeout(10_000),
      ...(body === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    const result = (await response.json()) as Connection & { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'Connection request failed.');
    return result;
  }
  private async release() {
    const previous = this.connection;
    this.connection = null;
    if (previous?.instanceId === this.instance.context.id)
      await this.request(`/connections/${previous.code}/disconnect`, {
        instanceId: previous.instanceId,
      }).catch(() => {});
  }
  private async poll() {
    if (this.busy || !this.instance.context.workspaceId) return;
    this.busy = true;
    try {
      await this.exclusive(() => this.update());
    } finally {
      this.busy = false;
    }
  }
  private async update() {
    try {
      const scope = this.instance.context;
      const workspaceId = scope.workspaceId!;
      const current = this.instance.session(workspaceId);
      if (this.invitation) {
        const code = this.invitation;
        this.invitation = null;
        const next = await this.request(`/connections/${code}`);
        if (next.appId !== scope.appId || next.workspaceId !== workspaceId)
          throw new Error('This connection link belongs to another app or workspace.');
        if (current && !equal(current, next.session))
          throw new Error(
            'This page already has another session. Open the connection link in a new page.',
          );
        await this.release();
        this.connection = next;
      }
      const previous = this.connection;
      if (!previous) return;
      const expected = previous.state === 'connected' ? previous.session : previous.previousSession;
      if (previous.workspaceId !== workspaceId || !equal(current, expected)) {
        await this.release();
        this.save();
        return;
      }
      let next = await this.request(`/connections/${previous.code}`);
      if (next.state === 'expired' || next.state === 'disconnected') {
        this.connection = null;
        this.error =
          'Connection receipt expired. The saved session is unchanged; create a new code to confirm this page again.';
        this.save();
        return;
      }
      if (next.session) {
        // Check again after network I/O, before accepting or changing the local binding.
        if (
          this.instance.context.workspaceId !== workspaceId ||
          !equal(current, this.instance.session(workspaceId))
        )
          return;
        next = await this.request(`/connections/${next.code}/accept`, {
          instanceId: scope.id,
          currentSession: current,
        });
        this.connection = next;
        if (
          this.instance.context.workspaceId !== workspaceId ||
          !equal(current, this.instance.session(workspaceId))
        ) {
          await this.release();
          this.save();
          return;
        }
        this.instance.bind(workspaceId, next.session);
      } else this.connection = next;
      this.error = '';
      this.save();
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not connect this page.';
      this.instance.notify();
    }
  }
  private save() {
    if (this.connection) sessionStorage.setItem(this.storageKey, JSON.stringify(this.connection));
    else sessionStorage.removeItem(this.storageKey);
    this.instance.notify();
  }
}
