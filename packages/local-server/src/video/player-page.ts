import type { VideoDocument } from '@codex-ux/video-domain';
const safeJson = (data: unknown) => JSON.stringify(data).replaceAll('<', '\\u003c');
const earlyErrors = `<script>addEventListener('error',function(event){window.__videoError=event.message||'A preview resource could not load.'},true);addEventListener('unhandledrejection',function(event){window.__videoError=String(event.reason&&event.reason.message||event.reason)});</script>`;
export function playerPage(doc: VideoDocument, css = '') {
  const source = doc.source;
  return `<!doctype html><html><head><meta charset="utf-8"><title>Video preview</title>${earlyErrors}<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#111}p[role=alert]{color:white;padding:20px}</style>${source.kind === 'remotion' ? '<base href="./preview/">' : ''}${css}</head><body>
${
  source.kind === 'remotion'
    ? '<script>window.remotion_staticBase=new URL("./source/public",location.href).pathname;</script><script type="module" src="./player.js"></script>'
    : `<script id="video-config" type="application/json">${safeJson({ kind: source.kind, src: './source/' + source.entry.split('/').map(encodeURIComponent).join('/'), width: doc.width, height: doc.height, duration: doc.duration })}</script><script type="module" src="/media/video-editor/engine/preview.js"></script>`
}
</body></html>`;
}
