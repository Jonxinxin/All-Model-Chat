import { createLocateTagPatterns, linkifyLocateTags } from './locateTagTransform';

const IMAGE_LOCATE_PATTERNS = createLocateTagPatterns('image-locate');

const buildImageSeekMarkdownLink = (attrs: Record<string, string>, inner: string): string | null => {
  const fileName = attrs.file?.trim() || attrs.image?.trim() || attrs.doc?.trim();
  const rawBox = attrs.box?.trim() || attrs.box2d?.trim() || attrs.box_2d?.trim();
  const rawPoint = attrs.point?.trim();
  if (!rawBox && !rawPoint) return null;

  const query = new URLSearchParams();
  if (fileName) query.set('file', fileName);

  if (rawBox) {
    const normalizedBox = rawBox
      .replace(/[()[\]]/g, '')
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .join(',');
    if (normalizedBox) query.set('box', normalizedBox);
  }

  if (rawPoint) {
    const normalizedPoint = rawPoint
      .replace(/[()[\]]/g, '')
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .join(',');
    if (normalizedPoint) query.set('point', normalizedPoint);
  }

  if (attrs.arrow?.trim()) {
    query.set('arrow', attrs.arrow.trim());
  }

  const rawLabel = attrs.label?.trim();
  if (rawLabel) {
    query.set('label', rawLabel);
  }

  const cleanSnippet = inner.trim();
  if (cleanSnippet) {
    query.set('snippet', cleanSnippet);
  }

  let label: string;
  if (rawLabel && cleanSnippet && rawLabel !== cleanSnippet) {
    label = `${rawLabel} · ${cleanSnippet}`;
  } else if (rawLabel) {
    label = rawLabel;
  } else if (cleanSnippet) {
    label = cleanSnippet;
  } else if (rawBox) {
    label = '目标框选';
  } else {
    label = '目标定位';
  }

  const safeLabel = label.replace(/[[\]]/g, '\\$&');
  return `[${safeLabel}](#image-seek?${query.toString()})`;
};

/**
 * Transforms <image-locate> tags into inline interactive `#image-seek` markdown links.
 * Avoids transforming inside code blocks.
 */
export const linkifyImageLocates = (text: string): string =>
  linkifyLocateTags(text, 'image-locate', IMAGE_LOCATE_PATTERNS, buildImageSeekMarkdownLink);

