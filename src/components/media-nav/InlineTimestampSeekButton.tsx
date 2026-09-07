import React from 'react';
import { Play } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { seekSessionVideo } from '@/utils/media-nav/seekVideo';
import { extractTextFromNode } from '@/utils/reactNodeText';

import { useChatStore } from '@/stores/chatStore';
import { useMediaNavStore } from '@/stores/mediaNavStore';
import { collectSessionMediaFiles } from '@/utils/media-nav/sessionMediaFiles';

interface InlineTimestampSeekButtonProps {
  startSeconds: number;
  endSeconds?: number;
  videoName?: string;
  annotation?: {
    point?: [number, number];
    box2d?: [number, number, number, number];
    snippet?: string;
  };
  messageId?: string;
  children: React.ReactNode;
}

/**
 * Minimalist graphite keycap inline video/audio seek button.
 * Uses neutral warm-cool slate/zinc tones, fine micro-border and subtle
 * drop shadow to blend seamlessly into editorial text without color clashing.
 */
export const InlineTimestampSeekButton: React.FC<InlineTimestampSeekButtonProps> = ({
  startSeconds,
  endSeconds,
  videoName,
  annotation,
  messageId,
  children,
}) => {
  const { t } = useI18n();
  const isAudio = useChatStore((state) => {
    const store = useMediaNavStore.getState();
    if (store.isOpen && store.openKind === 'audio') return true;
    const { videos, audios } = collectSessionMediaFiles(state.selectedFiles, state.activeMessages);
    if (
      videoName &&
      audios.some((a) => a.name === videoName || a.name.toLowerCase().includes(videoName.toLowerCase()))
    ) {
      return true;
    }
    return videos.length === 0 && audios.length > 0;
  });

  const handleClick = (e: React.MouseEvent) => {
    // If user is selecting text (e.g. dragging mouse or double-clicking to copy),
    // prevent accidental media seek jump.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    seekSessionVideo({
      startSeconds,
      endSeconds,
      videoName,
      annotation,
      messageId,
    });
  };

  const labelText = extractTextFromNode(children);
  const actionTitle = isAudio ? t('audioLocateButton') : t('videoLocateButton');
  const buttonTitle = labelText ? `${actionTitle}: ${labelText}` : actionTitle;

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 -my-0.5 mx-0.5 rounded-[5px] font-mono text-[0.82em] font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200/90 dark:hover:bg-zinc-700/80 hover:text-zinc-900 dark:hover:text-white active:scale-[0.97] transition-all cursor-pointer border border-zinc-200/80 dark:border-zinc-700/60 shadow-[0_1px_1px_rgba(0,0,0,0.04)] dark:shadow-none align-baseline"
      title={buttonTitle}
      data-testid="inline-timestamp-seek-btn"
    >
      <Play
        size={8.5}
        aria-hidden="true"
        className="fill-current text-zinc-400 dark:text-zinc-400 opacity-90 flex-shrink-0 select-none pointer-events-none"
        data-selection-copy="exclude"
      />
      <span className="select-text">{children}</span>
    </button>
  );
};
