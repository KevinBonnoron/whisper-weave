import type { AssistantRecord } from '@whisper-weave/shared';
import { useTranslation } from 'react-i18next';
import { Combobox, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';

export type AssistantOption = {
  value: string;
  label: string;
  description?: string;
};

function buildOptions(assistants: AssistantRecord[], options?: { showNoneOption?: boolean; noneLabel?: string }): AssistantOption[] {
  const { showNoneOption = false, noneLabel = 'None' } = options ?? {};
  const base: AssistantOption[] = showNoneOption ? [{ value: '_none', label: noneLabel }] : [];
  const fromAssistants = assistants.map((assistant) => ({
    value: assistant.id,
    label: assistant.name,
    description: assistant.isDefault ? 'Default' : undefined,
  }));
  return [...base, ...fromAssistants];
}

export interface AssistantSelectorProps {
  assistants: AssistantRecord[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  showNoneOption?: boolean;
  disabled?: boolean;
  className?: string;
}

export function AssistantSelector({ assistants, value, onChange, label, placeholder, showNoneOption = false, disabled = false, className }: AssistantSelectorProps) {
  const { t } = useTranslation();
  const options = buildOptions(assistants, { showNoneOption, noneLabel: t('AssistantSelector.noneOption') });
  const selectedOption = options.find((o) => o.value === (value || '_none')) ?? null;
  const placeholderText = placeholder ?? t('AssistantSelector.placeholder');

  return (
    <div className={className}>
      {label ? (
        <Label className="text-muted-foreground mb-2 block text-sm" htmlFor="assistant-selector">
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
        <ComboboxInput id="assistant-selector" placeholder={placeholderText} className="w-full min-w-[12rem]" showClear={!!(value && value !== '_none')} disabled={disabled} />
        <ComboboxContent>
          <ComboboxEmpty>{t('AssistantSelector.emptyText')}</ComboboxEmpty>
          <ComboboxList>
            <ComboboxCollection>
              {(item: AssistantOption, index: number) => (
                <ComboboxItem key={item.value} value={item} index={index}>
                  <div className="flex flex-col">
                    <span>{item.label}</span>
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
