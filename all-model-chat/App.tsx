
import React from 'react';
import { createPortal } from 'react-dom';
import { useAppLogic } from './hooks/app/useAppLogic';
import { useAppProps } from './hooks/app/useAppProps';
import { WindowProvider } from './contexts/WindowContext';
import { MainContent } from './components/layout/MainContent';
import { PiPPlaceholder } from './components/layout/PiPPlaceholder';
import { useUIStore } from './stores/uiStore';

const App: React.FC = () => {
  const logic = useAppLogic();
  const {
    currentTheme,
    pipState,
    sidePanelContent,
    handleCloseSidePanel,
  } = logic;

  // Read UI state directly from store (no longer from logic.uiState)
  const handleTouchStart = useUIStore(s => s.handleTouchStart);
  const handleTouchEnd = useUIStore(s => s.handleTouchEnd);
  const isHistorySidebarOpen = useUIStore(s => s.isHistorySidebarOpen);
  const setIsHistorySidebarOpen = useUIStore(s => s.setIsHistorySidebarOpen);

  const { sidebarProps, chatAreaProps, appModalsProps } = useAppProps(logic);

  return (
    <div
      className={`relative flex h-full bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)] theme-${currentTheme.id} overflow-hidden`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {pipState.isPipActive && pipState.pipContainer && pipState.pipWindow ? (
          <>
              {createPortal(
                  <WindowProvider window={pipState.pipWindow} document={pipState.pipWindow.document}>
                    <div
                        className={`theme-${currentTheme.id} h-full w-full flex relative bg-[var(--theme-bg-secondary)] text-[var(--theme-text-primary)]`}
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                    >
                        <MainContent
                            sidebarProps={sidebarProps}
                            chatAreaProps={chatAreaProps}
                            appModalsProps={appModalsProps}
                            isHistorySidebarOpen={isHistorySidebarOpen}
                            setIsHistorySidebarOpen={setIsHistorySidebarOpen}
                            sidePanelContent={sidePanelContent}
                            onCloseSidePanel={handleCloseSidePanel}
                            themeId={currentTheme.id}
                        />
                    </div>
                  </WindowProvider>,
                  pipState.pipContainer
              )}
              <PiPPlaceholder onClosePip={pipState.togglePip} />
          </>
      ) : (
          <WindowProvider>
            <MainContent
                sidebarProps={sidebarProps}
                chatAreaProps={chatAreaProps}
                appModalsProps={appModalsProps}
                isHistorySidebarOpen={isHistorySidebarOpen}
                setIsHistorySidebarOpen={setIsHistorySidebarOpen}
                sidePanelContent={sidePanelContent}
                onCloseSidePanel={handleCloseSidePanel}
                themeId={currentTheme.id}
            />
          </WindowProvider>
      )}
    </div>
  );
};

export default App;