import { createFileRoute } from '@tanstack/react-router';
import { AssistantsPage } from '@/components/assistants/AssistantPage';

export const Route = createFileRoute('/assistants/')({
  component: AssistantsPage,
});
