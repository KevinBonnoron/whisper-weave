import type { ConversationRecord } from '@whisper-weave/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { conversationsCollection } from '@/collections/conversations.collection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConversationListItem } from './ConversationListItem';

type ConversationSidebarProps = {
  conversations: ConversationRecord[];
  loading: boolean;
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  connectorNames?: Record<string, string>;
};

export function ConversationSidebar({ conversations, loading, selectedConversationId, onSelectConversation, onDeleteConversation, connectorNames }: ConversationSidebarProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);

  const handleNewConversation = () => {
    setCreating(true);
    try {
      const id = crypto.randomUUID();
      conversationsCollection.insert({
        id,
        title: t('ConversationPage.defaultTitle'),
        messages: [],
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      });
      onSelectConversation(id);
    } catch (e) {
      toast(e instanceof Error ? e.message : t('ConversationPage.errorCreate'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="flex min-h-0 w-full shrink-0 flex-col xl:w-80">
      <CardHeader className="flex flex-row items-center justify-between border-b py-3">
        <CardTitle className="text-base">{t('ConversationSidebar.title')}</CardTitle>
        <Button size="sm" onClick={handleNewConversation} disabled={creating}>
          {t('ConversationSidebar.newButton')}
        </Button>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">
        {loading ? (
          <p className="text-muted-foreground p-4 text-sm">{t('ConversationSidebar.loading')}</p>
        ) : conversations.length === 0 ? (
          <p className="text-muted-foreground p-4 text-sm">{t('ConversationSidebar.emptyHint')}</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-1 xl:gap-2">
            {conversations.map((conversation) => (
              <ConversationListItem
                key={conversation.id}
                conversation={conversation}
                isSelected={selectedConversationId === conversation.id}
                onSelect={() => onSelectConversation(conversation.id)}
                onDelete={() => onDeleteConversation(conversation.id)}
                connectorName={conversation.connectorId ? connectorNames?.[conversation.connectorId] : undefined}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
