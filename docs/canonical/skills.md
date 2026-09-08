# Installable skills

The public skills live in `skills/`, separate from repository-development skills in
`.agents/skills/`. Install the pair with Node.js 24 and npm/npx available:

```sh
npx skills add zhm9484/codex-ux --skill codex-ux-workspace codex-ux-video-editor
```

The installer can select agents and project/global scope. App and Workspace skills must come from
the same repository/ref. Local or branch installs use that source for both. Each app explicitly
requires the Workspace skill; a missing companion must be installed before startup. No
installer-specific automatic dependency resolution is assumed.

## Shipped artifacts

- `codex-ux-workspace` contains the startup/connection CLI and `assets/runtime.json`, a
  fingerprinted bundle of the service's TypeScript source, workspace packages, pinned package
  manifests/lockfile, and project license. It does not include platform-specific node_modules or
  user data.
- `codex-ux-video-editor` contains its built web application in `dist/`, upstream web license
  notices, `app.json`, and source/collaboration guidance. Users do not build the frontend after
  installing.

Scene installs with `--skill codex-ux-workspace codex-ux-scene-3d`. Its skill similarly ships
`dist/`, license notices and `app.json`, plus Three.js source and spatial collaboration guidance.
Both apps can be registered with the same Workspace runtime; their fingerprints are generated
together.

`pnpm build` builds both frontends and runs `scripts/build-skills.ts` to regenerate these artifacts.
`pnpm build:skills` is the same complete build. The generated runtime and web files are committed
because skill installation copies repository content. CI rebuilds and rejects differences in the
shipped artifacts. Author code in the normal packages/apps, never edit generated artifacts directly.
Keep skill instructions in English; use the user's language in agent responses.

## Startup and ownership

The Workspace launcher runs with Node.js 24. If unavailable, the skill instructs agents to use
`npx --yes --package node@24.19.0 node` to run it. First-time preparation needs npm/npx and network
access. `start --app /absolute/installed/app.json` verifies the runtime fingerprint, extracts the
bundle into a disposable versioned cache, installs production dependencies with the frozen pnpm
10.34.5 lockfile, and locates or downloads Chromium. Trusted runtime dependency builds follow the
workspace allowlist; user source dependency installs still disable lifecycle scripts.

By default, runtime caches use `~/.cache/codex-ux/`, independently of `~/.codex-ux/` Workspace data.
`CODEX_UX_CACHE_DIR` overrides the cache. `installed-apps.json` under the data root remembers hosted
app cache paths; `launcher.lock` serializes setup for that root. App web files are checked against
the manifest's content fingerprint and copied to immutable cache directories before registration, so
replacing installed skill files cannot change the running build. A live service can register another
app without restarting. Static registration does not add domain handlers. Skill files are read-only
inputs to startup, so symlink and copy installations both work.

The launcher starts a detached service with logs in `service.log`, or reuses a service with matching
API version, runtime fingerprint, and data root. It returns the actual origin instead of requiring
agents to assume a port. The default is automatic OS allocation, with the last successful port
preferred on restart when available. `--port` or `CODEX_UX_PORT` accepts `0` for automatic selection
or 1024–65535 for a strict fixed port; an occupied explicit port fails promptly and logs the cause.
Port overrides apply to new starts; a matching live service is reused at its current origin. Runtime
mismatches do not kill a live service or reset data: finish active work and stop that service
normally before starting the updated skills. No automatic cache or Workspace garbage collection is
supplied.

`start` is the agent's idempotent startup entry point and returns `state: "ready"`, `origin`,
`apiBase`, and the app `url`. `locate` is read-only discovery with the same verified address fields.
It checks loopback origin, service identity, data root, API version and runtime fingerprint. If the
record changes during a failed health check, it retries discovery once at the new origin; it never
replays an app operation. Discovery failures emit structured JSON on stderr (nonzero exit), with an
error code, data root and recovery instructions/argv. Missing, invalid, stale or unreachable records
direct the agent to start once for the same root. Version mismatches or an unusable live PID require
review before restart. Agents must not guess ports, change roots to hide a failure or blindly retry
mutations. The service publishes `runtime.json` through an atomic rename so readers cannot observe a
partially written record.

## Connecting and creating video

Workspace owns service discovery, Workspace selection, app-page pairing, and recovery. Video Editor
owns initialization/import, engine choice, preview, feedback interpretation, candidate publication,
and export. A user can enter through Video Editor without orchestrating the two skills manually.

The launcher uses the current Codex task ID from `CODEX_THREAD_ID` or an explicit `--session` task
ID/link. Skills require authoritative current identity and warn against inherited parent IDs or
guessing recent tasks. `doctor` checks local queue capability without sending messages. Only Codex
feedback delivery is implemented; other agents can edit source/use HTTP but cannot claim a complete
app-to-agent delivery loop.

The default skill flow prepares the service and document, creates an invitation, opens its URL
straight into a visible connected page, verifies the receipt, and retains the page for the user.
Agents do not open the unbound `start` URL first. For an explicitly selected existing page, agents
obtain the page code through browser tools; asking users to relay codes is only a fallback without
browser access. In Codex's in-app browser, the skill requires `markDeliverable()` before ending each
turn that uses the editor, since unmarked agent-created tabs are temporary. The detached service
also stays running for continued feedback. Tab retention belongs to the host browser integration,
not the HTTP connection broker; browser tests cannot certify host end-of-turn cleanup.

Agent-created invitations open a new page; existing pages expose connection codes. The page
acknowledges its actual instance ID, and the agent checks the receipt before reporting connection.
Existing other-session bindings are preserved unless the user requests takeover with an exact
previous-session comparison. Pairing does not send feedback. See the [local API](local-api.md) for
states, expiry, and acknowledgement contracts.

The video skill defaults to direct media for review/simple processing and Hyperframes for new
compositions, uses Remotion when requested, and preserves an existing project's engine. It explains
how to promote direct video to an engine composition while keeping original media, audio, and old
revision anchors. Engine conversion requires source work, not a manifest-only toggle.

## Verification

`pnpm check` covers source and launcher types/lint, protocol failure cases, and production
artifacts. Browser tests cover new-page pairing, existing-page takeover, acknowledgement, reload,
independent instances, Workspace switching, and the video workflows. `pnpm test:skills` additionally
copies only the installed skill folders into a temporary directory, prepares the bundled service,
opens a real browser connection, imports/renders Remotion, reuses the service, and rejects
mismatched app versions without changing Workspace data. It requires network access, npm/npx, and
Chromium; use `CODEX_UX_CACHE_DIR` to reuse a prepared cache. Tests do not send messages to actual
Codex tasks.
