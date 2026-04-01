
import { GenerateContentResponse, Part, UsageMetadata, Content } from "@google/genai";
import { ThoughtSupportingPart } from '../../types';
import { logService } from "../logService";
import { getConfiguredApiClient } from "./baseApi";

const MAX_429_RETRIES = 3;
const BASE_429_DELAY_MS = 1000;

const sleep = (ms: number, abortSignal?: AbortSignal): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (abortSignal?.aborted) { reject(new Error("Request aborted")); return; }
        const timer = setTimeout(() => {
            abortSignal?.removeEventListener('abort', onAbort);
            resolve();
        }, ms);
        const onAbort = () => { clearTimeout(timer); reject(new Error("Request aborted")); };
        abortSignal?.addEventListener('abort', onAbort, { once: true });
    });
};

const is429Error = (error: any): boolean => {
    if (!(error instanceof Error)) return false;
    const msg = error.message || '';
    // Check for HTTP 429 or rate limit indicators in error message
    return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('rate limit') || msg.includes('quota');
};

const with429Retry = async <T>(fn: () => Promise<T>, label: string, abortSignal?: AbortSignal): Promise<T> => {
    let lastError: any;
    for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
        if (abortSignal?.aborted) throw new Error("Request aborted");
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (is429Error(error) && attempt < MAX_429_RETRIES) {
                const delay = BASE_429_DELAY_MS * Math.pow(2, attempt);
                logService.warn(`${label}: 429 rate limit hit. Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_429_RETRIES})`);
                await sleep(delay, abortSignal);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
};

/**
 * Shared helper to parse GenAI responses.
 * Extracts parts, separates thoughts, and merges metadata/citations from tool calls.
 */
const processResponse = (response: GenerateContentResponse) => {
    let thoughtsText = "";
    const responseParts: Part[] = [];

    if (response.candidates && response.candidates[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
            const pAsThoughtSupporting = part as ThoughtSupportingPart;
            if (pAsThoughtSupporting.thought) {
                thoughtsText += part.text;
            } else {
                responseParts.push(part);
            }
        }
    }

    if (responseParts.length === 0 && response.text) {
        responseParts.push({ text: response.text });
    }
    
    const candidate = response.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const finalMetadata: any = groundingMetadata ? { ...groundingMetadata } : {};
    
    // @ts-expect-error - Handle potential snake_case from raw API responses
    const urlContextMetadata = candidate?.urlContextMetadata || candidate?.url_context_metadata;

    // toolCalls removed from Candidate in new SDK - function calls are in Content.parts
    // Grounding/URL context metadata already captured above

    return {
        parts: responseParts,
        thoughts: thoughtsText || undefined,
        usage: response.usageMetadata,
        grounding: Object.keys(finalMetadata).length > 0 ? finalMetadata : undefined,
        urlContext: urlContextMetadata
    };
};

export const sendStatelessMessageStreamApi = async (
    apiKey: string,
    modelId: string,
    history: Content[],
    parts: Part[],
    config: any,
    abortSignal: AbortSignal,
    onPart: (part: Part) => void,
    onThoughtChunk: (chunk: string) => void,
    onError: (error: Error) => void,
    onComplete: (usageMetadata?: UsageMetadata, groundingMetadata?: any, urlContextMetadata?: any) => void,
    role: 'user' | 'model' = 'user'
): Promise<void> => {
    logService.info(`Sending message via stateless generateContentStream for ${modelId} (Role: ${role})`);
    let finalUsageMetadata: UsageMetadata | undefined = undefined;
    let finalGroundingMetadata: any = null;
    let finalUrlContextMetadata: any = null;

    try {
        const ai = await getConfiguredApiClient(apiKey);

        if (abortSignal.aborted) {
            logService.warn("Streaming aborted by signal before start.");
            return;
        }

        const result = await with429Retry(
            () => ai.models.generateContentStream({
                model: modelId,
                contents: [...history, { role: role, parts }],
                config: config
            }),
            `Stream ${modelId}`,
            abortSignal
        );

        for await (const chunkResponse of result) {
            if (abortSignal.aborted) {
                logService.warn("Streaming aborted by signal.");
                break;
            }
            if (chunkResponse.usageMetadata) {
                finalUsageMetadata = chunkResponse.usageMetadata;
            }
            const candidate = chunkResponse.candidates?.[0];
            
            if (candidate) {
                const metadataFromChunk = candidate.groundingMetadata;
                if (metadataFromChunk) {
                    finalGroundingMetadata = metadataFromChunk;
                }
                
                // @ts-expect-error type compatibility
                const urlMetadata = candidate.urlContextMetadata || candidate.url_context_metadata;
                if (urlMetadata) {
                    finalUrlContextMetadata = urlMetadata;
                }

                // toolCalls removed from Candidate in new SDK
                
                if (candidate.content?.parts?.length) {
                    for (const part of candidate.content.parts) {
                        const pAsThoughtSupporting = part as ThoughtSupportingPart;

                        if (pAsThoughtSupporting.thought) {
                            onThoughtChunk(part.text || '');
                        } else {
                            onPart(part);
                        }
                    }
                }
            }
        }
        if (abortSignal.aborted) {
            logService.warn("Streaming aborted by signal, skipping onComplete.");
            return;
        }

        logService.info("Streaming complete.", { usage: finalUsageMetadata, hasGrounding: !!finalGroundingMetadata });
        onComplete(finalUsageMetadata, finalGroundingMetadata, finalUrlContextMetadata);
    } catch (error) {
        logService.error("Error sending message (stream):", error);
        onError(error instanceof Error ? error : new Error(String(error) || "Unknown error during streaming."));
        return; // Don't call onComplete after onError
    }
};

export const sendStatelessMessageNonStreamApi = async (
    apiKey: string,
    modelId: string,
    history: Content[],
    parts: Part[],
    config: any,
    abortSignal: AbortSignal,
    onError: (error: Error) => void,
    onComplete: (parts: Part[], thoughtsText?: string, usageMetadata?: UsageMetadata, groundingMetadata?: any, urlContextMetadata?: any) => void,
    role: 'user' | 'model' = 'user'
): Promise<void> => {
    logService.info(`Sending message via stateless generateContent (non-stream) for model ${modelId}`);

    try {
        const ai = await getConfiguredApiClient(apiKey);

        if (abortSignal.aborted) {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            onError(abortError);
            return;
        }

        const response = await with429Retry(
            () => ai.models.generateContent({
                model: modelId,
                contents: [...history, { role: role, parts }],
                config: config
            }),
            `NonStream ${modelId}`,
            abortSignal
        );

        if (abortSignal.aborted) {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            onError(abortError);
            return;
        }

        const { parts: responseParts, thoughts, usage, grounding, urlContext } = processResponse(response);

        logService.info(`Stateless non-stream complete for ${modelId}.`, { usage, hasGrounding: !!grounding, hasUrlContext: !!urlContext });
        onComplete(responseParts, thoughts, usage, grounding, urlContext);
    } catch (error) {
        logService.error(`Error in stateless non-stream for ${modelId}:`, error);
        onError(error instanceof Error ? error : new Error(String(error) || "Unknown error during stateless non-streaming call."));
    }
};
