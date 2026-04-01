

import { getConfiguredApiClient } from '../baseApi';
import { logService } from "../../logService";
import { Part } from "@google/genai";
import { blobToBase64 } from "../../../utils/appUtils";

export const generateSpeechApi = async (apiKey: string, modelId: string, text: string, voice: string, abortSignal: AbortSignal): Promise<string> => {
    logService.info(`Generating speech with model ${modelId}`, { textLength: text.length, voice });
    
    if (!text.trim()) {
        throw new Error("TTS input text cannot be empty.");
    }

    try {
        const ai = await getConfiguredApiClient(apiKey);

        // Race the API call against the abort signal so cancelled requests
        // don't continue consuming network bandwidth and API quota.
        const generatePromise = ai.models.generateContent({
            model: modelId,
            // TTS models do not support chat history roles, just plain content parts
            contents: [{ role: 'user', parts: [{ text: text }] }],
            config: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
                },
            },
        });

        const response = await new Promise<typeof generatePromise extends Promise<infer T> ? T : never>((resolve, reject) => {
            let settled = false;

            const onAbort = () => {
                if (!settled) {
                    settled = true;
                    const abortError = new Error("Speech generation cancelled by user.");
                    abortError.name = "AbortError";
                    reject(abortError);
                }
            };
            abortSignal.addEventListener('abort', onAbort, { once: true });

            generatePromise
                .then(result => {
                    if (!settled) {
                        settled = true;
                        abortSignal.removeEventListener('abort', onAbort);
                        resolve(result);
                    }
                })
                .catch(err => {
                    if (!settled) {
                        settled = true;
                        abortSignal.removeEventListener('abort', onAbort);
                        reject(err);
                    }
                });
        });

        if (abortSignal.aborted) {
            const abortError = new Error("Speech generation cancelled by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

        if (typeof audioData === 'string' && audioData.length > 0) {
            return audioData;
        }
        
        const candidate = response.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
             throw new Error(`TTS generation failed with reason: ${candidate.finishReason}`);
        }
        
        logService.error("TTS response did not contain expected audio data structure:", { response });

        // Fallback to checking text error if any, though unlikely with AUDIO modality
        const textError = response.text;
        if (textError) {
            throw new Error(`TTS generation failed: ${textError}`);
        }

        throw new Error('No audio data found in TTS response.');

    } catch (error) {
        logService.error(`Failed to generate speech with model ${modelId}:`, error);
        throw error;
    }
};

export const transcribeAudioApi = async (apiKey: string, audioFile: File, modelId: string, language: 'en' | 'zh' = 'en'): Promise<string> => {
    logService.info(`Transcribing audio with model ${modelId}`, { fileName: audioFile.name, size: audioFile.size });

    try {
        const ai = await getConfiguredApiClient(apiKey);
        // Use blobToBase64 which is efficient and handles Blobs/Files
        const audioBase64 = await blobToBase64(audioFile);

        const audioPart: Part = {
            inlineData: {
                mimeType: audioFile.type,
                data: audioBase64,
            },
        };

        const textPart: Part = {
            text: "Transcribe audio.",
        };

        const systemInstructionZh = "请准确转录语音内容。使用正确的标点符号。不要描述音频、回答问题或添加对话填充词，仅返回文本。若音频中无语音或仅有背景噪音，请不要输出任何文字。";
        const systemInstructionEn = "Accurately transcribe the speech content. Use correct punctuation. Do not describe the audio, answer questions, or add conversational filler—return only the text. If there is no speech or only background noise, output nothing.";

        const config: any = {
          systemInstruction: language === 'zh' ? systemInstructionZh : systemInstructionEn,
        };

        // Apply specific defaults based on model
        if (modelId.includes('gemini-3')) {
            // Gemini 3.1 Pro does not support 'MINIMAL' thinking level — use 'LOW'
            let thinkingLevel: "MINIMAL" | "LOW" | "MEDIUM" | "HIGH" = "MINIMAL";
            if (modelId.includes('gemini-3.1') && modelId.includes('pro')) {
                thinkingLevel = "LOW";
            }
            config.thinkingConfig = {
                includeThoughts: false,
                thinkingLevel,
            };
        } else if (modelId === 'gemini-2.5-pro') {
            config.thinkingConfig = {
                thinkingBudget: 128,
            };
        } else if (modelId.includes('flash')) {
            // Both 2.5 Flash and Flash Lite
            config.thinkingConfig = {
                thinkingBudget: 512,
            };
        } else {
            // For other models, use dynamic thinking to avoid errors with
            // models that cannot disable thinking (e.g. Gemini 2.5 Pro min budget is 128)
            config.thinkingConfig = {
                thinkingBudget: -1,
            };
        }

        const response = await ai.models.generateContent({
            model: modelId,
            contents: { parts: [textPart, audioPart] },
            config,
        });

        if (response.text) {
            return response.text;
        } else {
            const safetyFeedback = response.candidates?.[0]?.finishReason;
            if (safetyFeedback && safetyFeedback !== 'STOP') {
                 throw new Error(`Transcription failed due to safety settings: ${safetyFeedback}`);
            }
            throw new Error("Transcription failed. The model returned an empty response.");
        }
    } catch (error) {
        logService.error("Error during audio transcription:", error);
        throw error;
    }
};