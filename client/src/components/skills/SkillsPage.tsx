import { useLiveQuery } from '@tanstack/react-db';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type SkillListItem, skillsClient } from '@/clients/skills.client';
import { pluginsCollection } from '@/collections/plugins.collection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { config } from '@/lib/config';

function sanitizeId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');
}

export function SkillsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formId, setFormId] = useState('');
  const [formContent, setFormContent] = useState('');
  const [activating, setActivating] = useState(false);

  const { data: plugins = [] } = useLiveQuery((q) => q.from({ p: pluginsCollection }));
  const skillsPlugin = plugins.find((p) => p.type === 'skills');
  const isPluginActive = skillsPlugin?.enabled === true;

  const handleActivatePlugin = async () => {
    setActivating(true);
    try {
      if (skillsPlugin) {
        // Plugin exists but is disabled - enable it
        pluginsCollection.update(skillsPlugin.id, (draft) => {
          draft.enabled = true;
        });
      } else {
        // Plugin doesn't exist - create it
        pluginsCollection.insert({
          id: crypto.randomUUID(),
          type: 'skills',
          name: 'Skills',
          enabled: true,
          config: { directory: 'skills' },
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        });
      }
    } finally {
      setActivating(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['skills', 'list'],
    queryFn: async () => {
      const res = await skillsClient.list();
      return res.skills;
    },
  });

  const { data: editSkill, isLoading: loadingEdit } = useQuery({
    queryKey: ['skills', 'detail', editId],
    queryFn: () => (editId ? skillsClient.get(editId) : null),
    enabled: !!editId,
  });

  const createMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await fetch(`${config.api.url}/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      setCreateOpen(false);
      setFormId('');
      setFormContent('');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const res = await fetch(`${config.api.url}/skills/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      setEditId(null);
      setFormContent('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${config.api.url}/skills/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? res.statusText);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['skills'] });
      if (editId) setEditId(null);
    },
  });

  const skills: SkillListItem[] = data ?? [];

  const openCreate = () => {
    setFormId('');
    setFormContent('');
    setCreateOpen(true);
  };

  const openEdit = (id: string) => {
    setEditId(id);
    setFormContent('');
  };

  const handleCreate = () => {
    const id = sanitizeId(formId) || formId.trim().toLowerCase().replace(/\s+/g, '-');
    if (!id) return;
    createMutation.mutate({ id, content: formContent });
  };

  const handleUpdate = () => {
    if (!editId) return;
    updateMutation.mutate({ id: editId, content: formContent });
  };

  const handleDelete = (id: string) => {
    if (window.confirm(t('SkillsPage.deleteConfirm', { id }))) {
      deleteMutation.mutate(id);
    }
  };

  useEffect(() => {
    if (editId && editSkill?.content != null) {
      setFormContent(editSkill.content);
    }
  }, [editId, editSkill?.content]);

  if (!isPluginActive) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('SkillsPage.title')}</h1>
          <p className="text-muted-foreground">{t('SkillsPage.subtitle')}</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpenIcon className="mb-4 size-12 text-muted-foreground" />
            <p className="text-lg font-medium">{t('SkillsPage.pluginDisabledTitle')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('SkillsPage.pluginDisabledHint')}</p>
            <Button className="mt-4" onClick={handleActivatePlugin} disabled={activating}>
              {activating ? t('SkillsPage.activating') : t('SkillsPage.activatePlugin')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('SkillsPage.title')}</h1>
          <p className="text-muted-foreground">{t('SkillsPage.subtitle')}</p>
        </div>
        <Button onClick={openCreate}>
          <PlusIcon className="mr-2 size-4" />
          {t('SkillsPage.newSkill')}
        </Button>
      </div>

      {(createMutation.isError || updateMutation.isError || deleteMutation.isError) && <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">{createMutation.error?.message ?? updateMutation.error?.message ?? deleteMutation.error?.message}</div>}

      {isLoading ? (
        <p className="text-muted-foreground">{t('SkillsPage.loading')}</p>
      ) : skills.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <BookOpenIcon className="mb-4 size-12 text-muted-foreground" />
            <p className="text-lg font-medium text-muted-foreground">{t('SkillsPage.emptyTitle')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('SkillsPage.emptyHint')}</p>
            <Button className="mt-4" onClick={openCreate}>
              <PlusIcon className="mr-2 size-4" />
              {t('SkillsPage.newSkill')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => (
            <Card key={skill.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                <div className="min-w-0 flex-1">
                  <CardTitle className="truncate text-base">{skill.title ?? skill.id}</CardTitle>
                  <CardDescription className="truncate font-mono text-xs">{skill.id}</CardDescription>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(skill.id)} aria-label={t('SkillsPage.editAria')}>
                    <PencilIcon className="size-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(skill.id)} aria-label={t('SkillsPage.deleteAria')}>
                    <Trash2Icon className="size-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col">
          <DialogHeader>
            <DialogTitle>{t('SkillsPage.createTitle')}</DialogTitle>
            <DialogDescription>{t('SkillsPage.createDescription')}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2">
            <div className="space-y-2">
              <Label htmlFor="create-skill-id">{t('SkillsPage.skillIdLabel')}</Label>
              <Input id="create-skill-id" placeholder="my-skill" value={formId} onChange={(e) => setFormId(e.target.value)} />
              <p className="text-muted-foreground text-xs">{t('SkillsPage.skillIdHint')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-skill-content">{t('SkillsPage.contentLabel')}</Label>
              <Textarea id="create-skill-content" placeholder="# My Skill\n\nMarkdown content..." rows={10} className="font-mono text-sm" value={formContent} onChange={(e) => setFormContent(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('SkillsPage.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!formId.trim() || createMutation.isPending}>
              {createMutation.isPending ? t('SkillsPage.creating') : t('SkillsPage.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t('SkillsPage.editTitle', { id: editId ?? '' })}</DialogTitle>
            <DialogDescription>{t('SkillsPage.editDescription')}</DialogDescription>
          </DialogHeader>
          {loadingEdit && editId ? (
            <p className="text-muted-foreground py-8">{t('SkillsPage.loading')}</p>
          ) : (
            <div className="flex-1 space-y-2 overflow-hidden flex flex-col min-h-0">
              <Label htmlFor="edit-skill-content">{t('SkillsPage.contentLabel')}</Label>
              <Textarea id="edit-skill-content" placeholder="# My Skill\n\nMarkdown content..." rows={14} className="font-mono text-sm flex-1 min-h-[200px] resize-y" value={formContent} onChange={(e) => setFormContent(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditId(null)}>
              {t('SkillsPage.cancel')}
            </Button>
            <Button onClick={handleUpdate} disabled={!editId || updateMutation.isPending || loadingEdit}>
              {updateMutation.isPending ? t('SkillsPage.saving') : t('SkillsPage.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
