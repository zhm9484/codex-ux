import type { Clip, VideoDocument } from '@codex-ux/video-domain';
import { describeText, patchText, textBindings, type CanvasText } from './text-model';
import { startTextDrag } from './text-gestures';

export function createTextEditor(
  frame: Document,
  doc: VideoDocument,
  onSelect: (text: CanvasText) => void,
  onSave: (text: CanvasText, next: Clip) => Promise<unknown>,
  pause: () => void,
  onRestore: (text: CanvasText) => void = onSelect,
) {
  const hover = frame.createElement('style');
  hover.textContent =
    '[data-ux-text]:hover{outline:1px solid #a39bd077;outline-offset:4px}[contenteditable="plaintext-only"]{cursor:text!important;outline:none!important}';
  frame.head.appendChild(hover);
  const bindings = textBindings(frame, doc);
  let selectedId: string | null = null;
  const observe = new MutationObserver((records) => {
    if (
      !records.some((record) => Array.from(record.addedNodes).some((node) => node.nodeType === 1))
    )
      return;
    let restored = false;
    for (const [id, binding] of textBindings(frame, doc)) {
      if (!bindings.get(id)?.element.isConnected) {
        bindings.set(id, binding);
        binding.element.style.cursor = 'grab';
        if (id === selectedId) restored = true;
      }
    }
    if (restored && selectedId) {
      const selection = describe(selectedId);
      if (selection) onRestore(selection);
    }
  });
  observe.observe(frame.body, { childList: true, subtree: true });
  const describe = (id: string) => {
    const binding = bindings.get(id);
    return binding ? describeText(binding, doc) : null;
  };
  const select = (id: string) => {
    selectedId = id;
    const selection = describe(id);
    if (selection) {
      pause();
      onSelect(selection);
    }
    return selection;
  };
  const save = (selection: CanvasText, next: Clip) => {
    void onSave(selection, next).then((saved) => {
      const binding = bindings.get(selection.clip.id);
      if (!saved && binding?.element.isConnected) {
        patchText(binding.element, selection, selection.clip, doc);
        onSelect(selection);
      }
    });
  };
  const edit = (id: string) => {
    const selection = select(id);
    const binding = bindings.get(id);
    if (!selection || !binding) return;
    const element = binding.source ? binding.element : binding.element.querySelector('span')!;
    const original = element.textContent ?? '';
    element.contentEditable = 'plaintext-only';
    element.setAttribute('role', 'textbox');
    element.setAttribute('aria-label', 'Canvas text');
    element.focus({ preventScroll: true });
    const range = frame.createRange();
    range.selectNodeContents(element);
    frame.defaultView?.getSelection()?.removeAllRanges();
    frame.defaultView?.getSelection()?.addRange(range);
    element.onkeydown = (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        element.textContent = original;
        element.blur();
      }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        element.blur();
      }
    };
    element.onblur = () => {
      element.contentEditable = 'false';
      element.removeAttribute('role');
      const text = element.innerText.slice(0, 4000);
      element.onblur = null;
      element.onkeydown = null;
      if (text !== original) save(selection, { ...selection.clip, text });
    };
  };
  const down = (event: PointerEvent) => {
    const id = (event.target as Element).closest<HTMLElement>('[data-ux-text]')?.dataset.uxText;
    const binding = id ? bindings.get(id) : null;
    if (!binding || !id) return;
    const selection = select(id)!;
    startTextDrag(event, binding, selection, doc, onSelect, save);
  };
  frame.addEventListener('pointerdown', down);
  for (const binding of bindings.values()) binding.element.style.cursor = 'grab';
  return {
    select,
    restore: (id: string) => {
      selectedId = id;
      const selection = describe(id);
      if (selection) onRestore(selection);
    },
    edit,
    describe,
    patch: (selection: CanvasText, next: Clip) => {
      const binding = bindings.get(selection.clip.id);
      if (binding) patchText(binding.element, selection, next, doc);
    },
    destroy: () => {
      observe.disconnect();
      hover.remove();
      frame.removeEventListener('pointerdown', down);
    },
  };
}
