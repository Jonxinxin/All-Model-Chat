import { type UploadedFile } from '@/types';
import { copyTextToClipboard } from '@/utils/clipboard';

const isClipboardTextType = (mimeType: string): boolean => {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType.includes('javascript') ||
    mimeType.includes('xml')
  );
};

const canvasToBlob = (canvas: HTMLCanvasElement, type = 'image/png'): Promise<Blob | null> => {
  if (typeof canvas.toBlob === 'function') {
    return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type));
  }

  return new Promise<Blob | null>((resolve) => {
    try {
      const dataUrl = canvas.toDataURL(type);
      const base64 = dataUrl.split(',')[1];
      if (!base64) {
        resolve(null);
        return;
      }
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      resolve(new Blob([array], { type }));
    } catch {
      resolve(null);
    }
  });
};

/**
 * Converts an image Blob of any format (JPEG, WebP, GIF, etc.) into a PNG Blob.
 * This is required because modern browser Clipboard APIs (navigator.clipboard.write)
 * strictly require image/png MIME type for images.
 */
export const convertImageBlobToPng = async (blob: Blob, mimeType?: string): Promise<Blob> => {
  const effectiveType = mimeType || blob.type;
  if (effectiveType === 'image/png') {
    return blob;
  }

  // Try createImageBitmap if supported
  if (typeof createImageBitmap === 'function' && typeof document !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(blob);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Canvas 2D context not available.');
        }
        ctx.drawImage(bitmap, 0, 0);
        const pngBlob = await canvasToBlob(canvas, 'image/png');
        if (pngBlob) {
          return pngBlob;
        }
      } finally {
        bitmap.close();
      }
    } catch (bitmapError) {
      if (typeof Image === 'undefined') {
        throw bitmapError;
      }
    }
  }

  // Fallback using HTMLImageElement
  if (typeof Image !== 'undefined' && typeof URL !== 'undefined' && typeof document !== 'undefined') {
    return new Promise<Blob>((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(blob);

      img.onload = async () => {
        URL.revokeObjectURL(objectUrl);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas 2D context not available.'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const pngBlob = await canvasToBlob(canvas, 'image/png');
          if (pngBlob) {
            resolve(pngBlob);
          } else {
            reject(new Error('Failed to convert image to PNG Blob.'));
          }
        } catch (canvasError) {
          reject(canvasError);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image for PNG conversion.'));
      };

      img.src = objectUrl;
    });
  }

  return blob;
};

export const copyFileToClipboard = async (file: Pick<UploadedFile, 'dataUrl' | 'type'>): Promise<void> => {
  if (!file.dataUrl) {
    throw new Error('File preview URL is missing.');
  }

  const response = await fetch(file.dataUrl);
  const blob = await response.blob();
  const mimeType = blob.type || file.type || '';

  if (isClipboardTextType(mimeType)) {
    const text = await blob.text();
    const success = await copyTextToClipboard(text);
    if (!success) {
      throw new Error('Failed to copy file text to clipboard.');
    }
    return;
  }

  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard API not available.');
  }

  let blobToWrite = blob;
  let typeToWrite = blob.type || file.type;

  if (mimeType.startsWith('image/')) {
    blobToWrite = await convertImageBlobToPng(blob, mimeType);
    typeToWrite = 'image/png';
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      [typeToWrite]: blobToWrite,
    }),
  ]);
};
