import type { AssistantRecord } from '@whisper-weave/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { automationsCollection } from '@/collections/automations.collection';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9am (UTC)', value: '0 9 * * *' },
  { label: 'Every day at 6pm (UTC)', value: '0 18 * * *' },
  { label: 'Every Monday at 9am (UTC)', value: '0 9 * * 1' },
  { label: 'Every 1st of month at 9am (UTC)', value: '0 9 1 * *' },
  { label: 'Custom', value: 'custom' },
] as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistants: AssistantRecord[];
}

export function AddAutomationDialog({ open, onOpenChange, assistants }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [cronPreset, setCronPreset] = useState('0 9 * * *');
  const [customCron, setCustomCron] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [prompt, setPrompt] = useState('');

  const cron = cronPreset === 'custom' ? customCron : cronPreset;
  const canSave = name.trim() && cron && assistantId && prompt.trim();

  const resetForm = () => {
    setName('');
    setCronPreset('0 9 * * *');
    setCustomCron('');
    setAssistantId('');
    setPrompt('');
  };

  const handleSave = async () => {
    if (!canSave) {
      return;
    }

    try {
      automationsCollection.insert({
        id: crypto.randomUUID(),
        name: name.trim(),
        enabled: true,
        cron,
        assistant: assistantId,
        prompt: prompt.trim(),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });

      toast.success(t('AutomationsPage.created'));
      resetForm();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create automation');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  const getAssistantLabel = (assistant: AssistantRecord): string => {
    return assistant.name;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('AutomationsPage.addTitle')}</DialogTitle>
          <DialogDescription>{t('AutomationsPage.addDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="automation-name">{t('AutomationsPage.nameLabel')}</Label>
            <Input id="automation-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('AutomationsPage.namePlaceholder')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation-schedule">{t('AutomationsPage.scheduleLabel')}</Label>
            <Select value={cronPreset} onValueChange={setCronPreset}>
              <SelectTrigger id="automation-schedule">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRON_PRESETS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cronPreset === 'custom' && <Input value={customCron} onChange={(e) => setCustomCron(e.target.value)} placeholder="0 9 * * *" className="mt-2 font-mono" />}
            <p className="text-xs text-muted-foreground">{t('AutomationsPage.cronHelp')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation-assistant">{t('AutomationsPage.assistantLabel')}</Label>
            <Select value={assistantId} onValueChange={setAssistantId}>
              <SelectTrigger id="automation-assistant">
                <SelectValue placeholder={t('AutomationsPage.assistantPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {assistants.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {getAssistantLabel(a)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('AutomationsPage.assistantHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="automation-prompt">{t('AutomationsPage.promptLabel')}</Label>
            <Textarea id="automation-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('AutomationsPage.promptPlaceholder')} rows={3} className="max-h-36 resize-y overflow-y-auto" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('AutomationsPage.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t('AutomationsPage.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
