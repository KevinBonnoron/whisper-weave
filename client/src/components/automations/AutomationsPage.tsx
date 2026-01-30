import { useLiveQuery } from '@tanstack/react-db';
import type { AutomationRecord } from '@whisper-weave/shared';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { automationsClient } from '@/clients/automations.client';
import { assistantsCollection } from '@/collections/assistants.collection';
import { automationsCollection } from '@/collections/automations.collection';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { AddAutomationDialog } from './AddAutomationDialog';
import { EditAutomationDialog } from './EditAutomationDialog';

export function AutomationsPage() {
  const { t } = useTranslation();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editAutomation, setEditAutomation] = useState<AutomationRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: automations = [], isLoading } = useLiveQuery((q) => q.from({ a: automationsCollection }));
  const { data: assistants = [] } = useLiveQuery((q) => q.from({ a: assistantsCollection }));

  const handleToggle = (automation: AutomationRecord) => {
    setActionError(null);
    try {
      automationsCollection.update(automation.id, (draft) => {
        draft.enabled = !draft.enabled;
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Toggle failed');
    }
  };

  const handleDelete = async (id: string) => {
    setActionError(null);
    try {
      await automationsCollection.delete(id);
      toast.success(t('AutomationsPage.deleted'));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Delete failed');
      toast.error(t('AutomationsPage.deleteError'));
    }
  };

  const handleRunNow = async (id: string) => {
    try {
      await automationsClient.triggerRun(id);
      toast.success(t('AutomationsPage.triggered'));
    } catch {
      toast.error(t('AutomationsPage.triggerError'));
    }
  };

  const getAssistantName = (assistantId: string): string => {
    const assistant = assistants.find((a) => a.id === assistantId);
    return assistant?.name ?? 'Unknown';
  };

  if (isLoading && automations.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t('AutomationsPage.loading')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('AutomationsPage.title')}</h1>
          <p className="text-muted-foreground">{t('AutomationsPage.subtitle')}</p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <PlusIcon className="mr-2 size-4" />
          {t('AutomationsPage.addButton')}
        </Button>
      </div>

      {actionError && <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">{actionError}</div>}

      <AddAutomationDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} assistants={assistants} />
      <EditAutomationDialog automation={editAutomation} onOpenChange={(open) => !open && setEditAutomation(null)} assistants={assistants} />

      {automations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted py-16">
          <svg className="mb-4 h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg font-medium text-muted-foreground">{t('AutomationsPage.emptyTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('AutomationsPage.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {automations.map((automation) => {
            return <AutomationCard key={automation.id} automation={automation} assistantName={getAssistantName(automation.assistant)} onToggle={() => handleToggle(automation)} onEdit={() => setEditAutomation(automation)} onDelete={() => handleDelete(automation.id)} onRunNow={() => handleRunNow(automation.id)} />;
          })}
        </div>
      )}
    </div>
  );
}

interface AutomationCardProps {
  automation: AutomationRecord;
  assistantName: string;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRunNow: () => void;
}

function AutomationCard({ automation, assistantName, onToggle, onEdit, onDelete, onRunNow }: AutomationCardProps) {
  const { t } = useTranslation();
  const lastExecution = automation.executions?.[0];

  return (
    <Card className={!automation.enabled ? 'opacity-60' : ''}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base font-medium">{automation.name}</CardTitle>
        <Switch checked={automation.enabled} onCheckedChange={onToggle} />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {automation.cron}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {assistantName}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground line-clamp-2">{automation.prompt}</p>
        {lastExecution && (
          <p className="text-xs text-muted-foreground">
            {t('AutomationsPage.lastRun')}: {new Date(lastExecution.timestamp).toLocaleString()}
            <span className={lastExecution.success ? 'text-green-600' : 'text-destructive'}> ({lastExecution.success ? 'Success' : lastExecution.result})</span>
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onRunNow} disabled={!automation.enabled}>
            {t('AutomationsPage.runNow')}
          </Button>
          <Button variant="outline" size="sm" onClick={onEdit}>
            {t('AutomationsPage.editButton')}
          </Button>
          <Button variant="outline" size="sm" onClick={onDelete} className="text-destructive hover:bg-destructive/10">
            {t('AutomationsPage.deleteButton')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
