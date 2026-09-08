import React, { useState, useRef, useCallback } from 'react';
import { Check, Copy, X, Sparkles } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';

export interface ImageVisualCropperProps {
  fileName: string;
  imageDimensions: { width: number; height: number };
  onConfirmSelection: (box2d: [number, number, number, number]) => void;
  onCancel: () => void;
}

interface DragRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

/**
 * Visual Prompting Tool: Allows user to drag-select an area of an image,
 * view normalized coordinates, and insert an <image-locate> prompt directly into the chat composer.
 */
export const ImageVisualCropper: React.FC<ImageVisualCropperProps> = ({
  fileName,
  imageDimensions: _imageDimensions,
  onConfirmSelection,
  onCancel,
}) => {
  const { t } = useI18n();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragRect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [confirmedBox, setConfirmedBox] = useState<[number, number, number, number] | null>(null);
  const [copied, setCopied] = useState(false);

  const getRelativeCoords = useCallback((clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    const rawX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const rawY = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return {
      x: (rawX / rect.width) * 1000,
      y: (rawY / rect.height) * 1000,
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const coords = getRelativeCoords(e.clientX, e.clientY);
    setDragState({
      startX: coords.x,
      startY: coords.y,
      currentX: coords.x,
      currentY: coords.y,
    });
    setIsDragging(true);
    setConfirmedBox(null);
    setCopied(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragState) return;
    e.stopPropagation();
    const coords = getRelativeCoords(e.clientX, e.clientY);
    setDragState((prev) => (prev ? { ...prev, currentX: coords.x, currentY: coords.y } : null));
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragState) return;
    e.stopPropagation();
    setIsDragging(false);

    const coords = getRelativeCoords(e.clientX, e.clientY);
    const xmin = Math.round(Math.min(dragState.startX, coords.x));
    const xmax = Math.round(Math.max(dragState.startX, coords.x));
    const ymin = Math.round(Math.min(dragState.startY, coords.y));
    const ymax = Math.round(Math.max(dragState.startY, coords.y));

    // Threshold check (must be at least 15 units wide/high)
    if (xmax - xmin >= 15 && ymax - ymin >= 15) {
      setConfirmedBox([ymin, xmin, ymax, xmax]);
    } else {
      setDragState(null);
    }
  };

  // Compute bounding box percentage for rendering
  let boxStyle: React.CSSProperties | null = null;
  if (dragState) {
    const xmin = Math.min(dragState.startX, dragState.currentX);
    const xmax = Math.max(dragState.startX, dragState.currentX);
    const ymin = Math.min(dragState.startY, dragState.currentY);
    const ymax = Math.max(dragState.startY, dragState.currentY);

    boxStyle = {
      left: `${xmin / 10}%`,
      top: `${ymin / 10}%`,
      width: `${Math.max(0.5, (xmax - xmin) / 10)}%`,
      height: `${Math.max(0.5, (ymax - ymin) / 10)}%`,
    };
  }

  const handleCopyTag = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirmedBox) return;
    const tag = `<image-locate file="${fileName}" box="[${confirmedBox.join(',')}]">请问这里的具体情况是？</image-locate>`;
    navigator.clipboard?.writeText?.(tag);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleInsert = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmedBox) {
      onConfirmSelection(confirmedBox);
    }
  };

  return (
    <div
      ref={surfaceRef}
      data-testid="visual-cropper-surface"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="absolute inset-0 z-30 cursor-crosshair select-none touch-none bg-black/30"
    >
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-auto flex items-center gap-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-950/85 backdrop-blur-md border border-red-500/40 text-zinc-100 text-xs shadow-2xl">
          <Sparkles size={13} className="text-amber-400 animate-pulse" />
          <span>在图片上拖拽拉取矩形框，向 AI 进行视觉精准提问</span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="p-1 rounded-full bg-zinc-950/85 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-white/20 transition-all cursor-pointer shadow-lg"
          title={t('filePreviewVisualSelectExit')}
          aria-label={t('filePreviewVisualSelectExit')}
        >
          <X size={14} />
        </button>
      </div>

      {boxStyle && (
        <div
          data-testid="visual-crop-box"
          className="absolute border-2 border-red-500 bg-red-500/15 rounded shadow-[0_0_12px_rgba(239,68,68,0.5)] transition-none"
          style={boxStyle}
        >
          <div className="absolute -top-1 -left-1 w-2.5 h-2.5 border-t-2 border-l-2 border-white" />
          <div className="absolute -top-1 -right-1 w-2.5 h-2.5 border-t-2 border-r-2 border-white" />
          <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 border-b-2 border-l-2 border-white" />
          <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 border-b-2 border-r-2 border-white" />

          {confirmedBox && !isDragging && (
            <div
              className="absolute left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex items-center gap-1.5 p-1 rounded-lg bg-zinc-900/95 backdrop-blur-xl border border-white/20 shadow-2xl whitespace-nowrap"
              style={{
                top: confirmedBox[0] > 120 ? '-48px' : 'calc(100% + 10px)',
              }}
            >
              <button
                type="button"
                data-testid="visual-crop-insert-btn"
                onClick={handleInsert}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 active:scale-95 text-white text-xs font-semibold shadow transition-all cursor-pointer"
                title={t('filePreviewInsertQuestion')}
              >
                <Sparkles size={12} />
                <span>{t('filePreviewInsertQuestion')}</span>
              </button>

              <button
                type="button"
                onClick={handleCopyTag}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 active:scale-95 text-zinc-200 text-xs transition-all cursor-pointer"
                title={t('filePreviewCopyLocateTag')}
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copied ? '已复制' : t('filePreviewCopyLocateTag')}</span>
              </button>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmedBox(null);
                  setDragState(null);
                }}
                className="p-1 rounded text-zinc-400 hover:text-white hover:bg-white/15 transition-all cursor-pointer"
                title="重新框选"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
