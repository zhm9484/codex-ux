import { randomBytes } from 'node:crypto';
import type { AgentSessionRef, Connection } from '@codex-ux/protocol';
import { HttpError } from './errors.ts';

const equal = (a: AgentSessionRef | null, b: AgentSessionRef | null) =>
  a?.provider === b?.provider && a?.sessionId === b?.sessionId;

/** Ephemeral pairing receipts. Pages remain the owners of their bindings. */
export class Connections {
  private entries = new Map<string, Connection>();
  private now: () => number;
  constructor(now = Date.now) {
    this.now = now;
  }
  create(input: {
    appId: string;
    workspaceId: string;
    instanceId?: string;
    previousSession?: AgentSessionRef | null;
    session?: AgentSessionRef;
  }): Connection {
    this.prune();
    if (this.entries.size >= 1000) throw new HttpError(429, 'Too many pending connections.');
    const connection: Connection = {
      code: randomBytes(18).toString('base64url'),
      appId: input.appId,
      workspaceId: input.workspaceId,
      instanceId: input.instanceId ?? null,
      previousSession: input.previousSession ?? null,
      session: input.session ?? null,
      state: input.session ? 'waiting-page' : 'waiting-agent',
      expiresAt: new Date(this.now() + 10 * 60_000).toISOString(),
      confirmedAt: null,
    };
    this.entries.set(connection.code, connection);
    return structuredClone(connection);
  }
  get(code: string): Connection {
    const connection = this.entries.get(code);
    if (!connection) throw new HttpError(404, 'Connection not found. Create a new connection.');
    if (Date.parse(connection.expiresAt) <= this.now()) connection.state = 'expired';
    return structuredClone(connection);
  }
  connect(code: string, session: AgentSessionRef, replaceSession: AgentSessionRef | null) {
    const connection = this.active(code);
    if (connection.session) {
      if (!equal(connection.session, session))
        throw new HttpError(409, 'Connection already claimed.');
      return this.get(code);
    }
    if (
      connection.previousSession &&
      !equal(connection.previousSession, session) &&
      !equal(connection.previousSession, replaceSession)
    )
      throw new HttpError(
        409,
        'This page is bound to another session. Open a new page or explicitly replace that session.',
      );
    connection.session = session;
    connection.state = 'waiting-page';
    return this.get(code);
  }
  accept(code: string, instanceId: string, currentSession: AgentSessionRef | null) {
    const connection = this.active(code);
    if (connection.instanceId && connection.instanceId !== instanceId)
      throw new HttpError(409, 'Connection belongs to another page.');
    if (!connection.session) throw new HttpError(409, 'The agent has not connected yet.');
    if (
      !equal(currentSession, connection.previousSession) &&
      !equal(currentSession, connection.session)
    )
      throw new HttpError(409, 'The page connection changed during pairing.');
    connection.instanceId = instanceId;
    connection.state = 'connected';
    connection.confirmedAt = new Date(this.now()).toISOString();
    connection.expiresAt = new Date(this.now() + 90_000).toISOString();
    return this.get(code);
  }
  disconnect(code: string, instanceId: string) {
    const connection = this.get(code);
    if (connection.instanceId !== instanceId)
      throw new HttpError(409, 'Connection belongs to another page.');
    this.entries.get(code)!.state = 'disconnected';
    return this.get(code);
  }
  private active(code: string) {
    const connection = this.get(code);
    if (connection.state === 'expired' || connection.state === 'disconnected')
      throw new HttpError(410, 'Connection ended. Create a new connection.');
    return this.entries.get(code)!;
  }
  private prune() {
    for (const [code, connection] of this.entries)
      if (Date.parse(connection.expiresAt) + 10 * 60_000 <= this.now()) this.entries.delete(code);
  }
}
