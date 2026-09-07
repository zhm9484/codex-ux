import { clipSchema, type VideoDocument } from './schema.ts';

const artwork = (paper: string, ink: string, variant: number) => `<template>
<style>
  .art-__CLIP_ID__ { position:absolute; inset:0; background:${paper}; color:${ink}; overflow:hidden; font-family:Arial,sans-serif; }
  .art-__CLIP_ID__ .folio {position:absolute;left:76px;right:76px;bottom:45px;display:flex;justify-content:space-between;font-size:14px;letter-spacing:2px;border-top:1px solid ${ink}40;padding-top:20px}
  .art-__CLIP_ID__ .edition {position:absolute;left:76px;top:51px;font-size:15px;letter-spacing:3px}
  .art-__CLIP_ID__ .sculpture {position:absolute;width:480px;height:580px;right:-40px;top:64px}
</style>
<div class="art-__CLIP_ID__">
 <div class="edition">FIELDNOTES &nbsp; / &nbsp; A STUDY IN POSSIBILITY</div>
 <svg class="sculpture" viewBox="0 0 480 580" fill="none" aria-label="An abstract orbital sculpture">
  ${Array.from({ length: 9 }, (_, i) => `<ellipse cx="240" cy="290" rx="${55 + i * 18}" ry="245" stroke="${ink}" stroke-width="${i === 8 ? 2 : 1}" transform="rotate(${variant * 25 + i * 9} 240 290)"/>`).join('\n')}
  <circle cx="${variant === 1 ? 260 : 315}" cy="190" r="34" fill="${ink}"/>
 </svg>
 <div class="folio"><span>GOOD THINGS TAKE SHAPE.</span><span>0${variant} / 03</span></div>
</div>
<script>
{ const tl=gsap.timeline({paused:true});
  tl.fromTo('.art-__CLIP_ID__ .sculpture',{rotation:-8,scale:0.94},{rotation:8,scale:1,duration:6,ease:'none'});
  window.__timelines=window.__timelines||{}; window.__timelines['__CLIP_ID__']=tl;
}
</script>
</template>`;

export function sampleDocument(name = 'A little room'): VideoDocument {
  return {
    name,
    width: 1280,
    height: 720,
    fps: 30,
    background: '#e6e9ce',
    tracks: [
      { id: 'visuals', name: 'Scenes' },
      { id: 'titles', name: 'Words' },
      { id: 'sound', name: 'Sound' },
    ],
    clips: [
      ...['opening', 'shape', 'ending'].map((id, i) =>
        clipSchema.parse({
          id,
          name: ['A little space', 'Taking shape', 'Make it yours'][i],
          kind: 'scene',
          sourceId: id,
          trackId: 'visuals',
          start: i * 6,
          duration: 6,
        }),
      ),
      ...['Make room for\na good idea.', 'Give it\nsome shape.', 'Make it\nyours.'].map((text, i) =>
        clipSchema.parse({
          id: `title-${i + 1}`,
          name: ['Opening title', 'The idea', 'Closing title'][i],
          kind: 'text',
          trackId: 'titles',
          start: i * 6,
          duration: 6,
          text,
          fontFamily: 'Georgia',
          fontSize: 100,
          color: i === 1 ? '#f4efe2' : '#242820',
          align: 'left',
          x: 6,
          y: 44,
          width: 65,
        }),
      ),
    ],
    assets: [],
    sources: {
      opening: artwork('#e6e9ce', '#333b2b', 1),
      shape: artwork('#3b483e', '#d6ddc6', 2),
      ending: artwork('#e9c9ac', '#483c32', 3),
    },
  };
}
