import { parse, type DefaultTreeAdapterTypes } from 'parse5';

type Element = DefaultTreeAdapterTypes.Element;
type Node = DefaultTreeAdapterTypes.Node;
export function htmlElements(html: string) {
  const result: Element[] = [];
  function visit(node: Node) {
    if ('tagName' in node) result.push(node);
    if ('childNodes' in node) node.childNodes.forEach(visit);
    if ('content' in node) visit(node.content);
  }
  visit(parse(html, { sourceCodeLocationInfo: true }));
  return result;
}
export const attribute = (element: Element, name: string) =>
  element.attrs.find((attr) => attr.name === name)?.value;

/** Source ranges allow a text edit without reserializing scripts or the surrounding HTML. */
export function nativeTextTargets(html: string) {
  return htmlElements(html).flatMap((element, index) => {
    const location = element.sourceCodeLocation;
    if (
      !location?.startTag ||
      !location.endTag ||
      ['script', 'style', 'noscript', 'title', 'textarea', 'option'].includes(element.tagName) ||
      String(element.namespaceURI) !== 'http://www.w3.org/1999/xhtml' ||
      !element.childNodes.length ||
      element.childNodes.some((child) => child.nodeName !== '#text')
    )
      return [];
    const text = element.childNodes
      .map((child) => (child as DefaultTreeAdapterTypes.TextNode).value)
      .join('');
    return text.trim()
      ? [
          {
            index,
            tag: element.tagName,
            id: attribute(element, 'id'),
            text,
            style: attribute(element, 'style') ?? '',
            location,
          },
        ]
      : [];
  });
}
const escapeText = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
export function replaceNativeText(html: string, index: number, text: string, style: string) {
  const target = nativeTextTargets(html).find((item) => item.index === index);
  if (!target) throw new Error('This text no longer has a reliable source location.');
  const location = target.location;
  const attr = location.attrs?.style;
  const escapedStyle = style.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  const start = attr?.startOffset ?? location.startTag!.endOffset - 1;
  const end = attr?.endOffset ?? start;
  return (
    html.slice(0, start) +
    ` style="${escapedStyle}"` +
    html.slice(end, location.startTag!.endOffset) +
    escapeText(text) +
    html.slice(location.endTag!.startOffset)
  );
}
export function nativeMetadata(html: string) {
  const root = htmlElements(html).find(
    (element) => attribute(element, 'data-composition-id') && attribute(element, 'data-width'),
  );
  if (!root)
    throw new Error(
      'The entry HTML needs HyperFrames composition metadata (data-composition-id, data-width, data-height, data-duration).',
    );
  const number = (name: string) => Number(attribute(root, name));
  const width = number('data-width'),
    height = number('data-height'),
    duration = number('data-duration');
  if (![width, height, duration].every((value) => Number.isFinite(value) && value > 0))
    throw new Error('Composition dimensions and duration must be positive numbers.');
  return { width, height, duration };
}
