
import { useCallback, useRef, useEffect } from 'react';
import { AppSettings, ChatSettings as IndividualChatSettings, SavedChatSession } from '../../../types';
import { getKeyForRequest, logService, pcmBase64ToWavUrl } from '../../../utils/appUtils';
import { geminiServiceInstance } from '../../../services/geminiService';
import { DEFAULT_TTS_MODEL_ID } from '../../../constants/appConstants';

type SessionsUpdater = (updater: (prev: SavedChatSession[]) => SavedChatSession[]) => void;

interface TextToSpeechHandlerProps {
    appSettings: AppSettings;
    currentChatSettings: IndividualChatSettings;
    ttsMessageId: string | null;
    setTtsMessageId: (id: string | null) => void;
    updateAndPersistSessions: SessionsUpdater;
}

export const useTextToSpeechHandler = ({
    appSettings,
    currentChatSettings,
    ttsMessageId,
    setTtsMessageId,
    updateAndPersistSessions
}: TextToSpeechHandlerProps) => {

    // Track the active TTS AbortController so we can cancel on unmount or new request
    const activeTtsAbortRef = useRef<AbortController | null>(null);

    // Cancel any in-flight TTS request when the hook unmounts
    useEffect(() => {
        return () => {
            activeTtsAbortRef.current?.abort();
            activeTtsAbortRef.current = null;
        };
    }, []);

    const handleTextToSpeech = useCallback(async (messageId: string, text: string) => {
        if (ttsMessageId) return; 

        // Cancel any previous in-flight TTS request
        activeTtsAbortRef.current?.abort();

        // Use skipIncrement to avoid rotating keys for TTS, as users might replay audio.
        const keyResult = getKeyForRequest(appSettings, currentChatSettings, { skipIncrement: true });
        if ('error' in keyResult) {
            logService.error("TTS failed:", { error: keyResult.error });
            return;
        }
        const { key } = keyResult;
        
        setTtsMessageId(messageId);
        logService.info("Requesting TTS for message", { messageId });
        const modelId = DEFAULT_TTS_MODEL_ID;
        const voice = appSettings.ttsVoice;
        const abortController = new AbortController();
        activeTtsAbortRef.current = abortController;

        try {
            const base64Pcm = await geminiServiceInstance.generateSpeech(key, modelId, text, voice, abortController.signal);
            const wavUrl = pcmBase64ToWavUrl(base64Pcm);
            
            updateAndPersistSessions(prev => prev.map(s => {
                if(s.messages.some(m => m.id === messageId)) {
                    // Autoplay is true because user explicitly requested playback via button
                    return {...s, messages: s.messages.map(m => {
                        if (m.id === messageId) {
                            // Revoke old blob URL to prevent memory leak on re-request
                            if (m.audioSrc && m.audioSrc.startsWith('blob:')) {
                                URL.revokeObjectURL(m.audioSrc);
                            }
                            return {...m, audioSrc: wavUrl, audioAutoplay: true};
                        }
                        return m;
                    })};
                }
                return s;
            }));

        } catch (error) {
            logService.error("TTS generation failed:", { messageId, error });
        } finally {
            setTtsMessageId(null);
            if (activeTtsAbortRef.current === abortController) {
                activeTtsAbortRef.current = null;
            }
        }
    }, [appSettings, currentChatSettings, ttsMessageId, setTtsMessageId, updateAndPersistSessions]);

    const handleQuickTTS = useCallback(async (text: string): Promise<string | null> => {
        const keyResult = getKeyForRequest(appSettings, currentChatSettings, { skipIncrement: true });
        if ('error' in keyResult) {
            logService.error("Quick TTS failed:", { error: keyResult.error });
            return null;
        }
        const { key } = keyResult;

        logService.info("Requesting Quick TTS for selected text");
        const modelId = DEFAULT_TTS_MODEL_ID;
        const voice = appSettings.ttsVoice;
        const abortController = new AbortController();

        try {
            const base64Pcm = await geminiServiceInstance.generateSpeech(key, modelId, text, voice, abortController.signal);
            return pcmBase64ToWavUrl(base64Pcm);
        } catch (error) {
            if ((error as Error)?.name !== 'AbortError') {
                logService.error("Quick TTS generation failed:", { error });
            }
            return null;
        }
    }, [appSettings, currentChatSettings]);

    return { handleTextToSpeech, handleQuickTTS };
};
