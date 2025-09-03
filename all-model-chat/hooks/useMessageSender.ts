import { useCallback, useRef, Dispatch, SetStateAction } from 'react';
import { AppSettings, ChatMessage, UploadedFile, ChatSettings as IndividualChatSettings, SavedChatSession, ModelResponseVersion, ChatHistoryItem } from '../types';
import { generateUniqueId, buildContentParts, createChatHistoryForApi, getKeyForRequest, generateSessionTitle, logService } from '../utils/appUtils';
import { geminiServiceInstance } from '../services/geminiService';
import { DEFAULT_CHAT_SETTINGS } from '../constants/appConstants';
import { useChatStreamHandler } from './useChatStreamHandler';
import { useTtsImagenSender } from './useTtsImagenSender';
import { useImageEditSender } from './useImageEditSender';
import { Chat } from '@google/genai';
import { getApiClient, buildGenerationConfig } from '../services/api/baseApi';
import { conversationStreamThrottler } from '../utils/streamThrottler';
import { messageVersionManager } from '../utils/messageVersionManager';
import { sessionStateManager } from '../utils/sessionStateManager';
import { activeJobsManager } from '../utils/activeJobsManager';

type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;

interface MessageSenderProps {
    appSettings: AppSettings;
    messages: ChatMessage[];
    currentChatSettings: IndividualChatSettings;
    selectedFiles: UploadedFile[];
    setSelectedFiles: (files: UploadedFile[] | ((prev: UploadedFile[]) => UploadedFile[])) => void;
    editingMessageId: string | null;
    setEditingMessageId: (id: string | null) => void;
    setAppFileError: (error: string | null) => void;
    aspectRatio: string;
    userScrolledUp: React.MutableRefObject<boolean>;
    activeSessionId: string | null;
    setActiveSessionId: (id: string | null) => void;
    activeJobs: React.MutableRefObject<Map<string, AbortController>>;
    setLoadingSessionIds: Dispatch<SetStateAction<Set<string>>>;
    updateAndPersistSessions: SessionsUpdater;
    scrollContainerRef: React.RefObject<HTMLDivElement>;
    chat: Chat | null;
}

export const useMessageSender = (props: MessageSenderProps) => {
    const {
        appSettings,
        currentChatSettings,
        messages,
        selectedFiles,
        setSelectedFiles,
        editingMessageId,
        setEditingMessageId,
        setAppFileError,
        aspectRatio,
        userScrolledUp,
        activeSessionId,
        setActiveSessionId,
        activeJobs,
        setLoadingSessionIds,
        updateAndPersistSessions,
        scrollContainerRef,
        chat,
    } = props;

    const generationStartTimeRef = useRef<Date | null>(null);
    const { getStreamHandlers } = useChatStreamHandler(props);
    const { handleTtsImagenMessage } = useTtsImagenSender({ ...props, setActiveSessionId });
    const { handleImageEditMessage } = useImageEditSender({
        updateAndPersistSessions,
        setLoadingSessionIds,
        activeJobs,
        setActiveSessionId,
    });

    const executeMessageSending = useCallback(async (params: {
        textToUse: string;
        filesToUse: UploadedFile[];
        effectiveEditingId: string | null;
        retryOfMessageId: string | undefined;
        sessionToUpdate: IndividualChatSettings;
        activeModelId: string;
        isTtsModel: boolean;
        isImagenModel: boolean;
        isImageEditModel: boolean;
        keyToUse: string;
        shouldLockKey: boolean;
        newAbortController: AbortController;
        generationId: string;
    }) => {
        const {
            textToUse,
            filesToUse,
            effectiveEditingId,
            retryOfMessageId,
            sessionToUpdate,
            activeModelId,
            isTtsModel,
            isImagenModel,
            isImageEditModel,
            keyToUse,
            shouldLockKey,
            newAbortController,
            generationId,
        } = params;

        if (isTtsModel || isImagenModel) {
            await handleTtsImagenMessage(keyToUse, activeSessionId, generationId, newAbortController, appSettings, sessionToUpdate, textToUse.trim(), aspectRatio, { shouldLockKey });
            return;
        }
        
        if (isImageEditModel) {
            const editIndex = effectiveEditingId ? messages.findIndex(m => m.id === effectiveEditingId) : -1;
            const historyMessages = editIndex !== -1 ? messages.slice(0, editIndex) : messages;
            await handleImageEditMessage(keyToUse, activeSessionId, historyMessages, generationId, newAbortController, appSettings, sessionToUpdate, textToUse.trim(), filesToUse, effectiveEditingId, { shouldLockKey });
            return;
        }
        
        const successfullyProcessedFiles = filesToUse.filter(f => f.uploadState === 'active' && !f.error && !f.isProcessing);
        const { contentParts: promptParts, enrichedFiles } = await buildContentParts(textToUse.trim(), successfullyProcessedFiles);
        
        let finalSessionId = activeSessionId;
        
        const userMessageContent: ChatMessage = { id: generateUniqueId(), role: 'user', content: textToUse.trim(), files: enrichedFiles.length ? enrichedFiles.map(f => ({...f, rawFile: undefined})) : undefined, timestamp: new Date() };
        const modelMessageContent: ChatMessage = { id: generationId, role: 'model', content: '', timestamp: new Date(), isLoading: true, generationStartTime: generationStartTimeRef.current! };

        if (retryOfMessageId) {
            if (!finalSessionId) return;
            
            // Check for version conflicts before proceeding
            const versionResult = await messageVersionManager.createRetryVersion(
                retryOfMessageId,
                finalSessionId,
                generationStartTimeRef.current!
            );
            
            if (!versionResult.canProceed) {
                logService.error(`Cannot retry message: ${versionResult.conflict}`);
                setAppFileError(versionResult.conflict || 'Version conflict detected');
                activeJobsManager.completeJob(generationId, setLoadingSessionIds, 'error');
                return;
            }

            await sessionStateManager.atomicSessionUpdate(
                finalSessionId,
                (session) => ({
                    ...session,
                    messages: session.messages.map((m) => {
                        if (m.id !== retryOfMessageId) return m;
                        
                        // Create new version for retry synchronously
                        const newVersion: ModelResponseVersion = { 
                            content: '', 
                            timestamp: new Date(), 
                            generationStartTime: generationStartTimeRef.current!,
                        };
                        
                        // Get existing versions or create new array
                        const versions = [...(m.versions || [])];
                        
                        // Save current state as original version if no versions exist
                        if (versions.length === 0) {
                            const originalVersion: ModelResponseVersion = { 
                                content: m.content, 
                                files: m.files, 
                                timestamp: m.timestamp, 
                                thoughts: m.thoughts,
                                generationStartTime: m.generationStartTime, 
                                generationEndTime: m.generationEndTime, 
                                thinkingTimeMs: m.thinkingTimeMs, 
                                promptTokens: m.promptTokens, 
                                completionTokens: m.completionTokens, 
                                totalTokens: m.totalTokens, 
                                cumulativeTotalTokens: m.cumulativeTotalTokens, 
                                audioSrc: m.audioSrc, 
                                groundingMetadata: m.groundingMetadata, 
                                suggestions: m.suggestions, 
                                isGeneratingSuggestions: m.isGeneratingSuggestions 
                            };
                            versions.push(originalVersion);
                        }
                        
                        // Add new version for retry
                        versions.push(newVersion);
                        const newActiveIndex = versions.length - 1;

                        return { 
                            ...m, 
                            versions, 
                            activeVersionIndex: newActiveIndex, 
                            isLoading: true, 
                            content: '', 
                            files: [], 
                            thoughts: '', 
                            generationStartTime: generationStartTimeRef.current!, 
                            generationEndTime: undefined, 
                            thinkingTimeMs: undefined 
                        };
                    })
                }),
                updateAndPersistSessions,
                `retry-${generationId}`,
                'stream_update'
            );

            // Complete the version operation
            messageVersionManager.completeVersionOperation(retryOfMessageId, finalSessionId);
        } else if (effectiveEditingId) {
             await sessionStateManager.atomicSessionUpdate(
                finalSessionId || 'unknown',
                (session) => {
                    const isSessionToUpdate = session.messages.some(m => m.id === effectiveEditingId);
                    if (!isSessionToUpdate) return session;

                    const editIndex = session.messages.findIndex(m => m.id === effectiveEditingId);
                    const baseMessages = editIndex !== -1 ? session.messages.slice(0, editIndex) : [...session.messages];
                    
                    userMessageContent.cumulativeTotalTokens = baseMessages.length > 0 ? (baseMessages[baseMessages.length - 1].cumulativeTotalTokens || 0) : 0;
                    const newMessages = [...baseMessages, userMessageContent, modelMessageContent];

                    let newTitle = session.title;
                    if (session.title === 'New Chat' && !appSettings.isAutoTitleEnabled) {
                        newTitle = generateSessionTitle(newMessages);
                    }
                    let updatedSettings = session.settings;
                    if (shouldLockKey && !session.settings.lockedApiKey) {
                        updatedSettings = { ...session.settings, lockedApiKey: keyToUse };
                    }
                    return { ...session, messages: newMessages, title: newTitle, settings: updatedSettings };
                },
                updateAndPersistSessions,
                `edit-${generationId}`,
                'stream_update'
            );
        } else if (!finalSessionId) { // New Chat
            const newSessionId = generateUniqueId();
            finalSessionId = newSessionId;
            let newSessionSettings = { ...DEFAULT_CHAT_SETTINGS, ...appSettings };
            if (shouldLockKey) newSessionSettings.lockedApiKey = keyToUse;
            
            userMessageContent.cumulativeTotalTokens = 0;
            const newSession: SavedChatSession = { id: newSessionId, title: "New Chat", messages: [userMessageContent, modelMessageContent], timestamp: Date.now(), settings: newSessionSettings };
            updateAndPersistSessions(p => [newSession, ...p.filter(s => s.messages.length > 0)]);
            setActiveSessionId(newSessionId);
        } else { // Existing Chat
             await sessionStateManager.atomicSessionUpdate(
                finalSessionId!,
                (session) => {
                    const newMessages = [...session.messages, userMessageContent, modelMessageContent];
                    return { ...session, messages: newMessages };
                },
                updateAndPersistSessions,
                `existing-${generationId}`,
                'stream_update'
            );
        }

        if (editingMessageId) {
            setEditingMessageId(null);
        }
        
        if (promptParts.length === 0) {
            activeJobsManager.completeJob(generationId, setLoadingSessionIds, 'error');
            return; 
        }
        
        const { streamOnError, streamOnComplete, streamOnPart, onThoughtChunk } = getStreamHandlers(finalSessionId!, generationId, newAbortController, generationStartTimeRef, sessionToUpdate, retryOfMessageId);
        
        // Start the job with the manager
        activeJobsManager.startJob(generationId, finalSessionId!, newAbortController, setLoadingSessionIds);

        // Standard models that support the Chat object
        let chatToUse = chat;

        if (effectiveEditingId || retryOfMessageId) {
            logService.info("Handling message edit/retry: creating temporary chat object for this turn.");
            const baseMessagesForApi = retryOfMessageId 
                ? messages.slice(0, messages.findIndex(m => m.id === retryOfMessageId))
                : messages.slice(0, messages.findIndex(m => m.id === effectiveEditingId));

            const historyForChat = await createChatHistoryForApi(baseMessagesForApi);
            const storedSettings = localStorage.getItem('app-settings');
            const apiProxyUrl = storedSettings ? JSON.parse(storedSettings).apiProxyUrl : null;
            const ai = getApiClient(keyToUse, apiProxyUrl);
            chatToUse = ai.chats.create({
                model: activeModelId,
                history: historyForChat,
                config: buildGenerationConfig(
                    activeModelId, sessionToUpdate.systemInstruction, { temperature: sessionToUpdate.temperature, topP: sessionToUpdate.topP },
                    sessionToUpdate.showThoughts, sessionToUpdate.thinkingBudget,
                    !!sessionToUpdate.isGoogleSearchEnabled, !!sessionToUpdate.isCodeExecutionEnabled, !!sessionToUpdate.isUrlContextEnabled
                ),
            });
        }
        
        if (!chatToUse) {
            logService.error("Send message failed: Chat object not initialized.");
            setAppFileError("Chat is not ready, please wait a moment and try again.");
            return;
        }

        // Use stream throttler to prevent concurrent streams per session
        await conversationStreamThrottler.executeStream(generationId, finalSessionId!, async () => {
            if (appSettings.isStreamingEnabled) {
                await geminiServiceInstance.sendMessageStream(chatToUse!, promptParts, newAbortController.signal, streamOnPart, onThoughtChunk, 
                    (error) => {
                        streamOnError(error);
                        activeJobsManager.completeJob(generationId, setLoadingSessionIds, 'error');
                    }, 
                    (usage, grounding) => {
                        streamOnComplete(usage, grounding);
                        activeJobsManager.completeJob(generationId, setLoadingSessionIds, 'completed');
                    }
                );
            } else { 
                await geminiServiceInstance.sendMessageNonStream(chatToUse!, promptParts, newAbortController.signal, 
                    (error) => {
                        streamOnError(error);
                        activeJobsManager.completeJob(generationId, setLoadingSessionIds, 'error');
                    }, 
                    (parts, thoughts, usage, grounding) => {
                        for(const part of parts) streamOnPart(part);
                        if(thoughts) onThoughtChunk(thoughts);
                        streamOnComplete(usage, grounding);
                        activeJobsManager.completeJob(generationId, setLoadingSessionIds, 'completed');
                    }
                );
            }
        });
    }, [appSettings, currentChatSettings, messages, selectedFiles, setSelectedFiles, editingMessageId, setEditingMessageId, setAppFileError, aspectRatio, userScrolledUp, activeSessionId, setActiveSessionId, activeJobs, setLoadingSessionIds, updateAndPersistSessions, getStreamHandlers, handleTtsImagenMessage, scrollContainerRef, chat, handleImageEditMessage]);

    const handleSendMessage = useCallback(async (overrideOptions?: { text?: string; files?: UploadedFile[]; editingId?: string; retryOfMessageId?: string }) => {
        const textToUse = overrideOptions?.text ?? '';
        const filesToUse = overrideOptions?.files ?? selectedFiles;
        const effectiveEditingId = overrideOptions?.editingId ?? editingMessageId;
        const retryOfMessageId = overrideOptions?.retryOfMessageId;
        
        const sessionToUpdate = currentChatSettings;
        const activeModelId = sessionToUpdate.modelId;
        const isTtsModel = activeModelId.includes('-tts');
        const isImagenModel = activeModelId.includes('imagen');
        const isImageEditModel = activeModelId.includes('image-preview');

        logService.info(`Sending message with model ${activeModelId}`, { textLength: textToUse.length, fileCount: filesToUse.length, editingId: effectiveEditingId, sessionId: activeSessionId });

        if (!textToUse.trim() && !isTtsModel && !isImagenModel && filesToUse.filter(f => f.uploadState === 'active').length === 0) return;
        if ((isTtsModel || isImagenModel || isImageEditModel) && !textToUse.trim()) return;
        if (filesToUse.some(f => f.isProcessing || (f.uploadState !== 'active' && !f.error) )) { 
            logService.warn("Send message blocked: files are still processing.");
            setAppFileError("Wait for files to finish processing."); 
            return; 
        }
        
        setAppFileError(null);

        if (!activeModelId) { 
            logService.error("Send message failed: No model selected.");
            const errorMsg: ChatMessage = { id: generateUniqueId(), role: 'error', content: 'No model selected.', timestamp: new Date() };
            const newSession: SavedChatSession = { id: generateUniqueId(), title: "Error", messages: [errorMsg], settings: { ...DEFAULT_CHAT_SETTINGS, ...appSettings }, timestamp: Date.now() };
            updateAndPersistSessions(p => [newSession, ...p]);
            setActiveSessionId(newSession.id);
            return; 
        }

        const keyResult = getKeyForRequest(appSettings, sessionToUpdate);
        if ('error' in keyResult) {
            logService.error("Send message failed: API Key not configured.");
             const errorMsg: ChatMessage = { id: generateUniqueId(), role: 'error', content: keyResult.error, timestamp: new Date() };
             const newSession: SavedChatSession = { id: generateUniqueId(), title: "API Key Error", messages: [errorMsg], settings: { ...DEFAULT_CHAT_SETTINGS, ...appSettings }, timestamp: Date.now() };
             updateAndPersistSessions(p => [newSession, ...p]);
             setActiveSessionId(newSession.id);
            return;
        }
        const { key: keyToUse, isNewKey } = keyResult;
        const shouldLockKey = isNewKey && filesToUse.some(f => f.fileUri && f.uploadState === 'active');

        const newAbortController = new AbortController();
        const generationId = generateUniqueId();
        generationStartTimeRef.current = new Date();
        
        if (appSettings.isAutoScrollOnSendEnabled) {
            userScrolledUp.current = false;
        }
        if (overrideOptions?.files === undefined) setSelectedFiles([]);

        // Execute message sending with throttling
        await executeMessageSending({
            textToUse,
            filesToUse,
            effectiveEditingId,
            retryOfMessageId,
            sessionToUpdate,
            activeModelId,
            isTtsModel,
            isImagenModel,
            isImageEditModel,
            keyToUse,
            shouldLockKey,
            newAbortController,
            generationId,
        });
    }, [
        appSettings, currentChatSettings, messages, selectedFiles, setSelectedFiles,
        editingMessageId, setEditingMessageId, setAppFileError, aspectRatio,
        userScrolledUp, activeSessionId, setActiveSessionId, activeJobs,
        setLoadingSessionIds, updateAndPersistSessions, executeMessageSending
    ]);

    return { handleSendMessage };
};