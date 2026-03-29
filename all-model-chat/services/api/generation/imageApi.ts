import { getConfiguredApiClient } from '../baseApi';
import { logService } from "../../logService";

export const generateImagesApi = async (apiKey: string, modelId: string, prompt: string, aspectRatio: string, imageSize: string | undefined, abortSignal: AbortSignal): Promise<string[]> => {
    logService.info(`Generating image with model ${modelId}`, { prompt, aspectRatio, imageSize });
    
    if (!prompt.trim()) {
        throw new Error("Image generation prompt cannot be empty.");
    }

    if (abortSignal.aborted) {
        const abortError = new Error("Image generation cancelled by user before starting.");
        abortError.name = "AbortError";
        throw abortError;
    }

    try {
        const ai = await getConfiguredApiClient(apiKey);
        const config: any = {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: aspectRatio
        };

        if (imageSize) {
            config.imageSize = imageSize;
        }

        // Race the API call against the abort signal so cancelled requests
        // don't continue consuming network bandwidth and API quota.
        const generatePromise = ai.models.generateImages({
            model: modelId,
            prompt: prompt,
            config: config,
        });

        const response = await new Promise<typeof generatePromise extends Promise<infer T> ? T : never>((resolve, reject) => {
            let settled = false;

            const onAbort = () => {
                if (!settled) {
                    settled = true;
                    const abortError = new Error("Image generation cancelled by user.");
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
            const abortError = new Error("Image generation cancelled by user.");
            abortError.name = "AbortError";
            throw abortError;
        }

        const images = response.generatedImages?.map(img => img.image.imageBytes) ?? [];
        if (images.length === 0) {
            throw new Error("No images generated. The prompt may have been blocked or the model failed to respond.");
        }
        
        return images;

    } catch (error) {
        logService.error(`Failed to generate images with model ${modelId}:`, error);
        throw error;
    }
};
