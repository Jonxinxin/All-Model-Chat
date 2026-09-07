import type { ModelOption } from '@/types';
import { isGemini3Model, isGemmaModel, isReasoningModel, getModelCapabilities } from './modelCapabilities';
import { THINKING_BUDGET_RANGES } from '@/constants/modelConfiguration';

export interface ModelCapabilityTag {
  id: string;
  labelKey: string;
  defaultLabel: string;
  category: 'reasoning' | 'vision' | 'tools' | 'search' | 'code' | 'audio' | 'image';
}

export interface ModelSpecification {
  modelId: string;
  modelName: string;
  providerDisplayName: string;
  contextWindow: string;
  maxOutput?: string;
  capabilities: ModelCapabilityTag[];
  thinkingBudgetRange?: string;
  description?: string;
  isMultimodalVision: boolean;
  isReasoning: boolean;
  isToolSupported: boolean;
}

const isVisionSupportedModel = (modelId: string): boolean => {
  const lower = modelId.toLowerCase();
  if (lower.includes('tts') || lower.includes('transcribe')) return false;
  if (lower.includes('gemini')) return true;
  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo') || lower.includes('gpt-5') || lower.includes('o4')) {
    return true;
  }
  if (
    lower.includes('claude-3') ||
    lower.includes('claude-sonnet') ||
    lower.includes('claude-opus') ||
    lower.includes('claude-fable')
  ) {
    return true;
  }
  if (lower.includes('vision') || lower.includes('-vl') || lower.includes('/vl')) {
    return true;
  }
  return false;
};

const resolveProviderDisplayName = (model: ModelOption): string => {
  if (model.connectionName) return model.connectionName;
  if (model.templateId) {
    switch (model.templateId) {
      case 'openai':
        return 'OpenAI';
      case 'anthropic':
        return 'Anthropic';
      case 'deepseek':
        return 'DeepSeek';
      case 'openrouter':
        return 'OpenRouter';
      case 'qwen':
        return 'Qwen / DashScope';
      case 'kimi':
        return 'Moonshot Kimi';
      case 'glm':
        return 'Zhipu GLM';
      case 'siliconflow':
        return 'SiliconFlow';
      case 'groq':
        return 'Groq';
      case 'together':
        return 'Together AI';
      case 'nvidia':
        return 'NVIDIA NIM';
      case 'minimax':
        return 'MiniMax';
      case 'grok':
        return 'xAI Grok';
      case 'ollama':
        return 'Ollama';
      case 'lmstudio':
        return 'LM Studio';
      default:
        break;
    }
  }

  const id = model.id.toLowerCase();
  if (id.includes('gemini') || id.includes('gemma') || id.includes('robotics')) return 'Google Gemini';
  if (id.includes('gpt-') || id.startsWith('o4')) return 'OpenAI';
  if (id.includes('claude')) return 'Anthropic';
  if (id.includes('deepseek')) return 'DeepSeek';
  if (id.includes('qwen') || id.includes('qwq')) return 'Alibaba Qwen';
  if (id.includes('kimi')) return 'Moonshot Kimi';
  if (id.includes('glm')) return 'Zhipu AI';
  if (id.includes('llama')) return 'Meta Llama';
  if (id.includes('mistral') || id.includes('mixtral')) return 'Mistral AI';

  return 'AI Provider';
};

const resolveContextWindow = (modelId: string): { contextWindow: string; maxOutput?: string } => {
  const lower = modelId.toLowerCase();

  // Gemini family
  if (lower.includes('gemini-3.1-pro') || lower.includes('gemini-1.5-pro')) {
    return { contextWindow: '2,000,000 (2M)', maxOutput: '65,536 (64K)' };
  }
  if (lower.includes('gemini-3') || lower.includes('gemini-2.5') || lower.includes('gemini-1.5-flash')) {
    return { contextWindow: '1,000,000 (1M)', maxOutput: '65,536 (64K)' };
  }

  // Claude family
  if (
    lower.includes('claude-3') ||
    lower.includes('claude-sonnet') ||
    lower.includes('claude-opus') ||
    lower.includes('claude-fable')
  ) {
    if (lower.includes('3-7') || lower.includes('sonnet-5') || lower.includes('fable-5')) {
      return { contextWindow: '200,000 (200K)', maxOutput: '64,000 (64K)' };
    }
    return { contextWindow: '200,000 (200K)', maxOutput: '8,192 (8K)' };
  }

  // OpenAI family
  if (lower.includes('gpt-5') || lower.includes('o4')) {
    return { contextWindow: '200,000 (200K)', maxOutput: '100,000 (100K)' };
  }
  if (lower.includes('gpt-4o') || lower.includes('gpt-4-turbo')) {
    return { contextWindow: '128,000 (128K)', maxOutput: '16,384 (16K)' };
  }

  // DeepSeek family
  if (lower.includes('deepseek')) {
    return { contextWindow: '64,000 ~ 128,000', maxOutput: '8,192 (8K)' };
  }

  // Llama family
  if (lower.includes('llama-3')) {
    return { contextWindow: '128,000 (128K)', maxOutput: '8,192 (8K)' };
  }

  // Qwen family
  if (lower.includes('qwen') || lower.includes('qwq')) {
    return { contextWindow: '32,000 ~ 128,000', maxOutput: '8,192 (8K)' };
  }

  // Kimi / GLM
  if (lower.includes('kimi')) {
    return { contextWindow: '128,000 ~ 200,000', maxOutput: '8,192 (8K)' };
  }
  if (lower.includes('glm')) {
    return { contextWindow: '128,000 (128K)', maxOutput: '4,096 (4K)' };
  }

  return { contextWindow: '32,000 ~ 128,000' };
};

const resolveThinkingBudget = (modelId: string): string | undefined => {
  const range = THINKING_BUDGET_RANGES[modelId] || THINKING_BUDGET_RANGES[modelId.replace(/^models\//, '')];
  if (range) {
    return `${range.min.toLocaleString()} ~ ${range.max.toLocaleString()}`;
  }
  if (isGemini3Model(modelId)) {
    return '128 ~ 32,768';
  }
  return undefined;
};

const resolveModelDescription = (modelId: string): string | undefined => {
  const lower = modelId.toLowerCase();
  if (lower.includes('gemini-3.1-pro')) {
    return 'Google flagship frontier model designed for high-complexity reasoning, advanced code synthesis, and multimodal problem solving.';
  }
  if (lower.includes('gemini-3.8-flash') || lower.includes('gemini-3.7-flash')) {
    return 'Next-generation reasoning flash model balancing near-instant speed with high analytical precision.';
  }
  if (lower.includes('gemini-3.5-flash-lite')) {
    return 'Ultra-cost-efficient lightweight model with minimal latency for high-frequency interactive tasks.';
  }
  if (lower.includes('deepseek-r1')) {
    return 'Open-weight reasoning model excelling at mathematics, competitive programming, and multi-step logic.';
  }
  if (lower.includes('deepseek-v3') || lower.includes('deepseek-v4')) {
    return 'High-performance general chat and code model with state-of-the-art MoE architecture.';
  }
  if (lower.includes('claude-3-7') || lower.includes('claude-sonnet-5')) {
    return 'Hybrid reasoning model supporting instantaneous responses and extended thinking with exceptional coding acumen.';
  }
  if (lower.includes('llama-3.3-70b')) {
    return 'Flagship open architecture model delivering top-tier conversational depth and tool use.';
  }
  if (lower.includes('o4')) {
    return 'OpenAI next-generation reasoning model with deliberative chain-of-thought processing.';
  }
  return undefined;
};

export const getModelSpecification = (model: ModelOption): ModelSpecification => {
  const modelId = model.id;
  const lower = modelId.toLowerCase();
  const caps = getModelCapabilities(modelId);
  const isReasoning = isReasoningModel(modelId) || isGemini3Model(modelId);
  const isVision = isVisionSupportedModel(modelId);
  const isAudioLive = caps.isNativeAudioModel || caps.isLiveTranscribe || caps.isLiveTranslate;
  const isImageGen = caps.isImageGenerationModel || lower.includes('dall-e') || lower.includes('flux');
  const isGemma = isGemmaModel(modelId);
  const isToolSupported = caps.permissions.canUseTools && !isGemma;

  const capabilities: ModelCapabilityTag[] = [];

  if (isReasoning) {
    capabilities.push({
      id: 'reasoning',
      labelKey: 'modelCapReasoning',
      defaultLabel: 'Thinking',
      category: 'reasoning',
    });
  }

  if (isVision) {
    capabilities.push({
      id: 'vision',
      labelKey: 'modelCapVision',
      defaultLabel: 'Vision',
      category: 'vision',
    });
  }

  if (isToolSupported) {
    capabilities.push({
      id: 'tools',
      labelKey: 'modelCapTools',
      defaultLabel: 'Function Calling',
      category: 'tools',
    });
  }

  if (caps.permissions.canUseGoogleSearch) {
    capabilities.push({
      id: 'search',
      labelKey: 'modelCapSearch',
      defaultLabel: 'Web Search',
      category: 'search',
    });
  }

  if (caps.permissions.canUseLocalPython) {
    capabilities.push({
      id: 'code',
      labelKey: 'modelCapCodeExecution',
      defaultLabel: 'Python Sandbox',
      category: 'code',
    });
  }

  if (isAudioLive) {
    capabilities.push({
      id: 'audio',
      labelKey: 'modelCapLiveAudio',
      defaultLabel: 'Live Audio',
      category: 'audio',
    });
  }

  if (isImageGen) {
    capabilities.push({
      id: 'image',
      labelKey: 'modelCapImageGen',
      defaultLabel: 'Image Gen',
      category: 'image',
    });
  }

  const { contextWindow, maxOutput } = resolveContextWindow(modelId);
  const thinkingBudgetRange = resolveThinkingBudget(modelId);
  const description = resolveModelDescription(modelId);

  return {
    modelId,
    modelName: model.name,
    providerDisplayName: resolveProviderDisplayName(model),
    contextWindow,
    maxOutput,
    capabilities,
    thinkingBudgetRange,
    description,
    isMultimodalVision: isVision,
    isReasoning,
    isToolSupported,
  };
};
