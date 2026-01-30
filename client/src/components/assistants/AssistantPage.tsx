import { useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import type { AssistantRecord, PluginInstance, PluginRecord } from '@whisper-weave/shared';
import { PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { pluginsClient } from '@/clients/plugins.client';
import { assistantsCollection } from '@/collections/assistants.collection';
import { pluginsCollection } from '@/collections/plugins.collection';
import { useInstances } from '@/hooks/useInstances';
import { EditAssistantDialog } from '@/components/assistants/EditAssistantDialog';
import { RemoveAssistantButton } from '@/components/assistants/RemoveAssistantButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { filterActions, filterConnectors, filterLLMProviders } from '@/lib/plugin-helpers';

export function AssistantsPage() {
  const { t } = useTranslation();

  const { data: pluginRecords = [], isLoading: loadingPlugins } = useLiveQuery((q) => q.from({ p: pluginsCollection }));
  const { data: assistants = [], isLoading: loadingAssistants } = useLiveQuery((q) => q.from({ p: assistantsCollection }));
  const { data: catalog = [] } = useQuery({
    queryKey: ['plugins', 'catalog'],
    queryFn: () => pluginsClient.getCatalog(),
  });
  const { data: instances = [] } = useInstances();

  const connectorRecords = pluginRecords.filter((r) => {
    const entry = catalog.find((c) => c.type === r.type);
    return entry?.features.includes('connector');
  });

  const connectors = filterConnectors(instances);
  const llmProviders = filterLLMProviders(instances);
  const actions = filterActions(instances);

  if (loadingPlugins || loadingAssistants) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t('AssistantPage.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('AssistantPage.title')}</h1>
        <p className="text-muted-foreground">{t('AssistantPage.subtitle')}</p>
      </div>

      {/* Section 1: Assistants List */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">{t('AssistantPage.assistantsSection')}</h2>
            <p className="text-sm text-muted-foreground">{t('AssistantPage.assistantsSectionDescription')}</p>
          </div>
          <EditAssistantDialog assistant={null} llmProviders={llmProviders.filter((p) => p.enabled)} actions={actions.filter((a) => a.enabled)}>
            <Button size="sm">
              <PlusIcon className="mr-2 h-4 w-4" />
              {t('AssistantPage.createAssistant')}
            </Button>
          </EditAssistantDialog>
        </div>

        {assistants.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('AssistantPage.noAssistantsTitle')}</CardTitle>
              <CardDescription>{t('AssistantPage.noAssistantsDescription')}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {assistants.map((assistant) => (
              <AssistantCard key={assistant.id} assistant={assistant} llmProviders={llmProviders.filter((p) => p.enabled)} actions={actions.filter((a) => a.enabled)} />
            ))}
          </div>
        )}
      </section>

      {/* Section 2: Connector Bindings */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold">{t('AssistantPage.bindingsSection')}</h2>
          <p className="text-sm text-muted-foreground">{t('AssistantPage.bindingsSectionDescription')}</p>
        </div>

        {connectorRecords.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('AssistantPage.noConnectorTitle')}</CardTitle>
              <CardDescription>{t('AssistantPage.noConnectorDescription')}</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                {connectorRecords.map((connector) => {
                  const instance = connectors.find((c) => c.id === connector.id);
                  return <ConnectorBinding key={connector.id} connector={connector} instance={instance ?? null} assistants={assistants} />;
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

// Assistant Card Component
interface AssistantCardProps {
  assistant: AssistantRecord;
  llmProviders: PluginInstance[];
  actions: PluginInstance[];
}

function AssistantCard({ assistant, llmProviders, actions }: AssistantCardProps) {
  const { t } = useTranslation();

  const toolsCount = assistant.tools?.length ?? 0;

  const handleDelete = async () => {
    try {
      const tx = assistantsCollection.delete(assistant.id);
      await tx.isPersisted.promise;
      toast.success(t('AssistantCard.deleted'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('AssistantCard.deleteError'));
    }
  };

  return (
    <Card className="relative flex h-full flex-col overflow-hidden transition-all hover:shadow-md">
      <div className="absolute left-0 top-0 h-full w-1 bg-primary" />
      <CardHeader className="pl-6">
        <CardTitle className="text-lg">{assistant.name}</CardTitle>
        <CardDescription>{assistant.llmModel}</CardDescription>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col pl-6">
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-medium">{t('AssistantCard.tools')}:</span>
            <span>{t('AssistantPage.toolsCount', { count: toolsCount })}</span>
          </div>
          {assistant.systemPrompt && (
            <div className="flex items-start gap-2">
              <span className="font-medium shrink-0">{t('AssistantCard.systemPrompt')}:</span>
              <span className="line-clamp-2 text-xs">{assistant.systemPrompt}</span>
            </div>
          )}
        </div>

        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <EditAssistantDialog assistant={assistant} llmProviders={llmProviders} actions={actions}>
            <Button variant="outline" size="sm">
              {t('AssistantCard.editButton')}
            </Button>
          </EditAssistantDialog>
          <RemoveAssistantButton assistantName={assistant.name} onConfirm={handleDelete} />
        </div>
      </CardContent>
    </Card>
  );
}

// Connector Binding Component
interface ConnectorBindingProps {
  connector: PluginRecord;
  instance: PluginInstance | null;
  assistants: AssistantRecord[];
}

function ConnectorBinding({ connector, instance, assistants }: ConnectorBindingProps) {
  const { t } = useTranslation();

  const handleAssistantChange = async (assistantId: string) => {
    try {
      const tx = pluginsCollection.update(connector.id, (draft) => {
        draft.assistant = assistantId === '_none' ? '' : assistantId;
      });
      await tx.isPersisted.promise;
      toast.success(t('AssistantPage.bindingUpdated'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('AssistantPage.bindingError'));
    }
  };

  const getStatusBadge = () => {
    if (instance?.connected) {
      return (
        <Badge variant="default" className="bg-green-500/10 text-green-600">
          {t('AssistantPage.connected')}
        </Badge>
      );
    }
    if (instance && !instance.connected) {
      return (
        <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600">
          {t('AssistantPage.disconnected')}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="bg-gray-500/10 text-gray-500">
        {t('AssistantPage.notLoaded')}
      </Badge>
    );
  };

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-center gap-3">
        <span className="font-medium">{connector.name}</span>
        {getStatusBadge()}
      </div>
      <Select value={connector.assistant || '_none'} onValueChange={handleAssistantChange}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t('AssistantPage.selectAssistant')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">{t('AssistantPage.noAssistant')}</SelectItem>
          {assistants.map((assistant) => (
            <SelectItem key={assistant.id} value={assistant.id}>
              {assistant.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
