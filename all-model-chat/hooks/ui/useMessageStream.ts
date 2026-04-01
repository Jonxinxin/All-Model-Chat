
import { useState, useEffect, useRef } from 'react';
import { streamingStore } from '../../services/streamingStore';

export const useMessageStream = (messageId: string, isStreaming: boolean) => {
    const [streamContent, setStreamContent] = useState<string>('');
    const [streamThoughts, setStreamThoughts] = useState<string>('');
    const rAFIdRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isStreaming || !messageId) {
            setStreamContent('');
            setStreamThoughts('');
            return;
        }

        // Initialize with current store value
        setStreamContent(streamingStore.getContent(messageId));
        setStreamThoughts(streamingStore.getThoughts(messageId));

        const unsubscribe = streamingStore.subscribe(messageId, () => {
            // Throttle state updates via rAF (~16fps) to coalesce multiple
            // streamingStore notifications (content + thoughts) per chunk.
            // Without this, each store notification triggers a separate setState,
            // causing 20-60 re-renders/sec during streaming.
            if (rAFIdRef.current === null) {
                rAFIdRef.current = requestAnimationFrame(() => {
                    rAFIdRef.current = null;
                    setStreamContent(streamingStore.getContent(messageId));
                    setStreamThoughts(streamingStore.getThoughts(messageId));
                });
            }
        });

        return () => {
            unsubscribe();
            if (rAFIdRef.current !== null) {
                cancelAnimationFrame(rAFIdRef.current);
                rAFIdRef.current = null;
            }
        };
    }, [messageId, isStreaming]);

    return { streamContent, streamThoughts };
};
