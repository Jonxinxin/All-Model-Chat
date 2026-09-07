import { formatTimestamp, parseTimestamp } from './timestamp';
import { parseTagAttributes } from './tagAttributes';
import { transformMarkdownTextSegments } from '@/utils/markdownSegments';

// Matches mm:ss or hh:mm:ss, with optional range separator (- ~ – — 至 到 to)
const TIMESTAMP_PATTERN =
  /(?<![:\d])(\b\d{1,2}:\d{2}(?::\d{2})?)(?:\s*(?:[-–—~至到]|to)\s*(\d{1,2}:\d{2}(?::\d{2})?))?(?![:\d])\b/g;

// Matches timestamps optionally enclosed in [brackets] or (parentheses)
const TIMESTAMP_BRACKET_PATTERN =
  /(?:(\[|\()(?<![:\d]))?(\b\d{1,2}:\d{2}(?::\d{2})?)(?:\s*(?:[-–—~至到]|to)\s*(\d{1,2}:\d{2}(?::\d{2})?))?(?![:\d])\b(?:(\]|\)))?/g;

// Matches markdown links so we don't transform timestamps inside existing links [text](url)
const MARKDOWN_LINK_PATTERN = /\[((?:\\\]|[^\]])+)\]\(([^)]+)\)/g;

const TIME_LOCATE_TAG_RE = /<(?:video|audio)-locate\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:video|audio)-locate>)/gi;
const INLINE_TIME_LOCATE_RE =
  /(?:(\r?\n[ \t]*)|([ \t]*))<(?:video|audio)-locate\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:video|audio)-locate>)/gi;
const PARTIAL_TIME_LOCATE_RE = /<(?:video|audio)-locate\b[^>]*(?:>[^<]*)?$/i;

const checkPrecedingTextHasMatchingTimestamp = (precedingText: string, startSec: number): boolean => {
  const clean = precedingText.replace(TIME_LOCATE_TAG_RE, '');
  TIMESTAMP_PATTERN.lastIndex = 0;
  let tm: RegExpExecArray | null;
  while ((tm = TIMESTAMP_PATTERN.exec(clean)) !== null) {
    const s = parseTimestamp(tm[1]);
    const e = tm[2] ? parseTimestamp(tm[2]) : null;
    if (s !== null) {
      if (e !== null) {
        if (startSec >= s - 1 && startSec <= e + 1) return true;
      } else if (Math.abs(s - startSec) <= 2) {
        return true;
      }
    }
  }
  return false;
};

const buildVideoSeekMarkdownLink = (attrs: Record<string, string>, inner: string): string | null => {
  const rawStart = attrs.start ?? attrs.ts ?? attrs.time;
  const startSeconds = parseTimestamp(rawStart);
  if (startSeconds === null) return null;

  const endSeconds = attrs.end ? parseTimestamp(attrs.end) : null;
  const hasValidEnd = endSeconds !== null && endSeconds > startSeconds;

  const query = new URLSearchParams();
  query.set('start', String(startSeconds));
  if (hasValidEnd) query.set('end', String(endSeconds));
  if (attrs.point?.trim()) {
    const normalizedPoint = attrs.point
      .replace(/[()[\]]/g, '')
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .join(',');
    if (normalizedPoint) query.set('point', normalizedPoint);
  }
  if (attrs.box?.trim()) {
    const normalizedBox = attrs.box
      .replace(/[()[\]]/g, '')
      .split(/[,;\s]+/)
      .map((v) => v.trim())
      .filter(Boolean)
      .join(',');
    if (normalizedBox) query.set('box', normalizedBox);
  }
  if (attrs.video) query.set('video', attrs.video.trim());
  if (attrs.audio) query.set('video', attrs.audio.trim());
  const cleanSnippet = inner.trim();
  if (cleanSnippet) query.set('snippet', cleanSnippet);

  const timeStr = hasValidEnd
    ? `${formatTimestamp(startSeconds)}-${formatTimestamp(endSeconds!)}`
    : formatTimestamp(startSeconds);

  let label: string;
  if (!cleanSnippet) {
    label = timeStr;
  } else if (cleanSnippet.includes(':') || cleanSnippet === timeStr) {
    label = cleanSnippet;
  } else {
    label = `${timeStr} · ${cleanSnippet}`;
  }

  const safeLabel = label.replace(/[[\]]/g, '\\$&');
  return `[${safeLabel}](#video-seek?${query.toString()})`;
};

/**
 * Transforms plain timestamps like "00:02-00:04" or "01:05" as well as
 * <video-locate> and <audio-locate> tags in text into internal `#video-seek` markdown links.
 * Avoids transforming inside code blocks and existing markdown links.
 */
export const linkifyTimestamps = (text: string): string => {
  if (!text) {
    return text;
  }

  return transformMarkdownTextSegments(text, (plainText) => {
    let processedText = plainText;

    if (processedText.includes('<video-locate') || processedText.includes('<audio-locate')) {
      // Split off trailing locate tags that appear as a distinct bottom block separated by blank line
      const trailingMatch = processedText.match(
        /^([\s\S]*?\n)\s*\n\s*((?:<(?:video|audio)-locate\b[^>]*(?:\/>|>[\s\S]*?<\/(?:video|audio)-locate>)\s*)+)$/i,
      );

      const bodyPart = trailingMatch ? trailingMatch[1] : processedText;
      const trailingPart = trailingMatch ? trailingMatch[2] : '';

      // Collect existing start timestamps in the body text (excluding locate tags)
      const bodyWithoutTags = bodyPart.replace(TIME_LOCATE_TAG_RE, '');
      const existingTimestamps = new Set<number>();
      TIMESTAMP_PATTERN.lastIndex = 0;
      let tsMatch: RegExpExecArray | null;
      while ((tsMatch = TIMESTAMP_PATTERN.exec(bodyWithoutTags)) !== null) {
        const sec = parseTimestamp(tsMatch[1]);
        if (sec !== null) existingTimestamps.add(sec);
      }

      // Convert inline locate tags in the body
      let transformedBody = bodyPart.replace(
        INLINE_TIME_LOCATE_RE,
        (
          _full,
          leadingNewline: string | undefined,
          leadingSpace: string | undefined,
          attrStr: string,
          inner: string | undefined,
          offset: number,
          fullStr: string,
        ) => {
          const attrs = parseTagAttributes(attrStr);
          const sec = parseTimestamp(attrs.start ?? attrs.ts ?? attrs.time);
          if (sec === null) return '';

          if (existingTimestamps.has(sec) || checkPrecedingTextHasMatchingTimestamp(fullStr.slice(0, offset), sec)) {
            // Already represented by an inline timestamp in the preceding sentence or bullet!
            return '';
          }

          const link = buildVideoSeekMarkdownLink(attrs, inner || '');
          if (link) {
            existingTimestamps.add(sec);
            const prefix = leadingNewline || leadingSpace || '';
            return `${prefix}${link}`;
          }
          return '';
        },
      );

      // Clean up excessive blank lines left behind by omitted tags
      transformedBody = transformedBody.replace(/\n\s*(\n\s*)+/g, '\n\n');

      // Convert trailing locate tags, omitting those whose timestamp is already in the body
      const transformedTrailingButtons: string[] = [];
      TIME_LOCATE_TAG_RE.lastIndex = 0;
      let trailingMatchItem: RegExpExecArray | null;
      while ((trailingMatchItem = TIME_LOCATE_TAG_RE.exec(trailingPart)) !== null) {
        const attrs = parseTagAttributes(trailingMatchItem[1]);
        const sec = parseTimestamp(attrs.start ?? attrs.ts ?? attrs.time);
        if (sec !== null && (existingTimestamps.has(sec) || checkPrecedingTextHasMatchingTimestamp(bodyPart, sec))) {
          // Already represented by an inline button in the body text
          continue;
        }
        const link = buildVideoSeekMarkdownLink(attrs, trailingMatchItem[2] || '');
        if (link) {
          transformedTrailingButtons.push(link);
          if (sec !== null) existingTimestamps.add(sec);
        }
      }

      if (transformedTrailingButtons.length > 0) {
        const trailingRow = transformedTrailingButtons.join(' ');
        processedText = transformedBody.trimEnd() ? `${transformedBody.trimEnd()}\n\n${trailingRow}` : trailingRow;
      } else {
        processedText = transformedBody;
      }
    }

    // Strip any unterminated mid-stream partial locate tag at the end
    processedText = processedText.replace(PARTIAL_TIME_LOCATE_RE, '');

    if (!processedText.includes(':')) {
      return processedText;
    }

    // Split plain text by existing markdown links
    const parts: { type: 'text' | 'link'; content: string }[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    MARKDOWN_LINK_PATTERN.lastIndex = 0;
    while ((match = MARKDOWN_LINK_PATTERN.exec(processedText)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: processedText.slice(lastIndex, match.index) });
      }
      parts.push({ type: 'link', content: match[0] });
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < processedText.length) {
      parts.push({ type: 'text', content: processedText.slice(lastIndex) });
    }

    return parts
      .map((part) => {
        if (part.type === 'link') {
          return part.content;
        }

        TIMESTAMP_BRACKET_PATTERN.lastIndex = 0;
        return part.content.replace(
          TIMESTAMP_BRACKET_PATTERN,
          (
            fullMatch,
            openB: string | undefined,
            rawStart: string,
            rawEnd: string | undefined,
            closeB: string | undefined,
          ) => {
            const startSeconds = parseTimestamp(rawStart);
            if (startSeconds === null) {
              return fullMatch;
            }

            const endSeconds = rawEnd ? parseTimestamp(rawEnd) : null;
            const hasValidEnd = endSeconds !== null && endSeconds > startSeconds;

            const query = hasValidEnd ? `start=${startSeconds}&end=${endSeconds}` : `start=${startSeconds}`;

            const hasPair = (openB === '[' && closeB === ']') || (openB === '(' && closeB === ')');
            const coreMatch = hasPair ? fullMatch.slice(1, -1) : fullMatch;
            const prefix = hasPair ? '' : openB || '';
            const suffix = hasPair ? '' : closeB || '';

            return `${prefix}[${coreMatch}](#video-seek?${query})${suffix}`;
          },
        );
      })
      .join('');
  });
};
