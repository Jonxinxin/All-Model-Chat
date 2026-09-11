import { CHAT_INPUT_TEXTAREA_SELECTOR, HISTORY_SIDEBAR_ROOT_SELECTOR } from '@/constants/layout';

export type FocusChatInputOptions = {
  /** Place the caret at the end of the current input value after focusing. */
  caret?: 'end';
  /**
   * Number of retry attempts to reinforce focus against browser focus stealing
   * (e.g. mouseup completion, Radix tooltips, layout shifts, or panel slide animations).
   */
  retries?: number;
};

const placeCaretAtEnd = (textarea: HTMLTextAreaElement) => {
  const textLength = textarea.value.length;
  textarea.setSelectionRange(textLength, textLength);
  textarea.scrollTop = textarea.scrollHeight;
};

// 侧边栏内的可编辑控件（如双击标题重命名会话）。
// 注意：链接/按钮（例如「新聊天」）不在此列——它们只是动作入口，
// 点击后应正常把焦点移到聊天输入框。
export const isEditableElement = (element: HTMLElement): boolean =>
  element.tagName === 'INPUT' ||
  element.tagName === 'TEXTAREA' ||
  element.tagName === 'SELECT' ||
  element.isContentEditable;

export const focusChatInput = (delayMs = 50, options?: FocusChatInputOptions) => {
  const doFocus = () => {
    if (typeof document === 'undefined') {
      return;
    }

    // 聊天输入框由“选中/新建会话”的异步流程延迟聚焦。仅当焦点位于侧边栏的
    // 可编辑控件（如双击标题重命名会话）时才跳过，避免打断正在进行的键盘输入；
    // 侧边栏中的按钮/链接（如「新聊天」）不应阻止聚焦。
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(HISTORY_SIDEBAR_ROOT_SELECTOR) && isEditableElement(active)) {
      return;
    }

    const textarea = document.querySelector<HTMLTextAreaElement>(CHAT_INPUT_TEXTAREA_SELECTOR);
    if (!textarea) {
      return;
    }

    try {
      textarea.focus({ preventScroll: true });
    } catch {
      textarea.focus();
    }

    if (options?.caret === 'end') {
      placeCaretAtEnd(textarea);
    }
  };

  setTimeout(() => {
    doFocus();

    const retries = options?.retries ?? 0;
    if (retries > 0) {
      for (let i = 1; i <= retries; i++) {
        setTimeout(doFocus, i * 60);
      }
    }
  }, delayMs);
};
