const errors = `<script>(function(){
  function report(message){parent.postMessage({source:'video-editor',type:'preview-error',message:String(message)},'*')}
  window.addEventListener('error',function(event){
    if(event.target&&event.target!==window){var element=event.target;if(element.tagName==='SCRIPT'||element.tagName==='LINK')report('Could not load '+(element.src||element.href));}
    else report(event.message||'Composition script failed');
  },true);
  window.addEventListener('unhandledrejection',function(event){report(event.reason&&event.reason.message||event.reason)});
})();</script>`;

/** Only the served preview gains a playback bridge and error reporting; project files stay intact. */
export function nativePreview(html: string) {
  const withErrors = /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (head) => head + errors)
    : errors + html;
  if (/hyperframe\.runtime|\/engine\/runtime\.js/.test(html)) return withErrors;
  const bridge = '<script src="/engine/runtime.js"></script>';
  return /<\/body\s*>/i.test(withErrors)
    ? withErrors.replace(/<\/body\s*>/i, `${bridge}</body>`)
    : withErrors + bridge;
}
