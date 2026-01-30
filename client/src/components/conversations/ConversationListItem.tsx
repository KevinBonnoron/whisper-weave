import type { ConversationRecord } from '@whisper-weave/shared';
import { MessageSquare, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useDateTimeFormat } from '@/hooks/useDateTimeFormat';
import { cn } from '@/lib/utils';

function lastMessagePreview(messages: ConversationRecord['messages'], maxLen = 32): string {
  if (!messages?.length) return '';
  const last = messages[messages.length - 1];
  const text = last.content?.trim() || '';
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '...';
}

type ConversationListItemProps = {
  conversation: ConversationRecord;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  /** Display name for the connector (e.g. "Discord", "Google") when conversation is from a connector. */
  connectorName?: string;
};

export function ConversationListItem({ conversation, isSelected, onSelect, onDelete, connectorName }: ConversationListItemProps) {
  const { t } = useTranslation();
  const preview = lastMessagePreview(conversation.messages);
  const { relativeDateTimeFormat } = useDateTimeFormat();

  return (
    <li className="group/list-item h-full">
      <div className={cn('relative flex h-full rounded-lg border transition-colors xl:flex-row xl:items-stretch xl:gap-2', 'flex-col gap-2 p-3 min-h-0', isSelected ? 'border-primary/30 bg-accent shadow-sm' : 'border-transparent hover:border-border hover:bg-muted/50')}>
        <Button type="button" variant="ghost" className="flex min-w-0 flex-1 flex-col justify-start gap-0 text-left xl:flex-row xl:items-start xl:gap-3 xl:py-2 xl:pl-2 xl:pr-2 xl:h-auto" onClick={onSelect}>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md xl:mt-0.5', isSelected ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground')}>
            <MessageSquare className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap xl:gap-2">
              <span className="truncate text-sm font-medium text-foreground">{conversation.title}</span>
              {conversation.connectorId && <span className="bg-primary/10 text-primary shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium">{connectorName ?? 'Connector'}</span>}
            </div>
            {preview && <p className="text-muted-foreground mt-1 truncate text-xs">{preview}</p>}
            <p className="text-muted-foreground mt-auto pt-1 text-xs">{relativeDateTimeFormat(new Date(conversation.updated))}</p>
          </div>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn('absolute right-2 top-2 h-8 w-8 shrink-0 text-muted-foreground transition-opacity hover:text-destructive xl:static xl:self-center', isSelected ? 'opacity-100' : 'opacity-0 group-hover/list-item:opacity-100')}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={t('ConversationListItem.deleteAriaLabel')}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}
