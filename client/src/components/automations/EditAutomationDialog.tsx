import type { AssistantRecord, AutomationRecord } from '@whisper-weave/shared';
import { useEffect, useState } from 'react';
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
  automation: AutomationRecord | null;
  onOpenChange: (open: boolean) => void;
  assistants: AssistantRecord[];
}

export function EditAutomationDialog({ automation, onOpenChange, assistants }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [cronPreset, setCronPreset] = useState('custom');
  const [customCron, setCustomCron] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (automation) {
      setName(automation.name);
      const matchingPreset = CRON_PRESETS.find((p) => p.value === automation.cron);
      if (matchingPreset && matchingPreset.value !== 'custom') {
        setCronPreset(matchingPreset.value);
        setCustomCron('');
      } else {
        setCronPreset('custom');
        setCustomCron(automation.cron);
      }
      setAssistantId(automation.assistant);
      setPrompt(automation.prompt);
    }
  }, [automation]);

  const cron = cronPreset === 'custom' ? customCron : cronPreset;
  const canSave = name.trim() && cron && assistantId && prompt.trim();

  const handleSave = async () => {
    if (!canSave || !automation) {
      return;
    }

    try {
      automationsCollection.update(automation.id, (draft) => {
        draft.name = name.trim();
        draft.cron = cron;
        draft.assistant = assistantId;
        draft.prompt = prompt.trim();
      });

      toast.success(t('AutomationsPage.saved'));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update automation');
    }
  };

  return (
    <Dialog open={!!automation} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('AutomationsPage.editTitle')}</DialogTitle>
          <DialogDescription>{t('AutomationsPage.editDescription')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-automation-name">{t('AutomationsPage.nameLabel')}</Label>
            <Input id="edit-automation-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('AutomationsPage.namePlaceholder')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-automation-schedule">{t('AutomationsPage.scheduleLabel')}</Label>
            <Select value={cronPreset} onValueChange={setCronPreset}>
              <SelectTrigger id="edit-automation-schedule">
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
            <Label htmlFor="edit-automation-assistant">{t('AutomationsPage.assistantLabel')}</Label>
            <Select value={assistantId} onValueChange={setAssistantId}>
              <SelectTrigger id="edit-automation-assistant">
                <SelectValue placeholder={t('AutomationsPage.assistantPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {assistants.map(({ id, name }) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('AutomationsPage.assistantHint')}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-automation-prompt">{t('AutomationsPage.promptLabel')}</Label>
            <Textarea id="edit-automation-prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t('AutomationsPage.promptPlaceholder')} rows={3} className="max-h-36 resize-y overflow-y-auto" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('AutomationsPage.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t('AutomationsPage.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
