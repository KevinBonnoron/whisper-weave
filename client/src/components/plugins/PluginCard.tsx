import type { CatalogEntry, PluginInstance, PluginRecord } from '@whisper-weave/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ModelCapabilityBadges } from '@/components/atoms/ModelCapabilityBadges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { ToolsDetailsDialog } from '@/components/ui/tools-details-dialog';
import { RemovePluginButton } from './RemovePluginButton';

interface PluginCardProps {
  record: PluginRecord;
  instance: PluginInstance | null;
  catalogEntry?: CatalogEntry;
  onToggle: () => void;
  onRemove: () => void;
  configureTrigger?: React.ReactNode;
}

export function PluginCard({ record, instance, catalogEntry, onToggle, onRemove, configureTrigger }: PluginCardProps) {
  const { t } = useTranslation();
  const [showModels, setShowModels] = useState(false);

  const features = catalogEntry?.features ?? [];
  const isConnector = features.includes('connector');
  const isLLMProvider = features.includes('llm-provider');
  const hasTools = features.includes('tools');

  const getStatusColor = () => {
    if (!record.enabled) return 'bg-gray-500/10 text-gray-500';
    if (isConnector && instance?.connected) return 'bg-green-500/10 text-green-600';
    if (isConnector && !instance?.connected) return 'bg-yellow-500/10 text-yellow-600';
    return 'bg-blue-500/10 text-blue-600';
  };

  const getStatusText = () => {
    if (!record.enabled) return t('PluginCard.statusDisabled');
    if (isConnector && instance?.connected) return t('PluginCard.statusConnected');
    if (isConnector && !instance?.connected) return t('PluginCard.statusDisconnected');
    return t('PluginCard.statusActive');
  };

  return (
    <Card className="relative flex h-full flex-col overflow-hidden transition-all hover:shadow-md">
      <div className={`absolute left-0 top-0 h-full w-1 ${record.enabled ? 'bg-primary' : 'bg-muted'}`} />
      <CardHeader className="pl-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-lg">{record.name}</CardTitle>
              <Badge variant="outline" className="font-mono text-xs normal-case text-muted-foreground">
                {record.type}
              </Badge>
              <Badge variant={record.enabled ? 'default' : 'secondary'} className={getStatusColor()}>
                {getStatusText()}
              </Badge>
            </div>
            <CardDescription className="mt-1">{catalogEntry?.description ?? instance?.metadata.description}</CardDescription>
          </div>
          <Switch checked={record.enabled} onCheckedChange={onToggle} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {isConnector && (
            <Badge variant="outline" className="bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-300 dark:border-purple-700">
              <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              {t('PluginCard.connectorBadge')}
            </Badge>
          )}
          {isLLMProvider && (
            <Badge variant="outline" className="bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700">
              <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {t('PluginCard.llmProviderBadge')}
            </Badge>
          )}
          {hasTools && (
            <Badge variant="outline" className="bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-700">
              <svg className="mr-1 h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {t('PluginCard.toolsBadge')}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col pl-6">
        <div className="mt-auto flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {isLLMProvider && instance?.models && instance.models.length > 0 && (
              <Button type="button" variant="ghost" size="sm" className="h-auto gap-1 px-0 text-muted-foreground hover:text-foreground" onClick={() => setShowModels(true)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                </svg>
                <span className="underline decoration-dotted">{t('PluginCard.modelsCount', { count: instance.models.length })}</span>
              </Button>
            )}
            {hasTools && instance?.tools && instance.tools.length > 0 && (
              <ToolsDetailsDialog
                tools={instance.tools}
                pluginName={record.name}
                trigger={
                  <span className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <span className="underline decoration-dotted">{t('PluginCard.toolsCount', { count: instance.tools.length })}</span>
                  </span>
                }
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {configureTrigger}
            <RemovePluginButton pluginName={record.name} onConfirm={onRemove} />
          </div>
        </div>
      </CardContent>

      <Dialog open={showModels} onOpenChange={setShowModels}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('PluginCard.modelsDialogTitle', { name: record.name })}</DialogTitle>
            <DialogDescription>{t('PluginCard.modelsDialogDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {instance?.models?.map((model) => (
              <div key={model.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{model.name}</span>
                  <ModelCapabilityBadges capabilities={model.capabilities} />
                </div>
                <div className="text-sm text-muted-foreground">{model.description}</div>
                {model.contextWindow && <div className="mt-1 text-xs text-muted-foreground">{t('PluginCard.contextWindowLabel', { count: model.contextWindow })}</div>}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
