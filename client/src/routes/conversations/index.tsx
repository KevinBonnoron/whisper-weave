import { createFileRoute } from '@tanstack/react-router';
import { ConversationsPage } from '@/components/conversations/ConversationPage';

export const Route = createFileRoute('/conversations/')({
  validateSearch: (search: Record<string, unknown>) => ({
    conversationId: (search.conversationId as string) || undefined,
  }),
  component: ConversationsPage,
});
