/**
 * Shared BroadcastChannel singleton for multi-tab synchronization.
 * All stores, hooks, and services should use this module instead of
 * creating their own BroadcastChannel instances.
 */

export type SyncMessage =
    | { type: 'SETTINGS_UPDATED' }
    | { type: 'SESSIONS_UPDATED' }
    | { type: 'GROUPS_UPDATED' }
    | { type: 'SESSION_CONTENT_UPDATED'; sessionId: string }
    | { type: 'SESSION_LOADING'; sessionId: string; isLoading: boolean };

const CHANNEL_NAME = 'all_model_chat_sync_v1';

let channel: BroadcastChannel | null = null;

/** Get or create the singleton BroadcastChannel. */
export function getSyncChannel(): BroadcastChannel {
    if (!channel) {
        channel = new BroadcastChannel(CHANNEL_NAME);
    }
    return channel;
}

/** Broadcast a sync message to other tabs. */
export function broadcastSync(msg: SyncMessage): void {
    getSyncChannel().postMessage(msg);
}
