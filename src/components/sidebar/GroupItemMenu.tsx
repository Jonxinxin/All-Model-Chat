import React, { type RefObject, useRef } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { MessageSquarePlus, SquarePen, Trash2, Eraser } from 'lucide-react';
import {
  MENU_ITEM_BUTTON_CLASS,
  MENU_ITEM_DEFAULT_STATE_CLASS,
  MENU_ITEM_DANGER_STATE_CLASS,
} from '@/constants/menuClasses';

interface GroupItemMenuProps {
  menuRef: RefObject<HTMLDivElement>;
  onNewChat: () => void;
  onStartEdit: () => void;
  onDelete: () => void;
  onClear?: () => void;
  hasSessions?: boolean;
}

export const GroupItemMenu: React.FC<GroupItemMenuProps> = ({
  menuRef,
  onNewChat,
  onStartEdit,
  onDelete,
  onClear,
  hasSessions = true,
}) => {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = activeIndex < buttons.length - 1 ? activeIndex + 1 : 0;
      buttons[nextIndex]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = activeIndex > 0 ? activeIndex - 1 : buttons.length - 1;
      buttons[prevIndex]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    }
  };

  return (
    <div ref={menuRef} className="relative z-10" onKeyDown={handleKeyDown}>
      <div
        ref={containerRef}
        role="menu"
        aria-orientation="vertical"
        className="absolute right-3 -top-1 w-48 bg-[var(--theme-bg-primary)] border border-[var(--theme-border-secondary)] rounded-xl shadow-xl p-1 animate-in fade-in zoom-in-95 backdrop-blur-md"
      >
        <button
          role="menuitem"
          onClick={onNewChat}
          className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS} rounded-lg`}
        >
          <MessageSquarePlus size={14} className="text-[var(--theme-text-secondary)] shrink-0" />
          <span className="truncate">{t('historyNewChatInGroup')}</span>
        </button>
        <button
          role="menuitem"
          onClick={onStartEdit}
          className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DEFAULT_STATE_CLASS} rounded-lg`}
        >
          <SquarePen size={14} className="text-[var(--theme-text-secondary)] shrink-0" />
          <span>{t('edit')}</span>
        </button>
        {onClear && (
          <button
            role="menuitem"
            onClick={onClear}
            disabled={!hasSessions}
            className={`${MENU_ITEM_BUTTON_CLASS} rounded-lg ${
              hasSessions ? MENU_ITEM_DEFAULT_STATE_CLASS : 'text-[var(--theme-text-tertiary)] opacity-50 cursor-not-allowed'
            }`}
          >
            <Eraser size={14} className="text-[var(--theme-text-secondary)] shrink-0" />
            <span className="truncate">{t('historyClearGroup')}</span>
          </button>
        )}
        <div className="my-1 -mx-1 h-px bg-[var(--theme-border-secondary)]" />
        <button
          role="menuitem"
          onClick={onDelete}
          className={`${MENU_ITEM_BUTTON_CLASS} ${MENU_ITEM_DANGER_STATE_CLASS} rounded-lg`}
        >
          <Trash2 size={14} className="shrink-0" />
          <span>{t('delete')}</span>
        </button>
      </div>
    </div>
  );
};
