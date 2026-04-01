
import { useEffect, useCallback, useRef } from 'react';
import { logService } from '../../utils/appUtils';
import { type SyncMessage, getSyncChannel } from '../../utils/broadcastChannel';

export type { SyncMessage };

interface UseMultiTabSyncProps {
    onSettingsUpdated?: () => void;
    onSessionsUpdated?: () => void;
    onGroupsUpdated?: () => void;
    onSessionContentUpdated?: (sessionId: string) => void;
    onSessionLoading?: (sessionId: string, isLoading: boolean) => void;
}

export const useMultiTabSync = ({
    onSettingsUpdated,
    onSessionsUpdated,
    onGroupsUpdated,
    onSessionContentUpdated,
    onSessionLoading
}: UseMultiTabSyncProps) => {
    const channelRef = useRef<BroadcastChannel | null>(null);

    useEffect(() => {
        const channel = getSyncChannel();
        channelRef.current = channel;

        channel.onmessage = (event: MessageEvent<SyncMessage>) => {
            const msg = event.data;
            if (msg.type !== 'SESSION_LOADING') {
                logService.debug(`[Sync] Received: ${msg.type}`, { category: 'SYSTEM', data: msg });
            }

            switch (msg.type) {
                case 'SETTINGS_UPDATED':
                    onSettingsUpdated?.();
                    break;
                case 'SESSIONS_UPDATED':
                    onSessionsUpdated?.();
                    break;
                case 'GROUPS_UPDATED':
                    onGroupsUpdated?.();
                    break;
                case 'SESSION_CONTENT_UPDATED':
                    onSessionContentUpdated?.(msg.sessionId);
                    break;
                case 'SESSION_LOADING':
                    onSessionLoading?.(msg.sessionId, msg.isLoading);
                    break;
            }
        };

        return () => {
            // Don't close the shared singleton channel — just detach the handler.
            channel.onmessage = null;
        };
    }, [onSettingsUpdated, onSessionsUpdated, onGroupsUpdated, onSessionContentUpdated, onSessionLoading]);

    const broadcast = useCallback((message: SyncMessage) => {
        if (channelRef.current) {
            channelRef.current.postMessage(message);
        }
    }, []);

    return { broadcast };
};
