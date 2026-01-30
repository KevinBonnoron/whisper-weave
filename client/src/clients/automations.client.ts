import { config } from '@/lib/config';

const BASE_URL = `${config.api.url}/automations`;

export const automationsClient = {
  async triggerRun(id: string): Promise<{ success: boolean; message?: string; error?: string }> {
    const res = await fetch(`${BASE_URL}/${id}/run`, { method: 'POST' });
    return res.json();
  },

  async getStatus(): Promise<{ scheduledCount: number }> {
    const res = await fetch(`${BASE_URL}/status`);
    return res.json();
  },
};
