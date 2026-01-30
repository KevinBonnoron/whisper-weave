import type { CatalogEntry, PluginRecord } from '@whisper-weave/shared';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pluginsCollection } from '@/collections/plugins.collection';
import { PluginConfigForm } from '@/components/plugins/PluginConfigForm';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props extends PropsWithChildren {
  record: PluginRecord;
  catalogEntry?: CatalogEntry;
  onSaved?: () => void;
}

export function EditPluginDialog({ record, catalogEntry, onSaved, children }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(record.name);
  const [config, setConfig] = useState<Record<string, unknown>>({ ...record.config });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(record.name);
      setConfig({ ...record.config });
      setError(null);
    }
  }, [open, record.name, record.config]);

  const handleSave = () => {
    setError(null);
    try {
      const configToSave = { ...config };
      if (Array.isArray(configToSave.allowedChannels)) {
        configToSave.allowedChannels = configToSave.allowedChannels.filter((id): id is string => Boolean(id));
      }
      pluginsCollection.update(record.id, (draft) => {
        draft.name = name.trim();
        draft.config = configToSave;
      });
      setOpen(false);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('EditPluginDialog.errorEdit'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          requestAnimationFrame(() => {
            const content = e.currentTarget;
            if (content instanceof HTMLElement) {
              const firstInput = content.querySelector<HTMLInputElement | HTMLTextAreaElement>('input:not([type="hidden"]), textarea');
              if (firstInput) {
                firstInput.focus();
                const len = firstInput.value.length;
                firstInput.setSelectionRange(len, len);
              }
            }
          });
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('EditPluginDialog.title')}</DialogTitle>
          <DialogDescription>{t('EditPluginDialog.description')}</DialogDescription>
        </DialogHeader>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <div className="space-y-2 py-2">
          <Label htmlFor="edit-plugin-name">{t('EditPluginDialog.nameLabel')}</Label>
          <Input id="edit-plugin-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('EditPluginDialog.namePlaceholder')} />
        </div>
        <PluginConfigForm configSchema={catalogEntry?.configSchema} config={config} onConfigChange={(key, value) => setConfig((prev) => ({ ...prev, [key]: value }))} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('EditPluginDialog.cancel')}
          </Button>
          <Button onClick={handleSave}>{t('EditPluginDialog.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
