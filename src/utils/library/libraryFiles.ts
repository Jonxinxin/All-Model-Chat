import type { SavedChatSession, UploadedFile, LibraryItem, LibraryFilterState, LibraryFileTypeFilter } from '@/types';
import { getFileKindFlags } from '@/utils/file/fileTypeClassification';
import { fileToBlobUrl } from '@/utils/file/filePreviewUrls';

export const getLibraryFileType = (type: string, name: string): LibraryFileTypeFilter => {
  const flags = getFileKindFlags({ type, name });
  if (flags.isImage) return 'image';
  if (flags.isAudio) return 'audio';
  if (flags.isVideo || flags.isYoutube) return 'video';
  if (flags.isPdf) return 'pdf';
  if (flags.category === 'spreadsheet') return 'spreadsheet';
  if (flags.category === 'presentation') return 'presentation';
  return 'document';
};

export const isImageFileType = (type: string, name: string): boolean => {
  return getFileKindFlags({ type, name }).isImage;
};

export const isVideoFileType = (type: string, name: string): boolean => {
  const flags = getFileKindFlags({ type, name });
  return flags.isVideo || flags.isYoutube;
};

export const isAudioFileType = (type: string, name: string): boolean => {
  return getFileKindFlags({ type, name }).isAudio;
};

export const isDocumentFileType = (type: string, name: string): boolean => {
  return !isImageFileType(type, name) && !isAudioFileType(type, name) && !isVideoFileType(type, name);
};

const resolveLibraryDateLocale = (language: string): string => {
  const prefix = language.split('-')[0].toLowerCase();
  const map: Record<string, string> = {
    zh: 'zh-CN',
    ja: 'ja-JP',
    ko: 'ko-KR',
    es: 'es-ES',
    fr: 'fr-FR',
    de: 'de-DE',
  };
  return map[prefix] ?? 'en-US';
};

export const formatLibraryDate = (timestamp: number, language: string = 'zh'): string => {
  if (!timestamp || isNaN(timestamp)) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const locale = resolveLibraryDateLocale(language);

  const isToday =
    date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();

  if (isToday) {
    const formatted = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'day');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) {
    const formatted = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-1, 'day');
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  }

  // Within past 7 days: Day of week
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) {
    return new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  }

  const isCurrentYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(
    locale,
    isCurrentYear ? { month: 'short', day: 'numeric' } : { year: 'numeric', month: 'short', day: 'numeric' },
  ).format(date);
};

export const extractLibraryItemsFromSessions = (sessions: SavedChatSession[]): LibraryItem[] => {
  const itemMap = new Map<string, LibraryItem>();

  for (const session of sessions) {
    if (!session.messages) continue;

    for (const message of session.messages) {
      if (!message.files || message.files.length === 0) continue;

      const messageTimestamp =
        message.timestamp instanceof Date
          ? message.timestamp.getTime()
          : typeof message.timestamp === 'number'
            ? message.timestamp
            : session.timestamp;

      for (const file of message.files) {
        if (!file.id || !file.name) continue;

        // If not already in map, or this instance is newer
        const existing = itemMap.get(file.id);
        if (!existing || (messageTimestamp && messageTimestamp > existing.timestamp)) {
          itemMap.set(file.id, {
            id: file.id,
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size || (file.rawFile instanceof Blob ? file.rawFile.size : 0),
            timestamp: messageTimestamp || session.timestamp || Date.now(),
            sessionId: session.id,
            sessionTitle: session.title,
            messageId: message.id,
            rawFile: file.rawFile,
            dataUrl: file.dataUrl,
            textContent: file.textContent,
            source: message.role === 'model' ? 'generated' : 'uploaded',
            isStandalone: false,
            fileUri: file.fileUri,
            fileApiName: file.fileApiName,
            fileApiExpirationTime: file.fileApiExpirationTime,
            fileApiKeyFingerprint: file.fileApiKeyFingerprint,
            transferStrategy: file.transferStrategy,
            uploadState: file.uploadState,
          });
        }
      }
    }
  }

  return Array.from(itemMap.values());
};

export const filterAndSortLibraryItems = (items: LibraryItem[], filters: LibraryFilterState): LibraryItem[] => {
  let filtered = items;

  // Category filter
  if (filters.category === 'image') {
    filtered = filtered.filter((item) => isImageFileType(item.type, item.name));
  } else if (filters.category === 'document') {
    filtered = filtered.filter((item) => isDocumentFileType(item.type, item.name));
  } else if (filters.category === 'audio') {
    filtered = filtered.filter((item) => isAudioFileType(item.type, item.name));
  } else if (filters.category === 'video') {
    filtered = filtered.filter((item) => isVideoFileType(item.type, item.name));
  }

  // Source filter
  if (filters.source !== 'all') {
    filtered = filtered.filter((item) => item.source === filters.source);
  }

  // File type filter
  if (filters.fileType !== 'all') {
    filtered = filtered.filter((item) => getLibraryFileType(item.type, item.name) === filters.fileType);
  }

  // Search query filter
  if (filters.searchQuery.trim()) {
    const query = filters.searchQuery.trim().toLowerCase();
    filtered = filtered.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        (item.sessionTitle && item.sessionTitle.toLowerCase().includes(query)),
    );
  }

  // Sort
  const sorted = [...filtered];
  switch (filters.sort) {
    case 'date_asc':
      sorted.sort((a, b) => a.timestamp - b.timestamp);
      break;
    case 'name_asc':
      sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      break;
    case 'name_desc':
      sorted.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
      break;
    case 'size_desc':
      sorted.sort((a, b) => b.size - a.size);
      break;
    case 'size_asc':
      sorted.sort((a, b) => a.size - b.size);
      break;
    case 'date_desc':
    default:
      sorted.sort((a, b) => b.timestamp - a.timestamp);
      break;
  }

  return sorted;
};

export const libraryItemToUploadedFile = (item: LibraryItem): UploadedFile => {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    size: item.size,
    rawFile: item.rawFile,
    dataUrl: item.dataUrl,
    textContent: item.textContent,
    fileUri: item.fileUri,
    fileApiName: item.fileApiName,
    fileApiExpirationTime: item.fileApiExpirationTime,
    fileApiKeyFingerprint: item.fileApiKeyFingerprint,
    transferStrategy: item.transferStrategy,
    uploadState: item.uploadState,
  };
};

export const resolveLibraryItemToUploadedFile = async (
  item: LibraryItem,
  fetchBlob?: (item: LibraryItem) => Promise<Blob | null | undefined>,
): Promise<UploadedFile> => {
  let blob: Blob | undefined = item.rawFile;
  if (!blob && fetchBlob) {
    const fetched = await fetchBlob(item);
    if (fetched) {
      blob = fetched;
    }
  }
  if (!blob && item.textContent) {
    blob = new Blob([item.textContent], { type: item.type || 'text/plain' });
  }

  let dataUrl = item.dataUrl;
  if (dataUrl?.startsWith('blob:') && !item.rawFile) {
    dataUrl = undefined;
  }
  if (
    !dataUrl &&
    blob &&
    (isImageFileType(item.type, item.name) ||
      isAudioFileType(item.type, item.name) ||
      isVideoFileType(item.type, item.name))
  ) {
    dataUrl = fileToBlobUrl(blob);
  }

  const rawFile =
    blob instanceof File ? blob : blob ? new File([blob], item.name, { type: item.type || blob.type }) : undefined;

  return {
    ...libraryItemToUploadedFile(item),
    rawFile,
    dataUrl,
  };
};
