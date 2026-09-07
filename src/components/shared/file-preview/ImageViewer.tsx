import React, { useState, useRef, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, RotateCw } from 'lucide-react';
import Panzoom, { type PanzoomObject } from '@panzoom/panzoom';
import { type UploadedFile } from '@/types';
import { FloatingToolbar, ToolbarButton, ToolbarDivider } from './FloatingToolbar';
import { useI18n } from '@/contexts/I18nContext';
import { ImageHighlightOverlay } from '@/components/media-nav/ImageHighlightOverlay';
import type { ImageNavHighlight } from '@/stores/mediaNavStore';

interface ImageViewerProps {
  file: UploadedFile;
  highlight?: ImageNavHighlight | null;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 10;
const BUTTON_ZOOM_FACTOR = 1.3;

const ImageViewerContent: React.FC<ImageViewerProps> = ({ file, highlight }) => {
  const { t } = useI18n();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const panzoomElementRef = useRef<HTMLDivElement>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Initialize Panzoom
  useEffect(() => {
    const elem = panzoomElementRef.current;
    if (!elem) return;

    const pz = Panzoom(elem, {
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      canvas: true,
      cursor: 'grab',
      animate: false,
    });
    panzoomRef.current = pz;

    const handlePanzoomChange = (e: Event) => {
      const detail = (e as CustomEvent<{ scale: number }>).detail;
      if (!detail || typeof detail.scale !== 'number') return;
      setScale(detail.scale);
    };

    elem.addEventListener('panzoomchange', handlePanzoomChange);

    return () => {
      elem.removeEventListener('panzoomchange', handlePanzoomChange);
      pz.destroy();
      panzoomRef.current = null;
    };
  }, []);

  // Smooth continuous exponential wheel zooming
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      const pz = panzoomRef.current;
      if (!pz) return;

      event.preventDefault();
      event.stopPropagation();

      let delta = event.deltaY;
      if (delta === 0 && event.deltaX) {
        delta = event.deltaX;
      }
      if (event.deltaMode === 1) {
        delta *= 20;
      } else if (event.deltaMode === 2) {
        delta *= 100;
      }

      const isPinch = event.ctrlKey;
      const zoomFactor = isPinch ? 0.012 : 0.0018;
      const currentScale = pz.getScale();
      const targetScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, currentScale * Math.exp(-delta * zoomFactor)));

      if (targetScale !== currentScale) {
        pz.zoomToPoint(targetScale, event, { animate: false });
      }
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', onWheel);
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    const pz = panzoomRef.current;
    if (!pz) return;
    const current = pz.getScale();
    const next = Math.min(MAX_SCALE, current * BUTTON_ZOOM_FACTOR);
    pz.zoom(next, { animate: true });
    setScale(next);
  }, []);

  const handleZoomOut = useCallback(() => {
    const pz = panzoomRef.current;
    if (!pz) return;
    const current = pz.getScale();
    const next = Math.max(MIN_SCALE, current / BUTTON_ZOOM_FACTOR);
    pz.zoom(next, { animate: true });
    setScale(next);
  }, []);

  const handleRotateLeft = useCallback(() => {
    setRotation((prevRotation) => (prevRotation - 90 + 360) % 360);
  }, []);

  const handleRotateRight = useCallback(() => {
    setRotation((prevRotation) => (prevRotation + 90) % 360);
  }, []);

  const handleReset = useCallback(() => {
    setRotation(0);
    setScale(1);
    panzoomRef.current?.reset({ animate: true });
  }, []);

  const handleDoubleClick = useCallback((event: React.MouseEvent) => {
    const pz = panzoomRef.current;
    if (!pz) return;
    const current = pz.getScale();
    if (Math.abs(current - 1) < 0.1) {
      pz.zoomToPoint(1.8, event.nativeEvent, { animate: true });
    } else {
      pz.reset({ animate: true });
      setRotation(0);
      setScale(1);
    }
  }, []);

  const focusHighlight = useCallback(() => {
    if (!highlight || !imageRef.current || !panzoomRef.current || !viewportRef.current) return;
    const { box2d, point } = highlight;
    if (!box2d && !point) return;

    const img = imageRef.current;
    const vp = viewportRef.current;
    const imgWidth = img.offsetWidth;
    const imgHeight = img.offsetHeight;
    const vpWidth = vp.clientWidth;
    const vpHeight = vp.clientHeight;

    if (imgWidth <= 0 || imgHeight <= 0 || vpWidth <= 0 || vpHeight <= 0) return;

    let targetCenterX = 0;
    let targetCenterY = 0;
    let targetScale = 1.8;

    if (box2d && box2d.length === 4) {
      const [ymin, xmin, ymax, xmax] = box2d;
      const actualYmin = Math.min(ymin, ymax);
      const actualYmax = Math.max(ymin, ymax);
      const actualXmin = Math.min(xmin, xmax);
      const actualXmax = Math.max(xmin, xmax);

      targetCenterX = ((actualXmin + actualXmax) / 2000) * imgWidth;
      targetCenterY = ((actualYmin + actualYmax) / 2000) * imgHeight;

      const boxW = Math.max(1, ((actualXmax - actualXmin) / 1000) * imgWidth);
      const boxH = Math.max(1, ((actualYmax - actualYmin) / 1000) * imgHeight);

      const isQuarterTurn = rotation % 180 !== 0;
      const visualBoxW = isQuarterTurn ? boxH : boxW;
      const visualBoxH = isQuarterTurn ? boxW : boxH;

      const fitScale = Math.min((vpWidth * 0.45) / visualBoxW, (vpHeight * 0.45) / visualBoxH);
      targetScale = Math.min(3.5, Math.max(1.3, fitScale));
    } else if (point && point.length === 2) {
      const [pointY, pointX] = point;
      targetCenterX = (pointX / 1000) * imgWidth;
      targetCenterY = (pointY / 1000) * imgHeight;
      targetScale = 1.8;
    }

    const centerX = imgWidth / 2;
    const centerY = imgHeight / 2;
    const deltaX = targetCenterX - centerX;
    const deltaY = targetCenterY - centerY;

    const angleRadians = (rotation * Math.PI) / 180;
    const rotatedDeltaX = deltaX * Math.cos(angleRadians) - deltaY * Math.sin(angleRadians);
    const rotatedDeltaY = deltaX * Math.sin(angleRadians) + deltaY * Math.cos(angleRadians);

    try {
      panzoomRef.current.zoom(targetScale, { animate: true });
      panzoomRef.current.pan(-rotatedDeltaX, -rotatedDeltaY, { animate: true });
      setScale(targetScale);
    } catch {
      // Ignore unmounted or animation cancellation errors
    }
  }, [highlight, rotation]);

  const handleImageLoad = useCallback(() => {
    if (highlight) {
      focusHighlight();
    }
  }, [focusHighlight, highlight]);

  useEffect(() => {
    if (!highlight) return;
    focusHighlight();
    const rafId = requestAnimationFrame(() => {
      focusHighlight();
    });
    return () => cancelAnimationFrame(rafId);
  }, [focusHighlight, highlight, highlight?.focusToken]);

  const isMermaidDiagram = file.type === 'image/svg+xml';

  return (
    <div
      ref={viewportRef}
      className="w-full h-full relative flex flex-col select-none overflow-hidden"
      onDoubleClick={handleDoubleClick}
    >
      <div className="w-full h-full flex items-center justify-center overflow-hidden">
        <div
          ref={panzoomElementRef}
          className="flex items-center justify-center cursor-grab active:cursor-grabbing"
          style={{ width: '100%', height: '100%' }}
        >
          <div
            style={{
              transform: `rotate(${rotation}deg)`,
              transformOrigin: 'center center',
              transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            <img
              ref={imageRef}
              src={file.dataUrl}
              alt={`Zoomed view of ${file.name}`}
              style={{
                display: 'block',
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
                userSelect: 'none',
                backgroundColor: isMermaidDiagram ? 'white' : 'transparent',
                borderRadius: isMermaidDiagram ? '4px' : '0',
                boxShadow: isMermaidDiagram ? '0 0 0 1px rgba(255,255,255,0.1)' : 'none',
                pointerEvents: 'none',
              }}
              onLoad={handleImageLoad}
              draggable={false}
            />
            {highlight && <ImageHighlightOverlay highlight={highlight} scale={scale} />}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto panzoom-exclude">
        <FloatingToolbar className="p-1.5">
          <ToolbarButton
            onClick={handleZoomOut}
            disabled={scale <= MIN_SCALE}
            title={t('filePreviewZoomOut')}
            aria-label={t('filePreviewZoomOut')}
          >
            <ZoomOut size={16} strokeWidth={1.5} />
          </ToolbarButton>

          <button
            type="button"
            onClick={handleReset}
            title={t('filePreviewResetView')}
            aria-label={t('filePreviewResetView')}
            className="min-w-[52px] px-1.5 py-0.5 rounded-full font-mono text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors select-none text-center"
          >
            {Math.round(scale * 100)}%
          </button>

          <ToolbarButton
            onClick={handleZoomIn}
            disabled={scale >= MAX_SCALE}
            title={t('filePreviewZoomIn')}
            aria-label={t('filePreviewZoomIn')}
          >
            <ZoomIn size={16} strokeWidth={1.5} />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            onClick={handleRotateLeft}
            title={t('filePreviewRotateLeft')}
            aria-label={t('filePreviewRotateLeft')}
          >
            <RotateCcw size={16} strokeWidth={1.5} />
          </ToolbarButton>

          <ToolbarButton onClick={handleRotateRight} title={t('filePreviewRotate')} aria-label={t('filePreviewRotate')}>
            <RotateCw size={16} strokeWidth={1.5} />
          </ToolbarButton>
        </FloatingToolbar>
      </div>
    </div>
  );
};

export const ImageViewer: React.FC<ImageViewerProps> = ({ file, highlight }) => (
  <ImageViewerContent key={file.id} file={file} highlight={highlight} />
);
