---
name: codex-ux-workspace
description:
  Prepare local Codex UX workspaces, launch installed apps, and connect a specific app page to the
  current agent session. Use when another Codex UX app skill requires a workspace or when the user
  wants to open, connect, or reuse one. Does not manage Codex repository projects or create agent
  conversations.
---

# Codex UX Workspace

A Workspace is a persistent file container shared by people, agents, and apps. An app instance is
one browser page. Each page remembers its own session binding for each Workspace. A Workspace is not
the agent's current directory, a Codex project, or a conversation. One does not implicitly select or
create the others.

## Prepare and open

Resolve this installed skill's absolute directory as `WORKSPACE_SKILL`. Its `assets/runtime.json`
contains the versioned local service. App skills carry their own built web files and `app.json`. Use
the launcher below with Node.js 24. If that version is unavailable, use
`npx --yes --package node@24.19.0 node` in place of `node`; npm/npx and network access are required
for first-time preparation. Do not clone or build the development repository for end users.

```sh
node "$WORKSPACE_SKILL/scripts/workspace.ts" start --app "$APP_SKILL/app.json"
node "$WORKSPACE_SKILL/scripts/workspace.ts" workspaces
node "$WORKSPACE_SKILL/scripts/workspace.ts" create --name "My project"
```

`start` verifies and caches the app's bundled web files, prepares pinned dependencies and Chromium
when needed, registers the app, and starts or reuses a matching service. It returns JSON with the
actual origin and app URL. Use that origin throughout the task; never assume a fixed port. Startup
automatically selects an available port, preferring the last successful one on restart. Use `--port`
or `CODEX_UX_PORT` only when a fixed port is needed (`0` restores automatic selection). Reuse the
user's specified Workspace; create one for a new work item when appropriate. Do not silently choose
a similarly named Workspace. Creating a Workspace does not initialize any app's document. Read the
relevant app skill for that step.

The default data root is `~/.codex-ux/`; runtime dependencies are cached separately under
`~/.cache/codex-ux/`. `CODEX_UX_DATA_DIR`, `CODEX_UX_CACHE_DIR`, `CODEX_UX_PORT`, and
`CODEX_UX_CHROME` override these defaults. Pass the same data root to later launcher commands. Keep
user content out of skill installation directories. Never edit app-private databases, blobs, or
prepared previews. Get actual working paths through `GET /api/workspaces/:id` and app APIs.

## Connect this conversation

First run `doctor` to inspect Codex delivery support without sending a message:

```sh
node "$WORKSPACE_SKILL/scripts/workspace.ts" doctor
```

Only Codex delivery is implemented. Other agents may edit files and use HTTP, but must not claim
they can receive app-submitted feedback. A compatible Codex executable must support
`queue --thread --message`; `CODEX_UX_CODEX_BIN` can select one before service startup. Queue
capability is separate from session identity and successful delivery.

Use the current task's authoritative ID from the agent environment. The launcher defaults to
`CODEX_THREAD_ID`; pass `--session ID` when the current host explicitly supplies the ID or the user
provides a task link. In nested agent processes, an inherited environment variable may refer to the
parent: use the actual current task identity. If identity is unavailable or ambiguous, ask for the
current task link. Never select the most recent task, create a new conversation merely to connect,
or use a directory name as a session ID.

For a new app page:

```sh
node "$WORKSPACE_SKILL/scripts/workspace.ts" connect --app video-editor --workspace WORKSPACE_ID
```

Open the returned `url` in a **new browser page** using the host's browser-opening capability. The
fragment carries a single-page invitation; do not open it in multiple pages. The actual page accepts
it and reports its instance ID. Query the receipt after opening:

```sh
node "$WORKSPACE_SKILL/scripts/workspace.ts" status --code CONNECTION_CODE
```

Only report the page as connected after `state` is `connected` and the returned app, Workspace,
instance, and session match the intended target. An unopened URL remains `waiting-page`. Poll
briefly if needed; after 30 seconds explain what is waiting rather than declaring success. The
receipt confirms browser binding, not successful message delivery.

For an existing page, ask the user to choose **Connect current agent** in that app and provide its
connection code, unless an already available browser tool can obtain the code from the explicitly
selected page. Then run `connect --code CONNECTION_CODE` and check its receipt. This targets that
page, even if other pages display the same Workspace. Never write browser session storage yourself.

If the page belongs to another session, prefer a new page. Only for a user-requested takeover, read
the receipt and pass `--replace-session PREVIOUS_SESSION_ID` with the connect command. A changed
binding requires a fresh code; do not retry with guessed replacement identities.

Connecting does not send notes, change the agent's working directory, or grant permission to send
messages. Users choose which feedback to send in the app. Switching Workspaces or disconnecting
cannot retarget already submitted requests.

## Recovery and updates

Pairing codes expire after 10 minutes. Confirmed receipts expire after 90 seconds without page
acknowledgement; a closed, suspended, or disconnected page is not proof of an active connection.
Saved session bindings survive reload independently. Generate a fresh code when a receipt expires or
the service restarts. Switching Workspaces ends the previous active receipt but preserves that
Workspace's saved binding.

Install Workspace and app skills from the same source/ref. Their runtime fingerprints must match.
Updates never rewrite Workspace data, and the launcher does not kill a running service to replace
it. For a version mismatch, finish active work and stop that specific service normally before
starting the new version. Do not remove the data root to resolve an installation error.

For exact HTTP contracts and adding another app, read [connections.md](references/connections.md).
