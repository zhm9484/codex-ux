import type { HyperframesPlayer } from '@hyperframes/player';

// The player iframe is a separate event boundary. Keep editor shortcuts and file drops working
// when focus or the pointer moves into the composition.
export function bindPlayerInteractions(
  player: HyperframesPlayer,
  clipIds: string[],
  select: (id: string) => void,
  edit: (id: string) => void,
  clear: () => void,
  context: (position: { x: number; y: number }) => void,
) {
  const document = player.iframeElement.contentDocument;
  if (!document) return () => undefined;
  const resolve = (event: Event) => {
    let element = event.target as Element | null;
    while (element) {
      if (clipIds.includes(element.id)) return element.id;
      element = element.parentElement;
    }
  };
  const contextMenu = (event: MouseEvent) => {
    event.preventDefault();
    player.pause();
    if (!(event.target as Element).closest('[data-ux-text]')) clear();
    const rect = player.getBoundingClientRect();
    const width = Number(player.getAttribute('width'));
    context({
      x: rect.left + (event.clientX * rect.width) / width,
      y: rect.top + (event.clientY * rect.width) / width,
    });
  };
  const click = (event: Event) => {
    if ((event.target as Element).closest('[data-ux-text]')) return;
    const id = resolve(event);
    if (id) {
      player.pause();
      select(id);
    } else clear();
  };
  const doubleClick = (event: Event) => {
    const id = (event.target as Element).closest<HTMLElement>('[data-ux-text]')?.dataset.uxText;
    if (id) edit(id);
  };
  const key = (event: KeyboardEvent) => {
    if ((event.target as HTMLElement).isContentEditable) return;
    if ((event.target as Element).closest('input,textarea,select,button')) return;
    const forwarded = new KeyboardEvent('keydown', {
      key: event.key,
      code: event.code,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      repeat: event.repeat,
      cancelable: true,
    });
    if (!window.dispatchEvent(forwarded)) event.preventDefault();
  };
  const drop = (event: DragEvent) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    player.dispatchEvent(
      new DragEvent(event.type, {
        dataTransfer: event.dataTransfer,
        bubbles: true,
        cancelable: true,
      }),
    );
  };
  const dragEvents = ['dragenter', 'dragleave', 'dragover', 'drop'] as const;
  document.addEventListener('contextmenu', contextMenu);
  document.addEventListener('click', click);
  document.addEventListener('dblclick', doubleClick);
  document.addEventListener('keydown', key);
  for (const type of dragEvents) document.addEventListener(type, drop);
  return () => {
    document.removeEventListener('contextmenu', contextMenu);
    document.removeEventListener('click', click);
    document.removeEventListener('dblclick', doubleClick);
    document.removeEventListener('keydown', key);
    for (const type of dragEvents) document.removeEventListener(type, drop);
  };
}
