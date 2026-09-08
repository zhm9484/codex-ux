/** Transport-independent references shared by app and agent operations. */
export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}
export interface AppDefinition {
  id: string;
  name: string;
}
export interface AgentSessionRef {
  provider: string;
  sessionId: string;
}
export interface AppInstance {
  id: string;
  appId: string;
  workspaceId: string | null;
}
export interface CollaborationTarget {
  instanceId: string;
  session: AgentSessionRef;
}
/** A short-lived rendezvous, not a workspace-global session binding. */
export interface Connection {
  code: string;
  appId: string;
  workspaceId: string;
  instanceId: string | null;
  previousSession: AgentSessionRef | null;
  session: AgentSessionRef | null;
  state: 'waiting-agent' | 'waiting-page' | 'connected' | 'disconnected' | 'expired';
  expiresAt: string;
  confirmedAt: string | null;
}
export interface RevisionReference {
  workspaceId: string;
  appId: string;
  revisionId: string;
}
export interface ChangeRequest {
  requestId: string;
  baseRevision: string;
  label: string;
}
export interface OperationFailure {
  error: string;
  code: string;
}
export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FeedbackAnchor {
  revisionId: string;
  start: number;
  end: number;
  objectId?: string;
  region?: Region;
}
