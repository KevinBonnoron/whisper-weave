import { universalClient, withDelegate, withMethods } from 'universal-client';
import { config } from '@/lib/config';

export interface SkillListItem {
  id: string;
  title?: string;
}

export interface SkillDetail {
  id: string;
  content: string;
}

export const skillsClient = universalClient(
  withDelegate({ type: 'http', impl: 'fetch', baseURL: config.api.url }),
  withMethods(({ delegate }) => ({
    list: () => delegate.get<{ skills: SkillListItem[] }>('/skills'),
    get: (id: string) => delegate.get<SkillDetail>(`/skills/${encodeURIComponent(id)}`),
    create: (id: string, content: string) => delegate.post<SkillDetail>('/skills', { body: JSON.stringify({ id, content }), headers: { 'Content-Type': 'application/json' } }),
    update: (id: string, content: string) => delegate.put<SkillDetail>(`/skills/${encodeURIComponent(id)}`, { body: JSON.stringify({ content }), headers: { 'Content-Type': 'application/json' } }),
    delete: (id: string) => delegate.delete<{ deleted: string }>(`/skills/${encodeURIComponent(id)}`),
  })),
);
