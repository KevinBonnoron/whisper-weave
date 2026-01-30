import { createFileRoute } from '@tanstack/react-router';
import { PluginsPage } from '@/components/plugins/PluginsPage';

export const Route = createFileRoute('/plugins/')({
  component: PluginsPage,
});
