# Canonical documentation

Start here for an authoritative overview of the current project. These documents describe verified
behavior, feature designs, architecture, and operating conventions. Keep them in sync with changes
to the project; maintenance rules are in [AGENTS.md](../../AGENTS.md).

- [Architecture](architecture.md): workspace/app/session concepts, storage ownership, module
  boundaries and development commands.
- [Video editor](video-editor.md): editing, responsive UI, collaboration and export.
- [3D Space](3d-space.md): immersive 3D editing, model imports, Three.js source and spatial
  feedback.
- [Shared local library](library.md): workspace materials, attachment references and reusable UI.
- [Local API](local-api.md): HTTP contracts, candidate publication and source conventions.
- [Skills](skills.md): installable app/runtime artifacts, startup, connection and release checks.

Research, proposals, and historical context belong in [non-canonical](../non-canonical/README.md).

For contribution workflow and review policy, see [Contributing](../../CONTRIBUTING.md). Most issues
use the general template, with free-form issues available when needed. PRs use a concise template
covering the summary, validation and documentation impact. Agents must begin every issue and PR with
a Summary combining brief text and a clear visual, including blank issues and draft PRs; human
contributors may use their judgment. Summaries use GitHub-renderable Markdown, never HTML. See the
[visual summary guidance](../../CONTRIBUTING.md#visual-summaries-for-issues-and-pull-requests).
English is preferred for discussions and required for repository content.
