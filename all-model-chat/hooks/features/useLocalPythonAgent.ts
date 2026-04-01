import { useEffect } from 'react';
import { ChatMessage, AppSettings, SavedChatSession } from '../../types';
import { usePyodide } from '../usePyodide';

interface UseLocalPythonAgentProps {
    messages: ChatMessage[];
    appSettings: AppSettings;
    currentChatSettings: any; // ChatSettings type
    isLoading: boolean;
    activeSessionId: string | null;
    updateMessageContent: (messageId: string, content: string) => void;
    onContinueGeneration: (messageId: string) => void;
    updateAndPersistSessions: (updater: (prev: SavedChatSession[]) => SavedChatSession[], options?: { persist?: boolean }) => void;
}

export const useLocalPythonAgent = ({
    messages,
    appSettings,
    currentChatSettings,
    isLoading,
    activeSessionId,
    updateMessageContent,
    onContinueGeneration,
    updateAndPersistSessions
}: UseLocalPythonAgentProps) => {
    const { runCode } = usePyodide();

    const isLocalPythonEnabled = currentChatSettings.isLocalPythonEnabled || appSettings.isLocalPythonEnabled;

    useEffect(() => {
        // Auto-execution of Python code is disabled for security.
        // Users can manually run Python code blocks via the "Run" button in CodeBlock.tsx.
        // This hook is kept for potential future opt-in auto-execution.
    }, [messages, isLoading, isLocalPythonEnabled, activeSessionId, runCode, updateMessageContent, onContinueGeneration, updateAndPersistSessions]);
};
