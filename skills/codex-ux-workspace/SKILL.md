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

## Default opening flow

When asked to open an app, complete startup, pairing, browser opening, and page retention yourself.
The user should receive a usable app connected to this conversation, without copying a code or
opening a URL manually. Follow this order:

1. Start the core service and select/create the intended Workspace below. App and video tools are
   prepared separately; `start` readiness describes the service, not a completed document.
2. Resolve the current task identity and inspect `doctor` without sending a message. Create an
   invitation with `connect --app APP_ID --workspace WORKSPACE_ID` and open its URL immediately in a
   visible page. Prefer the host's in-app browser unless the user chooses another browser.
3. Let the page show preparation and initialize its document. Verify the connection receipt and
   document readiness separately. If browser access is unavailable, `prepare --capability scene` or
   `video` can prepare the selected app before its initialization API. Do not prepare export tools
   merely to open the app.
4. Retain the same page before ending the turn. If delivery is unsupported or identity unavailable,
   open the unbound app URL and explain the missing connection capability; do not block access or
   claim the page is connected. Never invent a session identity.

Reuse an explicitly selected page already connected to this conversation. If it needs pairing,
follow the existing-page flow below using browser tools first. Manual code exchange is a fallback
only when you cannot operate that page; never ask the user to copy a code from a page you just
opened.

## Prepare the service

Resolve this installed skill's absolute directory as `WORKSPACE_SKILL`. Its `assets/runtime.json`
contains the versioned local service. App skills carry their own built web files and `app.json`. Use
the JavaScript launcher below with `node`. It selects Node 24 once and reuses it, preparing a pinned
version when necessary. `--help` and `preflight` work before service preparation. A working Node/npm
installation and network are needed for first setup; Node 18 can run the bootstrap. Do not clone or
build the development repository for end users.

```sh
node "$WORKSPACE_SKILL/scripts/workspace.mjs" start --app "$APP_SKILL/app.json"
node "$WORKSPACE_SKILL/scripts/workspace.mjs" workspaces
node "$WORKSPACE_SKILL/scripts/workspace.mjs" create --name "My project"
```

`start` verifies and caches the app's bundled web files, prepares only pinned core dependencies,
registers the app, and starts or reuses a matching service. It returns JSON with the actual origin
and app URL. Use that origin throughout the task; never assume a fixed port. Startup automatically
selects an available port, preferring the last successful one on restart. Use `--port` or
`CODEX_UX_PORT` only when a fixed port is needed (`0` restores automatic selection). Reuse the
user's specified Workspace; create one for a new work item when appropriate. Do not silently choose
a similarly named Workspace. Creating a Workspace does not initialize any app's document. Read the
relevant app skill for that step.

The default data root is `~/.codex-ux/`; runtime dependencies are cached separately under
`~/.cache/codex-ux/`. `CODEX_UX_DATA_DIR`, `CODEX_UX_CACHE_DIR`, `CODEX_UX_PORT`, and
`CODEX_UX_CHROME` override these defaults. Pass the same data root to later launcher commands. Keep
user content out of skill installation directories. Never edit app-private databases, blobs, or
prepared previews. Get actual working paths through `GET /api/workspaces/:id` and app APIs.

## Get a usable service address

Use `start --app "$APP_SKILL/app.json"` as the normal entry point. It is idempotent: it starts a
service if needed or reuses a matching live one, then returns verified `origin`, `apiBase`, and
`url`. Do not ask the user for a port or read/edit `runtime.json` manually.

To recover the address later without starting anything:

```sh
node "$WORKSPACE_SKILL/scripts/workspace.mjs" locate
```

Keep the same `--data-dir` or `CODEX_UX_DATA_DIR` across calls. Success is JSON on stdout with
`state: "ready"`; discovery failures exit nonzero and emit JSON on stderr with `error.code`, the
exact data root, and recovery instructions/command arguments. For `service_not_started`,
`service_unreachable`, `service_record_invalid`, or `service_mismatch`, run `start` once for that
same root (include the intended app manifest), then use the newly returned address. If the same
failure persists, report the code and log path; do not guess ports, scan directories, or silently
switch to another data root. For `runtime_mismatch` or `service_restart_required`, run `inspect`.
When restart is authorized, run `restart --app APP_JSON`; it prepares core before stopping and
refuses to interrupt active work. `stop` performs a verified normal shutdown. Only legacy services
lacking this endpoint require their original terminal. Do not automatically stop active work merely
to open another app.

If an HTTP operation fails after a restart, run `locate` and refresh the address. Retry a read with
the new origin; for a mutation, check its recorded result before retrying to avoid duplicates. Never
reuse an old pairing code after a service restart; request a fresh one.

## Connect this conversation

First run `doctor` to inspect Codex delivery support without sending a message:

```sh
node "$WORKSPACE_SKILL/scripts/workspace.mjs" doctor
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
node "$WORKSPACE_SKILL/scripts/workspace.mjs" connect --app video-editor --workspace WORKSPACE_ID
```

Open the returned `url` in a **new browser page** using the host's browser-opening capability. The
fragment carries a single-page invitation; do not open it in multiple pages. The actual page accepts
it and reports its instance ID. Query the receipt after opening:

```sh
node "$WORKSPACE_SKILL/scripts/workspace.mjs" status --code CONNECTION_CODE
```

Only report the page as connected after `state` is `connected` and the returned app, Workspace,
instance, and session match the intended target. An unopened URL remains `waiting-page`. Poll
briefly if needed; after 30 seconds explain what is waiting rather than declaring success. The
receipt confirms browser binding, not successful message delivery.

For an explicitly selected existing page, use available browser tools to open **Agent connection**,
choose **Connect current agent**, and read its connection code yourself. Run
`connect --code CONNECTION_CODE` and check its receipt. Only when browser access is unavailable, ask
the user to choose **Connect current agent** and provide the code. This targets that page, even if
other pages display the same Workspace. Never write browser session storage yourself.

If the page belongs to another session, prefer a new page. Only for a user-requested takeover, read
the receipt and pass `--replace-session PREVIOUS_SESSION_ID` with the connect command. A changed
binding requires a fresh code; do not retry with guessed replacement identities.

Connecting does not send notes, change the agent's working directory, or grant permission to send
messages. Users choose which feedback to send in the app. Switching Workspaces or disconnecting
cannot retarget already submitted requests.

## Keep the editor available between turns

A collaborative app is a user-facing deliverable, not a temporary inspection tab. In Codex's in-app
browser, agent-created tabs close when the turn ends unless retained. After opening and verifying
this app, call `await tab.markDeliverable()` on its browser handle. The mark is turn-scoped: repeat
it in later turns that use the app and must leave it available. Use `markHandoff()` only for
temporary work to continue next turn, not as the final delivery of the editor. Follow the active
browser tool's retention API if its interface differs; a visible tab or a link in the final answer
does not replace retention. Do not close the user's editor during test-tab cleanup.

Leave the detached Workspace service running for ongoing playback, notes, and feedback. Do not stop
it just because the agent's current response is complete. Service lifetime and tab lifetime are
separate: keeping one alive does not preserve the other. In later turns reuse the retained page; if
it was closed, create a fresh invitation for the same Workspace and current conversation instead of
asking the user to repair the connection. Do not reuse a consumed invitation URL.

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
