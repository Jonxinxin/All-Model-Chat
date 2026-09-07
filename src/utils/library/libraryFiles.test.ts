import { describe, it, expect } from 'vitest';
import {
  getLibraryFileType,
  isImageFileType,
  isVideoFileType,
  isDocumentFileType,
  formatLibraryDate,
  extractLibraryItemsFromSessions,
  filterAndSortLibraryItems,
  libraryItemToUploadedFile,
} from './libraryFiles';
import type { SavedChatSession, LibraryItem, LibraryFilterState } from '@/types';

describe('libraryFiles utils', () => {
  it('correctly classifies file types', () => {
    expect(getLibraryFileType('image/png', 'photo.png')).toBe('image');
    expect(getLibraryFileType('image/jpeg', 'photo.jpg')).toBe('image');
    expect(getLibraryFileType('application/pdf', 'paper.pdf')).toBe('pdf');
    expect(getLibraryFileType('text/csv', 'data.csv')).toBe('spreadsheet');
    expect(getLibraryFileType('application/vnd.ms-excel', 'data.xlsx')).toBe('spreadsheet');
    expect(getLibraryFileType('application/vnd.ms-powerpoint', 'slides.pptx')).toBe('presentation');
    expect(getLibraryFileType('text/plain', 'notes.txt')).toBe('document');
    expect(getLibraryFileType('text/markdown', 'readme.md')).toBe('document');
    expect(getLibraryFileType('audio/mp3', 'song.mp3')).toBe('audio');
    expect(getLibraryFileType('audio/wav', 'voice.wav')).toBe('audio');
    expect(getLibraryFileType('video/mp4', 'clip.mp4')).toBe('video');
    expect(getLibraryFileType('video/webm', 'recording.webm')).toBe('video');
  });

  it('determines isImageFileType and isDocumentFileType', () => {
    expect(isImageFileType('image/png', 'test.png')).toBe(true);
    expect(isImageFileType('application/pdf', 'test.pdf')).toBe(false);

    expect(isDocumentFileType('application/pdf', 'test.pdf')).toBe(true);
    expect(isDocumentFileType('image/png', 'test.png')).toBe(false);
    expect(isDocumentFileType('audio/mp3', 'test.mp3')).toBe(false);
    expect(isDocumentFileType('video/mp4', 'test.mp4')).toBe(false);
  });

  it('determines isVideoFileType correctly', () => {
    expect(isVideoFileType('video/mp4', 'clip.mp4')).toBe(true);
    expect(isVideoFileType('application/octet-stream', 'video.mov')).toBe(true);
    expect(isVideoFileType('video/webm', 'recording.webm')).toBe(true);
    expect(isVideoFileType('image/png', 'photo.png')).toBe(false);
    expect(isVideoFileType('application/pdf', 'document.pdf')).toBe(false);
    expect(isVideoFileType('audio/mp3', 'song.mp3')).toBe(false);
  });

  it('formats library dates nicely', () => {
    const now = Date.now();
    expect(formatLibraryDate(now, 'zh')).toBe('今天');
    expect(formatLibraryDate(now, 'en')).toBe('Today');

    const yesterday = now - 24 * 60 * 60 * 1000;
    expect(formatLibraryDate(yesterday, 'zh')).toBe('昨天');
    expect(formatLibraryDate(yesterday, 'en')).toBe('Yesterday');

    // 4 days ago
    const fourDaysAgo = now - 4 * 24 * 60 * 60 * 1000;
    const dateStr = formatLibraryDate(fourDaysAgo, 'zh');
    expect(dateStr.startsWith('星期')).toBe(true);
  });

  it('extracts library items from saved sessions', () => {
    const mockSessions: SavedChatSession[] = [
      {
        id: 'session-1',
        title: 'Session One',
        timestamp: 1000,
        settings: {} as any,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Here is a file',
            timestamp: new Date(1000),
            files: [
              {
                id: 'file-1',
                name: 'diagram.png',
                type: 'image/png',
                size: 1024,
              },
            ],
          },
          {
            id: 'msg-2',
            role: 'model',
            content: 'Here is another file',
            timestamp: new Date(2000),
            files: [
              {
                id: 'file-2',
                name: 'report.pdf',
                type: 'application/pdf',
                size: 2048,
              },
            ],
          },
        ],
      },
    ];

    const items = extractLibraryItemsFromSessions(mockSessions);
    expect(items).toHaveLength(2);
    expect(items[0].id).toBe('file-1');
    expect(items[0].source).toBe('uploaded');
    expect(items[0].sessionTitle).toBe('Session One');

    expect(items[1].id).toBe('file-2');
    expect(items[1].source).toBe('generated');
  });

  it('filters and sorts library items', () => {
    const items: LibraryItem[] = [
      {
        id: '1',
        name: 'A-photo.png',
        type: 'image/png',
        size: 500,
        timestamp: 100,
        source: 'uploaded',
      },
      {
        id: '2',
        name: 'B-doc.pdf',
        type: 'application/pdf',
        size: 2000,
        timestamp: 300,
        source: 'uploaded',
      },
      {
        id: '3',
        name: 'C-photo.jpg',
        type: 'image/jpeg',
        size: 1500,
        timestamp: 200,
        source: 'generated',
      },
      {
        id: '4',
        name: 'D-voice.mp3',
        type: 'audio/mp3',
        size: 800,
        timestamp: 250,
        source: 'uploaded',
      },
      {
        id: '5',
        name: 'E-clip.mp4',
        type: 'video/mp4',
        size: 3000,
        timestamp: 350,
        source: 'uploaded',
      },
    ];

    const baseFilter: LibraryFilterState = {
      category: 'all',
      source: 'all',
      fileType: 'all',
      sort: 'date_desc',
      searchQuery: '',
      viewMode: 'list',
    };

    // Category: image
    const imageOnly = filterAndSortLibraryItems(items, { ...baseFilter, category: 'image' });
    expect(imageOnly).toHaveLength(2);
    expect(imageOnly.map((i) => i.id)).toEqual(['3', '1']); // Sorted by date desc: 200 > 100

    // Category: document
    const docOnly = filterAndSortLibraryItems(items, { ...baseFilter, category: 'document' });
    expect(docOnly).toHaveLength(1);
    expect(docOnly[0].id).toBe('2');

    // Category: audio
    const audioOnly = filterAndSortLibraryItems(items, { ...baseFilter, category: 'audio' });
    expect(audioOnly).toHaveLength(1);
    expect(audioOnly[0].id).toBe('4');

    // Category: video
    const videoOnly = filterAndSortLibraryItems(items, { ...baseFilter, category: 'video' });
    expect(videoOnly).toHaveLength(1);
    expect(videoOnly[0].id).toBe('5');

    // Source: generated
    const genOnly = filterAndSortLibraryItems(items, { ...baseFilter, source: 'generated' });
    expect(genOnly).toHaveLength(1);
    expect(genOnly[0].id).toBe('3');

    // Sort: name_asc
    const nameAsc = filterAndSortLibraryItems(items, { ...baseFilter, sort: 'name_asc' });
    expect(nameAsc.map((i) => i.name)).toEqual([
      'A-photo.png',
      'B-doc.pdf',
      'C-photo.jpg',
      'D-voice.mp3',
      'E-clip.mp4',
    ]);

    // Sort: size_desc
    const sizeDesc = filterAndSortLibraryItems(items, { ...baseFilter, sort: 'size_desc' });
    expect(sizeDesc.map((i) => i.size)).toEqual([3000, 2000, 1500, 800, 500]);

    // Search query
    const searchDoc = filterAndSortLibraryItems(items, { ...baseFilter, searchQuery: 'doc' });
    expect(searchDoc).toHaveLength(1);
    expect(searchDoc[0].id).toBe('2');
  });

  it('converts library item to uploaded file', () => {
    const item: LibraryItem = {
      id: 'f-1',
      name: 'test.png',
      type: 'image/png',
      size: 1234,
      timestamp: 100,
      source: 'uploaded',
      textContent: 'hello',
    };

    const uploaded = libraryItemToUploadedFile(item);
    expect(uploaded.id).toBe('f-1');
    expect(uploaded.name).toBe('test.png');
    expect(uploaded.type).toBe('image/png');
    expect(uploaded.size).toBe(1234);
    expect(uploaded.textContent).toBe('hello');
  });

  it('preserves Files API metadata when extracting and converting library items', () => {
    const mockSessions: SavedChatSession[] = [
      {
        id: 'session-files-api',
        title: 'Files API Chat',
        timestamp: 1000,
        settings: {} as any,
        messages: [
          {
            id: 'msg-1',
            role: 'user',
            content: 'Uploaded via Files API',
            timestamp: new Date(1000),
            files: [
              {
                id: 'file-api-1',
                name: 'document.pdf',
                type: 'application/pdf',
                size: 10240,
                fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/abc123xyz',
                fileApiName: 'files/abc123xyz',
                fileApiExpirationTime: '2026-09-06T00:00:00.000Z',
                fileApiKeyFingerprint: 'key-fingerprint-123',
                transferStrategy: 'files-api',
                uploadState: 'active',
              },
            ],
          },
        ],
      },
    ];

    const items = extractLibraryItemsFromSessions(mockSessions);
    expect(items).toHaveLength(1);
    expect(items[0].fileUri).toBe('https://generativelanguage.googleapis.com/v1beta/files/abc123xyz');
    expect(items[0].fileApiName).toBe('files/abc123xyz');
    expect(items[0].fileApiExpirationTime).toBe('2026-09-06T00:00:00.000Z');
    expect(items[0].fileApiKeyFingerprint).toBe('key-fingerprint-123');
    expect(items[0].transferStrategy).toBe('files-api');
    expect(items[0].uploadState).toBe('active');

    const converted = libraryItemToUploadedFile(items[0]);
    expect(converted.fileUri).toBe('https://generativelanguage.googleapis.com/v1beta/files/abc123xyz');
    expect(converted.fileApiName).toBe('files/abc123xyz');
    expect(converted.fileApiExpirationTime).toBe('2026-09-06T00:00:00.000Z');
    expect(converted.fileApiKeyFingerprint).toBe('key-fingerprint-123');
    expect(converted.transferStrategy).toBe('files-api');
    expect(converted.uploadState).toBe('active');
  });
});
