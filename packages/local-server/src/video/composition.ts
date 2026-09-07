import { durationOf, type VideoDocument, type Clip } from '@codex-ux/video-domain';

const escape = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
function media(clip: Clip, doc: VideoDocument) {
  const asset = doc.assets.find((a) => a.id === clip.assetId);
  if (!asset) return '';
  const timing = `id="${clip.id}" data-start="${clip.start}" data-duration="${clip.duration}" data-media-start="${clip.offset}" data-volume="${clip.volume}"`;
  if (clip.kind === 'audio') return `<audio ${timing} src="assets/${asset.file}"></audio>`;
  const style = `position:absolute;left:${clip.x}%;top:${clip.y}%;width:${clip.width}%;transform:translate(-50%,-50%);max-height:100%;object-fit:contain`;
  if (clip.kind === 'video')
    return `<video ${timing} src="assets/${asset.file}" data-has-audio="true" muted playsinline style="${style}"></video>`;
  return `<img ${timing} class="clip" src="assets/${asset.file}" style="${style}" alt="${escape(clip.name)}">`;
}

/** The arrangement is generated; scene HTML stays freely editable. */
export function compositionHtml(doc: VideoDocument, preview = false) {
  const fonts = doc.assets
    .filter((a) => a.mime.startsWith('font/'))
    .map((a) => `@font-face{font-family:'${a.id}';src:url('assets/${a.file}');font-display:block}`)
    .join('\n');
  const clips = doc.tracks
    .flatMap((track, index) =>
      doc.clips
        .filter((c) => c.trackId === track.id)
        .map((c) => {
          let html: string;
          if (c.kind === 'scene')
            html = `<div id="${c.id}" class="clip" data-composition-id="${c.id}" data-composition-src="scenes/${c.id}.html" data-start="${c.start}" data-duration="${c.duration}" data-playback-start="${c.offset}" data-width="${doc.width}" data-height="${doc.height}"></div>`;
          else if (c.kind === 'text')
            html = `<div id="${c.id}" class="clip text-clip" data-start="${c.start}" data-duration="${c.duration}" style="left:${c.x}%;top:${c.y}%;width:${c.width}%;font-size:${c.fontSize}px;font-family:${escape(c.fontFamily)};color:${c.color};text-align:${c.align}"><span>${escape(c.text)}</span></div>`;
          else html = media(c, doc);
          return `<div style="position:absolute;inset:0;z-index:${index};pointer-events:none">${html}</div>`;
        }),
    )
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=${doc.width},height=${doc.height}"><script src="vendor/gsap.js"></script><style>
  ${fonts}
  html,body{margin:0;width:${doc.width}px;height:${doc.height}px;overflow:hidden}
  #root{position:relative;width:${doc.width}px;height:${doc.height}px;background:${doc.background};overflow:hidden}
  .clip{position:absolute;inset:0}.text-clip{inset:auto;transform:translateY(-50%);white-space:pre-wrap;line-height:1.04;letter-spacing:-0.045em;font-weight:400;pointer-events:auto}
  </style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${durationOf(doc)}" data-width="${doc.width}" data-height="${doc.height}">${clips}</div>
  <script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true});</script>
  ${preview ? '<script src="/media/video-editor/engine/runtime.js"></script>' : ''}</body></html>`;
}

export function sceneHtml(source: string, clip: Clip, doc: VideoDocument) {
  const content = source.replaceAll('__CLIP_ID__', clip.id);
  const body = content
    .trim()
    .replace(/^<template[^>]*>/, '')
    .replace(/<\/template>$/, '');
  return `<template><div id="root" data-composition-id="${clip.id}" data-width="${doc.width}" data-height="${doc.height}" data-duration="${clip.offset + clip.duration}" style="position:relative;width:${doc.width}px;height:${doc.height}px">${body}</div></template>`;
}
