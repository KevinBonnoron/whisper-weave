import type { CatalogEntry, PluginRecord } from '@whisper-weave/shared';
import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PluginConfigForm } from '@/components/plugins/PluginConfigForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AddDialogState = { open: true; entry: CatalogEntry } | { open: false };

interface AddPluginDialogProps {
  catalog: CatalogEntry[];
  records: PluginRecord[];
  onAdd: (entry: CatalogEntry, name: string, config: Record<string, unknown>) => Promise<void>;
}

export function AddPluginDialog({ catalog, records, onAdd }: AddPluginDialogProps) {
  const { t } = useTranslation();
  const [addDialog, setAddDialog] = useState<AddDialogState>({ open: false });
  const [addFormName, setAddFormName] = useState('');
  const [addFormConfig, setAddFormConfig] = useState<Record<string, unknown>>({});

  const openAddDialog = (entry: CatalogEntry) => {
    const sameTypeCount = records.filter((r) => r.type === entry.type).length;
    const defaultName = sameTypeCount > 0 ? `${entry.name} (${sameTypeCount + 1})` : entry.name;
    setAddFormName(defaultName);
    setAddFormConfig(entry.type === 'files' ? { directory: 'output' } : entry.type === 'skills' ? { directory: 'skills' } : {});
    setAddDialog({ open: true, entry });
  };

  const handleAdd = async () => {
    if (!addDialog.open) {
      return;
    }
    await onAdd(addDialog.entry, addFormName, addFormConfig);
    setAddDialog({ open: false });
    setAddFormName('');
    setAddFormConfig({});
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <PlusIcon className="mr-2 size-4" />
            {t('PluginsPage.addPluginButton')}
            <ChevronDownIcon className="ml-2 size-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[240px]">
          {catalog.map((entry) => (
            <DropdownMenuItem key={entry.type} onClick={() => openAddDialog(entry)}>
              <div className="flex w-full items-center gap-2">
                <span className="flex-1">{entry.name}</span>
                <div className="flex gap-1">
                  {entry.features.includes('connector') && (
                    <Badge variant="outline" className="scale-75 bg-purple-500/10 text-purple-700">
                      C
                    </Badge>
                  )}
                  {entry.features.includes('llm-provider') && (
                    <Badge variant="outline" className="scale-75 bg-blue-500/10 text-blue-700">
                      L
                    </Badge>
                  )}
                  {entry.features.includes('tools') && (
                    <Badge variant="outline" className="scale-75 bg-orange-500/10 text-orange-700">
                      A
                    </Badge>
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addDialog.open} onOpenChange={(open) => !open && setAddDialog({ open: false })}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{addDialog.open ? t('PluginsPage.addDialogTitle', { name: addDialog.entry.name }) : ''}</DialogTitle>
            <DialogDescription>{addDialog.open ? addDialog.entry.description : ''}</DialogDescription>
          </DialogHeader>
          {addDialog.open && (
            <>
              <div className="space-y-2">
                <Label htmlFor="add-plugin-name">{t('PluginsPage.nameLabel')}</Label>
                <Input id="add-plugin-name" value={addFormName} onChange={(e) => setAddFormName(e.target.value)} onFocus={(e) => e.target.setSelectionRange(e.target.value.length, e.target.value.length)} placeholder={t('PluginsPage.namePlaceholder')} />
              </div>
              <PluginConfigForm configSchema={addDialog.entry.configSchema} config={addFormConfig} onConfigChange={(key, value) => setAddFormConfig((prev) => ({ ...prev, [key]: value }))} />
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog({ open: false })}>
              {t('PluginsPage.cancel')}
            </Button>
            <Button onClick={handleAdd}>{t('PluginsPage.add')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
