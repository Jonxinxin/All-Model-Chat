import React from 'react';
import { ScanSearch } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { seekSessionImage } from '@/utils/media-nav/seekImage';
import { extractTextFromNode } from '@/utils/reactNodeText';

interface InlineImageLocateButtonProps {
  fileName?: string;
  imageName?: string;
  box2d?: [number, number, number, number];
  point?: [number, number];
  arrow?: string;
  label?: string;
  snippet?: string;
  messageId?: string;
  children: React.ReactNode;
}

/**
 * Minimalist graphite keycap inline image locate button.
 * Matches InlinePdfLocateButton styling with a red ScanSearch icon
 * indicating image visual-grounding target location.
 */
export const InlineImageLocateButton: React.FC<InlineImageLocateButtonProps> = ({
  fileName,
  imageName,
  box2d,
  point,
  arrow,
  label,
  snippet,
  messageId,
  children,
}) => {
  const { t } = useI18n();

  const handleClick = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    seekSessionImage({
      fileName: fileName ?? imageName,
      box2d,
      point,
      arrow,
      label,
      snippet,
      messageId,
    });
  };

  const labelText = extractTextFromNode(children);
  const buttonTitle = labelText ? `${t('imageNavLocateButton')}: ${labelText}` : t('imageNavLocateButton');

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 -my-0.5 mx-0.5 rounded-[5px] text-[0.82em] font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200/90 dark:hover:bg-zinc-700/80 hover:text-zinc-900 dark:hover:text-white active:scale-[0.97] transition-all cursor-pointer border border-zinc-200/80 dark:border-zinc-700/60 shadow-[0_1px_1px_rgba(0,0,0,0.04)] dark:shadow-none align-baseline"
      title={buttonTitle}
      data-testid="inline-image-locate-btn"
    >
      <ScanSearch
        size={10}
        aria-hidden="true"
        className="text-red-500/90 dark:text-red-400/90 flex-shrink-0 select-none pointer-events-none"
        data-selection-copy="exclude"
      />
      <span className="select-text">{children}</span>
    </button>
  );
};
