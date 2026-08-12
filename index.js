// Me&U — Push Worker
// Stocke les abonnements push (KV) et envoie les notifications via web-push.
// Endpoints : POST /subscribe, POST /unsubscribe, POST /send

import webpush from 'web-push';

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };
}

function json(obj, status, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) }
  });
}

function isAuthorized(request, env) {
  const auth = request.headers.get('Authorization') || '';
  return auth === `Bearer ${env.APP_SECRET}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (!isAuthorized(request, env)) {
      return json({ error: 'unauthorized' }, 401, env);
    }

    webpush.setVapidDetails(
      env.VAPID_CONTACT || 'mailto:contact@example.com',
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );

    // ── Enregistrer un abonnement push pour un utilisateur ──
    if (url.pathname === '/subscribe' && request.method === 'POST') {
      const { userId, subscription } = await request.json();
      if (!userId || !subscription || !subscription.endpoint) {
        return json({ error: 'bad request' }, 400, env);
      }
      const key = `subs:${userId}`;
      const existing = JSON.parse((await env.PUSH_SUBS.get(key)) || '[]');
      const filtered = existing.filter((s) => s.endpoint !== subscription.endpoint);
      filtered.push(subscription);
      await env.PUSH_SUBS.put(key, JSON.stringify(filtered));
      return json({ ok: true }, 200, env);
    }

    // ── Retirer un abonnement (ex: désactivation depuis l'app) ──
    if (url.pathname === '/unsubscribe' && request.method === 'POST') {
      const { userId, endpoint } = await request.json();
      if (!userId || !endpoint) return json({ error: 'bad request' }, 400, env);
      const key = `subs:${userId}`;
      const existing = JSON.parse((await env.PUSH_SUBS.get(key)) || '[]');
      const filtered = existing.filter((s) => s.endpoint !== endpoint);
      await env.PUSH_SUBS.put(key, JSON.stringify(filtered));
      return json({ ok: true }, 200, env);
    }

    // ── Envoyer une notification push à tous les appareils d'un utilisateur ──
    if (url.pathname === '/send' && request.method === 'POST') {
      const { userId, title, body, url: clickUrl, tag } = await request.json();
      if (!userId || !title) return json({ error: 'bad request' }, 400, env);

      const key = `subs:${userId}`;
      const subs = JSON.parse((await env.PUSH_SUBS.get(key)) || '[]');
      if (subs.length === 0) return json({ ok: true, sent: 0 }, 200, env);

      const payload = JSON.stringify({
        title,
        body: body || '',
        url: clickUrl || './',
        tag: tag || 'meu'
      });

      const results = await Promise.allSettled(
        subs.map((sub) => webpush.sendNotification(sub, payload))
      );

      // Nettoyage des abonnements invalides (appareil désinscrit / expiré)
      const stillValid = subs.filter((_, i) => {
        const r = results[i];
        if (r.status === 'fulfilled') return true;
        const code = r.reason && r.reason.statusCode;
        return code !== 404 && code !== 410;
      });
      if (stillValid.length !== subs.length) {
        await env.PUSH_SUBS.put(key, JSON.stringify(stillValid));
      }

      const sent = results.filter((r) => r.status === 'fulfilled').length;
      return json({ ok: true, sent, total: subs.length }, 200, env);
    }

    return json({ error: 'not found' }, 404, env);
  }
};
