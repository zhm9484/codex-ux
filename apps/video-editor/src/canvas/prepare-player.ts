import type { HyperframesPlayer } from '@hyperframes/player';
import type { VideoDocument } from '@codex-ux/video-domain';
import { patchText } from './text-model';
import type { LiveTextEdit } from './live-edit';

/** Keep the imperative custom element lifecycle outside React's render model. */
export function preparePlayer(
  previous: HyperframesPlayer | null,
  doc: VideoDocument,
  workspaceId: string,
  revisionId: string,
  compare: boolean | undefined,
  edit: LiveTextEdit | null,
) {
  const instance = previous ?? (document.createElement('hyperframes-player') as HyperframesPlayer);
  if (!previous) instance.style.opacity = '0';
  instance.style.pointerEvents = 'none';
  instance.dataset.revision = revisionId;
  if (previous && edit) {
    const element = Array.from(
      instance.iframeElement.contentDocument!.querySelectorAll<HTMLElement>('[data-ux-text]'),
    ).find((element) => element.dataset.uxText === edit.selection.clip.id);
    if (element) patchText(element, edit.selection, edit.next, doc);
  }
  if (!compare) instance.setAttribute('interactive', '');
  if (!previous)
    instance.setAttribute(
      'src',
      `/media/video-editor/preview/${workspaceId}/${revisionId}/index.html`,
    );
  instance.setAttribute('width', String(doc.width));
  instance.setAttribute('height', String(doc.height));
  return instance;
}
