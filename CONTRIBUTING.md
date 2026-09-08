# Contributing to Codex UX

Contributions are welcome, including bug reports, ideas, documentation improvements and code. Prefer
English for issues, pull requests and review discussions so more people can participate. Other
languages are welcome when needed. Repository content, including documentation, comments and UI
copy, must be in English.

## Opening an issue

Search existing issues before opening a new one. Use the general issue template for most reports,
questions and proposals. Adapt or omit sections that do not apply; a blank issue is available when
the template does not fit.

Describe the problem or use case and the result you expected. For bugs, include reproduction steps,
actual behavior and relevant environment details. For proposals, explain the current limitation and
desired outcome; a technical solution is optional. Add screenshots, logs or a small example when
helpful, removing credentials and private data.

Small fixes and documentation improvements can go straight to a pull request. Discuss new features,
protocol or API changes, architecture changes and significant dependency changes in an issue before
investing in implementation, so maintainers can confirm the direction and scope.

## Preparing a pull request

Read [AGENTS.md](AGENTS.md) and start with the [canonical documentation](docs/canonical/README.md).
Follow the existing module boundaries and conventions. Keep each PR focused on one clear problem and
preserve unrelated work. Avoid unrelated refactors or formatting changes.

See the [development instructions](README.md#develop) for setup. Use the Node.js and pnpm versions
declared in the repository, and update the lockfile when dependencies change.

- Run `pnpm check` for code or configuration changes. For documentation-only changes, run
  `pnpm exec prettier --check <changed-files>` with the affected paths.
- Test meaningful behavior and failure cases. For browser, rendering or export changes, run the
  relevant additional checks described in
  [verification](docs/canonical/architecture.md#verification). State what you verified and disclose
  any checks you could not run.
- Assess documentation impact for every change. Update affected canonical documents in the same PR
  when behavior, interfaces or operational conventions change.
- Include updated tracked skill distribution artifacts when the build changes them. CI verifies they
  match the source; see
  [runtime and app builds](docs/canonical/architecture.md#runtime-and-app-builds).
- Keep credentials, user projects and generated media out of Git, and respect third-party licenses.

Use the PR template to explain the problem, resulting behavior and validation. Link related issues
when available; an issue is not required for every PR. Include screenshots or a short demonstration
for UI changes. Draft PRs are welcome for work that needs early feedback.

AI-assisted contributions are welcome. The contributor is responsible for understanding the change,
checking its results and responding to review. Full AI conversation logs are not required.

## Review and merge

External PRs require review and approval from at least one maintainer before a maintainer merges
them. Required CI checks must pass, and maintainers also assess scope, design, behavior and
documentation. The default is squash merging; contributors do not need to clean up every
intermediate commit or follow a mandatory commit-message format.

These are contribution policies. Automated enforcement depends on the repository's GitHub settings;
the templates themselves do not enforce approvals or merge methods.
