

import React, { Dispatch, SetStateAction, useCallback } from 'react';
import { AppSettings, SavedChatSession, ChatMessage, ChatSettings as IndividualChatSettings } from '../../types';
import { Part, UsageMetadata } from '@google/genai';
import { useApiErrorHandler } from './useApiErrorHandler';
import { logService, showNotification, calculateTokenStats, playCompletionSound } from '../../utils/appUtils';
import { APP_LOGO_SVG_DATA_URI } from '../../constants/appConstants';
import { finalizeMessages, updateMessagesWithBatch, appendApiPart } from '../chat-stream/processors';
import { streamingStore } from '../../services/streamingStore';
import { SUPPORTED_GENERATED_MIME_TYPES } from '../../constants/fileConstants';

type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[], options?: { persist?: boolean }) => void;

interface ChatStreamHandlerProps {
    appSettings: AppSettings;
    updateAndPersistSessions: SessionsUpdater;
    setSessionLoading: (sessionId: string, isLoading: boolean) => void;
    activeJobs: React.MutableRefObject<Map<string, AbortController>>;
}

export const useChatStreamHandler = ({
    appSettings,
    updateAndPersistSessions,
    setSessionLoading,
    activeJobs
}: ChatStreamHandlerProps) => {
    const { handleApiError } = useApiErrorHandler(updateAndPersistSessions);

    const getStreamHandlers = useCallback((
        currentSessionId: string,
        generationId: string,
        abortController: AbortController,
        generationStartTime: Date,
        currentChatSettings: IndividualChatSettings,
        onSuccess?: (generationId: string, finalContent: string) => void
    ) => {
        const newModelMessageIds = new Set<string>([generationId]);
        let firstContentPartTime: Date | null = null;
        let firstTokenTime: Date | null = null;
        let accumulatedText = "";
        let accumulatedThoughts = "";
        let accumulatedApiParts: any[] = [];

        // --- rAF Batching State ---
        // Pending data that hasn't been flushed to React state yet
        let pendingText = "";
        let pendingThoughts = "";
        let pendingParts: Part[] = [];
        let pendingTTFT: number | null = null; // Batched TTFT value
        let rAFId: number | null = null;
        let isCompleted = false;

        // Reset store for this new generation
        streamingStore.clear(generationId);

        /**
         * Flush all pending data into a single updateAndPersistSessions call.
         * This is called via requestAnimationFrame to coalesce multiple stream chunks
         * into one React state update per frame.
         */
        const flush = () => {
            rAFId = null;

            // Snapshot and clear pending data
            const textToFlush = pendingText;
            const thoughtsToFlush = pendingThoughts;
            const partsToFlush = pendingParts;
            const ttftToFlush = pendingTTFT;

            pendingText = "";
            pendingThoughts = "";
            pendingParts = [];
            pendingTTFT = null;

            if (!textToFlush && !thoughtsToFlush && partsToFlush.length === 0 && ttftToFlush === null) return;

            updateAndPersistSessions(prev => {
                const sessionIndex = prev.findIndex(s => s.id === currentSessionId);
                if (sessionIndex === -1) return prev;

                const newSessions = [...prev];
                const sessionToUpdate = { ...newSessions[sessionIndex] };

                // Apply batch message update (text + thoughts + inline files)
                if (textToFlush || thoughtsToFlush || partsToFlush.length > 0) {
                    sessionToUpdate.messages = updateMessagesWithBatch(
                        sessionToUpdate.messages,
                        partsToFlush,
                        thoughtsToFlush,
                        generationStartTime,
                        newModelMessageIds,
                        firstContentPartTime
                    );

                    // Append flushed text to the target message content
                    if (textToFlush) {
                        sessionToUpdate.messages = sessionToUpdate.messages.map(msg => {
                            if (msg.id === generationId) {
                                return { ...msg, content: (msg.content || '') + textToFlush };
                            }
                            return msg;
                        });
                    }

                    // Append flushed apiParts
                    if (partsToFlush.length > 0) {
                        sessionToUpdate.messages = sessionToUpdate.messages.map(msg => {
                            if (msg.id === generationId) {
                                // Rebuild accumulated parts for this message
                                const currentParts = msg.apiParts || [];
                                const newParts = partsToFlush.reduce((acc, part) => appendApiPart(acc, part), currentParts);
                                return { ...msg, apiParts: newParts };
                            }
                            return msg;
                        });
                    }
                }

                // Apply TTFT if pending
                if (ttftToFlush !== null) {
                    sessionToUpdate.messages = sessionToUpdate.messages.map(m => {
                        if (m.id === generationId && m.firstTokenTimeMs === undefined) {
                            return { ...m, firstTokenTimeMs: ttftToFlush };
                        }
                        return m;
                    });
                }

                newSessions[sessionIndex] = sessionToUpdate;
                return newSessions;
            }, { persist: false });
        };

        /**
         * Schedule a flush via requestAnimationFrame if not already scheduled.
         */
        const scheduleFlush = () => {
            if (rAFId === null && !isCompleted) {
                rAFId = requestAnimationFrame(flush);
            }
        };

        // Helper to record TTFT — now batched instead of immediate state update
        const recordFirstToken = () => {
            if (!firstTokenTime) {
                firstTokenTime = new Date();
                pendingTTFT = firstTokenTime.getTime() - generationStartTime.getTime();
                scheduleFlush();
            }
        };

        const streamOnError = (error: Error) => {
            // Cancel any pending batched updates
            if (rAFId !== null) {
                cancelAnimationFrame(rAFId);
                rAFId = null;
            }
            isCompleted = true;

            // Merge pending text/thoughts into accumulated values before error handling.
            // Without this, any data buffered since the last rAF flush is permanently lost.
            const finalText = accumulatedText + pendingText;
            const finalThoughts = accumulatedThoughts + pendingThoughts;

            // Pass accumulated content so it can be saved even on error/abort
            handleApiError(error, currentSessionId, generationId, "Error", finalText, finalThoughts);
            setSessionLoading(currentSessionId, false);
            activeJobs.current.delete(generationId);
            streamingStore.clear(generationId);
        };

        const streamOnComplete = (usageMetadata?: UsageMetadata, groundingMetadata?: any, urlContextMetadata?: any) => {
            // Cancel any pending rAF — we'll do a single final update
            if (rAFId !== null) {
                cancelAnimationFrame(rAFId);
                rAFId = null;
            }
            isCompleted = true;

            const lang = appSettings.language === 'system'
                ? (navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en')
                : appSettings.language;

            if (appSettings.isStreamingEnabled && !firstContentPartTime) {
                firstContentPartTime = new Date();
            }

            if (usageMetadata) {
                const { promptTokens, completionTokens } = calculateTokenStats(usageMetadata);
                logService.recordTokenUsage(
                    currentChatSettings.modelId,
                    promptTokens,
                    completionTokens
                );
            }

            // Perform the Final Update to State (and DB) — includes all accumulated data
            updateAndPersistSessions(prev => {
                const sessionIndex = prev.findIndex(s => s.id === currentSessionId);
                if (sessionIndex === -1) return prev;

                const newSessions = [...prev];
                const sessionToUpdate = { ...newSessions[sessionIndex] };

                const updatedMessages = sessionToUpdate.messages.map(msg => {
                    if (msg.id === generationId) {
                        return {
                            ...msg,
                            // Use accumulatedText directly instead of appending —
                            // flush() already appends incremental text during streaming,
                            // and accumulatedText contains the complete canonical text.
                            content: accumulatedText,
                            thoughts: accumulatedThoughts,
                            // Only set apiParts from accumulated data — flush() already
                            // appended inline data parts during streaming via pendingParts,
                            // so we use accumulatedApiParts as the authoritative source.
                            apiParts: accumulatedApiParts
                        };
                    }
                    return msg;
                });

                // Finalize (mark loading false, set stats)
                const finalizationResult = finalizeMessages(
                    updatedMessages,
                    generationStartTime,
                    newModelMessageIds,
                    currentChatSettings,
                    lang,
                    firstContentPartTime,
                    usageMetadata,
                    groundingMetadata,
                    urlContextMetadata,
                    abortController.signal.aborted
                );

                sessionToUpdate.messages = finalizationResult.updatedMessages;
                newSessions[sessionIndex] = sessionToUpdate;

                if (finalizationResult.completedMessageForNotification) {
                    if (appSettings.isCompletionSoundEnabled) {
                        playCompletionSound();
                    }
                    if (appSettings.isCompletionNotificationEnabled && document.hidden) {
                        const msg = finalizationResult.completedMessageForNotification;
                        const notificationBody = (msg.content || "Media or tool response received").substring(0, 150) + (msg.content && msg.content.length > 150 ? '...' : '');
                        showNotification(
                            'Response Ready',
                            {
                                body: notificationBody,
                                icon: APP_LOGO_SVG_DATA_URI,
                            }
                        );
                    }
                }

                return newSessions;
            }, { persist: true });

            setSessionLoading(currentSessionId, false);
            activeJobs.current.delete(generationId);
            streamingStore.clear(generationId);

            if (onSuccess && !abortController.signal.aborted) {
                setTimeout(() => onSuccess(generationId, accumulatedText), 0);
            }
        };

        const streamOnPart = (part: Part) => {
            recordFirstToken(); // Now batched — no immediate state update

            accumulatedApiParts = appendApiPart(accumulatedApiParts, part);

            const anyPart = part as any;

            // 1. Accumulate plain text
            if (anyPart.text) {
                const chunkText = anyPart.text;
                accumulatedText += chunkText;
                pendingText += chunkText;
                streamingStore.updateContent(generationId, chunkText);
            }

            // 2. Handle Tools / Code (Convert to text representation for the store)
            if (anyPart.executableCode) {
                const codePart = anyPart.executableCode as { language: string, code: string };
                const toolContent = `\n\n\`\`\`${codePart.language.toLowerCase() || 'python'}\n${codePart.code}\n\`\`\`\n\n`;
                accumulatedText += toolContent;
                pendingText += toolContent;
                streamingStore.updateContent(generationId, toolContent);
            } else if (anyPart.codeExecutionResult) {
                const resultPart = anyPart.codeExecutionResult as { outcome: string, output?: string };
                const escapeHtml = (unsafe: string) => {
                    if (typeof unsafe !== 'string') return '';
                    return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
                };
                let toolContent = `\n\n<div class="tool-result outcome-${resultPart.outcome.toLowerCase()}"><strong>Execution Result (${resultPart.outcome}):</strong>`;
                if (resultPart.output) {
                    toolContent += `<pre><code class="language-text">${escapeHtml(resultPart.output)}</code></pre>`;
                }
                toolContent += '</div>\n\n';
                accumulatedText += toolContent;
                pendingText += toolContent;
                streamingStore.updateContent(generationId, toolContent);
            } else if (anyPart.inlineData) {
                const { mimeType } = anyPart.inlineData;

                const isSupportedFile =
                    mimeType.startsWith('image/') ||
                    mimeType.startsWith('audio/') ||
                    mimeType.startsWith('video/') ||
                    SUPPORTED_GENERATED_MIME_TYPES.has(mimeType);

                if (isSupportedFile) {
                    // Batch inline data parts instead of immediate update
                    pendingParts.push(part);
                }
            }

            const hasMeaningfulContent =
                (anyPart.text && anyPart.text.trim().length > 0) ||
                anyPart.executableCode ||
                anyPart.codeExecutionResult ||
                anyPart.inlineData;

            if (appSettings.isStreamingEnabled && !firstContentPartTime && hasMeaningfulContent) {
                firstContentPartTime = new Date();
            }

            // Schedule a batched flush via rAF
            scheduleFlush();
        };

        const onThoughtChunk = (thoughtChunk: string) => {
            recordFirstToken(); // Now batched

            accumulatedThoughts += thoughtChunk;
            pendingThoughts += thoughtChunk;
            streamingStore.updateThoughts(generationId, thoughtChunk);

            scheduleFlush();
        };

        return { streamOnError, streamOnComplete, streamOnPart, onThoughtChunk };

    }, [appSettings.isStreamingEnabled, appSettings.isCompletionNotificationEnabled, appSettings.isCompletionSoundEnabled, appSettings.language, updateAndPersistSessions, handleApiError, setSessionLoading, activeJobs]);

    return { getStreamHandlers };
};
