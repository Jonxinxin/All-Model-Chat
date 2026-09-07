import React from 'react';
import { MapPin } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import { seekSessionPdf } from '@/utils/media-nav/seekPdf';
import { extractTextFromNode } from '@/utils/reactNodeText';

interface InlinePdfLocateButtonProps {
  pageNumber: number;
  docName?: string;
  box2d?: [number, number, number, number];
  point?: [number, number];
  snippet?: string;
  messageId?: string;
  children: React.ReactNode;
}

/**
 * Minimalist graphite keycap inline PDF locate button.
 * Matches InlineTimestampSeekButton styling with a subtle red map pin
 * indicating PDF page/element location.
 */
export const InlinePdfLocateButton: React.FC<InlinePdfLocateButtonProps> = ({
  pageNumber,
  docName,
  box2d,
  point,
  snippet,
  messageId,
  children,
}) => {
  const { t } = useI18n();

  const handleClick = (e: React.MouseEvent) => {
    // If user is selecting text (e.g. dragging mouse or double-clicking to copy),
    // prevent accidental panel opening.
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    seekSessionPdf({
      pageNumber,
      docName,
      box2d,
      point,
      snippet,
      messageId,
    });
  };

  const labelText = extractTextFromNode(children);
  const buttonTitle = labelText ? `${t('pdfNavLocateButton')}: ${labelText}` : t('pdfNavLocateButton');

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 -my-0.5 mx-0.5 rounded-[5px] text-[0.82em] font-medium text-zinc-700 dark:text-zinc-200 bg-zinc-100/90 dark:bg-zinc-800/80 hover:bg-zinc-200/90 dark:hover:bg-zinc-700/80 hover:text-zinc-900 dark:hover:text-white active:scale-[0.97] transition-all cursor-pointer border border-zinc-200/80 dark:border-zinc-700/60 shadow-[0_1px_1px_rgba(0,0,0,0.04)] dark:shadow-none align-baseline"
      title={buttonTitle}
      data-testid="inline-pdf-locate-btn"
    >
      <MapPin
        size={9}
        aria-hidden="true"
        className="text-red-500/90 dark:text-red-400/90 flex-shrink-0 select-none pointer-events-none"
        data-selection-copy="exclude"
      />
      <span className="select-text">{children}</span>
    </button>
  );
};
