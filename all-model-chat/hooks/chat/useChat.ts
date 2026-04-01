

import React, { useRef, useCallback, useEffect } from 'react';
import { AppSettings, UploadedFile } from '../../types';
import { useSettingsStore } from '../../stores/settingsStore';
import { useChatStore } from '../../stores/chatStore';
import { useSessionStore } from '../../stores/sessionStore';
import { useFileHandling } from '../files/useFileHandling';
import { useFileDragDrop } from '../files/useFileDragDrop';
import { usePreloadedScenarios } from '../usePreloadedScenarios';
import { useMessageHandler } from '../useMessageHandler';
import { useChatScroll } from './useChatScroll';
import { useAutoTitling } from './useAutoTitling';
import { useSuggestions } from './useSuggestions';
import { useChatActions } from './useChatActions';
import { useChatEffects } from './useChatEffects';
import { useBackgroundKeepAlive } from '../core/useBackgroundKeepAlive';
import { useLocalPythonAgent } from '../features/useLocalPythonAgent';

export const useChat = (appSettings: AppSettings, setAppSettings: React.Dispatch<React.SetStateAction<AppSettings>>, language: 'en' | 'zh') => {

    // Read state from Zustand chatStore
    const savedSessions = useChatStore(s => s.savedSessions);
    const savedGroups = useChatStore(s => s.savedGroups);
    const activeSessionId = useChatStore(s => s.activeSessionId);
    const activeMessages = useChatStore(s => s.activeMessages);
    const editingMessageId = useChatStore(s => s.editingMessageId);
    const editMode = useChatStore(s => s.editMode);
    const commandedInput = useChatStore(s => s.commandedInput);
    const loadingSessionIds = useChatStore(s => s.loadingSessionIds);
    const generatingTitleSessionIds = useChatStore(s => s.generatingTitleSessionIds);
    const selectedFiles = useChatStore(s => s.selectedFiles);
    const appFileError = useChatStore(s => s.appFileError);
    const isAppProcessingFile = useChatStore(s => s.isAppProcessingFile);
    const aspectRatio = useChatStore(s => s.aspectRatio);
    const imageSize = useChatStore(s => s.imageSize);
    const ttsMessageId = useChatStore(s => s.ttsMessageId);
    const isSwitchingModel = useChatStore(s => s.isSwitchingModel);
    const isLoading = useChatStore(s => s.isLoading);

    // Read actions from Zustand chatStore
    const {
        setActiveSessionId, setActiveMessages, setSavedSessions, setSavedGroups,
        setEditingMessageId, setEditMode, setCommandedInput,
        setLoadingSessionIds, setGeneratingTitleSessionIds,
        setSelectedFiles, setAppFileError, setIsAppProcessingFile,
        setAspectRatio, setImageSize, setTtsMessageId, setIsSwitchingModel,
        setIsLoading, setScrollContainerRef,
        updateAndPersistSessions, updateAndPersistGroups,
        refreshSessions, setSessionLoading, getRefs,
    } = useChatStore.getState();

    // Refs from chatStore
    const refs = getRefs();
    const activeJobs = refs.activeJobs;
    const userScrolledUp = refs.userScrolledUp;
    const fileDraftsRef = refs.fileDraftsRef;
    const sessionKeyMapRef = refs.sessionKeyMapRef;

    // Read state from Zustand sessionStore
    const {
        startNewChat, loadChatSession, handleDeleteChatHistorySession,
        handleRenameSession, handleTogglePinSession,
        handleDuplicateSession, handleAddNewGroup, handleDeleteGroup,
        handleRenameGroup, handleMoveSessionToGroup, handleToggleGroupExpansion,
        clearAllHistory, clearCacheAndReload, loadInitialData,
    } = useSessionStore.getState();

    // Computed state
    const activeChat = savedSessions.find(s => s.id === activeSessionId);
    const messages = activeMessages;
    const currentChatSettings = activeChat?.settings || appSettings;

    const setCurrentChatSettings = useCallback((updater: (prevSettings: any) => any) => {
        if (!activeSessionId) return;
        updateAndPersistSessions(prevSessions =>
            prevSessions.map(s =>
                s.id === activeSessionId
                    ? { ...s, settings: updater(s.settings) }
                    : s
            )
        );
    }, [activeSessionId, updateAndPersistSessions]);

    // Read models from Zustand settingsStore
    const apiModels = useSettingsStore(s => s.apiModels);
    const setApiModels = useSettingsStore(s => s.setApiModels);
    const isModelsLoading = useSettingsStore(s => s.isModelsLoading);
    const modelsLoadingError = useSettingsStore(s => s.modelsLoadingError);

    // Optimize background performance when loading
    useBackgroundKeepAlive(isLoading);

    // Initialize multi-tab sync once
    useEffect(() => {
        const cleanup = useChatStore.getState().initMultiTabSync();
        return cleanup;
    }, []);

    const fileHandler = useFileHandling({
        appSettings, selectedFiles, setSelectedFiles, setAppFileError,
        isAppProcessingFile, setIsAppProcessingFile, currentChatSettings,
        setCurrentChatSettings
    });

    const handleAddTempFile = useCallback((file: UploadedFile) => {
        setSelectedFiles(prev => [...prev, file]);
    }, [setSelectedFiles]);

    const handleRemoveTempFile = useCallback((id: string) => {
        setSelectedFiles(prev => prev.filter(f => f.id !== id));
    }, [setSelectedFiles]);

    const dragDropHandler = useFileDragDrop({
        onFilesDropped: fileHandler.handleProcessAndAddFiles,
        onAddTempFile: handleAddTempFile,
        onRemoveTempFile: handleRemoveTempFile
    });

    const scenarioHandler = usePreloadedScenarios({
        appSettings,
        setAppSettings,
        updateAndPersistSessions,
        setActiveSessionId,
    });

    const scrollHandler = useChatScroll({ messages, userScrolledUp });

    const messageHandler = useMessageHandler({
        appSettings, messages, isLoading, currentChatSettings, selectedFiles,
        setSelectedFiles, editingMessageId, setEditingMessageId, setEditMode, setAppFileError,
        aspectRatio, userScrolledUp, ttsMessageId, setTtsMessageId, activeSessionId,
        setActiveSessionId, setCommandedInput, activeJobs, loadingSessionIds,
        setLoadingSessionIds, updateAndPersistSessions, language,
        scrollContainerRef: scrollHandler.scrollContainerRef,
        sessionKeyMapRef,
        setSessionLoading
    });

    useAutoTitling({ appSettings, activeChat, updateAndPersistSessions, language, generatingTitleSessionIds, setGeneratingTitleSessionIds, sessionKeyMapRef });
    useSuggestions({ appSettings, activeChat, isLoading, updateAndPersistSessions, language, sessionKeyMapRef });

    const chatActions = useChatActions({
        appSettings,
        activeSessionId,
        isLoading,
        currentChatSettings,
        selectedFiles,
        setActiveSessionId,
        setIsSwitchingModel,
        setAppFileError,
        setCurrentChatSettings,
        setSelectedFiles,
        updateAndPersistSessions,
        handleStopGenerating: messageHandler.handleStopGenerating,
        startNewChat: () => startNewChat(appSettings),
        handleTogglePinSession,
        userScrolledUp
    });

    // Auto-Agent for Local Python
    useLocalPythonAgent({
        messages,
        appSettings,
        currentChatSettings,
        isLoading,
        activeSessionId,
        updateMessageContent: chatActions.handleUpdateMessageContent,
        onContinueGeneration: messageHandler.handleContinueGeneration,
        updateAndPersistSessions
    });

    useChatEffects({
        activeSessionId,
        savedSessions,
        selectedFiles,
        appFileError,
        setAppFileError,
        isModelsLoading,
        apiModels,
        activeChat,
        updateAndPersistSessions,
        isSwitchingModel,
        setIsSwitchingModel,
        currentChatSettings,
        aspectRatio,
        setAspectRatio,
        loadInitialData: () => loadInitialData(appSettings),
        loadChatSession,
        startNewChat: () => startNewChat(appSettings),
        messages
    });

    return {
        messages,
        isLoading,
        loadingSessionIds,
        generatingTitleSessionIds,
        currentChatSettings,
        editingMessageId,
        setEditingMessageId,
        editMode,
        commandedInput,
        setCommandedInput,
        selectedFiles,
        setSelectedFiles,
        appFileError,
        setAppFileError,
        isAppProcessingFile,
        savedSessions,
        savedGroups,
        activeSessionId,
        apiModels,
        setApiModels,
        isModelsLoading,
        modelsLoadingError,
        isSwitchingModel,
        aspectRatio,
        setAspectRatio,
        imageSize,
        setImageSize,
        ttsMessageId,

        updateAndPersistSessions,
        updateAndPersistGroups,

        scrollContainerRef: scrollHandler.scrollContainerRef,
        setScrollContainerRef: scrollHandler.setScrollContainerRef,
        onScrollContainerScroll: scrollHandler.handleScroll,

        loadChatSession,
        startNewChat: () => startNewChat(appSettings),
        handleDeleteChatHistorySession,
        handleRenameSession,
        handleTogglePinSession,
        handleDuplicateSession,
        handleAddNewGroup,
        handleDeleteGroup,
        handleRenameGroup,
        handleMoveSessionToGroup,
        handleToggleGroupExpansion,
        clearCacheAndReload,
        clearAllHistory,

        isAppDraggingOver: dragDropHandler.isAppDraggingOver,
        isProcessingDrop: dragDropHandler.isProcessingDrop,
        handleProcessAndAddFiles: fileHandler.handleProcessAndAddFiles,
        handleAppDragEnter: dragDropHandler.handleAppDragEnter,
        handleAppDragOver: dragDropHandler.handleAppDragOver,
        handleAppDragLeave: dragDropHandler.handleAppDragLeave,
        handleAppDrop: dragDropHandler.handleAppDrop,
        handleCancelFileUpload: fileHandler.handleCancelFileUpload,
        handleCancelUpload: fileHandler.handleCancelFileUpload,
        handleAddFileById: fileHandler.handleAddFileById,

        handleSendMessage: messageHandler.handleSendMessage,
        handleGenerateCanvas: messageHandler.handleGenerateCanvas,
        handleStopGenerating: messageHandler.handleStopGenerating,
        handleEditMessage: messageHandler.handleEditMessage,
        handleCancelEdit: messageHandler.handleCancelEdit,
        handleDeleteMessage: messageHandler.handleDeleteMessage,
        handleRetryMessage: messageHandler.handleRetryMessage,
        handleRetryLastTurn: messageHandler.handleRetryLastTurn,
        handleTextToSpeech: messageHandler.handleTextToSpeech,
        handleQuickTTS: messageHandler.handleQuickTTS,
        handleEditLastUserMessage: messageHandler.handleEditLastUserMessage,
        handleContinueGeneration: messageHandler.handleContinueGeneration,

        savedScenarios: scenarioHandler.savedScenarios,
        handleSaveAllScenarios: scenarioHandler.handleSaveAllScenarios,
        handleLoadPreloadedScenario: scenarioHandler.handleLoadPreloadedScenario,

        handleTranscribeAudio: chatActions.handleTranscribeAudio,
        setCurrentChatSettings,
        handleSelectModelInHeader: chatActions.handleSelectModelInHeader,
        handleClearCurrentChat: chatActions.handleClearCurrentChat,
        toggleGoogleSearch: chatActions.toggleGoogleSearch,
        toggleCodeExecution: chatActions.toggleCodeExecution,
        toggleLocalPython: chatActions.toggleLocalPython,
        toggleUrlContext: chatActions.toggleUrlContext,
        toggleDeepSearch: chatActions.toggleDeepSearch,
        handleTogglePinCurrentSession: chatActions.handleTogglePinCurrentSession,
        handleUpdateMessageContent: chatActions.handleUpdateMessageContent,
        handleUpdateMessageFile: chatActions.handleUpdateMessageFile,
        handleAddUserMessage: chatActions.handleAddUserMessage,
        handleLiveTranscript: chatActions.handleLiveTranscript,
    };
};
