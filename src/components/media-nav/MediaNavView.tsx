import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Repeat, X } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import type { UploadedFile } from '@/types';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { formatTimestamp } from '@/utils/media-nav/timestamp';
import { type VideoAnnotation } from './VideoHighlightOverlay';
import { VideoPlayer, type VideoPlayerHandle } from '@/components/shared/file-preview/VideoPlayer';

interface MediaNavViewProps {
  file: UploadedFile;
  kind: 'video' | 'audio';
}

/**
 * Media player inside the media navigation panel (video or audio).
 * For video, delegates playback, HUD, letterbox-compensation, and frame stepping
 * to the shared VideoPlayer component while coordinating with the media navigation store.
 * For audio, coordinates playback, seeking, and segment looping with full segment banner controls.
 */
const MediaNavViewComponent: React.FC<MediaNavViewProps> = ({ file, kind }) => {
  const { t } = useI18n();
  const playerRef = useRef<VideoPlayerHandle | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [isMetadataReady, setIsMetadataReady] = useState(false);
  const [segment, setSegment] = useState<{ start: number; end: number } | null>(null);
  const [isSegmentLoopEnabled, setIsSegmentLoopEnabled] = useState(true);

  const [annotation, setAnnotation] = useState<VideoAnnotation | null>(null);
  const [annotationTargetTime, setAnnotationTargetTime] = useState<number | null>(null);
  const [isAnnotationVisible, setIsAnnotationVisible] = useState(false);

  const seekTarget = useMediaNavStore((state) => state.videoTarget);
  const consumeTarget = useMediaNavStore((state) => state.consumeVideoTarget);

  const handleSegmentChange = useCallback((newSeg: { start: number; end: number } | null) => {
    setSegment(newSeg);
    if (!newSeg) {
      setIsAnnotationVisible(false);
      useMediaNavStore.getState().consumeVideoTarget();
    }
  }, []);

  // Reset state on file switch
  useEffect(() => {
    setSegment(null);
    setIsSegmentLoopEnabled(true);
    setAnnotation(null);
    setAnnotationTargetTime(null);
    setIsAnnotationVisible(false);
    setIsMetadataReady(false);
  }, [file.id]);

  // Sync ready state if already available
  useEffect(() => {
    if (kind === 'audio' && audioRef.current && audioRef.current.readyState >= 1) {
      setIsMetadataReady(true);
    } else if (kind === 'video') {
      const videoEl = playerRef.current?.getVideoElement();
      if (videoEl && videoEl.readyState >= 1) {
        setIsMetadataReady(true);
      }
    }
  }, [kind, file.id]);

  // Handle incoming seek requests from store
  useEffect(() => {
    if (!seekTarget) return;
    if (!isMetadataReady) return;

    const hasSegment = seekTarget.end !== undefined;
    const targetSeconds = seekTarget.seconds;

    if (kind === 'video') {
      playerRef.current?.seekTo(targetSeconds, true);
    } else if (audioRef.current) {
      const media = audioRef.current;
      media.currentTime = Math.max(0, targetSeconds);
      try {
        const p = media.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            // Autoplay may be blocked by browser policy
          });
        }
      } catch {
        // Fallback for mock environments
      }
    }

    setSegment(hasSegment ? { start: targetSeconds, end: seekTarget.end! } : null);
    setIsSegmentLoopEnabled(true);

    if (seekTarget.box2d || seekTarget.point) {
      setAnnotation({
        box2d: seekTarget.box2d,
        point: seekTarget.point,
        snippet: seekTarget.snippet,
      });
      setAnnotationTargetTime(targetSeconds);
      setIsAnnotationVisible(true);
    } else {
      setAnnotation(null);
      setAnnotationTargetTime(null);
      setIsAnnotationVisible(false);
    }

    consumeTarget();
  }, [seekTarget, isMetadataReady, consumeTarget, kind]);

  // Audio loadedmetadata handler
  const handleAudioLoadedMetadata = () => {
    setIsMetadataReady(true);
  };

  const isHandlingSegmentLoopRef = useRef(false);
  const handleAudioTimeUpdate = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !segment) return;

    const currentTime = audio.currentTime;

    // If user manually scrubbed outside active segment bounds, exit segment
    if (currentTime < segment.start - 0.5 || currentTime > segment.end + 0.5) {
      if (!isHandlingSegmentLoopRef.current) {
        setSegment(null);
      }
      return;
    }

    // If audio reached or passed segment end
    if (currentTime >= segment.end) {
      if (isSegmentLoopEnabled) {
        isHandlingSegmentLoopRef.current = true;
        audio.currentTime = segment.start;
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
        setTimeout(() => {
          isHandlingSegmentLoopRef.current = false;
        }, 100);
      } else {
        audio.pause();
      }
    }
  }, [segment, isSegmentLoopEnabled]);

  return (
    <div className="h-full w-full flex flex-col bg-black select-none relative">
      {kind === 'video' ? (
        <VideoPlayer
          key={file.id}
          ref={playerRef}
          src={file.dataUrl || ''}
          file={file}
          testId="media-nav-video"
          segment={segment}
          onSegmentChange={handleSegmentChange}
          isSegmentLoopEnabled={isSegmentLoopEnabled}
          onSegmentLoopChange={setIsSegmentLoopEnabled}
          annotation={annotation}
          annotationTargetTime={annotationTargetTime}
          isAnnotationVisible={isAnnotationVisible}
          onAnnotationVisibilityChange={setIsAnnotationVisible}
          onAnnotationDismiss={() => setIsAnnotationVisible(false)}
          onLoadedMetadata={() => setIsMetadataReady(true)}
        />
      ) : (
        <div className="h-full w-full flex flex-col select-none relative">
          {segment && (
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#101113] border-b border-white/10 text-xs text-white/90 flex-shrink-0 z-30">
              <span className="font-mono">
                {t('videoLocateSegment')
                  .replace('{start}', formatTimestamp(segment.start))
                  .replace('{end}', formatTimestamp(segment.end))}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsSegmentLoopEnabled((prev) => !prev)}
                  className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                    isSegmentLoopEnabled ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10'
                  }`}
                  aria-pressed={isSegmentLoopEnabled}
                  aria-label={t('videoSegmentLoop')}
                  title={t('videoSegmentLoop')}
                  data-testid="media-segment-loop"
                >
                  <Repeat size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleSegmentChange(null)}
                  className="p-1.5 rounded-lg text-white/70 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  aria-label={t('videoSegmentExit')}
                  title={t('videoSegmentExit')}
                  data-testid="media-segment-exit"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          <div className="flex-grow min-h-0 flex items-center justify-center p-2 sm:p-3 relative overflow-hidden">
            <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-secondary)] p-6 shadow-xl">
              <span className="truncate text-sm font-medium text-[var(--theme-text-primary)]" title={file.name}>
                {file.name}
              </span>
              <audio
                key={file.id}
                ref={audioRef}
                src={file.dataUrl}
                controls
                onLoadedMetadata={handleAudioLoadedMetadata}
                onTimeUpdate={handleAudioTimeUpdate}
                className="w-full outline-none"
                data-testid="media-nav-audio"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const MediaNavView = React.memo(MediaNavViewComponent);
