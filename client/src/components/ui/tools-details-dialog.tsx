import type { Tool } from '@whisper-weave/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface ToolsDetailsDialogProps {
  tools: Tool[];
  pluginName: string;
  trigger?: React.ReactNode;
}

export function ToolsDetailsDialog({ tools, pluginName, trigger }: ToolsDetailsDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (tools.length === 0) return null;

  const defaultTrigger = (
    <Badge variant="outline" className="text-xs cursor-pointer hover:bg-muted">
      {t('PluginCard.toolsCount', { count: tools.length })}
    </Badge>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-auto p-0 font-normal hover:bg-transparent">
          {trigger ?? defaultTrigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('PluginCard.toolsDialogTitle', { name: pluginName })}</DialogTitle>
          <DialogDescription>{t('PluginCard.toolsDialogDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {tools.map((tool) => (
            <div key={tool.name} className="rounded-lg border p-3">
              <div className="font-medium font-mono text-sm">{tool.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{tool.description}</div>
              {tool.parameters && tool.parameters.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">{t('PluginCard.parametersLabel')}</div>
                  {tool.parameters.map((param) => (
                    <div key={param.name} className="text-xs pl-3">
                      <span className="font-mono">{param.name}</span>
                      <span className="text-muted-foreground">
                        {' '}
                        ({param.type}){param.required && <span className="text-destructive"> *</span>}
                      </span>
                      {param.description && <div className="text-muted-foreground pl-4">{param.description}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
