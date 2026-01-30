import { useLiveQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import type { CatalogEntry, GetPluginsResponse, PluginRecord } from '@whisper-weave/shared';
import { AlertCircle, ArrowRight, Bot, MessageSquare, Plug } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { pluginsClient } from '@/clients/plugins.client';
import { assistantsCollection } from '@/collections/assistants.collection';
import { conversationsCollection } from '@/collections/conversations.collection';
import { pluginsCollection } from '@/collections/plugins.collection';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDateTimeFormat } from '@/hooks/useDateTimeFormat';

const RECENT_CONVERSATIONS_COUNT = 8;

function pluginStats(records: PluginRecord[], catalog: CatalogEntry[]) {
  const byFeature = (feature: 'connector' | 'llm-provider' | 'tools') => {
    const total = records.filter((r) => catalog.some((c) => (c.type === r.type || c.id === r.type) && c.features.includes(feature))).length;
    const enabled = records.filter((r) => {
      const entry = catalog.find((c) => c.type === r.type || c.id === r.type);
      return entry?.features.includes(feature) && r.enabled;
    }).length;
    return { total, enabled };
  };
  return {
    connectors: byFeature('connector'),
    llmProviders: byFeature('llm-provider'),
    actions: byFeature('tools'),
  };
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { relativeDateTimeFormat } = useDateTimeFormat();
  const [pluginsData, setPluginsData] = useState<GetPluginsResponse | null>(null);
  const [pluginsLoading, setPluginsLoading] = useState(true);
  const [pluginsError, setPluginsError] = useState<string | null>(null);

  const { data: conversations = [], isLoading: conversationsLoading } = useLiveQuery((q) => q.from({ conv: conversationsCollection }));
  const { data: assistants = [], isLoading: assistantsLoading } = useLiveQuery((q) => q.from({ a: assistantsCollection }));
  const { data: pluginRecords = [] } = useLiveQuery((q) => q.from({ p: pluginsCollection }));

  useEffect(() => {
    pluginsClient
      .getPlugins()
      .then(setPluginsData)
      .catch((e) => setPluginsError(e instanceof Error ? e.message : t('Dashboard.errorLoad')))
      .finally(() => setPluginsLoading(false));
  }, [t]);

  const loading = pluginsLoading;
  const error = pluginsError || (!pluginsData && !pluginsLoading ? t('Dashboard.errorLoadPlugins') : null);

  if (loading && !pluginsData) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">{t('Dashboard.loading')}</p>
      </div>
    );
  }
  if (error && !pluginsData) {
    return <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive">{error}</div>;
  }

  const catalog = pluginsData?.catalog ?? [];
  const stats = pluginStats(pluginRecords, catalog);
  const enabledConnectors = stats.connectors.enabled;
  const enabledLLM = stats.llmProviders.enabled;
  const enabledActions = stats.actions.enabled;

  const recentConversations = [...conversations].sort((a, b) => new Date(b.updated).getTime() - new Date(a.updated).getTime()).slice(0, RECENT_CONVERSATIONS_COUNT);

  const hasConnector = enabledConnectors > 0;
  const hasLLM = enabledLLM > 0;
  const hasAssistant = assistants.length > 0;
  const warnings: { key: string; link: string }[] = [];
  if (!assistantsLoading) {
    if (!hasLLM) warnings.push({ key: 'Dashboard.warnNoLLM', link: '/plugins' });
    if (!hasConnector) warnings.push({ key: 'Dashboard.warnNoConnector', link: '/plugins' });
    if (hasConnector && !hasAssistant) warnings.push({ key: 'Dashboard.warnNoAssistant', link: '/assistants' });
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('Dashboard.title')}</h1>
        <p className="text-muted-foreground">{t('Dashboard.subtitle')}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="flex h-full flex-col transition-colors hover:border-primary/40 hover:bg-muted/30">
          <Link to="/conversations" search={{ conversationId: undefined }} className="flex min-h-[140px] flex-1 flex-col">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <MessageSquare className="size-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base">{t('Dashboard.quickNewConversation')}</CardTitle>
                <CardDescription>{t('Dashboard.quickNewConversationHint')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="mt-auto pt-2">
              <Button variant="secondary" size="sm" className="w-full gap-2" asChild>
                <span>
                  {t('Dashboard.goToConversations')}
                  <ArrowRight className="size-4" />
                </span>
              </Button>
            </CardContent>
          </Link>
        </Card>
        <Card className="flex h-full flex-col transition-colors hover:border-primary/40 hover:bg-muted/30">
          <Link to="/plugins" className="flex min-h-[140px] flex-1 flex-col">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Plug className="size-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base">{t('Dashboard.quickPlugins')}</CardTitle>
                <CardDescription>{t('Dashboard.quickPluginsHint')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="mt-auto pt-2">
              <Button variant="secondary" size="sm" className="w-full gap-2" asChild>
                <span>
                  {t('Dashboard.configurePluginsButton')}
                  <ArrowRight className="size-4" />
                </span>
              </Button>
            </CardContent>
          </Link>
        </Card>
        <Card className="flex h-full flex-col transition-colors hover:border-primary/40 hover:bg-muted/30">
          <Link to="/assistants" className="flex min-h-[140px] flex-1 flex-col">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0 pb-2">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bot className="size-5" />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-base">{t('Dashboard.quickAssistants')}</CardTitle>
                <CardDescription>{t('Dashboard.quickAssistantsHint')}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="mt-auto pt-2">
              <Button variant="secondary" size="sm" className="w-full gap-2" asChild>
                <span>
                  {t('AppHeader.navAssistants')}
                  <ArrowRight className="size-4" />
                </span>
              </Button>
            </CardContent>
          </Link>
        </Card>
      </div>

      {warnings.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-400">
              <AlertCircle className="size-4" />
              {t('Dashboard.statusTitle')}
            </CardTitle>
            <CardDescription>{t('Dashboard.statusDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {warnings.map((w) => (
              <div key={w.key} className="flex items-center justify-between gap-4 rounded-md bg-background/60 py-2 pl-3 pr-2">
                <p className="text-sm text-muted-foreground">{t(w.key)}</p>
                <Button variant="outline" size="sm" asChild>
                  <Link to={w.link}>{t('Dashboard.fixLink')}</Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>{t('Dashboard.recentConversations')}</CardTitle>
            <CardDescription>{t('Dashboard.recentConversationsDescription')}</CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/conversations" search={{ conversationId: undefined }}>
              {t('Dashboard.viewAllConversations')}
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {conversationsLoading ? (
            <p className="text-sm text-muted-foreground">{t('Dashboard.loading')}</p>
          ) : recentConversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('Dashboard.noConversationsYet')}</p>
          ) : (
            <ul className="space-y-1">
              {recentConversations.map(({ id, title, updated }) => (
                <li key={id}>
                  <Link to="/conversations" search={{ conversationId: id }} className="flex items-center justify-between gap-2 rounded-lg border border-transparent px-3 py-2 text-left transition-colors hover:border-border hover:bg-muted/50">
                    <span className="min-w-0 truncate font-medium">{title || t('ConversationPage.defaultTitle')}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeDateTimeFormat(new Date(updated))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>{t('Dashboard.pluginsSummary')}</CardTitle>
            <CardDescription>{t('Dashboard.pluginsSummaryDescription')}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/plugins">{t('Dashboard.viewPlugins')}</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t('Dashboard.connectors')}</p>
              <p className="text-2xl font-bold">
                {enabledConnectors}
                <span className="text-sm font-normal text-muted-foreground"> / {stats.connectors.total}</span>
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t('Dashboard.llmProviders')}</p>
              <p className="text-2xl font-bold">
                {enabledLLM}
                <span className="text-sm font-normal text-muted-foreground"> / {stats.llmProviders.total}</span>
              </p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t('Dashboard.tools')}</p>
              <p className="text-2xl font-bold">
                {enabledActions}
                <span className="text-sm font-normal text-muted-foreground"> / {stats.actions.total}</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
