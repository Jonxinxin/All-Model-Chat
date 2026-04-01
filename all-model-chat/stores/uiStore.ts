import { create } from 'zustand';
import type { SideViewContent } from '../types';

interface UIState {
  // Modals
  isSettingsModalOpen: boolean;
  isPreloadedMessagesModalOpen: boolean;
  isLogViewerOpen: boolean;
  // Sidebar
  isHistorySidebarOpen: boolean;
  // PiP
  isPipSupported: boolean;
  isPipActive: boolean;
  // Side Panel
  sidePanelContent: SideViewContent | null;
}

interface UIActions {
  // Modals
  setIsSettingsModalOpen: (open: boolean) => void;
  setIsPreloadedMessagesModalOpen: (open: boolean) => void;
  setIsLogViewerOpen: (open: boolean) => void;
  // Sidebar
  setIsHistorySidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleHistorySidebar: () => void;
  // PiP
  setPipState: (window: Window | null, container: HTMLElement | null) => void;
  // Side Panel
  openSidePanel: (content: SideViewContent) => void;
  closeSidePanel: () => void;
  // Touch handlers
  handleTouchStart: (e: React.TouchEvent) => void;
  handleTouchEnd: (e: React.TouchEvent) => void;
}

const touchStartRef = { x: 0, y: 0 };

export const useUIStore = create<UIState & UIActions>((set, get) => ({
  isSettingsModalOpen: false,
  isPreloadedMessagesModalOpen: false,
  isLogViewerOpen: false,
  isHistorySidebarOpen: window.innerWidth >= 768,
  isPipSupported: 'documentPictureInPicture' in window,
  isPipActive: false,
  sidePanelContent: null,

  setIsSettingsModalOpen: (open) => set({ isSettingsModalOpen: open }),
  setIsPreloadedMessagesModalOpen: (open) => set({ isPreloadedMessagesModalOpen: open }),
  setIsLogViewerOpen: (open) => set({ isLogViewerOpen: open }),

  setIsHistorySidebarOpen: (open) => set(s => ({
    isHistorySidebarOpen: typeof open === 'function' ? open(s.isHistorySidebarOpen) : open,
  })),
  toggleHistorySidebar: () => set(s => ({ isHistorySidebarOpen: !s.isHistorySidebarOpen })),

  setPipState: (window, container) => set({
    isPipActive: !!window,
  }),

  openSidePanel: (content) => set({ sidePanelContent: content }),
  closeSidePanel: () => set({ sidePanelContent: null }),

  handleTouchStart: (e: React.TouchEvent) => {
    const firstTouch = e.touches[0];
    if (firstTouch) {
      touchStartRef.x = firstTouch.clientX;
      touchStartRef.y = firstTouch.clientY;
    }
  },

  handleTouchEnd: (e: React.TouchEvent) => {
    const lastTouch = e.changedTouches[0];
    if (!lastTouch) return;

    const deltaX = lastTouch.clientX - touchStartRef.x;
    const deltaY = lastTouch.clientY - touchStartRef.y;
    const swipeThreshold = 50;
    const edgeThreshold = 40;

    if (Math.abs(deltaX) < Math.abs(deltaY)) return;

    const { isHistorySidebarOpen, setIsHistorySidebarOpen } = get();
    if (deltaX > swipeThreshold && !isHistorySidebarOpen && touchStartRef.x < edgeThreshold) {
      setIsHistorySidebarOpen(true);
    } else if (deltaX < -swipeThreshold && isHistorySidebarOpen) {
      setIsHistorySidebarOpen(false);
    }
  },
}));
