import type { PluginConfigField } from '@whisper-weave/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/clients/auth.client';
import { StringListInput } from '@/components/atoms/StringListInput';
import { config as appConfig } from '@/lib/config';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Textarea } from '../ui/textarea';

interface Props {
  schema: PluginConfigField[];
  config: Record<string, unknown>;
  onConfigChange: (key: string, value: unknown) => void;
}

export function DynamicConfigForm({ schema, config, onConfigChange }: Props) {
  // Sync defaults into config on mount
  useEffect(() => {
    for (const field of schema) {
      if (field.default !== undefined && config[field.name] === undefined) {
        onConfigChange(field.name, field.default);
      }
    }
  }, [schema, config, onConfigChange]);

  const isFieldVisible = (field: PluginConfigField): boolean => {
    if (!field.showIf) {
      return true;
    }
    return config[field.showIf.field] === field.showIf.equals;
  };

  return (
    <div className="space-y-4 py-4">
      {schema.filter(isFieldVisible).map((field) => (
        <ConfigField key={field.name} field={field} config={config} value={config[field.name]} onChange={(value) => onConfigChange(field.name, value)} onConfigChange={onConfigChange} />
      ))}
    </div>
  );
}

interface ConfigFieldProps {
  field: PluginConfigField;
  config: Record<string, unknown>;
  value: unknown;
  onChange: (value: unknown) => void;
  onConfigChange: (key: string, value: unknown) => void;
}

function ConfigField({ field, config, value, onChange, onConfigChange }: ConfigFieldProps) {
  const fieldId = `field-${field.name}`;

  switch (field.type) {
    case 'secret':
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{field.label}</Label>
          <Input id={fieldId} type="password" placeholder={field.placeholder ?? field.label} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
          {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
        </div>
      );

    case 'number':
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{field.label}</Label>
          <Input
            id={fieldId}
            type="number"
            placeholder={field.placeholder ?? (field.default != null ? String(field.default) : undefined)}
            value={value != null ? String(value) : ''}
            onChange={(e) => {
              const val = e.target.value;
              onChange(val === '' ? undefined : Number(val));
            }}
          />
          {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
        </div>
      );

    case 'boolean':
      return (
        <div className="flex items-center justify-between gap-4 py-2">
          <div className="space-y-0.5">
            <Label htmlFor={fieldId}>{field.label}</Label>
            {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
          </div>
          <Switch id={fieldId} checked={Boolean(value ?? field.default ?? false)} onCheckedChange={(checked) => onChange(checked)} />
        </div>
      );

    case 'string-list':
      return <StringListInput id={fieldId} label={field.label} placeholder={field.placeholder} hint={field.description} value={Array.isArray(value) ? value : []} onChange={(list) => onChange(list)} />;

    case 'select':
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{field.label}</Label>
          <Select value={String(value ?? field.default ?? '')} onValueChange={onChange}>
            <SelectTrigger id={fieldId} className="w-full">
              <SelectValue placeholder={field.placeholder ?? field.label} />
            </SelectTrigger>
            <SelectContent>
              {field.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
        </div>
      );

    case 'oauth':
      return <OAuthField field={field} config={config} onConfigChange={onConfigChange} />;

    case 'record':
      return <RecordField field={field} value={value} onChange={onChange} />;

    default:
      return (
        <div className="space-y-2">
          <Label htmlFor={fieldId}>{field.label}</Label>
          <Input id={fieldId} type="text" placeholder={field.placeholder ?? (field.default != null ? String(field.default) : undefined)} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
          {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
        </div>
      );
  }
}

interface RecordFieldProps {
  field: PluginConfigField;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Unwrap a value that may have been double-JSON-encoded (e.g. `"{\"key\":\"val\"}"` → `{"key":"val"}`). */
function unescapeRecordValue(val: unknown): string {
  if (typeof val !== 'string') return '';
  try {
    const parsed = JSON.parse(val);
    if (typeof parsed === 'string') {
      return parsed;
    }
  } catch {
    // not double-encoded, keep as-is
  }
  return val;
}

function RecordField({ field, value, onChange }: RecordFieldProps) {
  const raw = typeof value === 'object' && value !== null ? value : {};
  const record = Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k, unescapeRecordValue(v)]));
  const keys = field.keys ?? [];
  const defaultTab = keys[0]?.value ?? '';

  return (
    <div className="space-y-2">
      <Label>{field.label}</Label>
      {field.description && <p className="text-muted-foreground text-xs">{field.description}</p>}
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {keys.map((k) => (
            <TabsTrigger key={k.value} value={k.value}>
              {k.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {keys.map((k) => (
          <TabsContent key={k.value} value={k.value}>
            <Textarea placeholder={field.placeholder ?? k.label} value={record[k.value] ?? ''} onChange={(e) => onChange({ ...record, [k.value]: e.target.value })} rows={10} className="!field-sizing-fixed max-h-64 font-mono text-xs" />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

interface OAuthFieldProps {
  field: PluginConfigField;
  config: Record<string, unknown>;
  onConfigChange: (key: string, value: unknown) => void;
}

function OAuthField({ field, config, onConfigChange }: OAuthFieldProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupTimeoutRef = useRef<number | null>(null);
  const messageHandlerRef = useRef<((e: MessageEvent) => void) | null>(null);

  const oauth = field.oauth;
  const clientId = oauth ? String(config[oauth.clientIdField] ?? '').trim() : '';
  const clientSecret = oauth ? String(config[oauth.clientSecretField] ?? '').trim() : '';
  const isConnected = Boolean(config[field.name]);
  const redirectUri = oauth ? `${appConfig.api.url}/auth/${oauth.provider}/callback` : '';
  const providerName = oauth ? oauth.provider.charAt(0).toUpperCase() + oauth.provider.slice(1) : '';

  const handleConnect = useCallback(() => {
    if (!oauth) {
      return;
    }
    if (!clientId || !clientSecret) {
      setError(t('PluginForm.fillClientIdSecret'));
      return;
    }
    setError(null);
    setLoading(true);

    authClient
      .getGoogleAuthUrl(clientId, clientSecret)
      .then(({ authUrl }) => {
        const width = 520;
        const height = 600;
        const left = Math.round((window.screen.width - width) / 2);
        const top = Math.round((window.screen.height - height) / 2);
        const popup = window.open(authUrl, `${oauth.provider}-oauth`, `width=${width},height=${height},left=${left},top=${top}`);

        if (!popup) {
          setError(t('PluginForm.allowPopupsRetry'));
          setLoading(false);
          return;
        }

        const handler = (e: MessageEvent) => {
          if (e.data?.type !== `${oauth.provider}-oauth-callback`) {
            return;
          }
          const token = e.data.refreshToken;
          if (typeof token === 'string') {
            onConfigChange(field.name, token);
            setError(null);
          }
          window.removeEventListener('message', handler);
          if (popupTimeoutRef.current) {
            clearTimeout(popupTimeoutRef.current);
            popupTimeoutRef.current = null;
          }
          messageHandlerRef.current = null;
          setLoading(false);
        };

        messageHandlerRef.current = handler;
        window.addEventListener('message', handler);

        popupTimeoutRef.current = window.setTimeout(
          () => {
            popupTimeoutRef.current = null;
            if (messageHandlerRef.current) {
              window.removeEventListener('message', messageHandlerRef.current);
              messageHandlerRef.current = null;
            }
            setLoading(false);
          },
          5 * 60 * 1000,
        );
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || t('PluginForm.errorAuth'));
        setLoading(false);
      });
  }, [t, oauth, clientId, clientSecret, field.name, onConfigChange]);

  useEffect(() => {
    return () => {
      if (popupTimeoutRef.current) {
        clearTimeout(popupTimeoutRef.current);
      }
      if (messageHandlerRef.current) {
        window.removeEventListener('message', messageHandlerRef.current);
      }
    };
  }, []);

  if (!oauth) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button type="button" variant={isConnected ? 'outline' : 'secondary'} onClick={handleConnect} disabled={loading}>
          {loading ? t('PluginForm.connecting') : isConnected ? t('PluginForm.reconnectWith', { provider: providerName }) : t('PluginForm.connectWith', { provider: providerName })}
        </Button>
        {isConnected && <span className="text-green-600 text-xs">{t('PluginForm.connected')}</span>}
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <p className="text-muted-foreground text-xs">
        {t('PluginForm.redirectUriHint', { provider: providerName })} <code className="rounded bg-muted px-1">{redirectUri}</code>
      </p>
    </div>
  );
}
