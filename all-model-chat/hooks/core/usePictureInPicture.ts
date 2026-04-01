
import { useState, useEffect, useCallback, useRef } from 'react';
import { logService } from '../../utils/appUtils';
import { useUIStore } from '../../stores/uiStore';

declare global {
    interface Window {
        documentPictureInPicture?: {
            requestWindow(options?: { width: number, height: number }): Promise<Window>;
            readonly window?: Window;
        };
    }
}

export const usePictureInPicture = (setIsHistorySidebarOpen: (value: boolean | ((prev: boolean) => boolean)) => void) => {
    const [isPipSupported, setIsPipSupported] = useState(false);
    const [pipWindow, setPipWindow] = useState<Window | null>(null);
    const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
    const pendingOpenRef = useRef(false);
    const sidebarWasOpenRef = useRef<boolean | null>(null);

    useEffect(() => {
        if ('documentPictureInPicture' in window) {
            setIsPipSupported(true);
        }
    }, []);

    const closePip = useCallback(() => {
        if (pipWindow) {
            // The 'pagehide' event listener handles the state cleanup and sidebar expansion
            pipWindow.close();
        }
    }, [pipWindow]);

    const openPip = useCallback(async () => {
        if (!isPipSupported || pipWindow || pendingOpenRef.current) return;
        pendingOpenRef.current = true;

        // Collapse sidebar when entering PiP mode, but remember its previous state
        sidebarWasOpenRef.current = useUIStore.getState().isHistorySidebarOpen;
        setIsHistorySidebarOpen(false);

        try {
            const pipWin = await window.documentPictureInPicture!.requestWindow({
                width: 500, // A reasonable default width
                height: 700, // A reasonable default height
            });

            // Copy all head elements from the main document to the PiP window.
            // This ensures styles, scripts (like Tailwind), and other configurations are available.
            // IMPORTANT: Filter out the main application script to prevent it from re-executing 
            // and trying to mount to #root in the PiP window, which causes errors.
            Array.from(document.head.childNodes).forEach(node => {
                if (node.nodeName === 'SCRIPT' && (node as HTMLScriptElement).src && (node as HTMLScriptElement).src.includes('index.tsx')) {
                    return;
                }
                pipWin.document.head.appendChild(node.cloneNode(true));
            });
            
            pipWin.document.title = "All Model Chat - PiP";
            pipWin.document.body.className = document.body.className;
            pipWin.document.body.style.margin = '0';
            pipWin.document.body.style.overflow = 'hidden';

            // Ensure full height/width for layout
            pipWin.document.documentElement.style.height = '100%';
            pipWin.document.body.style.height = '100%';
            pipWin.document.body.style.width = '100%';

            // Create a root container for the React portal
            const container = pipWin.document.createElement('div');
            container.id = 'pip-root';
            container.style.height = '100%';
            container.style.width = '100%';
            pipWin.document.body.appendChild(container);

            // Listen for when the user closes the PiP window
            pipWin.addEventListener('pagehide', () => {
                setPipWindow(null);
                setPipContainer(null);
                // Restore sidebar to its previous state before PiP was opened
                const prevSidebarState = sidebarWasOpenRef.current;
                if (prevSidebarState !== null) {
                    setIsHistorySidebarOpen(prevSidebarState);
                    sidebarWasOpenRef.current = null;
                } else {
                    setIsHistorySidebarOpen(true);
                }
                logService.info('PiP window closed.');
            }, { once: true });

            setPipWindow(pipWin);
            setPipContainer(container);
            logService.info('PiP window opened.');

        } catch (error) {
            logService.error('Error opening Picture-in-Picture window:', error);
            setPipWindow(null);
            setPipContainer(null);
            // If opening fails, restore the sidebar state
            if (sidebarWasOpenRef.current !== null) {
                setIsHistorySidebarOpen(sidebarWasOpenRef.current);
                sidebarWasOpenRef.current = null;
            } else {
                setIsHistorySidebarOpen(true);
            }
        } finally {
            pendingOpenRef.current = false;
        }
    }, [isPipSupported, pipWindow, setIsHistorySidebarOpen]);

    const togglePip = useCallback(() => {
        if (pipWindow) {
            closePip();
        } else {
            openPip();
        }
    }, [pipWindow, openPip, closePip]);

    return {
        isPipSupported,
        isPipActive: !!pipWindow,
        togglePip,
        pipContainer,
        pipWindow,
    };
};
