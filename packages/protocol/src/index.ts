/** Transport-independent references shared by app and agent operations. */
export interface RevisionReference {
  workspaceId: string;
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
