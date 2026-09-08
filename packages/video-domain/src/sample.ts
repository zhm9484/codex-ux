/** Ordinary HyperFrames source files for a new video. Never regenerated after initialization. */
export function starterFiles(): Record<string, string> {
  const names = ['opening', 'shape', 'ending'];
  const titles = ['Make room for\na good idea.', 'Give it\nsome shape.', 'Make it\nyours.'];
  const labels = ['A little space', 'Taking shape', 'Make it yours'];
  const papers = ['#ececf0', '#24242a', '#e3e7ff'];
  const inks = ['#292934', '#dcdce5', '#343469'];
  const files: Record<string, string> = {
    'video.json':
      JSON.stringify({ kind: 'hyperframes', entry: 'index.html', fps: 30 }, null, 2) + '\n',
    'index.html': `<!doctype html><html><head><meta charset="utf-8"><script src="vendor/gsap.js"></script><style>
html,body{margin:0;width:1280px;height:720px;overflow:hidden}
#root{position:relative;width:1280px;height:720px;background:#ececf0;overflow:hidden}
.scene{position:absolute;inset:0;pointer-events:none}
.text-clip{position:absolute;left:6%;top:44%;width:65%;transform:translateY(-50%);white-space:pre-wrap;line-height:1.04;letter-spacing:-0.045em;font:100px Georgia;color:#24242a;pointer-events:auto}
</style></head><body><div id="root" data-composition-id="main" data-width="1280" data-height="720" data-duration="18">
${names.map((id, i) => `<div id="${id}" class="scene" data-name="${labels[i]}" data-composition-id="${id}" data-composition-src="scenes/${id}.html" data-start="${i * 6}" data-duration="6" data-width="1280" data-height="720"></div>`).join('\n')}
${titles.map((text, i) => `<div id="title-${i + 1}" class="text-clip" data-start="${i * 6}" data-duration="6" style="${i === 1 ? 'color:#f4f4f6' : ''}">${text}</div>`).join('\n')}
</div><script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true}).to({}, {duration:18});</script></body></html>`,
  };
  names.forEach((id, i) => {
    files[`scenes/${id}.html`] =
      `<template><div data-composition-id="${id}" data-width="1280" data-height="720" data-duration="6" style="position:relative;width:1280px;height:720px">
<style>
.art-${id}{position:absolute;inset:0;background:${papers[i]};color:${inks[i]};font-family:Arial,sans-serif}
.art-${id} .folio{position:absolute;left:76px;right:76px;bottom:45px;display:flex;justify-content:space-between;font-size:14px;letter-spacing:2px;border-top:1px solid ${inks[i]}40;padding-top:20px}
.art-${id} .edition{position:absolute;left:76px;top:51px;font-size:15px;letter-spacing:3px}
.art-${id} .sculpture{position:absolute;width:480px;height:580px;right:-40px;top:64px}
</style><div class="art-${id}"><div id="${id}-edition" class="edition">FIELDNOTES &nbsp; / &nbsp; A STUDY IN POSSIBILITY</div>
<svg class="sculpture" viewBox="0 0 480 580" fill="none" aria-label="An abstract orbital sculpture">
${Array.from({ length: 9 }, (_, j) => `<ellipse cx="240" cy="290" rx="${55 + j * 18}" ry="245" stroke="${inks[i]}" stroke-width="${j === 8 ? 2 : 1}" transform="rotate(${(i + 1) * 25 + j * 9} 240 290)"/>`).join('\n')}
<circle cx="${i === 0 ? 260 : 315}" cy="190" r="34" fill="${inks[i]}"/></svg>
<div class="folio"><span id="${id}-motto">GOOD THINGS TAKE SHAPE.</span><span>0${i + 1} / 03</span></div></div></div>
<script>{const tl=gsap.timeline({paused:true});tl.fromTo('.art-${id} .sculpture',{rotation:-8,scale:0.94},{rotation:8,scale:1,duration:6,ease:'none'});window.__timelines=window.__timelines||{};window.__timelines['${id}']=tl;}</script></template>`;
  });
  return files;
}
