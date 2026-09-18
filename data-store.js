// ─────────────────────────────────────────
// DataStore — owns the read-modify-write cycle against data.json
// (posts, comments, reactions, profiles) on the GitHub Contents API.
//
// Every mutator applies its change, persists it, and rolls back the
// in-memory change if the persist fails — so a failed save never
// leaves the UI showing something that isn't actually saved.
// ─────────────────────────────────────────
const DataStore = (function () {
  let _posts = [];
  let _profiles = {};
  let _sha = null;
  let _sessionToken = null;

  // ── Worker-proxied GitHub Contents API ──
  // The GitHub token lives only on the Worker now. The client holds a
  // short-lived session token (obtained via login()) instead.
  function workerBase() {
    return `${CFG.push.workerUrl}/gh`;
  }
  function authHeaders() {
    return { Authorization: `Bearer ${_sessionToken}`, 'Content-Type': 'application/json' };
  }
  async function login(userId, passwordHash) {
    let r;
    try {
      r = await fetch(`${CFG.push.workerUrl}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, passwordHash })
      });
    } catch (e) {
      console.error('Login request failed:', e);
      throw new Error('Erreur de connexion au serveur');
    }
    if (!r.ok) return false;
    const { token } = await r.json();
    _sessionToken = token;
    return true;
  }
  async function ghGet(path) {
    const r = await fetch(`${workerBase()}/${path}`, { headers: authHeaders() });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub GET ${path}: ${r.status}`);
    return r.json();
  }
  async function ghPut(path, content, sha, message) {
    const body = { message, content: btoa(unescape(encodeURIComponent(content))) };
    if (sha) body.sha = sha;
    const r = await fetch(`${workerBase()}/${path}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`GitHub PUT ${path}: ${r.status}`);
    return r.json();
  }
  async function ghPutBinary(path, arrayBuffer, sha, message) {
    const bytes = new Uint8Array(arrayBuffer);
    const CHUNK = 8192; let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    const body = { message, content: btoa(binary) };
    if (sha) body.sha = sha;
    const r = await fetch(`${workerBase()}/${path}`, { method:'PUT', headers: authHeaders(), body: JSON.stringify(body) });
    if (!r.ok) {
      let detail = r.status;
      try { const j = await r.json(); detail = j.error || r.status; } catch(_) {}
      throw new Error(`GitHub ${r.status}: ${detail}`);
    }
    return r.json();
  }

  // ── internal state helpers ──
  function getState() {
    return { posts: _posts, profiles: _profiles };
  }

  function snapshot() {
    return { posts: structuredClone(_posts), profiles: structuredClone(_profiles) };
  }

  async function persist() {
    const json = JSON.stringify({ posts: _posts, profiles: _profiles }, null, 2);
    try {
      const res = await ghPut('data.json', json, _sha, 'Update data.json');
      _sha = res.content.sha;
    } catch (e) {
      if (e.message && (e.message.includes('409') || e.message.includes('422'))) {
        const file = await ghGet('data.json');
        if (file) _sha = file.sha;
        const res2 = await ghPut('data.json', json, _sha, 'Update data.json');
        _sha = res2.content.sha;
      } else throw e;
    }
  }

  // Applies mutateFn, persists, and rolls back in-memory state if the
  // persist fails. mutateFn may itself throw (e.g. "not found") before
  // anything is persisted — state is restored the same way either way.
  async function commit(mutateFn) {
    const before = snapshot();
    try {
      mutateFn();
      await persist();
    } catch (e) {
      _posts = before.posts;
      _profiles = before.profiles;
      console.error('DataStore persist failed:', e);
      throw new Error('Erreur de sauvegarde');
    }
    return getState();
  }

  // ── public interface ──
  async function load() {
    const file = await ghGet('data.json');
    if (file) {
      _sha = file.sha;
      const json = decodeURIComponent(escape(atob(file.content.replace(/\n/g,''))));
      const parsed = JSON.parse(json);
      _posts = parsed.posts || [];
      _profiles = parsed.profiles || {};
    } else {
      const res = await ghPut('data.json', '{"posts":[],"profiles":{}}', null, 'Init data.json');
      _sha = res.content.sha;
      _posts = []; _profiles = {};
    }
    return getState();
  }

  // Returns null if nothing changed since the last load/check.
  async function checkForUpdates() {
    const file = await ghGet('data.json');
    if (!file || file.sha === _sha) return null;
    _sha = file.sha;
    const json = decodeURIComponent(escape(atob(file.content.replace(/\n/g,''))));
    const parsed = JSON.parse(json);
    _posts = parsed.posts || [];
    _profiles = parsed.profiles || {};
    return getState();
  }

  async function addPost({ userId, caption, file }) {
    let imgPath = null;
    if (file) {
      if (file.size > 10 * 1024 * 1024) throw new Error('Photo trop lourde (max 10 Mo)');
      try {
        const ext = file.name.split('.').pop().toLowerCase();
        imgPath = `photos/${Date.now()}_${Math.random().toString(36).slice(2,6)}.${ext}`;
        await ghPutBinary(imgPath, await file.arrayBuffer(), null, `Photo: ${imgPath}`);
      } catch (e) {
        console.error('Photo upload failed:', e);
        throw new Error("Échec de l'upload");
      }
    }
    const post = {
      id: `p${Date.now()}${Math.random().toString(36).slice(2,5)}`,
      userId, caption, imgPath, ts: Date.now(), reactions: [], comments: []
    };
    return commit(() => { _posts.unshift(post); });
  }

  async function deletePost({ postId }) {
    return commit(() => { _posts = _posts.filter(p => p.id !== postId); });
  }

  async function addComment({ postId, userId, text }) {
    return commit(() => {
      const post = _posts.find(p => p.id === postId);
      if (!post) throw new Error('Post introuvable');
      post.comments = post.comments || [];
      post.comments.push({ userId, text, ts: Date.now() });
    });
  }

  async function toggleReaction({ postId, userId, emoji }) {
    let wasAdded = false;
    const result = await commit(() => {
      const post = _posts.find(p => p.id === postId);
      if (!post) throw new Error('Post introuvable');
      post.reactions = post.reactions || [];
      const idx = post.reactions.findIndex(r => r.userId === userId && r.emoji === emoji);
      wasAdded = idx < 0;
      if (idx >= 0) post.reactions.splice(idx, 1);
      else post.reactions.push({ userId, emoji });
    });
    return { ...result, wasAdded };
  }

  async function updateProfile({ userId, name, emoji, avatarFile, removeAvatar, newPasswordHash }) {
    let avatarPath = _profiles[userId]?.avatarPath || null;
    if (removeAvatar) {
      avatarPath = null;
    } else if (avatarFile) {
      if (avatarFile.size > 10 * 1024 * 1024) throw new Error('Photo trop lourde (max 10 Mo)');
      try {
        const ext = avatarFile.name.split('.').pop().toLowerCase();
        avatarPath = `photos/avatar_${userId}_${Date.now()}.${ext}`;
        await ghPutBinary(avatarPath, await avatarFile.arrayBuffer(), null, `Avatar: ${avatarPath}`);
      } catch (e) {
        console.error('Avatar upload failed:', e);
        throw new Error('Échec upload photo de profil');
      }
    }
    return commit(() => {
      _profiles[userId] = _profiles[userId] || {};
      _profiles[userId].name = name;
      _profiles[userId].emoji = emoji;
      _profiles[userId].avatarPath = avatarPath;
      _profiles[userId].ts = Date.now();
      if (newPasswordHash) _profiles[userId].hash = newPasswordHash;
    });
  }

  function reset() {
    _posts = []; _profiles = {}; _sha = null; _sessionToken = null;
  }

  return { login, load, checkForUpdates, addPost, deletePost, addComment, toggleReaction, updateProfile, getState, reset };
})();
