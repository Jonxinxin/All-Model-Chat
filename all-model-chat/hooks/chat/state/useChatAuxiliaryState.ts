
import { useState, useRef } from 'react';
import { UploadedFile, InputCommand } from '../../../types';

export const useChatAuxiliaryState = (activeSessionId: string | null) => {
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [editMode, setEditMode] = useState<'update' | 'resend'>('resend');
    const [commandedInput, setCommandedInput] = useState<InputCommand | null>(null);

    // Loading & Async State
    // Ref for O(1) internal checks (no React re-render on change)
    const loadingSessionIdsRef = useRef(new Set<string>());
    // State for sidebar reactivity (only sidebar consumes this)
    const [loadingSessionIds, setLoadingSessionIds] = useState(new Set<string>());
    // Simple boolean for the active session — avoids Set-based useMemo cascades in main chat path
    const [isCurrentSessionLoading, setIsCurrentSessionLoading] = useState(false);
    const [generatingTitleSessionIds, setGeneratingTitleSessionIds] = useState(new Set<string>());
    const activeJobs = useRef(new Map<string, AbortController>());

    // File & Input State
    const [selectedFiles, setSelectedFiles] = useState<UploadedFile[]>([]);
    const [appFileError, setAppFileError] = useState<string | null>(null);
    const [isAppProcessingFile, setIsAppProcessingFile] = useState<boolean>(false);

    // Settings specific to input context
    const [aspectRatio, setAspectRatio] = useState<string>('1:1');
    const [imageSize, setImageSize] = useState<string>('1K');
    const [ttsMessageId, setTtsMessageId] = useState<string | null>(null);
    const [isSwitchingModel, setIsSwitchingModel] = useState<boolean>(false);

    // Interaction Refs
    const userScrolledUp = useRef<boolean>(false);
    const fileDraftsRef = useRef<Record<string, UploadedFile[]>>({});

    // Derived: is the active session loading?
    // We expose this as a getter-style function to avoid recomputation
    const isSessionLoading = (sessionId: string) => loadingSessionIdsRef.current.has(sessionId);

    return {
        editingMessageId, setEditingMessageId,
        editMode, setEditMode,
        commandedInput, setCommandedInput,
        loadingSessionIdsRef,
        loadingSessionIds, setLoadingSessionIds,
        // For consumers that need the active session loading state
        isLoading: isCurrentSessionLoading,
        setIsCurrentSessionLoading,
        isSessionLoading,
        generatingTitleSessionIds, setGeneratingTitleSessionIds,
        activeJobs,
        selectedFiles, setSelectedFiles,
        appFileError, setAppFileError,
        isAppProcessingFile, setIsAppProcessingFile,
        aspectRatio, setAspectRatio,
        imageSize, setImageSize,
        ttsMessageId, setTtsMessageId,
        isSwitchingModel, setIsSwitchingModel,
        userScrolledUp,
        fileDraftsRef
    };
};
