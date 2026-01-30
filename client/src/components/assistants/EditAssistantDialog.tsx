import type { AssistantRecord, PluginInstance } from '@whisper-weave/shared';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { assistantsCollection } from '@/collections/assistants.collection';
import { LlmModelSelector } from '@/components/atoms/LlmModelSelector';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ToolsDetailsDialog } from '@/components/ui/tools-details-dialog';

interface Props extends PropsWithChildren {
  assistant: AssistantRecord | null;
  llmProviders: PluginInstance[];
  actions: PluginInstance[];
  onSaved?: () => void;
}

export function EditAssistantDialog({ assistant, llmProviders, actions, onSaved, children }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string>('');
  const [selectedModelKey, setSelectedModelKey] = useState<string>('');
  const [toolIds, setToolIds] = useState<Set<string>>(new Set());
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isEditing = Boolean(assistant);

  useEffect(() => {
    if (open) {
      setName(assistant?.name ?? '');
      const key = assistant?.llmProvider && assistant?.llmModel ? `${assistant.llmProvider}:${assistant.llmModel}` : '';
      setSelectedModelKey(key);
      setToolIds(new Set(assistant?.tools ?? []));
      setSystemPrompt(assistant?.systemPrompt ?? '');
      setMemoryEnabled(assistant?.memoryEnabled ?? false);
      setError(null);
    }
  }, [open, assistant]);

  const toggleTool = (id: string) => {
    setToolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    setError(null);

    if (!name.trim()) {
      setError(t('EditAssistantDialog.errorNoName'));
      return;
    }

    // Split only on the first colon so model ids that contain ':' (e.g. "...GGUF:Q4_K_M") are preserved
    const colonIndex = selectedModelKey?.indexOf(':') ?? -1;
    const providerId = colonIndex >= 0 ? selectedModelKey!.slice(0, colonIndex) : null;
    const modelId = colonIndex >= 0 ? selectedModelKey!.slice(colonIndex + 1) : null;

    if (!providerId || !modelId) {
      setError(t('EditAssistantDialog.errorNoModel'));
      return;
    }

    setSaving(true);
    try {
      if (assistant) {
        // Update existing assistant
        const tx = assistantsCollection.update(assistant.id, (draft) => {
          draft.name = name.trim();
          draft.llmProvider = providerId;
          draft.llmModel = modelId;
          draft.tools = [...toolIds];
          draft.systemPrompt = systemPrompt.trim();
          draft.memoryEnabled = memoryEnabled;
        });
        await tx.isPersisted.promise;
      } else {
        // Create new assistant
        const tx = assistantsCollection.insert({
          id: crypto.randomUUID().replace(/-/g, '').slice(0, 15),
          name: name.trim(),
          llmProvider: providerId,
          llmModel: modelId,
          tools: [...toolIds],
          systemPrompt: systemPrompt.trim(),
          memoryEnabled,
        } as Parameters<typeof assistantsCollection.insert>[0]);
        await tx.isPersisted.promise;
      }
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('EditAssistantDialog.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const fallbackKey = assistant?.llmProvider && assistant?.llmModel ? `${assistant.llmProvider}:${assistant.llmModel}` : '';
  const fallbackLabel = assistant?.llmModel ? t('EditAssistantDialog.fallbackLabel', { modelId: assistant.llmModel }) : undefined;

  return (
    <Dialog open={open} onOpenChange={setOpen} modal={false}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-lg min-w-0 overflow-hidden">
        <div className="flex max-h-full flex-col gap-4 overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>{isEditing ? t('EditAssistantDialog.titleEdit') : t('EditAssistantDialog.titleCreate')}</DialogTitle>
            <DialogDescription>{t('EditAssistantDialog.description')}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-destructive shrink-0 text-sm">{error}</p>}

          <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden py-2">
            <div className="min-w-0 space-y-2">
              <Label htmlFor="assistant-name">{t('EditAssistantDialog.nameLabel')}</Label>
              <Input id="assistant-name" placeholder={t('EditAssistantDialog.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} className="min-w-0" />
            </div>

            <div className="min-w-0 space-y-2">
              <LlmModelSelector providers={llmProviders} value={selectedModelKey} onChange={setSelectedModelKey} label={t('EditAssistantDialog.modelLabel')} placeholder={t('EditAssistantDialog.modelPlaceholder')} showNoneOption={false} fallbackKey={fallbackKey || undefined} fallbackLabel={fallbackLabel} />
            </div>

            <div className="min-w-0 space-y-2">
              <Label htmlFor="assistant-system-prompt">{t('EditAssistantDialog.systemPromptLabel')}</Label>
              <Textarea id="assistant-system-prompt" placeholder={t('EditAssistantDialog.systemPromptPlaceholder')} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={4} className="max-h-36 min-w-0 resize-y overflow-x-hidden overflow-y-auto font-mono text-sm break-words" />
            </div>

            <div className="flex items-center gap-2 space-y-0">
              <input type="checkbox" id="assistant-memory-enabled" checked={memoryEnabled} onChange={(e) => setMemoryEnabled(e.target.checked)} className="h-4 w-4 shrink-0 rounded border-input" />
              <Label htmlFor="assistant-memory-enabled" className="cursor-pointer font-normal">
                {t('EditAssistantDialog.memoryEnabledLabel')}
              </Label>
            </div>
            <p className="text-muted-foreground text-sm">{t('EditAssistantDialog.memoryEnabledDescription')}</p>

            <div className="space-y-2">
              <Label>{t('EditAssistantDialog.toolsLabel')}</Label>
              {actions.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('EditAssistantDialog.noTools')}</p>
              ) : (
                <ul className="space-y-2">
                  {actions.map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <input type="checkbox" id={`assistant-tool-${a.id}`} checked={toolIds.has(a.id)} onChange={() => toggleTool(a.id)} className="h-4 w-4 shrink-0 rounded border-input" />
                      <label htmlFor={`assistant-tool-${a.id}`} className="cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {a.name}
                      </label>
                      {a.tools && a.tools.length > 0 && <ToolsDetailsDialog tools={a.tools} pluginName={a.name} />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('EditAssistantDialog.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? t('EditAssistantDialog.saving') : t('EditAssistantDialog.save')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
