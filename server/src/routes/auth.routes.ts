import { zValidator } from '@hono/zod-validator';
import { google } from 'googleapis';
import { Hono } from 'hono';
import { z } from 'zod';

const GOOGLE_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.modify', 'https://www.googleapis.com/auth/calendar.readonly'];

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface PendingState {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  createdAt: number;
}

const pendingStates = new Map<string, PendingState>();

function cleanupExpiredStates(): void {
  const now = Date.now();
  for (const [state, data] of pendingStates.entries()) {
    if (now - data.createdAt > STATE_TTL_MS) {
      pendingStates.delete(state);
    }
  }
}

const authorizeSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  redirectUri: z.string().url(),
});

export const authRoutes = new Hono();

authRoutes.post('/google/authorize', zValidator('json', authorizeSchema), async (c) => {
  const { clientId, clientSecret, redirectUri } = c.req.valid('json');
  cleanupExpiredStates();
  const state = crypto.randomUUID();
  pendingStates.set(state, {
    clientId,
    clientSecret,
    redirectUri,
    createdAt: Date.now(),
  });
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_SCOPES,
    state,
  });
  return c.json({ authUrl });
});

authRoutes.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  if (error) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erreur</title></head><body><p>Autorisation refusée ou erreur: ${escapeHtml(error)}</p><p>Vous pouvez fermer cette fenêtre.</p></body></html>`;
    return c.html(html, 400);
  }

  if (!code || !state) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erreur</title></head><body><p>Paramètres manquants (code ou state).</p><p>Vous pouvez fermer cette fenêtre.</p></body></html>`;
    return c.html(html, 400);
  }

  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  if (!pending) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erreur</title></head><body><p>Session expirée ou invalide. Réessayez en cliquant sur « Connecter avec Google ».</p><p>Vous pouvez fermer cette fenêtre.</p></body></html>`;
    return c.html(html, 400);
  }

  const { clientId, clientSecret, redirectUri } = pending;
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  let tokens: { refresh_token?: string };
  try {
    const { tokens: t } = await oauth2Client.getToken(code);
    tokens = t;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Erreur</title></head><body><p>Impossible d'échanger le code: ${escapeHtml(msg)}</p><p>Vous pouvez fermer cette fenêtre.</p></body></html>`;
    return c.html(html, 400);
  }

  const refreshToken = tokens.refresh_token ?? '';
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Connecté</title></head>
<body>
  <p>Connexion réussie. Cette fenêtre va se fermer automatiquement.</p>
  <script>
    (function() {
      var msg = { type: 'google-oauth-callback', refreshToken: ${JSON.stringify(refreshToken)} };
      if (window.opener) {
        window.opener.postMessage(msg, '*');
        window.close();
      } else {
        document.body.innerHTML = '<p>Refresh token (copiez-le si la fenêtre ne s’est pas fermée):</p><pre style="word-break:break-all;">' + ${JSON.stringify(refreshToken)} + '</pre>';
      }
    })();
  </script>
</body></html>`;
  return c.html(html);
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
