import { Link, useRouterState } from '@tanstack/react-router';
import { BookOpen, Bot, LayoutDashboard, MessageCircle, Plug, Settings, Timer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../ui/theme-toggle';

export function AppHeader() {
  const { t } = useTranslation();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const nav = [
    { to: '/', label: t('AppHeader.navDashboard'), icon: LayoutDashboard },
    { to: '/conversations', label: t('AppHeader.navConversations'), icon: MessageCircle },
    { to: '/plugins', label: t('AppHeader.navPlugins'), icon: Plug },
    { to: '/assistants', label: t('AppHeader.navAssistants'), icon: Bot },
    { to: '/automations', label: t('AppHeader.navAutomations'), icon: Timer },
    { to: '/skills', label: t('AppHeader.navSkills'), icon: BookOpen },
    { to: '/settings', label: t('AppHeader.navSettings'), icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/90 backdrop-blur-md" role="banner">
      <div className="flex h-12 w-full items-center px-4">
        <Link to="/" className="mr-8 flex shrink-0 items-center gap-2 font-semibold text-foreground no-underline">
          <span className="text-base tracking-tight">Whisper Weave</span>
        </Link>
        <nav className="flex flex-1 items-center gap-0.5" aria-label="Main navigation">
          {nav.map(({ to, label, icon: Icon }) => {
            const isActive = pathname === to || (to !== '/' && pathname.startsWith(to));
            return (
              <Link key={to} to={to} title={label} className={cn('flex items-center gap-2 rounded-sm px-2 py-2 text-sm font-medium transition-colors lg:px-3', isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')}>
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="ml-4 flex h-12 shrink-0 items-center">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
