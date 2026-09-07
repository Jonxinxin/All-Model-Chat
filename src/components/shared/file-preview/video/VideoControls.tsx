import React, { useRef } from 'react';
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  StepBack,
  StepForward,
  Volume2,
  VolumeX,
  PictureInPicture,
} from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { formatTimestamp } from '@/utils/media-nav/timestamp';
import { Tooltip } from '@/components/shared/Tooltip';
import { Slider } from '@/components/shared/Slider';

interface VideoControlsProps {
  visible: boolean;
  style?: React.CSSProperties;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  isPictureInPicture?: boolean;
  activeSegment?: { start: number; end: number } | null;
  onTogglePlay: () => void;
  onStepFrame: (direction: 'back' | 'forward') => void;
  onCyclePlaybackRate: () => void;
  onToggleMute: () => void;
  onVolumeChange: (newVolume: number) => void;
  onToggleFullscreen: () => void;
  onTogglePictureInPicture?: () => void;
  onSeek: (seconds: number) => void;
}

export const VideoControls: React.FC<VideoControlsProps> = ({
  visible,
  style,
  currentTime,
  duration,
  isPlaying,
  playbackRate,
  volume,
  isMuted,
  isFullscreen,
  isPictureInPicture: _isPictureInPicture,
  activeSegment,
  onTogglePlay,
  onStepFrame,
  onCyclePlaybackRate,
  onToggleMute,
  onVolumeChange,
  onToggleFullscreen,
  onTogglePictureInPicture,
  onSeek,
}) => {
  const { t } = useI18n();
  const isScrubbingRef = useRef(false);

  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  return (
    <div
      className={`absolute bottom-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent px-3 sm:px-4 py-2.5 pt-8 flex flex-col gap-2 transition-opacity duration-300 z-30 pointer-events-auto rounded-b-xl ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      style={style}
    >
      <div className="relative w-full flex items-center group/timeline py-1.5 cursor-pointer">
        <div className="absolute inset-x-0 h-1 group-hover/timeline:h-1.5 bg-white/25 rounded-full overflow-hidden transition-all pointer-events-none">
          <div className="h-full bg-white transition-[width] duration-75" style={{ width: `${progressPercent}%` }} />
        </div>

        {activeSegment && duration > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-emerald-400/80 rounded-full pointer-events-none border border-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.6)] z-10"
            style={{
              left: `${Math.max(0, Math.min(100, (activeSegment.start / duration) * 100))}%`,
              width: `${Math.max(0.5, Math.min(100, ((activeSegment.end - activeSegment.start) / duration) * 100))}%`,
            }}
          />
        )}

        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.05}
          value={currentTime}
          onPointerDown={() => {
            isScrubbingRef.current = true;
          }}
          onPointerUp={() => {
            isScrubbingRef.current = false;
          }}
          onChange={(e) => {
            onSeek(Number.parseFloat(e.target.value));
          }}
          className="relative z-20 w-full h-1 group-hover/timeline:h-1.5 appearance-none bg-transparent outline-none cursor-pointer accent-white transition-all"
          aria-label="Seek timeline"
          title="Seek (← / →)"
        />
      </div>

      <div className="flex items-center justify-between text-white/95 text-xs select-none">
        <div className="flex items-center gap-1 sm:gap-1.5">
          <Tooltip text={`${isPlaying ? t('videoPause') : t('videoPlay')} (Space / K)`} asChild>
            <button
              type="button"
              onClick={onTogglePlay}
              className="p-1.5 rounded-lg hover:bg-white/20 active:bg-white/30 text-white transition-all active:scale-95 cursor-pointer"
              aria-label={isPlaying ? t('videoPause') : t('videoPlay')}
            >
              {isPlaying ? (
                <Pause size={17} className="fill-current" />
              ) : (
                <Play size={17} className="fill-current ml-0.5" />
              )}
            </button>
          </Tooltip>

          <Tooltip text={`${t('videoStepBack')} (Shift+← / ,)`} asChild>
            <button
              type="button"
              onClick={() => onStepFrame('back')}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 active:bg-white/25 transition-all active:scale-95 cursor-pointer"
              aria-label={t('videoStepBack')}
            >
              <StepBack size={14} />
            </button>
          </Tooltip>

          <Tooltip text={`${t('videoStepForward')} (Shift+→ / .)`} asChild>
            <button
              type="button"
              onClick={() => onStepFrame('forward')}
              className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 active:bg-white/25 transition-all active:scale-95 cursor-pointer"
              aria-label={t('videoStepForward')}
            >
              <StepForward size={14} />
            </button>
          </Tooltip>

          <div className="ml-1.5 font-mono text-xs tabular-nums text-white/90 select-none tracking-tight">
            <span>{formatTimestamp(currentTime)}</span>
            <span className="opacity-40 mx-1">/</span>
            <span className="opacity-70">{formatTimestamp(duration)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <Tooltip text={t('videoSpeed')} asChild>
            <button
              type="button"
              onClick={onCyclePlaybackRate}
              className="px-2 py-0.5 rounded font-mono text-xs font-medium bg-white/10 hover:bg-white/20 active:bg-white/30 text-white transition-all active:scale-95 cursor-pointer shadow-sm"
              aria-label={t('videoSpeed')}
            >
              {playbackRate}x
            </button>
          </Tooltip>

          <div className="flex items-center gap-1.5 group/volume relative">
            <Tooltip text={`${isMuted ? t('videoUnmute') : t('videoMute')} (M)`} asChild>
              <button
                type="button"
                onClick={onToggleMute}
                className="p-1.5 rounded-lg hover:bg-white/20 active:bg-white/30 text-white transition-all active:scale-95 cursor-pointer"
                aria-label={isMuted ? t('videoUnmute') : t('videoMute')}
              >
                {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </Tooltip>
            <div className="w-14 sm:w-16 hidden sm:flex items-center">
              <Slider
                value={isMuted ? 0 : volume}
                min={0}
                max={1}
                step={0.05}
                onChange={onVolumeChange}
                ariaLabel="Volume"
                className="w-full"
              />
            </div>
          </div>

          {onTogglePictureInPicture && (
            <Tooltip text="画中画 (P)" asChild>
              <button
                type="button"
                onClick={onTogglePictureInPicture}
                className="p-1.5 rounded-lg hover:bg-white/20 active:bg-white/30 text-white transition-all active:scale-95 cursor-pointer"
                aria-label="画中画"
              >
                <PictureInPicture size={16} />
              </button>
            </Tooltip>
          )}

          <Tooltip text={`${isFullscreen ? t('videoExitFullscreen') : t('videoFullscreen')} (F)`} asChild>
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="p-1.5 rounded-lg hover:bg-white/20 active:bg-white/30 text-white transition-all active:scale-95 cursor-pointer"
              aria-label={isFullscreen ? t('videoExitFullscreen') : t('videoFullscreen')}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
};
