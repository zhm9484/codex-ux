# Video engine boundaries

Non-canonical research; proposals and findings may be outdated.

Research date: September 6, 2026. Findings are based on official documentation; integration remains
unverified in this repository.

## Finding

Both HyperFrames and Remotion can provide composition, preview, and rendering without requiring
their official editors, project management, or editing histories.

|          | HyperFrames                                   | Remotion                                |
| -------- | --------------------------------------------- | --------------------------------------- |
| Source   | HTML, CSS, JavaScript, and timing conventions | React components and frame-based logic  |
| Preview  | Standalone web-component Player               | React Player                            |
| Export   | Producer or CLI                               | Bundler and Renderer, or CLI            |
| Optional | Studio, editing SDK, hosted services          | Studio, Editor Starter, hosted services |

A project directory is a rendering input, not a requirement to adopt an engine's project-management
UI. HyperFrames still requires its composition and seek conventions. Remotion requires reproducible
frame-based output. Their technical contracts are separate from the Codex UX collaboration protocol.

## Design implications

- Let the app own feedback, revisions, and the relationship between source and outputs.
- Let source code define the visuals and sequencing; let the engine execute and render them.
- Allow agents to edit HTML or TSX directly. Fine-grained edit commands can be useful but must not
  be the only creative path.
- Tie preview and export to the same source, assets, parameters, and engine version.
- Do not build a universal video model or require conversion between engines before it is needed.

A useful first workflow: annotate revision 12 at a particular frame, let the agent edit the source,
validate and publish revision 13, then preview and render that revision. Reject publication if the
base work has changed. A successful API call alone does not prove that work was saved or rendered.

## Sources

- [HyperFrames HTML contract](https://hyperframes.heygen.com/reference/html-schema)
- [HyperFrames Player](https://hyperframes.heygen.com/packages/player)
- [HyperFrames Producer](https://hyperframes.heygen.com/packages/producer)
- [Remotion fundamentals](https://www.remotion.dev/docs/the-fundamentals)
- [Remotion Player](https://www.remotion.dev/docs/player)
- [Remotion rendering](https://www.remotion.dev/docs/ssr-node)
