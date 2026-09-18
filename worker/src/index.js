// Me&U — Worker
// Two jobs: (1) hold the GitHub token server-side and proxy the app's
// data.json/photos reads+writes through it, gated by a short-lived
// session token issued at login; (2) store push subscriptions (KV) and
// send push notifications via web-push, gated by APP_SECRET as before.
// Endpoints: POST /login, GET/PUT /gh/*, POST /subscribe, /unsubscribe, /send

import webpush from 'web-push';

const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24h
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
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

// ── session tokens (HMAC-signed, stateless, no KV needed) ──
async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}
function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + (4 - str.length % 4) % 4, '=');
  return atob(b64);
}
async function signPayload(payload, secret) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(sig));
}
async function issueSessionToken(userId, secret) {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${userId}.${exp}`;
  const sig = await signPayload(payload, secret);
  return `${toBase64Url(new TextEncoder().encode(payload))}.${sig}`;
}
async function verifySessionToken(token, secret) {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let payload;
  try { payload = fromBase64Url(payloadB64); } catch (e) { return null; }
  const expectedSig = await signPayload(payload, secret);
  if (expectedSig !== sig) return null;
  const [userId, expStr] = payload.split('.');
  const exp = Number(expStr);
  if (!userId || !exp || Date.now() > exp) return null;
  return { userId };
}

// ── GitHub Contents API (server-side token, never sent to the client) ──
function ghUrl(path, env) {
  return `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`;
}
function ghHeaders(env) {
  return {
    Authorization: `token ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'User-Agent': 'meu-push-worker'
  };
}
async function ghGetFile(path, env) {
  const r = await fetch(ghUrl(path, env), { headers: ghHeaders(env) });
  if (r.status === 404) return null;
  if (!r.ok) {
    let detail = r.status;
    try { const j = await r.json(); detail = j.message || r.status; } catch (_) {}
    throw new Error(`GitHub GET ${path}: ${r.status} ${detail}`);
  }
  return r.json();
}

// ── /login ──
async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad request' }, 400, env); }
  const { userId, passwordHash } = body;
  if ((userId !== 'user1' && userId !== 'user2') || !passwordHash) {
    return json({ error: 'bad request' }, 400, env);
  }

  let expectedHash = null;
  try {
    const file = await ghGetFile('data.json', env);
    if (file) {
      const parsed = JSON.parse(atob(file.content.replace(/\n/g, '')));
      expectedHash = parsed.profiles?.[userId]?.hash || null;
    }
  } catch (e) {
    // fall through to the default hash below
  }
  if (!expectedHash) {
    expectedHash = userId === 'user1' ? env.USER1_HASH : env.USER2_HASH;
  }

  if (!expectedHash || passwordHash !== expectedHash) {
    return json({ error: 'invalid credentials' }, 401, env);
  }

  const token = await issueSessionToken(userId, env.APP_SECRET);
  return json({ token, expiresIn: SESSION_TTL_SECONDS }, 200, env);
}

// ── /gh/* (session-token gated) ──
async function handleGhGet(path, env) {
  try {
    const file = await ghGetFile(path, env);
    if (!file) return json(null, 404, env);
    return json(file, 200, env);
  } catch (e) {
    return json({ error: e.message }, 502, env);
  }
}

async function handleGhPut(path, request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad request' }, 400, env); }
  const { message, content, sha } = body;
  if (!message || !content) return json({ error: 'bad request' }, 400, env);

  if (path.startsWith('photos/')) {
    const approxBytes = Math.floor(content.length * 3 / 4);
    if (approxBytes > MAX_UPLOAD_BYTES) return json({ error: 'Photo trop lourde (max 10 Mo)' }, 413, env);
  }

  try {
    const putBody = { message, content };
    if (sha) putBody.sha = sha;
    const r = await fetch(ghUrl(path, env), { method: 'PUT', headers: ghHeaders(env), body: JSON.stringify(putBody) });
    if (!r.ok) {
      let detail = r.status;
      try { const j = await r.json(); detail = j.message || r.status; } catch (_) {}
      return json({ error: `GitHub ${r.status}: ${detail}` }, r.status, env);
    }
    return json(await r.json(), 200, env);
  } catch (e) {
    return json({ error: e.message }, 502, env);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === '/login' && request.method === 'POST') {
      return handleLogin(request, env);
    }

    if (url.pathname.startsWith('/gh/')) {
      const auth = request.headers.get('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const session = await verifySessionToken(token, env.APP_SECRET);
      if (!session) return json({ error: 'unauthorized' }, 401, env);

      const ghPath = url.pathname.slice('/gh/'.length);
      if (request.method === 'GET') return handleGhGet(ghPath, env);
      if (request.method === 'PUT') return handleGhPut(ghPath, request, env);
      return json({ error: 'method not allowed' }, 405, env);
    }

    // ── push notifications (unchanged: static APP_SECRET) ──
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
