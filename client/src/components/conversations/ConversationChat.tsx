import type { AssistantRecord, ConversationMessageImage, ConversationRecord } from '@whisper-weave/shared';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AssistantSelector } from '@/components/atoms/AssistantSelector';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { MarkdownContent } from './MarkdownContent';

const ACCEPT_IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_IMAGES_PER_MESSAGE = 4;

function readFileAsBase64(file: File): Promise<ConversationMessageImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = (reader.result as string).replace(/^data:[^;]+;base64,/, '');
      resolve({ data, mediaType: file.type || 'image/png' });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

type ConversationChatProps = {
  conversation: ConversationRecord | null;
  loading: boolean;
  error: string | null;
  assistants: AssistantRecord[];
  selectedAssistantId: string;
  onAssistantChange: (value: string) => void;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  pendingImages?: ConversationMessageImage[];
  onAddImages?: (images: ConversationMessageImage[]) => void;
  onRemovePendingImage?: (index: number) => void;
};

export function ConversationChat({ conversation, loading, error, assistants, selectedAssistantId, onAssistantChange, input, onInputChange, onSend, onKeyDown, textareaRef, pendingImages = [], onAddImages, onRemovePendingImage }: ConversationChatProps) {
  const { t } = useTranslation();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isConnectorConversation = Boolean(conversation?.connectorId);

  const messages = useMemo(() => [...(conversation?.messages ?? [])].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime()), [conversation?.messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const [isDragging, setIsDragging] = useState(false);

  const addImagesFromFiles = async (files: FileList | File[]) => {
    if (!onAddImages) return;
    const fileArray = Array.from(files);
    const toAdd = Math.min(MAX_IMAGES_PER_MESSAGE - pendingImages.length, fileArray.length);
    const images: ConversationMessageImage[] = [];
    for (let i = 0; i < toAdd; i++) {
      const file = fileArray[i];
      if (!file.type.startsWith('image/')) continue;
      try {
        images.push(await readFileAsBase64(file));
      } catch {}
    }
    if (images.length) onAddImages(images);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await addImagesFromFiles(files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onAddImages || pendingImages.length >= MAX_IMAGES_PER_MESSAGE) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (!files?.length || !onAddImages) return;
    await addImagesFromFiles(files);
  };

  const canSend = input.trim() || pendingImages.length > 0;

  return (
    <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <CardHeader className="flex shrink-0 flex-col gap-2 border-b py-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="flex items-center gap-2 text-lg font-semibold">
          {conversation ? conversation.title : t('ConversationChat.titleNew')}
          {isConnectorConversation && <span className="bg-muted text-muted-foreground rounded-md px-2 py-0.5 text-xs font-normal">{t('ConversationChat.readOnlyBadge')}</span>}
        </CardTitle>
        {!isConnectorConversation && <AssistantSelector assistants={assistants} value={selectedAssistantId} onChange={onAssistantChange} label={t('ConversationChat.assistantLabel')} placeholder={t('ConversationChat.assistantPlaceholder')} className="w-full sm:w-auto" />}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-4">
        {assistants.length === 0 && !isConnectorConversation ? (
          <p className="text-muted-foreground py-8 text-center text-sm">{t('ConversationChat.configureAssistantHint')}</p>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
              {messages.length === 0 && !loading && <p className="text-muted-foreground text-center text-sm">{t('ConversationChat.emptyMessagesHint')}</p>}
              {messages.map(({ id, role, content, modelName, images: msgImages, toolUsage }) => {
                if (role === 'tool' && toolUsage) {
                  return (
                    <div key={id} className="flex flex-col gap-0.5 items-start">
                      <div className="flex w-full justify-start">
                        <div className="max-w-[85%] rounded-lg border border-dashed border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-amber-600 dark:text-amber-400 font-mono text-xs font-semibold">{toolUsage.toolName}</span>
                            {toolUsage.durationMs !== undefined && <span className="text-muted-foreground text-xs">({toolUsage.durationMs}ms)</span>}
                            {toolUsage.error && <span className="text-destructive text-xs font-medium">Error</span>}
                          </div>
                          <details className="text-xs">
                            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">{t('ConversationChat.toolDetails')}</summary>
                            <div className="mt-2 space-y-2">
                              <div>
                                <span className="text-muted-foreground font-medium">Input:</span>
                                <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-xs">{JSON.stringify(toolUsage.input, null, 2)}</pre>
                              </div>
                              <div>
                                <span className="text-muted-foreground font-medium">Output:</span>
                                <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-xs max-h-40 overflow-y-auto">{typeof toolUsage.output === 'string' ? toolUsage.output : JSON.stringify(toolUsage.output, null, 2)}</pre>
                              </div>
                            </div>
                          </details>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={id} className={cn('flex flex-col gap-0.5', role === 'user' ? 'items-end' : 'items-start')}>
                    {role === 'assistant' && modelName && <span className="text-muted-foreground text-xs font-medium">{modelName}</span>}
                    <div className={cn('flex w-full', role === 'user' ? 'justify-end' : 'justify-start')}>
                      <div className={cn('rounded-lg px-3 py-2 text-sm', role === 'user' ? 'bg-primary text-primary-foreground min-w-[min(12rem,80%)] max-w-[85%] text-left' : 'max-w-[85%] bg-muted text-foreground')}>
                        <div className="flex flex-col gap-2">
                          {msgImages?.length ? (
                            <div className="flex flex-wrap gap-1">
                              {msgImages.map((img, i) => (
                                <img key={i} src={`data:${img.mediaType};base64,${img.data}`} alt="" className="max-h-40 rounded object-cover" />
                              ))}
                            </div>
                          ) : null}
                          {content ? role === 'assistant' ? <MarkdownContent content={content} className="break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0" /> : <span className="whitespace-pre-wrap break-words">{content}</span> : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">...</div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {error && (
              <p className="text-destructive shrink-0 text-sm" role="alert">
                {error}
              </p>
            )}

            {isConnectorConversation ? (
              <p className="text-muted-foreground shrink-0 rounded-md border border-dashed p-4 text-center text-sm">{t('ConversationChat.connectorReadOnlyNotice')}</p>
            ) : (
              <div className={cn('flex shrink-0 flex-col gap-2 rounded-md border-2 border-dashed transition-colors', isDragging ? 'border-primary bg-muted/50' : 'border-transparent')} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                {pendingImages.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {pendingImages.map((img, i) => (
                      <div key={i} className="relative">
                        <img src={`data:${img.mediaType};base64,${img.data}`} alt="" className="h-16 w-16 rounded border object-cover" />
                        {onRemovePendingImage ? (
                          <Button type="button" variant="secondary" size="icon-xs" className="absolute -right-1 -top-1 h-5 w-5 rounded-full" onClick={() => onRemovePendingImage(i)} aria-label={t('ConversationChat.removeImage')}>
                            ×
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" accept={ACCEPT_IMAGE_TYPES} multiple className="hidden" onChange={handleFileChange} />
                  {!isConnectorConversation && onAddImages && pendingImages.length < MAX_IMAGES_PER_MESSAGE ? (
                    <Button type="button" variant="outline" size="icon" onClick={() => fileInputRef.current?.click()} disabled={loading} title={t('ConversationChat.addImage')} aria-label={t('ConversationChat.addImage')}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                        <circle cx="9" cy="9" r="2" />
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                      </svg>
                    </Button>
                  ) : null}
                  <Textarea ref={textareaRef} value={input} onChange={(e) => onInputChange(e.target.value)} onKeyDown={onKeyDown} placeholder={t('ConversationChat.messagePlaceholder')} rows={2} className="min-h-[2.5rem] flex-1 resize-none" disabled={loading} />
                  <Button onClick={onSend} disabled={loading || !canSend} className="shrink-0">
                    {t('ConversationChat.sendButton')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
