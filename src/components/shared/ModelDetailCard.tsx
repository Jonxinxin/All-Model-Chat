import React from 'react';
import {
  Brain,
  Eye,
  Wrench,
  Globe,
  Code2,
  AudioLines,
  Image as ImageIcon,
  Layers,
  Sparkles,
  Cpu,
} from 'lucide-react';
import type { ModelOption } from '@/types';
import { useI18n } from '@/contexts/I18nContext';
import { getModelSpecification, type ModelCapabilityTag } from '@/utils/model/modelSpecifications';

interface ModelDetailCardProps {
  model: ModelOption;
  renderModelIcon?: (model: ModelOption) => React.ReactNode;
  className?: string;
}

const CATEGORY_ICONS: Record<ModelCapabilityTag['category'], React.ElementType> = {
  reasoning: Brain,
  vision: Eye,
  tools: Wrench,
  search: Globe,
  code: Code2,
  audio: AudioLines,
  image: ImageIcon,
};

const CATEGORY_STYLES: Record<
  ModelCapabilityTag['category'],
  { badge: string; icon: string }
> = {
  reasoning: {
    badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20',
    icon: 'text-purple-500',
  },
  vision: {
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20',
    icon: 'text-blue-500',
  },
  tools: {
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20',
    icon: 'text-emerald-500',
  },
  search: {
    badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20',
    icon: 'text-cyan-500',
  },
  code: {
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20',
    icon: 'text-amber-500',
  },
  audio: {
    badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20',
    icon: 'text-rose-500',
  },
  image: {
    badge: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20',
    icon: 'text-pink-500',
  },
};

export const ModelDetailCard: React.FC<ModelDetailCardProps> = ({
  model,
  renderModelIcon,
  className = '',
}) => {
  const { t } = useI18n();
  const spec = getModelSpecification(model);

  return (
    <div
      data-testid="model-detail-card"
      className={`w-72 sm:w-80 rounded-2xl bg-[var(--theme-bg-secondary)] border border-[var(--theme-border-primary)] p-3.5 shadow-premium space-y-3 pointer-events-auto select-none ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex-shrink-0">
          {renderModelIcon ? (
            renderModelIcon(model)
          ) : (
            <div className="size-6 rounded-lg bg-[var(--theme-bg-tertiary)] flex items-center justify-center text-[var(--theme-text-primary)]">
              <Cpu size={14} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-center justify-between gap-1.5">
            <h4 className="font-semibold text-sm text-[var(--theme-text-primary)] truncate" title={spec.modelName}>
              {spec.modelName}
            </h4>
            <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded-md bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)] border border-[var(--theme-border-secondary)]/50">
              {spec.providerDisplayName}
            </span>
          </div>
          <p className="font-mono text-xs text-[var(--theme-text-tertiary)] truncate" title={spec.modelId}>
            {spec.modelId}
          </p>
        </div>
      </div>

      {spec.description && (
        <p className="text-xs leading-relaxed text-[var(--theme-text-secondary)] line-clamp-2">
          {spec.description}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[var(--theme-border-secondary)]/40">
        <div className="rounded-lg bg-[var(--theme-bg-tertiary)]/40 p-2 space-y-0.5 border border-[var(--theme-border-secondary)]/30">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--theme-text-tertiary)]">
            <Layers size={12} className="flex-shrink-0" />
            <span className="truncate">{t('modelCardContext')}</span>
          </div>
          <p className="font-semibold text-xs text-[var(--theme-text-primary)] truncate" title={spec.contextWindow}>
            {spec.contextWindow}
          </p>
        </div>

        <div className="rounded-lg bg-[var(--theme-bg-tertiary)]/40 p-2 space-y-0.5 border border-[var(--theme-border-secondary)]/30">
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--theme-text-tertiary)]">
            <Sparkles size={12} className="flex-shrink-0" />
            <span className="truncate">{t('modelCardOutput')}</span>
          </div>
          <p className="font-semibold text-xs text-[var(--theme-text-primary)] truncate" title={spec.maxOutput ?? '—'}>
            {spec.maxOutput ?? '—'}
          </p>
        </div>
      </div>

      {spec.thinkingBudgetRange && (
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg bg-purple-500/5 border border-purple-500/15 text-xs">
          <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
            <Brain size={12} className="flex-shrink-0" />
            <span>{t('modelCardThinking')}</span>
          </div>
          <span className="font-mono font-medium text-purple-700 dark:text-purple-300">
            {spec.thinkingBudgetRange}
          </span>
        </div>
      )}

      {spec.capabilities.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--theme-text-tertiary)]">
            {t('modelCardCapabilities')}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {spec.capabilities.map((cap) => {
              const Icon = CATEGORY_ICONS[cap.category] || Sparkles;
              const style = CATEGORY_STYLES[cap.category] || {
                badge: 'bg-[var(--theme-bg-tertiary)] text-[var(--theme-text-secondary)]',
                icon: 'text-[var(--theme-text-secondary)]',
              };

              return (
                <span
                  key={cap.id}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${style.badge}`}
                >
                  <Icon size={11} className={style.icon} />
                  <span>{t(cap.labelKey) || cap.defaultLabel}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
