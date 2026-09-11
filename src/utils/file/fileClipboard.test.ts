import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFileToClipboard, convertImageBlobToPng } from './fileClipboard';
import * as clipboardModule from '@/utils/clipboard';

describe('fileClipboard', () => {
  const originalClipboard = navigator.clipboard;
  const originalClipboardItem = globalThis.ClipboardItem;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      configurable: true,
      writable: true,
    });
    if (originalClipboardItem) {
      globalThis.ClipboardItem = originalClipboardItem;
    } else {
      // @ts-expect-error cleanup mock
      delete globalThis.ClipboardItem;
    }
  });

  describe('convertImageBlobToPng', () => {
    it('returns the same blob if already image/png', async () => {
      const pngBlob = new Blob(['png-content'], { type: 'image/png' });
      const result = await convertImageBlobToPng(pngBlob);
      expect(result).toBe(pngBlob);
    });

    it('converts non-png image using createImageBitmap and canvas', async () => {
      const jpegBlob = new Blob(['jpeg-content'], { type: 'image/jpeg' });
      const mockConvertedBlob = new Blob(['png-converted'], { type: 'image/png' });

      const mockBitmap = {
        width: 100,
        height: 100,
        close: vi.fn(),
      };

      globalThis.createImageBitmap = vi.fn().mockResolvedValue(mockBitmap);

      const mockCtx = {
        drawImage: vi.fn(),
      };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(mockCtx),
        toBlob: vi.fn((callback: (b: Blob | null) => void) => callback(mockConvertedBlob)),
      };

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return mockCanvas as unknown as HTMLCanvasElement;
        }
        return document.createElement(tagName);
      });

      const result = await convertImageBlobToPng(jpegBlob);
      expect(result).toBe(mockConvertedBlob);
      expect(mockCanvas.width).toBe(100);
      expect(mockCanvas.height).toBe(100);
      expect(mockCtx.drawImage).toHaveBeenCalledWith(mockBitmap, 0, 0);
      expect(mockBitmap.close).toHaveBeenCalled();
    });
  });

  describe('copyFileToClipboard', () => {
    it('throws error when dataUrl is missing', async () => {
      await expect(copyFileToClipboard({ dataUrl: '', type: 'text/plain' })).rejects.toThrow(
        'File preview URL is missing.',
      );
    });

    it('copies text files using copyTextToClipboard', async () => {
      const copyTextSpy = vi.spyOn(clipboardModule, 'copyTextToClipboard').mockResolvedValue(true);
      globalThis.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['hello code'], { type: 'text/plain' })),
      } as unknown as Response);

      await copyFileToClipboard({
        dataUrl: 'data:text/plain;base64,aGVsbG8=',
        type: 'text/plain',
      });

      expect(copyTextSpy).toHaveBeenCalledWith('hello code');
    });

    it('throws error when copyTextToClipboard fails for text file', async () => {
      vi.spyOn(clipboardModule, 'copyTextToClipboard').mockResolvedValue(false);
      globalThis.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['bad text'], { type: 'text/plain' })),
      } as unknown as Response);

      await expect(
        copyFileToClipboard({
          dataUrl: 'data:text/plain;base64,YmFk',
          type: 'text/plain',
        }),
      ).rejects.toThrow('Failed to copy file text to clipboard.');
    });

    it('throws when Clipboard API is unavailable for images', async () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: undefined,
        configurable: true,
        writable: true,
      });
      globalThis.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(new Blob(['img'], { type: 'image/png' })),
      } as unknown as Response);

      await expect(
        copyFileToClipboard({
          dataUrl: 'data:image/png;base64,iVBORw==',
          type: 'image/png',
        }),
      ).rejects.toThrow('Clipboard API not available.');
    });

    it('copies image/png directly to clipboard', async () => {
      const writeMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: writeMock },
        configurable: true,
        writable: true,
      });

      class MockClipboardItem {
        items: Record<string, Blob>;
        constructor(items: Record<string, Blob>) {
          this.items = items;
        }
      }
      // @ts-expect-error mock ClipboardItem
      globalThis.ClipboardItem = MockClipboardItem;

      const pngBlob = new Blob(['png-bytes'], { type: 'image/png' });
      globalThis.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(pngBlob),
      } as unknown as Response);

      await copyFileToClipboard({
        dataUrl: 'data:image/png;base64,iVBORw==',
        type: 'image/png',
      });

      expect(writeMock).toHaveBeenCalledTimes(1);
      const passedItem = writeMock.mock.calls[0][0][0] as MockClipboardItem;
      expect(passedItem.items['image/png']).toBe(pngBlob);
    });

    it('converts non-png image (e.g. image/jpeg) to image/png before writing', async () => {
      const writeMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { write: writeMock },
        configurable: true,
        writable: true,
      });

      class MockClipboardItem {
        items: Record<string, Blob>;
        constructor(items: Record<string, Blob>) {
          this.items = items;
        }
      }
      // @ts-expect-error mock ClipboardItem
      globalThis.ClipboardItem = MockClipboardItem;

      const jpegBlob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
      const convertedPngBlob = new Blob(['png-bytes'], { type: 'image/png' });

      globalThis.fetch = vi.fn().mockResolvedValue({
        blob: () => Promise.resolve(jpegBlob),
      } as unknown as Response);

      const mockBitmap = { width: 200, height: 100, close: vi.fn() };
      globalThis.createImageBitmap = vi.fn().mockResolvedValue(mockBitmap);

      const mockCtx = { drawImage: vi.fn() };
      const mockCanvas = {
        width: 0,
        height: 0,
        getContext: vi.fn().mockReturnValue(mockCtx),
        toBlob: vi.fn((callback: (b: Blob | null) => void) => callback(convertedPngBlob)),
      };

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'canvas') {
          return mockCanvas as unknown as HTMLCanvasElement;
        }
        return document.createElement(tagName);
      });

      await copyFileToClipboard({
        dataUrl: 'data:image/jpeg;base64,/9j/4AAQ...',
        type: 'image/jpeg',
      });

      expect(writeMock).toHaveBeenCalledTimes(1);
      const passedItem = writeMock.mock.calls[0][0][0] as MockClipboardItem;
      expect(passedItem.items['image/png']).toBe(convertedPngBlob);
      expect(passedItem.items['image/jpeg']).toBeUndefined();
    });
  });
});
