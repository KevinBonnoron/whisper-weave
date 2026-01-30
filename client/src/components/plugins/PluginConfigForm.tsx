import type { PluginConfigField } from '@whisper-weave/shared';
import { useTranslation } from 'react-i18next';
import { DynamicConfigForm } from './DynamicConfigForm';

export interface ConfigFormProps {
  config: Record<string, unknown>;
  onConfigChange: (key: string, value: unknown) => void;
}

interface Props {
  configSchema?: PluginConfigField[];
  config: Record<string, unknown>;
  onConfigChange: (key: string, value: unknown) => void;
}

export function PluginConfigForm({ configSchema, config, onConfigChange }: Props) {
  const { t } = useTranslation();

  if (configSchema && configSchema.length > 0) {
    return <DynamicConfigForm schema={configSchema} config={config} onConfigChange={onConfigChange} />;
  }

  return (
    <div className="py-4">
      <p className="text-muted-foreground text-sm">{t('AddPluginForm.noConfigRequired')}</p>
    </div>
  );
}
