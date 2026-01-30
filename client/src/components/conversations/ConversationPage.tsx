import { useLiveQuery } from '@tanstack/react-db';
import { useNavigate, useSearch } from '@tanstack/react-router';
import type { ConversationMessage, ConversationMessageImage } from '@whisper-weave/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ChatMessage, chatClient } from '@/clients/chat.client';
import { assistantsCollection } from '@/collections/assistants.collection';
import { conversationsCollection } from '@/collections/conversations.collection';
import { ConversationChat } from '@/components/conversations/ConversationChat';
import { ConversationSidebar } from '@/components/conversations/ConversationSidebar';

export function ConversationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: '/conversations/' });
  const [selectedAssistantId, setSelectedAssistantId] = useState<string>('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const [pendingImages, setPendingImages] = useState<ConversationMessageImage[]>([]);

  const { data: conversations = [], isLoading } = useLiveQuery((q) => q.from({ conv: conversationsCollection }));
  const { data: assistants = [] } = useLiveQuery((q) => q.from({ asst: assistantsCollection }));
  const mostRecentId = conversations.length > 0 ? [...conversations].sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime())[0].id : null;
  const urlIdValid = search.conversationId && conversations.some((c) => c.id === search.conversationId);
  const selectedConversationId = urlIdValid ? search.conversationId! : mostRecentId;
  const selectedConversation = selectedConversationId ? (conversations.find((c) => c.id === selectedConversationId) ?? null) : null;

  // Auto-select default or first assistant
  useEffect(() => {
    if (assistants.length > 0 && !selectedAssistantId) {
      const defaultAssistant = assistants.find((a) => a.isDefault);
      setSelectedAssistantId(defaultAssistant?.id ?? assistants[0].id);
    }
  }, [assistants, selectedAssistantId]);

  useEffect(() => {
    if (isLoading || conversations.length === 0 || urlIdValid) return;
    if (mostRecentId) {
      navigate({ to: '/conversations', search: { conversationId: mostRecentId }, replace: true });
    }
  }, [isLoading, conversations.length, urlIdValid, mostRecentId, navigate]);

  const handleSelectConversation = (id: string) => {
    navigate({ to: '/conversations', search: { conversationId: id } });
  };

  const handleSend = async () => {
    const text = input.trim();
    const hasContent = text || pendingImages.length > 0;
    if (!hasContent || !selectedAssistantId || loading) return;

    const selectedAssistant = assistants.find((a) => a.id === selectedAssistantId);
    if (!selectedAssistant) {
      setError(t('ConversationPage.errorChooseAssistant'));
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    setError(null);
    setLoading(true);

    const userMessage: ChatMessage = {
      role: 'user',
      content: text || '',
      ...(pendingImages.length > 0 && { images: pendingImages }),
    };
    setInput('');
    setPendingImages([]);

    const userEntry: ConversationMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: userMessage.content,
      created: new Date().toISOString(),
      ...(pendingImages.length > 0 && { images: [...pendingImages] }),
    };

    let convId = selectedConversationId;
    const currentMessages: ConversationMessage[] = selectedConversation?.messages ?? [];

    try {
      if (!convId) {
        convId = crypto.randomUUID();
        conversationsCollection.insert({
          id: convId,
          title: text ? `${text.slice(0, 50)}${text.length > 50 ? '...' : ''}` : t('ConversationPage.messageWithImages'),
          messages: [userEntry],
        } as unknown as Parameters<typeof conversationsCollection.insert>[0]);
        navigate({ to: '/conversations', search: { conversationId: convId } });
      } else {
        conversationsCollection.update(convId, (draft) => {
          draft.messages = [...(draft.messages ?? []), userEntry];
        });
      }

      const historyMessages: ChatMessage[] = currentMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
          ...(m.role === 'user' && (m as { images?: ConversationMessageImage[] }).images?.length && { images: (m as { images?: ConversationMessageImage[] }).images }),
        }));
      const messagesToSend: ChatMessage[] = [...historyMessages, userMessage];

      const response = await chatClient.sendChat(selectedAssistantId, messagesToSend);

      // Add tool usage messages if present
      const toolMessages: ConversationMessage[] = (response.toolUsages ?? []).map((usage, idx) => ({
        id: `tool-${crypto.randomUUID()}-${idx}`,
        role: 'tool' as const,
        content: usage.error ?? (typeof usage.output === 'string' ? usage.output : JSON.stringify(usage.output)),
        created: new Date().toISOString(),
        toolUsage: usage,
      }));

      const assistantEntry: ConversationMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.content,
        created: new Date().toISOString(),
        modelName: selectedAssistant.name,
      };

      conversationsCollection.update(convId, (draft) => {
        draft.messages = [...(draft.messages ?? []), ...toolMessages, assistantEntry];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ConversationPage.errorSend'));
    } finally {
      setLoading(false);
      sendingRef.current = false;
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const addPendingImages = useCallback((images: ConversationMessageImage[]) => {
    setPendingImages((prev) => [...prev, ...images].slice(0, 4));
  }, []);
  const removePendingImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDeleteConversation = (id: string) => {
    try {
      conversationsCollection.delete(id);
      if (selectedConversationId === id) {
        navigate({ to: '/conversations', search: { conversationId: '' } });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ConversationPage.errorDelete'));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-hidden pb-4">
      <div className="shrink-0">
        <h1 className="text-3xl font-bold tracking-tight">{t('ConversationPage.title')}</h1>
        <p className="text-muted-foreground">{t('ConversationPage.subtitle')}</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden xl:flex-row">
        <ConversationSidebar conversations={conversations} loading={isLoading} selectedConversationId={selectedConversationId} onSelectConversation={handleSelectConversation} onDeleteConversation={handleDeleteConversation} />
        <ConversationChat
          conversation={selectedConversation}
          loading={loading}
          error={error}
          assistants={assistants}
          selectedAssistantId={selectedAssistantId}
          onAssistantChange={setSelectedAssistantId}
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onKeyDown={handleKeyDown}
          textareaRef={textareaRef}
          pendingImages={pendingImages}
          onAddImages={addPendingImages}
          onRemovePendingImage={removePendingImage}
        />
      </div>
    </div>
  );
}
