import type { VideoDocument } from '@codex-ux/video-domain';

/** Both screenshots and candidate review use the same local player as the editor. */
export function playerPage(source: string, document: VideoDocument, time = 0, controls = false) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Codex UX · Video preview</title>
    <style>body{margin:0;background:#f0f2ec}hyperframes-player{display:block;width:100vw;height:100vh}</style>
    <script type="module" src="/engine/player.js"></script>
  </head>
  <body>
    <hyperframes-player runtime-src="/engine/runtime.js" src="${source}"
      width="${document.width}" height="${document.height}" ${controls ? 'controls' : ''}>
    </hyperframes-player>
    <script>
      const player = document.querySelector('hyperframes-player');
      player.addEventListener('ready', () => {
        player.seek(${time});
        setTimeout(() => { document.documentElement.dataset.ready = 'true'; }, 250);
      });
    </script>
  </body>
</html>`;
}
