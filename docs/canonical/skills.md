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

3D Space installs with `--skill codex-ux-workspace codex-ux-3d-space`. Its skill similarly ships
`dist/`, license notices and `app.json`, plus Three.js source and spatial collaboration guidance.
Both apps can be registered with the same Workspace runtime; their fingerprints are generated
together.

`pnpm build` builds both frontends and runs `scripts/build-skills.ts` to regenerate these artifacts.
`pnpm build:skills` is the same complete build. The generated runtime and web files are committed
because skill installation copies repository content. CI rebuilds and rejects differences in the
shipped artifacts. Author code in the normal packages/apps, never edit generated artifacts directly.
Keep skill instructions in English; use the user's language in agent responses.

## Startup and ownership

Use `node scripts/workspace.mjs` in the installed Workspace skill. This small JavaScript bootstrap
supports `--help` and `preflight` without loading the service or downloading anything. It uses Node
24 directly, reuses a previously selected executable or a known Homebrew Node 24, and otherwise
prepares Node 24.20.0 with an explicit npm package invocation. A working Node/npm installation and
network are required for first preparation; Node 18 can run the bootstrap. The TypeScript CLI is an
internal entry point requiring Node 24. Every service/compiler child inherits the selected Node.

`start --app /absolute/installed/app.json` verifies the source and web fingerprints, caches
immutable source/web files, installs only core dependencies, and starts or reuses the service. It
does not prepare Chromium, media binaries, or either app's domain dependencies. The app displays a
preparation screen before initializing its document. 3D and Video Editor load independently, and a
live service can register another app without restarting. Static registration does not add arbitrary
domain handlers.

The source bundle includes frozen standalone capability manifests generated from the workspace
lockfile. Separate environments contain core, 3D, video basics, Hyperframes preview, Remotion
preview, each engine's export tools, browser automation, probing, and encoding dependencies. A
capability is installed only on demand. Its key includes the transitive production graph, platform,
architecture and Node ABI; unchanged dependencies are reused across source-only updates. Source/web
fingerprints still verify exact build identity. Unknown runtime compatibility requires a controlled
restart; this is not automatic hot code replacement or cross-version data migration.

Dependencies install at their final cache paths; runtime source points to them through junctions.
Never move an installed pnpm tree or delete a cache used by a live service. Source extraction and
capability installation use separate locks, with atomically published PID/token ownership and
serialized dead-owner reclamation. Failed installations retain partial files and can be retried;
capabilities are marked ready only after their own packages resolve and compiler/media binaries pass
a smoke check. FFprobe uses platform-specific `@ffprobe-installer` binaries, including a native
macOS ARM64 build. Media executables have short hard-linked paths outside the nested pnpm tree so
Windows can launch them. The Windows Remotion compositor uses a short directory junction passed
through the renderer’s `binariesDirectory` option. A damaged ready cache is rejected rather than
reinstalled in place while another service may be using it; its error identifies the cache and
required stopped-service recovery. Trusted dependency builds allow esbuild, ffmpeg-static and
platform-specific FFprobe installers. Project source dependencies still disable lifecycle scripts.

The installer uses explicit `--package pnpm@10.34.5 pnpm` arguments and clears inherited npm exec
package/call selection while preserving registry/proxy configuration. Windows invokes the fixed npx
arguments through cmd.exe; paths remain process options, and junctions avoid symlink privileges.
Preparation reports stage/elapsed time in the app, with diagnostic output and an installation log.
Cancel and Retry preparation affect only that capability. Failed preparation is not retried by
polling. `prepare --capability NAME` provides the same explicit operation for agents.

Background thumbnails may reuse available browser tools but never install them implicitly. Users can
enable them in Video Editor. An animation export prepares its renderer and browser on demand;
Remotion preview no longer builds an export bundle. Direct media export copies original bytes.
Browser preparation validates an explicit `CODEX_UX_CHROME`, a managed browser, or known installed
Chrome/Edge/Chromium paths with a fresh headless profile. If no usable browser exists it downloads
pinned Playwright Chromium. An invalid explicit path fails with its cause instead of silently
choosing another browser. Browser failure leaves editing and 3D available. An existing system
browser is not guaranteed to render identically to the pinned version; export records its version.

Caches default to `~/.cache/codex-ux/` (`CODEX_UX_CACHE_DIR` overrides them), independently of
`~/.codex-ux/` Workspace data. `installed-apps.json` remembers immutable hosted app paths. The
service runs detached with `service.log`; installed skill inputs remain read-only and can be copies
or symlinks. No automatic cache/Workspace garbage collection is supplied.

`start` returns `state: "ready"`, verified `origin`, `apiBase`, and app `url`; this means the
service and app shell are available, not that document compilation, connection or export preparation
has finished. `locate` is read-only verified discovery. Both use the actual bound port: automatic OS
allocation prefers the last available port; explicit `--port`/`CODEX_UX_PORT` (1024–65535, or 0 for
automatic) is strict. A matching live service keeps its origin.

`inspect` reports verified PID, mode, build and activity even when the launcher's build differs.
`stop` and `restart` serialize with startup and use the service record's control nonce and matching
health PID/root. The stop endpoint rejects requests during active operations, exports or environment
preparation. Restart validates the requested app and prepares core before stopping the old service.
Legacy services lacking the ownership endpoint require stopping from their original terminal once.
Discovery retains structured errors and never guesses ports, changes data roots, or replays app
mutations. Runtime records are published atomically. After restart use fresh connection invitations.

## Connecting and creating video

Workspace owns service discovery, Workspace selection, app-page pairing, and recovery. Video Editor
owns initialization/import, engine choice, preview, feedback interpretation, candidate publication,
and export. A user can enter through Video Editor without orchestrating the two skills manually.

The launcher uses the current Codex task ID from `CODEX_THREAD_ID` or an explicit `--session` task
ID/link. Skills require authoritative current identity and warn against inherited parent IDs or
guessing recent tasks. `doctor` checks local queue capability without sending messages. Only Codex
feedback delivery is implemented; other agents can edit source/use HTTP but cannot claim a complete
app-to-agent delivery loop.

The default skill flow prepares the core service, creates an invitation, and opens its URL into a
visible page while the selected app prepares and initializes its document. It verifies the receipt
and usable document separately, and retains the page for the user. Agents do not open the unbound
`start` URL first. For an explicitly selected existing page, agents obtain the page code through
browser tools; asking users to relay codes is only a fallback without browser access. In Codex's
in-app browser, the skill requires `markDeliverable()` before ending each turn that uses the editor,
since unmarked agent-created tabs are temporary. The detached service also stays running for
continued feedback. Tab retention belongs to the host browser integration, not the HTTP connection
broker; browser tests cannot certify host end-of-turn cleanup.

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
verifies 3D without video/browser dependencies, offline reuse, failure isolation and lifecycle, then
copies only the installed skill folders into a temporary directory, prepares the bundled service,
opens a real browser connection, imports/renders Remotion, reuses the service, and rejects
mismatched app versions without changing Workspace data. It requires network access, npm/npx, and
Chromium; use `CODEX_UX_CACHE_DIR` to reuse a prepared cache. Tests do not send messages to actual
Codex tasks.

CI runs real installed-skills/browser/export checks on Linux, macOS and Windows, in addition to
launcher fixtures and the ordinary project checks. Timings distinguish core start, app readiness,
live reuse and prepared restart; local warm-store measurements are not cold-network guarantees.
