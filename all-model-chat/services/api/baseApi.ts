


import { GoogleGenAI, Modality } from "@google/genai";
import { logService } from "../logService";
import { dbService } from '../../utils/db';
import { DEEP_SEARCH_SYSTEM_PROMPT, LOCAL_PYTHON_SYSTEM_PROMPT } from "../../constants/promptConstants";
import { SafetySetting, MediaResolution } from "../../types/settings";
import { isGemini3Model } from "../../utils/appUtils";


const POLLING_INTERVAL_MS = 2000; // 2 seconds
const MAX_POLLING_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export { POLLING_INTERVAL_MS, MAX_POLLING_DURATION_MS };

// ---------------------------------------------------------------------------
// In-memory cache for proxy settings so we don't read IndexedDB on every API call.
// Invalidated when app settings are saved (via invalidateProxyCache()) or when
// the broadcast channel signals a settings update from another tab.
// ---------------------------------------------------------------------------
let _cachedProxy: { baseUrl: string | null; httpOptions: any } | null = null;

export const invalidateProxyCache = () => { _cachedProxy = null; };

// Listen for cross-tab settings updates to keep the cache fresh.
// Uses the shared BroadcastChannel singleton from utils/broadcastChannel.ts.
import { getSyncChannel } from '../../utils/broadcastChannel';
try {
    getSyncChannel().addEventListener('message', (e) => {
        if ((e as MessageEvent).data?.type === 'SETTINGS_UPDATED') {
            _cachedProxy = null;
        }
    });
} catch { /* BroadcastChannel not available */ }

export const getClient = (apiKey: string, baseUrl?: string | null, httpOptions?: any): GoogleGenAI => {
  try {
      // Sanitize the API key to replace common non-ASCII characters that might
      // be introduced by copy-pasting from rich text editors. This prevents
      // "Failed to execute 'append' on 'Headers': Invalid character" errors.
      const sanitizedApiKey = apiKey
          .replace(/[\u2013\u2014]/g, '-') // en-dash, em-dash to hyphen
          .replace(/[\u2018\u2019]/g, "'") // smart single quotes to apostrophe
          .replace(/[\u201C\u201D]/g, '"') // smart double quotes to quote
          .replace(/[\u00A0]/g, ' '); // non-breaking space to regular space
          
      if (apiKey !== sanitizedApiKey) {
          logService.warn("API key was sanitized. Non-ASCII characters were replaced.");
      }
      
      const config: any = { apiKey: sanitizedApiKey };
      
      // Use the SDK's native baseUrl support if provided.
      // This is more robust than the network interceptor for SDK-generated requests.
      if (baseUrl && baseUrl.trim().length > 0) {
          // Remove trailing slash for consistency
          config.baseUrl = baseUrl.trim().replace(/\/$/, '');
      }

      if (httpOptions) {
          config.httpOptions = httpOptions;
      }
      
      return new GoogleGenAI(config);
  } catch (error) {
      logService.error("Failed to initialize GoogleGenAI client:", error);
      // Re-throw to be caught by the calling function
      throw error;
  }
};

export const getApiClient = (apiKey?: string | null, baseUrl?: string | null, httpOptions?: any): GoogleGenAI => {
    if (!apiKey) {
        const silentError = new Error("API key is not configured in settings or provided.");
        silentError.name = "SilentError";
        throw silentError;
    }
    return getClient(apiKey, baseUrl, httpOptions);
};

/**
 * Async helper to get an API client with settings (proxy, etc) loaded from DB.
 * Respects the `useApiProxy` toggle. Results are cached in memory and
 * invalidated on settings save or cross-tab sync.
 */
export const getConfiguredApiClient = async (apiKey: string, httpOptions?: any): Promise<GoogleGenAI> => {
    if (!_cachedProxy) {
        const settings = await dbService.getAppSettings();

        const shouldUseProxy = !!(settings?.useCustomApiConfig && settings?.useApiProxy);
        const apiProxyUrl = shouldUseProxy ? settings?.apiProxyUrl : null;

        if (settings?.useCustomApiConfig && !shouldUseProxy) {
            if (settings?.apiProxyUrl && !settings?.useApiProxy) {
                 logService.debug("[API Config] Proxy URL present but 'Use API Proxy' toggle is OFF.");
            }
        }

        _cachedProxy = { baseUrl: apiProxyUrl ?? null, httpOptions: undefined };
    }

    return getClient(apiKey, _cachedProxy.baseUrl, httpOptions);
};

export const buildGenerationConfig = (
    modelId: string,
    systemInstruction: string,
    config: { temperature?: number; topP?: number },
    showThoughts: boolean,
    thinkingBudget: number,
    isGoogleSearchEnabled?: boolean,
    isCodeExecutionEnabled?: boolean,
    isUrlContextEnabled?: boolean,
    thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH',
    aspectRatio?: string,
    isDeepSearchEnabled?: boolean,
    imageSize?: string,
    safetySettings?: SafetySetting[],
    mediaResolution?: MediaResolution,
    isLocalPythonEnabled?: boolean
): any => {
    if (modelId === 'gemini-2.5-flash-image') {
        const imageConfig: any = {};
        if (aspectRatio && aspectRatio !== 'Auto') imageConfig.aspectRatio = aspectRatio;

        const generationConfig: any = {
            ...config,
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        };
        if (Object.keys(imageConfig).length > 0) {
            generationConfig.imageConfig = imageConfig;
        }
        return generationConfig;
    }

    if (modelId === 'gemini-3.1-flash-image-preview' || modelId === 'gemini-3-pro-image-preview') {
         const imageConfig: any = {
            imageSize: imageSize || '1K',
         };
         if (aspectRatio && aspectRatio !== 'Auto') {
            imageConfig.aspectRatio = aspectRatio;
         }

         const generationConfig: any = {
            ...config,
            responseModalities: [Modality.IMAGE, Modality.TEXT],
            imageConfig,
         };
         
         // Add tools if enabled
         const tools = [];
         if (isGoogleSearchEnabled || isDeepSearchEnabled) tools.push({ googleSearch: {} });
         if (tools.length > 0) generationConfig.tools = tools;

         if (systemInstruction) generationConfig.systemInstruction = systemInstruction;

         return generationConfig;
    }
    
    let finalSystemInstruction = systemInstruction;
    if (isDeepSearchEnabled) {
        finalSystemInstruction = finalSystemInstruction 
            ? `${finalSystemInstruction}\n\n${DEEP_SEARCH_SYSTEM_PROMPT}`
            : DEEP_SEARCH_SYSTEM_PROMPT;
    }

    if (isLocalPythonEnabled) {
        finalSystemInstruction = finalSystemInstruction 
            ? `${finalSystemInstruction}\n\n${LOCAL_PYTHON_SYSTEM_PROMPT}`
            : LOCAL_PYTHON_SYSTEM_PROMPT;
    }

    const generationConfig: any = {
        ...config,
        systemInstruction: finalSystemInstruction || undefined,
        safetySettings: safetySettings || undefined,
    };

    // Check if model is Gemini 3. If so, prefer per-part media resolution (handled in content construction),
    // but we can omit the global config to avoid conflict, or set it if per-part isn't used.
    // However, if we are NOT Gemini 3, we MUST use global config.
    const isGemini3 = isGemini3Model(modelId);
    // Gemma models do not support media resolution at all
    const isGemma = modelId.toLowerCase().includes('gemma');
    
    if (!isGemini3 && !isGemma && mediaResolution) {
        // For non-Gemini 3 models (and not Gemma), apply global resolution if specified
        generationConfig.mediaResolution = mediaResolution;
    } 
    // Note: For Gemini 3, we don't set global mediaResolution here because we inject it into parts in `buildContentParts`.
    // The API documentation says per-part overrides global, but to be clean/explicit as requested ("become Per-part"), 
    // we skip global for G3.

    if (!generationConfig.systemInstruction) {
        delete generationConfig.systemInstruction;
    }

    // Robust check for Gemini 3
    if (isGemini3) {
        // Per Gemini 3 docs: strongly recommend temperature=1.0.
        // Lower values may cause looping or degraded performance.
        if (config.temperature === undefined) {
            generationConfig.temperature = 1.0;
        }

        // Gemini 3 should use thinkingLevel, NOT thinkingBudget.
        // Per API docs: using thinkingBudget with Gemini 3 Pro may result in unexpected performance.
        generationConfig.thinkingConfig = {
            includeThoughts: true, // Always capture thoughts in data; UI toggles visibility
        };

        // Gemini 3.1 Pro does not support 'MINIMAL' thinking level — upgrade to 'LOW'
        let effectiveThinkingLevel = thinkingLevel || 'HIGH';
        if (effectiveThinkingLevel === 'MINIMAL' && modelId.includes('gemini-3.1') && modelId.includes('pro')) {
            effectiveThinkingLevel = 'LOW';
        }
        generationConfig.thinkingConfig.thinkingLevel = effectiveThinkingLevel;
    } else {
        const modelSupportsThinking = [
            'gemini-2.5-pro',
        ].includes(modelId) || modelId.includes('gemini-2.5');

        if (modelSupportsThinking) {
            // Decouple thinking budget from showing thoughts.
            // `thinkingBudget` controls if and how much the model thinks.
            // `includeThoughts` controls if the `thought` field is returned in the stream.
            generationConfig.thinkingConfig = {
                thinkingBudget: thinkingBudget,
                includeThoughts: true, // Always capture thoughts in data; UI toggles visibility
            };
        }
    }

    const tools = [];
    // Deep Search requires Google Search tool
    if (isGoogleSearchEnabled || isDeepSearchEnabled) {
        tools.push({ googleSearch: {} });
    }
    // Only allow server code execution if local python is DISABLED
    if (isCodeExecutionEnabled && !isLocalPythonEnabled) {
        tools.push({ codeExecution: {} });
    }
    if (isUrlContextEnabled) {
        tools.push({ urlContext: {} });
    }

    if (tools.length > 0) {
        generationConfig.tools = tools;
        // When using tools, these should not be set
        delete generationConfig.responseMimeType;
        delete generationConfig.responseSchema;
    }
    
    return generationConfig;
};