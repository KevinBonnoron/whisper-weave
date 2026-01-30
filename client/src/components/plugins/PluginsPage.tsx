import { useLiveQuery } from '@tanstack/react-db';
import { useQuery } from '@tanstack/react-query';
import type { CatalogEntry, PluginRecord } from '@whisper-weave/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pluginsClient } from '@/clients/plugins.client';
import { pluginsCollection } from '@/collections/plugins.collection';
import { useInstances } from '@/hooks/useInstances';
import { AddPluginDialog } from '@/components/plugins/AddPluginDialog';
import { EditPluginDialog } from '@/components/plugins/EditPluginDialog';
import { PluginCard } from '@/components/plugins/PluginCard';
import { Button } from '@/components/ui/button';

export function PluginsPage() {
  const { t } = useTranslation();
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: records = [], isLoading: loadingRecords } = useLiveQuery((q) => q.from({ p: pluginsCollection }));
  const { data: instances = [] } = useInstances();
  const { data: catalog = [], isLoading: loadingCatalog } = useQuery({
    queryKey: ['plugins', 'catalog'],
    queryFn: () => pluginsClient.getCatalog(),
  });

  const handleAdd = async (entry: CatalogEntry, name: string, config: Record<string, unknown>) => {
    setActionError(null);
    try {
      const id = crypto.randomUUID();
      const sameTypeCount = records.filter((r) => r.type === entry.type).length;
      const defaultName = sameTypeCount > 0 ? `${entry.name} (${sameTypeCount + 1})` : entry.name;
      const finalName = name.trim() || defaultName;
      let finalConfig = config ?? {};
      if (entry.type === 'discord' && Array.isArray(finalConfig.allowedChannels)) {
        finalConfig = { ...finalConfig, allowedChannels: finalConfig.allowedChannels.filter((id: unknown): id is string => Boolean(id)) };
      }
      if (entry.type === 'files' && !String(finalConfig.directory ?? '').trim()) {
        finalConfig = { ...finalConfig, directory: 'output' };
      }
      if (entry.type === 'skills' && !String(finalConfig.directory ?? '').trim()) {
        finalConfig = { ...finalConfig, directory: 'skills' };
      }
      pluginsCollection.insert({
        id,
        type: entry.type,
        name: finalName,
        enabled: true,
        config: finalConfig,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Add failed');
    }
  };

  const handleRemove = async (id: string) => {
    setActionError(null);
    try {
      await pluginsCollection.delete(id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Remove failed');
    }
  };

  const handleToggle = (record: PluginRecord) => {
    setActionError(null);
    const newEnabled = !record.enabled;
    try {
      pluginsCollection.update(record.id, (draft) => {
        draft.enabled = newEnabled;
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const getCatalogEntry = (record: PluginRecord): CatalogEntry | undefined => {
    return catalog.find((c) => c.type === record.type);
  };

  const sortedRecords = [...records].sort((a, b) => a.name.localeCompare(b.name));

  if (loadingRecords && records.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t('PluginsPage.loading')}</p>
      </div>
    );
  }
  if (loadingCatalog && catalog.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t('PluginsPage.loadingCatalog')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('PluginsPage.title')}</h1>
          <p className="text-muted-foreground">{t('PluginsPage.subtitle')}</p>
        </div>
        <AddPluginDialog catalog={catalog} records={records} onAdd={handleAdd} />
      </div>

      {actionError && <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">{actionError}</div>}

      {sortedRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted py-16">
          <svg className="mb-4 h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p className="text-lg font-medium text-muted-foreground">{t('PluginsPage.noPluginsTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('PluginsPage.noPluginsHint')}</p>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {sortedRecords.map((record) => (
            <PluginCard
              key={record.id}
              record={record}
              instance={instances.find((i) => i.id === record.id) ?? null}
              catalogEntry={getCatalogEntry(record)}
              onToggle={() => handleToggle(record)}
              onRemove={() => handleRemove(record.id)}
              configureTrigger={
                <EditPluginDialog record={record} catalogEntry={getCatalogEntry(record)}>
                  <Button variant="outline" size="sm">
                    {t('PluginsPage.configureButton')}
                  </Button>
                </EditPluginDialog>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
