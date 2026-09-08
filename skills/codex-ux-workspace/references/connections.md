# Workspace and app connection API

Use the origin returned by the launcher. Paths below are relative to `/api`; JSON writes use
`Content-Type: application/json`. Errors contain `{ error, code }`. The current API version is 3.

| Operation                           | Endpoint and body                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| Service identity                    | `GET /health`: service, version, dataRoot, runtimeBuild                        |
| Registered apps                     | `GET /apps`                                                                    |
| Register/update installed web build | `POST /apps` with `{ id, name, distDirectory }`; absolute build path           |
| List/create Workspace               | `GET /workspaces`; `POST /workspaces` with `{ name }`                          |
| Workspace file paths                | `GET /workspaces/:id`                                                          |
| Codex queue availability            | `GET /agents/codex`; does not send a message                                   |
| Invite a new page                   | `POST /connections` with `{ appId, workspaceId, session }`                     |
| Offer an existing page              | `POST /connections` with `{ appId, workspaceId, instanceId, previousSession }` |
| Agent claims offer                  | `POST /connections/:code/connect` with `{ session, replaceSession?: session }` |
| Read receipt                        | `GET /connections/:code`                                                       |
| Page acknowledges/renews            | `POST /connections/:code/accept` with `{ instanceId, currentSession }`         |
| Page disconnects                    | `POST /connections/:code/disconnect` with `{ instanceId }`                     |

Session references are `{ provider: "codex", sessionId }`; `previousSession` and `currentSession`
may be null. The portable protocol does not restrict providers, but this server accepts only the
implemented Codex adapter. IDs for Workspaces and instances are UUIDs. Codes are opaque, local
pairing capabilities: do not publish them. A new-page link has the shape
`/apps/:appId/w/:workspaceId#connect=:code`.

Receipts contain `code`, scope IDs, `previousSession`, requested `session`, `state`, `expiresAt`,
and `confirmedAt`. States are `waiting-agent`, `waiting-page`, `connected`, `disconnected`,
`expired`. An agent must not call the page's accept endpoint to fabricate acknowledgement. Repeated
same-session claims and same-page acknowledgements are idempotent. Another session/page gets 409.
Replacing an existing binding requires its exact previous session; a changed page rejects stale
pairing. Ended receipts reject mutations with 410; missing receipts return 404.

App integration uses `openAppInstance(appId)` and `instance.enableConnections()` from
`@codex-ux/sdk`. Call `instance.select(workspaceId)` when page navigation changes, subscribe to
instance updates to refresh UI, and expose `instance.connections.offer()` for existing-page pairing.
Read the resulting connection/error for user feedback. The SDK removes invitation fragments,
verifies scope and current binding before and after network calls, persists local bindings, and
renews active receipts. Do not implement a workspace-global binding endpoint.

The service is loopback-only trusted local software. Hosted apps and imported code share an origin;
pairing codes do not turn it into a remote authentication service. Receipts are transient memory,
not user project data. Static app registration does not install arbitrary domain API handlers.
