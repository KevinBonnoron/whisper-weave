import { config } from '@/lib/config';

export const authClient = {
  async getGoogleAuthUrl(clientId: string, clientSecret: string): Promise<{ authUrl: string }> {
    const redirectUri = `${config.api.url}/auth/google/callback`;
    const res = await fetch(`${config.api.url}/auth/google/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret, redirectUri }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string | { message?: string; issues?: Array<{ message?: string }> };
      };
      const raw = err?.error;
      let message: string;
      if (typeof raw === 'string') {
        message = raw;
      } else if (raw && typeof raw === 'object') {
        const firstIssue = Array.isArray(raw.issues) ? raw.issues[0] : undefined;
        message = (firstIssue && typeof firstIssue.message === 'string' ? firstIssue.message : null) ?? (typeof raw.message === 'string' ? raw.message : null) ?? res.statusText;
      } else {
        message = res.statusText;
      }
      throw new Error(message || 'Request failed');
    }
    const data = (await res.json()) as { authUrl?: string; success?: boolean; error?: { issues?: Array<{ message?: string }>; message?: string } };
    if (data.success === false && data.error) {
      const raw = data.error;
      const firstIssue = Array.isArray(raw.issues) ? raw.issues[0] : undefined;
      const message = (firstIssue && typeof firstIssue.message === 'string' ? firstIssue.message : null) ?? (typeof raw.message === 'string' ? raw.message : null) ?? 'Validation failed';
      throw new Error(message);
    }
    if (typeof data.authUrl !== 'string') {
      throw new Error('Invalid response');
    }
    return { authUrl: data.authUrl };
  },
};
