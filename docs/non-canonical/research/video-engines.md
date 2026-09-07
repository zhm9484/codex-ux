# Video engine boundaries

Non-canonical research; proposals and findings may be outdated.

Updated September 7, 2026. Evidence includes current repository source, official engine
documentation and an isolated local Remotion/media feasibility probe. This records the research and
proposal before implementation; the implemented result is described in
[canonical documentation](../../canonical/README.md).

## Finding

An engine-independent video collaboration container is feasible. HyperFrames and Remotion can
provide preview and rendering without their official editors or histories. Existing media can play
directly in an HTML video element. The shared product can own navigation, feedback and revisions;
source-specific adapters must own execution and any reliable direct edits.

|          | HyperFrames                                   | Remotion                                |
| -------- | --------------------------------------------- | --------------------------------------- |
| Source   | HTML, CSS, JavaScript, and timing conventions | React components and frame-based logic  |
| Preview  | Standalone web-component Player               | React Player                            |
| Export   | Producer or CLI                               | Bundler and Renderer, or CLI            |
| Optional | Studio, editing SDK, hosted services          | Studio, Editor Starter, hosted services |

A project directory is a rendering input, not a requirement to adopt an engine's project-management
UI. Supporting a source does not imply automatic discovery or rewriting of arbitrary scene graphs.
All sources can accept time/region feedback; their direct editing capabilities differ.

## Coupling before implementation

| Area     | Verified pre-implementation behavior                                                        | Required change                                                             |
| -------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Player   | `use-player.ts` directly uses HyperFrames Player and its iframe DOM                         | Separate transport control from optional canvas editing                     |
| Document | `schema.ts` combines structured clips with native HTML files; fps is restricted to 24/30/60 | Represent source identity and time metadata without requiring HTML or clips |
| Import   | `native/files.ts` requires HyperFrames metadata in root index.html                          | Source-specific discovery and validation                                    |
| Snapshot | Directory scanning includes dependency/build directories and rejects symbolic links         | Separate source/assets from dependency caches and build outputs             |
| Timeline | `native-timeline.ts` parses HTML timing attributes; UI items wrap these as clips            | Optional revision-scoped structure, with a time-only fallback               |
| Editing  | HTML ranges and rendered DOM are matched for direct text/timing changes                     | Preserve this inside the HyperFrames integration                            |
| Output   | `video/jobs.ts`, `player-page.ts` and thumbnails use HyperFrames                            | Dispatch preview, capture and export by source/runtime                      |
| Agent    | `video/collaboration.ts` prepares engine-specific files and instructions                    | Describe the actual source, entry and publication workflow                  |

The current protocol's revision/time/region anchors, app-owned history, stale-write checks and
captured agent destinations are useful foundations. File transaction and publication plumbing can be
reused after removing HTML assumptions. The workspace/app/session separation should stay intact;
this is a Video Editor change, not a new workspace model or a universal domain protocol.

## Isolated probe

Executed outside the repository with Node 24.19.0, React 19.2.8, Vite 8.2.2, Remotion
Player/Bundler/Renderer 4.0.522 and local Chrome. The probe itself changed no production
dependencies or application code. Two simple 320 by 240 TSX compositions used 25 fps, different
source text/colors and 50/75 frames. Separate Vite preview builds shared each revision's component
with its Remotion render entry.

| Check                                              | Observed result                                                                                                                        |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Host control through a small iframe message bridge | Seek to 1.2 seconds displayed frame 30; play advanced; pause stopped                                                                   |
| Different source revisions                         | Both builds displayed their own text at frame 30 simultaneously                                                                        |
| Seek beyond an older revision's end                | Adapter clamped to frame 49 of the 50-frame composition                                                                                |
| Broken React composition                           | Error fallback appeared while the separately mounted good preview remained available                                                   |
| Readiness counterexample                           | A naive mount-plus-two-paints bridge still announced ready for the broken composition                                                  |
| Export                                             | Renderer produced H.264 MP4s with 50 and 75 video frames at 25 fps                                                                     |
| Direct media                                       | HTML video played and sought to 1.2 seconds; replacing A with B and seeking again worked using the repository's byte-range file server |
| Existing document validator                        | Rejected the probe's valid 25 fps metadata                                                                                             |
| Existing source inventory                          | Rejected the probe project at a pnpm dependency symlink                                                                                |

An initial media assertion expecting exactly 2 seconds failed. FFprobe showed a 2-second video
stream but a 2.048-second AAC stream and container; Chrome reported 2.048 seconds. The second export
had 3 seconds of video and approximately 3.051 seconds of container duration. Media metadata must be
measured, and mappings between composition time and output time cannot assume identical endpoints.
The initial minimal static server also failed the seeking check; using existing byte-range serving
made it pass.

These results verify constituent mechanisms, not production integration. They do not verify an
automatic source watcher, atomic preview adoption, database undo across engines, visual equivalence
between preview and export, arbitrary Remotion imports, complex media buffering, variable-frame-rate
accuracy or performance on real projects. The failed-revision check retained a separate good iframe;
it did not implement a complete publication/readiness state machine. Short synthetic build/render
times are not a product latency estimate.

## Proposed ownership

The container owns the displayed revision, playback controls, time/range and normalized region
selection, notes, requests, history and comparison. Its mandatory integration surface should remain
small: metadata, load/dispose, play/pause/seek/mute, and time/buffering/error/presentation events.
Backend source handling supplies capture, validation, candidate files and output preparation. Direct
text edits, object bounds and editable timing are optional capabilities, preferably reported per
target rather than as a single engine-wide boolean. An adapter is a boundary of responsibility; this
does not require a plugin registry or public SDK in the first implementation.

Separate authoring source from presentation artifacts. A Remotion revision may have both an
interactive preview and a rendered MP4; displaying its MP4 should not discard its TSX source. A
media-only revision may have no recoverable authoring source. An explicit replacement may change the
source kind within the same video's history; it does not imply conversion of old source code. Other
tools that only output MP4 can use the media path without a dedicated runtime adapter.

Let authored code or media remain authoritative for the video. Any scene/object map is a derived or
explicitly supplied collaboration aid, tied to its source revision. Keep provenance clear when an
agent infers a scene boundary. Do not silently create a second master timeline that competes with
HyperFrames or Remotion code. Combining several engines as editable clips in one composition would
require an additional composition model; it is not necessary for the requested container workflow.

## Timeline, transitions and direct editing

A time axis, sampled thumbnails and region feedback need no scene graph. An MP4 should remain usable
without automatically detecting scenes. An optional structure map can add scene names, boundaries,
object IDs and source references when available. A single image per scene is not a sufficient
thumbnail strategy for a long media-only video.

Distinguish three things in the UI and request data: what currently exists, what the user wants, and
what has been applied. Dragging a proposed scene boundary can express an agent request when there is
no supported direct source operation. It must not masquerade as a completed edit or an exportable
change. Supported direct operations should still commit an ordinary validated revision.

Transitions can target a boundary, a range or a relation between two known scenes. Preserve the
user's actual constraints, such as desired duration or keeping total duration unchanged; leave
unspecified constraints open. A transition duration alone is insufficient: Remotion's overlapping
TransitionSeries transitions shorten the sequence, while its overlays do not. On flattened media,
creating a new overlap may require trimming or generating missing footage. Accepting the feedback
does not guarantee that the existing frames can realize every requested transition.

HTML source-range editing remains useful for supported HyperFrames text. Remotion's rendered DOM is
not a reliable inverse mapping to React source; patching the DOM does not persist an edit. Remotion
can offer direct editing through explicit parameters or source bindings later. Flattened video has
no original text layers; the same region/text request can still be sent to an agent.

## Remotion and publication requirements

Player accepts a React component or lazy component import, not an arbitrary project/render URL. A
source integration needs a known component export for preview and a render entry/composition ID,
resolved props and metadata. Export's bundle and Player's frontend build are separate build paths;
custom aliases, CSS transforms and asset behavior must agree. Composition metadata can be dynamic,
so scraping a TSX declaration or letting Player guess duration is insufficient.

Start with an explicit supported project convention, preserving its ordinary source files. Exclude
node_modules, build outputs and caches from source snapshots, while retaining manifests, lockfiles,
configuration and local assets. Backend build jobs own dependency resolution and processes. A
revision-specific preview iframe is a useful way to isolate project styles and React dependencies;
it is not by itself a security boundary for untrusted code.

Keep captured source, prepared artifacts and the displayed revision distinguishable. Save/capture
the source, prepare the corresponding preview, seek it, observe errors/buffering, then adopt its
picture, metadata and structure together. Do not pair old pixels with a new timeline or anchor new
metadata to an old displayed revision. Use revision/load identifiers to reject late results from
superseded builds, and check the base revision again before publishing a prepared candidate. Failed
preparation should leave the last good presentation available with the error identified.

Hot reload is an optimization, not revision identity. Historical previews must reference immutable
outputs, not a live development URL. Source and lockfiles alone cannot guarantee identical visuals
when fonts, remote services, browser versions or nondeterministic code change. Freeze local inputs
and preserve rendered artifacts where exact historical appearance is required. This requirement is
also relevant to HyperFrames.

Use seconds for common intent anchors, with optional exact frame/timebase information for sources
that support it. Do not force 24/30/60 fps or infer exact frame stepping from a variable-rate
video's average fps. Keep original anchors after cuts and replacements. Moving a note to a
corresponding new moment requires an explicit mapping; equal timestamps need not show the same
content.

## Implementation sequence and acceptance

1. Introduce source/presentation identity and optional capabilities inside the video domain. Move
   current HyperFrames behavior behind that boundary and retain existing direct editing tests.
2. Complete the media-only collaboration loop: import, annotate, prepare replacement, publish,
   preview, export/download, undo and compare. Reuse byte-range serving and immutable assets.
3. Add Remotion using the bounded project convention. Validate dependencies, props, preview/render
   agreement, asynchronous failures and revision-specific builds before broadening imports.
4. Add optional scene/boundary/transition intent and target-specific direct operations without
   making structure mandatory. Keep generic feedback usable throughout.

Acceptance must include the same note/request/history workflow on all three sources, failed and
rapid successive builds, media replaced while being written, stale publication after a build,
duration/aspect-ratio changes, preserved draft anchors, old notes after cuts, and preview/export
resource consistency. Run existing HyperFrames regressions and the repository checks when code is
changed. Automatic arbitrary-TSX editing, lossless cross-engine conversion and zero-latency video
generation are not prerequisites or promised outcomes.

## Sources

- [HyperFrames HTML contract](https://hyperframes.heygen.com/reference/html-schema)
- [HyperFrames Player](https://hyperframes.heygen.com/packages/player)
- [HyperFrames Producer](https://hyperframes.heygen.com/packages/producer)
- [Remotion fundamentals](https://www.remotion.dev/docs/the-fundamentals)
- [Remotion Player](https://www.remotion.dev/docs/player)
- [Remotion Player API](https://www.remotion.dev/docs/player/player)
- [Remotion preview/render code sharing](https://www.remotion.dev/docs/player/integration)
- [Remotion dynamic metadata](https://www.remotion.dev/docs/calculate-metadata)
- [Remotion buffering](https://www.remotion.dev/docs/player/buffer-state)
- [Remotion transition timing](https://www.remotion.dev/docs/transitions/transitionseries)
- [Remotion rendering](https://www.remotion.dev/docs/ssr-node)
- [HTML media timing and seeking](https://html.spec.whatwg.org/multipage/media.html)
