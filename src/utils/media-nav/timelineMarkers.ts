import type { ChatMessage, UploadedFile } from '@/types';
import { parseLocateMarkers } from './locateMarker';

export interface TimelineMarker {
  id: string;
  time: number;
  endTime?: number;
  snippet?: string;
  label?: string;
  box2d?: [number, number, number, number];
  point?: [number, number];
  mediaName?: string;
  messageId?: string;
}

const normalizeName = (name: string): string => {
  const base = name.split('/').pop()?.split('\\').pop() ?? name;
  return base.toLowerCase().replace(/\.[^/.]+$/, '').trim();
};

const isFileMatch = (markerName: string | undefined, file: UploadedFile | undefined): boolean => {
  if (!markerName || !file) return true;
  const normMarker = normalizeName(markerName);
  const normFile = normalizeName(file.name);
  if (!normMarker || !normFile) return true;
  return (
    normMarker === normFile ||
    normFile.includes(normMarker) ||
    normMarker.includes(normFile)
  );
};

const VIDEO_SEEK_LINK_RE = /\[([^\]]*?)\]\(#video-seek\?([^)\s]+)\)/g;

/**
 * Extracts all timeline marker points for a specific video or audio file
 * across all chat messages in the active session.
 * Deduplicates nearby timestamps (within 0.5s) and sorts chronologically.
 */
export const extractTimelineMarkers = (
  messages: ChatMessage[],
  file: UploadedFile | undefined,
  kind: 'video' | 'audio',
): TimelineMarker[] => {
  if (!messages || messages.length === 0) return [];

  const rawMarkers: Array<{
    time: number;
    endTime?: number;
    snippet?: string;
    label?: string;
    box2d?: [number, number, number, number];
    point?: [number, number];
    mediaName?: string;
    messageId?: string;
  }> = [];

  for (const msg of messages) {
    if (!msg.content) continue;

    // 1. Parse from structured locate tags (<video-locate> or <audio-locate>)
    const parsed = parseLocateMarkers(msg.content);
    if (kind === 'video' && parsed.videoLocates.length > 0) {
      for (const loc of parsed.videoLocates) {
        if (isFileMatch(loc.videoName, file)) {
          rawMarkers.push({
            time: loc.startSeconds,
            endTime: loc.endSeconds,
            snippet: loc.snippet,
            box2d: loc.box2d,
            point: loc.point,
            mediaName: loc.videoName,
            messageId: msg.id,
          });
        }
      }
    } else if (kind === 'audio' && parsed.audioLocates.length > 0) {
      for (const loc of parsed.audioLocates) {
        if (isFileMatch(loc.audioName, file)) {
          rawMarkers.push({
            time: loc.startSeconds,
            endTime: loc.endSeconds,
            snippet: loc.snippet,
            mediaName: loc.audioName,
            messageId: msg.id,
          });
        }
      }
    }

    // 2. Parse from markdown #video-seek links
    VIDEO_SEEK_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = VIDEO_SEEK_LINK_RE.exec(msg.content)) !== null) {
      const linkText = match[1]?.trim();
      const queryStr = match[2];
      const params = new URLSearchParams(queryStr);
      const startStr = params.get('start');
      if (!startStr) continue;
      const start = Number.parseFloat(startStr);
      if (!Number.isFinite(start) || start < 0) continue;

      const endStr = params.get('end');
      const end = endStr ? Number.parseFloat(endStr) : undefined;
      const videoName = params.get('video') || undefined;
      const snippet = params.get('snippet') || (linkText && !linkText.includes(':') ? linkText : undefined);

      if (isFileMatch(videoName, file)) {
        rawMarkers.push({
          time: start,
          endTime: Number.isFinite(end) ? end : undefined,
          snippet,
          label: linkText,
          mediaName: videoName,
          messageId: msg.id,
        });
      }
    }
  }

  if (rawMarkers.length === 0) return [];

  // Sort chronologically
  rawMarkers.sort((a, b) => a.time - b.time);

  // Deduplicate timestamps within 0.5 seconds
  const deduped: TimelineMarker[] = [];
  for (const cur of rawMarkers) {
    const existing = deduped.find((d) => Math.abs(d.time - cur.time) <= 0.5);
    if (existing) {
      // Merge richer info into existing
      if (!existing.snippet && cur.snippet) existing.snippet = cur.snippet;
      if (!existing.label && cur.label) existing.label = cur.label;
      if (existing.endTime === undefined && cur.endTime !== undefined) existing.endTime = cur.endTime;
      if (!existing.box2d && cur.box2d) existing.box2d = cur.box2d;
      if (!existing.point && cur.point) existing.point = cur.point;
    } else {
      deduped.push({
        id: `tm-${cur.time.toFixed(2)}-${cur.endTime ? cur.endTime.toFixed(2) : 'moment'}-${deduped.length}`,
        time: cur.time,
        endTime: cur.endTime,
        snippet: cur.snippet,
        label: cur.label,
        box2d: cur.box2d,
        point: cur.point,
        mediaName: cur.mediaName,
        messageId: cur.messageId,
      });
    }
  }

  return deduped;
};
