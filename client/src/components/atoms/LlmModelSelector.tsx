import type { PluginInstance } from '@whisper-weave/shared';
import { useTranslation } from 'react-i18next';
import { ModelCapabilityBadges } from '@/components/atoms/ModelCapabilityBadges';
import { cn } from '@/lib/utils';
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';

export type LlmModelOption = {
  value: string;
  label: string;
  description?: string;
  /** When present and includes "tools", the model supports tool/function calling. */
  capabilities?: string[];
};

function buildOptions(providers: PluginInstance[], options?: { showNoneOption?: boolean; noneLabel?: string; fallbackKey?: string; fallbackLabel?: string }): LlmModelOption[] {
  const { showNoneOption = true, noneLabel = 'None', fallbackKey, fallbackLabel } = options ?? {};
  const base: LlmModelOption[] = showNoneOption ? [{ value: '_none', label: noneLabel }] : [];
  const fromProviders = providers.flatMap((provider) =>
    (provider.models ?? []).map((model) => ({
      value: `${provider.id}:${model.id}`,
      label: `${model.name}`,
      description: model.description,
      capabilities: model.capabilities,
    })),
  );
  const list = [...base, ...fromProviders];
  if (fallbackKey && fallbackLabel && !list.some((o) => o.value === fallbackKey)) {
    return [...list, { value: fallbackKey, label: fallbackLabel }];
  }
  return list;
}

export interface LlmModelSelectorProps {
  /** LLM provider instances (with models). */
  providers: PluginInstance[];
  /** Current value: "providerId:modelId" or "" (or "_none" when showNoneOption). */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  showNoneOption?: boolean;
  /** When the current value is not in the list, show this option (e.g. saved model). */
  fallbackKey?: string;
  fallbackLabel?: string;
  disabled?: boolean;
  className?: string;
}

export function LlmModelSelector({ providers, value, onChange, label, placeholder, showNoneOption = true, fallbackKey, fallbackLabel, disabled = false, className }: LlmModelSelectorProps) {
  const { t } = useTranslation();
  const options = buildOptions(providers, { showNoneOption, noneLabel: t('LlmModelSelector.noneOption'), fallbackKey, fallbackLabel });
  const selectedOption = options.find((o) => o.value === (value || '_none')) ?? null;
  const placeholderText = placeholder ?? t('LlmModelSelector.placeholder');

  return (
    <div className={cn('min-w-0', className)}>
      {label ? (
        <Label className="text-muted-foreground mb-2 block text-sm" htmlFor="llm-model-selector">
          {label}
        </Label>
      ) : null}
      <Combobox
        value={selectedOption}
        onValueChange={(item) => onChange(item?.value === '_none' ? '' : (item?.value ?? ''))}
        items={options}
        isItemEqualToValue={(a, b) => a?.value === b?.value}
        itemToStringLabel={(item) => item?.label ?? ''}
        filter={(item, query, itemToString) => {
          if (!query?.trim()) return true;
          const labelText = itemToString?.(item) ?? item?.label ?? '';
          return labelText.toLowerCase().includes(query.toLowerCase());
        }}
      >
        <ComboboxInput id="llm-model-selector" placeholder={placeholderText} className="min-w-0 w-full truncate" showClear={!!(value && value !== '_none')} disabled={disabled} />
        <ComboboxContent>
          <ComboboxEmpty>{t('LlmModelSelector.emptyText')}</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(item: LlmModelOption, index: number) => (
                <ComboboxItem key={item.value} value={item} index={index}>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span>{item.label}</span>
                      <ModelCapabilityBadges capabilities={item.capabilities} />
                    </div>
                    {item.description ? <span className="text-muted-foreground text-xs">{item.description}</span> : null}
                  </div>
                </ComboboxItem>
              )}
            </ComboboxCollection>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
