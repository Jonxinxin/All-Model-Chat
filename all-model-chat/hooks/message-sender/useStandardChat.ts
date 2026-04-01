
import { useCallback } from 'react';
import { generateUniqueId, buildContentParts, getKeyForRequest, performOptimisticSessionUpdate, logService } from '../../utils/appUtils';
import { DEFAULT_CHAT_SETTINGS, MODELS_SUPPORTING_RAW_MODE, THINKING_BUDGET_RANGES } from '../../constants/appConstants';
import { UploadedFile, ChatMessage } from '../../types';
import { StandardChatProps } from './types';
import { useSessionUpdate } from './standard/useSessionUpdate';
import { useApiInteraction } from './standard/useApiInteraction';

export const useStandardChat = ({
    appSettings,
    currentChatSettings,
    messages,
    selectedFiles,
    setSelectedFiles,
    editingMessageId,
    setEditingMessageId,
    setAppFileError,
    aspectRatio,
    imageSize,
    userScrolledUp,
    activeSessionId,
    setActiveSessionId,
    activeJobs,
    setSessionLoading,
    updateAndPersistSessions,
    getStreamHandlers,
    sessionKeyMapRef,
    handleGenerateCanvas,
}: StandardChatProps) => {

    const { updateSessionState } = useSessionUpdate({
        appSettings,
        updateAndPersistSessions,
        setActiveSessionId,
        setEditingMessageId,
        sessionKeyMapRef
    });

    const { performApiCall } = useApiInteraction({
        appSettings,
        messages,
        getStreamHandlers,
        handleGenerateCanvas,
        setSessionLoading,
        activeJobs
    });

    const sendStandardMessage = useCallback(async (
        textToUse: string, 
        filesToUse: UploadedFile[], 
        effectiveEditingId: string | null, 
        activeModelId: string,
        isContinueMode: boolean = false,
        isFastMode: boolean = false
    ) => {
        const settingsForPersistence = { ...currentChatSettings };
        const settingsForApi = { ...currentChatSettings };
        
        if (isFastMode) {
            const isGemini3 = activeModelId.includes('gemini-3');
            const isGemini3Flash = isGemini3 && activeModelId.includes('flash');
            const isGemini31Pro = activeModelId.includes('gemini-3.1') && activeModelId.includes('pro');

            if (isGemini3) {
                // Gemini 3 uses thinkingLevel; MINIMAL not supported on 3.1 Pro
                const targetLevel = (isGemini3Flash && !isGemini31Pro) ? 'MINIMAL' : 'LOW';
                settingsForApi.thinkingLevel = targetLevel;
                settingsForApi.thinkingBudget = 0;
            } else {
                // Gemini 2.5 uses thinkingBudget; set to minimum supported value
                const range = THINKING_BUDGET_RANGES[activeModelId];
                settingsForApi.thinkingBudget = range ? range.min : 0;
            }

            logService.info(`Fast Mode activated (One-off): Overriding thinking for ${activeModelId}.`);
        }

        const keyResult = getKeyForRequest(appSettings, settingsForApi);
        if ('error' in keyResult) {
            logService.error("Send message failed: API Key not configured.");
             const errorMsg: ChatMessage = { id: generateUniqueId(), role: 'error', content: keyResult.error, timestamp: new Date() };
             const newSessionId = generateUniqueId();
             
             updateAndPersistSessions(prev => performOptimisticSessionUpdate(prev, {
                 activeSessionId: null,
                 newSessionId,
                 newMessages: [errorMsg],
                 settings: { ...DEFAULT_CHAT_SETTINGS, ...appSettings },
                 title: "API Key Error"
             }));
             setActiveSessionId(newSessionId);
            return;
        }
        const { key: keyToUse, isNewKey } = keyResult;
        const shouldLockKey = isNewKey && filesToUse.some(f => f.fileUri && f.uploadState === 'active');

        const newAbortController = new AbortController();
        
        let generationId: string;
        let generationStartTime: Date;
        
        if (isContinueMode && effectiveEditingId) {
            generationId = effectiveEditingId;
            const targetMsg = messages.find(m => m.id === effectiveEditingId);
            generationStartTime = targetMsg?.generationStartTime || new Date();
        } else {
            generationId = generateUniqueId();
            generationStartTime = new Date();
        }
        
        const successfullyProcessedFiles = filesToUse.filter(f => f.uploadState === 'active' && !f.error && !f.isProcessing);
        
        const { contentParts: promptParts, enrichedFiles } = await buildContentParts(
            textToUse.trim(), 
            successfullyProcessedFiles,
            activeModelId,
            settingsForApi.mediaResolution
        );
        
        const finalSessionId = activeSessionId || generateUniqueId();
        
        const isRawMode = (settingsForApi.isRawModeEnabled ?? appSettings.isRawModeEnabled) 
            && !isContinueMode 
            && MODELS_SUPPORTING_RAW_MODE.some(m => activeModelId.includes(m));
        
        updateSessionState({
            activeSessionId,
            finalSessionId,
            textToUse,
            enrichedFiles,
            effectiveEditingId,
            generationId,
            generationStartTime,
            isContinueMode,
            isRawMode,
            sessionToUpdate: settingsForPersistence,
            keyToUse,
            shouldLockKey
        });

        userScrolledUp.current = false;
        
        await performApiCall({
            finalSessionId,
            generationId,
            generationStartTime,
            keyToUse,
            activeModelId,
            promptParts,
            effectiveEditingId,
            isContinueMode,
            isRawMode,
            sessionToUpdate: settingsForApi,
            aspectRatio: aspectRatio,
            imageSize: imageSize,
            newAbortController,
            textToUse,
            enrichedFiles
        });

    }, [
        appSettings, currentChatSettings, messages, aspectRatio, imageSize, activeSessionId, 
        updateAndPersistSessions, setActiveSessionId, userScrolledUp, updateSessionState, performApiCall
    ]);

    return { sendStandardMessage };
};
