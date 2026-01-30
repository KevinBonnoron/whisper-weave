import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from '@/providers/theme-provider';

export const Route = createFileRoute('/settings/')({
  component: SettingsPage,
});

const THEME_VALUES = ['light', 'dark', 'system'] as const;
const LANGUAGE_KEYS = ['en', 'fr'] as const;

function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t('SettingsPage.title')}</h1>
        <p className="text-muted-foreground">{t('SettingsPage.subtitle')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('SettingsPage.general')}</CardTitle>
          <CardDescription>{t('SettingsPage.generalDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('SettingsPage.theme')}</Label>
            <div className="flex gap-2">
              {THEME_VALUES.map((value) => (
                <Button key={value} type="button" variant={theme === value ? 'default' : 'outline'} size="sm" onClick={() => setTheme(value)}>
                  {t(`SettingsPage.theme${value.charAt(0).toUpperCase() + value.slice(1)}`)}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('SettingsPage.language')}</Label>
            <Select value={i18n.language?.startsWith('fr') ? 'fr' : 'en'} onValueChange={(value) => i18n.changeLanguage(value)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {t(`SettingsPage.language${key.charAt(0).toUpperCase() + key.slice(1)}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('SettingsPage.about')}</CardTitle>
          <CardDescription>{t('SettingsPage.aboutDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('SettingsPage.version')}</p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">React</Badge>
            <Badge variant="secondary">Vite</Badge>
            <Badge variant="secondary">Bun</Badge>
            <Badge variant="secondary">TypeScript</Badge>
            <Badge variant="secondary">Tailwind</Badge>
            <Badge variant="secondary">shadcn</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
