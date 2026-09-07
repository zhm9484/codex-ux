# Codex UX

**A shared workspace for people and agents.**

An open collaboration protocol and a collection of local web apps. People select, annotate, and
edit; agents read the context and return changes to the same workspace. Preset apps can be
customized through code and saved for later use.

## Status

The first preset is a local video editor: HyperFrames playback and export, multitrack arrangement,
text editing, assets, anchored notes, saved history and existing-task Codex delivery. The minimal
collaboration contract and browser instance helpers are implemented. Apps share file-based
workspaces; agent bindings are independent per page and workspace. 3D and automatic custom app
builds remain reserved.

## Start

Use Node.js 24 and pnpm 10.34.5.

```sh
pnpm install
pnpm dev
```

Open <http://127.0.0.1:5173/apps/video-editor/>. Run `pnpm check` to verify formatting, lint, types,
tests and production builds. Use `pnpm format` to format files.

## Structure

```text
apps/
  video-editor/     React + Vite video editor
  scene-3d/         Reserved for 3D scene assembly
packages/
  protocol/         Shared collaboration contract
  video-domain/     Video document and timeline operations
  sdk/              Browser app instance and session-binding helpers
  adapter-codex/    Codex-specific connection
  local-server/     TypeScript backend
docs/
  canonical/        Current project facts and architecture
  non-canonical/    Research, plans, and historical context
```

All project code is TypeScript. Repository content is in English. Packages keep video behavior,
portable contracts, system access and Codex delivery separate. User data defaults to `~/.codex-ux/`.
Use `pnpm build && pnpm start` to serve the app build from `.agents/skills/video-editor/dist/`.
Builds remain separate from workspace files and app state. Chrome is required for thumbnails and
rendering; see the runtime settings in the canonical docs.

The protocol stays independent of React, Codex, and video or 3D engines. See
[Canonical documentation](docs/canonical/README.md) for current behavior and
[Non-canonical notes](docs/non-canonical/README.md) for research and plans.

## License

[MIT](LICENSE). Third-party dependencies and assets retain their own licenses.

An independent project, not an official OpenAI product.
