// ── LUCIDE init ──
document.addEventListener('DOMContentLoaded', () => lucide.createIcons());

// ── CONFIG ──
window.CFG = null;
const cfgScript = document.createElement('script');
cfgScript.src = 'config.js';
cfgScript.onload = () => { lucide.createIcons(); if (window.CFG) bootAuth(); else showSetup(); };
cfgScript.onerror = () => { lucide.createIcons(); showSetup(); };
document.head.appendChild(cfgScript);

// ── STATE ──
let ME = null, POSTS = [], DATA_SHA = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.error('SW register failed:', e));
  });
}

// ─────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────
function showToast(msg, type = '') {
  const tc = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast${type ? ' toast-' + type : ''}`;

  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error')   iconName = 'alert-circle';

  t.innerHTML = `<i data-lucide="${iconName}" width="15" height="15"></i> ${msg}`;
  tc.appendChild(t);
  lucide.createIcons({ nodes: [t] });

  setTimeout(() => {
    t.classList.add('toast-out');
    setTimeout(() => t.remove(), 280);
  }, 2800);
}

// ─────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────
function openLightbox(src) {
  const lb = document.getElementById('lightbox');
  document.getElementById('lightbox-img').src = src;
  lb.classList.add('open');
  document.addEventListener('keydown', lbKeyClose);
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.removeEventListener('keydown', lbKeyClose);
  document.body.style.overflow = '';
  setTimeout(() => { document.getElementById('lightbox-img').src = ''; }, 200);
}
function lbKeyClose(e) { if (e.key === 'Escape') closeLightbox(); }

// ─────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────
function showSetup() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('setup-screen').style.display = 'flex';
}
async function generateConfig() {
  const token = document.getElementById('s-token').value.trim();
  const owner = document.getElementById('s-owner').value.trim();
  const repo  = document.getElementById('s-repo').value.trim();
  const n1 = document.getElementById('s-n1').value.trim() || 'Moi';
  const e1 = document.getElementById('s-e1').value.trim() || '🌸';
  const p1 = document.getElementById('s-p1').value;
  const n2 = document.getElementById('s-n2').value.trim() || 'Toi';
  const e2 = document.getElementById('s-e2').value.trim() || '💛';
  const p2 = document.getElementById('s-p2').value;
  if (!token || !owner || !repo || !p1 || !p2) { showToast('Remplis tous les champs !', 'error'); return; }
  const h1 = await sha256(p1), h2 = await sha256(p2);
  const b64 = btoa(token), mid = Math.floor(b64.length / 2);
  const tk = [b64.slice(mid), b64.slice(0, mid)];
  const code = `// Me&U — Config\nwindow.CFG = {\n  _tk: ["${tk[0]}","${tk[1]}"],\n  owner: "${owner}",\n  repo:  "${repo}",\n  users: {\n    user1: { name: "${n1}", emoji: "${e1}", hash: "${h1}" },\n    user2: { name: "${n2}", emoji: "${e2}", hash: "${h2}" }\n  }\n};`;
  document.getElementById('setup-code').value = code;
  const out = document.getElementById('setup-result');
  out.style.display = 'block';
  out.scrollIntoView({ behavior: 'smooth' });
}
function copyConfig() {
  const ta = document.getElementById('setup-code'); ta.select(); document.execCommand('copy');
  const btn = document.getElementById('copy-btn');
  btn.innerHTML = `<span class="icon"><i data-lucide="check" width="14" height="14"></i></span><span>Copié !</span>`;
  lucide.createIcons({ nodes: [btn] });
  setTimeout(() => {
    btn.innerHTML = `<span class="icon"><i data-lucide="copy" width="14" height="14"></i></span><span>Copier le code</span>`;
    lucide.createIcons({ nodes: [btn] });
  }, 2000);
}

// ─────────────────────────────────────────
// PROFILES & AVATARS SYSTEM
// ─────────────────────────────────────────
let PROFILES = {};

function getPartnerId() {
  return ME.id === 'user1' ? 'user2' : 'user1';
}
function getUserProfile(uid) {
  const base = (CFG.users && CFG.users[uid]) ? CFG.users[uid] : { name: uid, emoji: '👤' };
  if (PROFILES && PROFILES[uid]) {
    return { ...base, ...PROFILES[uid] };
  }
  return base;
}

function renderAvatarHtml(uid, extraClass = '', styleStr = '') {
  const p = getUserProfile(uid);
  if (p.avatarPath) {
    const src = `https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/main/${p.avatarPath}?v=${p.ts || 1}`;
    return `<div class="${extraClass} avatar-img-box" style="${styleStr}"><img src="${src}" alt="${esc(p.name)}" class="avatar-img"></div>`;
  }
  return `<div class="${extraClass}" style="${styleStr}">${p.emoji || '👤'}</div>`;
}

function updateHeaderUserUI() {
  if (!ME) return;
  const current = getUserProfile(ME.id);
  ME.name = current.name;
  ME.emoji = current.emoji;

  const nameEl = document.getElementById('tb-name');
  if (nameEl) nameEl.textContent = current.name;

  const avWrap = document.getElementById('tb-av-wrap');
  if (avWrap) avWrap.innerHTML = renderAvatarHtml(ME.id, 'topbar-avatar');
}

// ── SETTINGS MODAL ──
let pickedSettingsAvatarFile = null;
let removeAvatarFlag = false;

function openSettingsModal() {
  if (!ME) return;
  const profile = getUserProfile(ME.id);
  document.getElementById('settings-name').value = profile.name || '';
  document.getElementById('settings-emoji').value = profile.emoji || '';
  document.getElementById('settings-password').value = '';
  document.getElementById('settings-status').textContent = '';
  document.getElementById('btn-save-settings').disabled = false;
  pickedSettingsAvatarFile = null;
  removeAvatarFlag = false;

  const avBox = document.getElementById('settings-av-box');
  if (avBox) {
    avBox.innerHTML = renderAvatarHtml(ME.id, '', 'width:100%;height:100%');
  }

  const remBtn = document.getElementById('btn-remove-photo');
  if (remBtn) remBtn.style.display = profile.avatarPath ? 'block' : 'none';

  document.getElementById('settings-modal').classList.add('open');
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('open');
  document.getElementById('settings-av-input').value = '';
  pickedSettingsAvatarFile = null;
  removeAvatarFlag = false;
}

function bgCloseSettings(e) {
  if (e.target === e.currentTarget) closeSettingsModal();
}

function previewSettingsAvatar(e) {
  pickedSettingsAvatarFile = e.target.files[0]; if (!pickedSettingsAvatarFile) return;
  removeAvatarFlag = false;
  const avBox = document.getElementById('settings-av-box');
  if (avBox) {
    avBox.innerHTML = `<img src="${URL.createObjectURL(pickedSettingsAvatarFile)}" class="avatar-img">`;
  }
  const remBtn = document.getElementById('btn-remove-photo');
  if (remBtn) remBtn.style.display = 'block';
}

function removeSettingsAvatar() {
  pickedSettingsAvatarFile = null;
  removeAvatarFlag = true;
  const profile = getUserProfile(ME.id);
  const avBox = document.getElementById('settings-av-box');
  if (avBox) avBox.textContent = profile.emoji || '👤';
  document.getElementById('btn-remove-photo').style.display = 'none';
}

function setSettingsStatus(msg, showSpinner = false) {
  const el = document.getElementById('settings-status');
  if (!msg) { el.textContent = ''; return; }
  el.innerHTML = showSpinner ? `<div class="spinner"></div> ${msg}` : msg;
}

async function saveSettings() {
  const newName = document.getElementById('settings-name').value.trim();
  const newEmoji = document.getElementById('settings-emoji').value.trim() || '🌸';
  const newPw = document.getElementById('settings-password').value;

  if (!newName) {
    setSettingsStatus('Le prénom ne peut pas être vide');
    showToast('Le prénom ne peut pas être vide', 'error'); return;
  }

  document.getElementById('btn-save-settings').disabled = true;
  let avatarPath = PROFILES[ME.id]?.avatarPath || null;

  if (removeAvatarFlag) {
    avatarPath = null;
  } else if (pickedSettingsAvatarFile) {
    if (pickedSettingsAvatarFile.size > 10 * 1024 * 1024) {
      setSettingsStatus('Photo trop lourde (max 10 Mo)');
      showToast('Photo trop lourde — max 10 Mo', 'error');
      document.getElementById('btn-save-settings').disabled = false; return;
    }
    setSettingsStatus('Upload de la photo de profil…', true);
    try {
      const ext = pickedSettingsAvatarFile.name.split('.').pop().toLowerCase();
      avatarPath = `photos/avatar_${ME.id}_${Date.now()}.${ext}`;
      await ghPutBinary(avatarPath, await pickedSettingsAvatarFile.arrayBuffer(), null, `Avatar: ${avatarPath}`);
    } catch(e) {
      console.error('Avatar upload error:', e);
      setSettingsStatus('Erreur upload avatar : ' + e.message);
      showToast('Échec upload photo de profil', 'error');
      document.getElementById('btn-save-settings').disabled = false; return;
    }
  }

  setSettingsStatus('Enregistrement du profil…', true);
  PROFILES[ME.id] = PROFILES[ME.id] || {};
  PROFILES[ME.id].name = newName;
  PROFILES[ME.id].emoji = newEmoji;
  PROFILES[ME.id].avatarPath = avatarPath;
  PROFILES[ME.id].ts = Date.now();

  if (newPw) {
    PROFILES[ME.id].hash = await sha256(newPw);
  }

  try {
    await savePosts();
    closeSettingsModal();
    updateHeaderUserUI();
    renderFeed();
    updateNotificationsUI();
    showToast('Profil mis à jour avec succès !', 'success');
  } catch(e) {
    console.error('Save settings error:', e);
    setSettingsStatus('Erreur d\'enregistrement');
    showToast('Erreur d\'enregistrement', 'error');
    document.getElementById('btn-save-settings').disabled = false;
  }
}

// ─────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────
function bootAuth() {
  const u1 = getUserProfile('user1');
  const u2 = getUserProfile('user2');
  document.getElementById('nm-u1').textContent = u1.name;
  document.getElementById('nm-u2').textContent = u2.name;

  const av1 = document.getElementById('av-u1');
  if (av1) av1.innerHTML = u1.avatarPath ? `<img src="https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/main/${u1.avatarPath}?v=${u1.ts||1}" class="avatar-img">` : u1.emoji;

  const av2 = document.getElementById('av-u2');
  if (av2) av2.innerHTML = u2.avatarPath ? `<img src="https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/main/${u2.avatarPath}?v=${u2.ts||1}" class="avatar-img">` : u2.emoji;

  document.getElementById('auth-screen').style.display = 'flex';
}
let selectedUid = 'user1';
function selectUser(uid) {
  selectedUid = uid;
  ['user1','user2'].forEach(u => {
    document.getElementById(`btn-${u==='user1'?'u1':'u2'}`).classList.toggle('active', u === uid);
  });
  document.getElementById('auth-pw').value = '';
  document.getElementById('auth-err').textContent = '';
}
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
async function doLogin() {
  const pw = document.getElementById('auth-pw').value;
  const err = document.getElementById('auth-err');
  if (!pw) {
    err.innerHTML = `<i data-lucide="alert-circle" width="14" height="14"></i> Entre ton mot de passe`;
    lucide.createIcons({ nodes: [err] }); return;
  }
  const hash = await sha256(pw);
  const user = getUserProfile(selectedUid);
  const targetHash = user.hash || CFG.users[selectedUid].hash;
  if (hash === targetHash) {
    ME = { id: selectedUid, ...user };
    document.getElementById('auth-screen').style.display = 'none';
    updateHeaderUserUI();
    document.getElementById('app').style.display = 'block';
    await loadPosts();
    updateNotificationsUI();
    updatePushToggleUI();
    await checkAndNotifyOnLogin();
    startBackgroundPolling();
  } else {
    err.innerHTML = `<i data-lucide="x-circle" width="14" height="14"></i> Mot de passe incorrect`;
    lucide.createIcons({ nodes: [err] });
    document.getElementById('auth-pw').value = '';
  }
}
function doLogout() {
  if (pollingInterval) clearInterval(pollingInterval);
  ME = null; POSTS = []; DATA_SHA = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('auth-pw').value = '';
  document.getElementById('auth-err').textContent = '';
  document.getElementById('feed').querySelectorAll('.post-card,.skeleton-card').forEach(c => c.remove());
  document.getElementById('feed-empty').style.display = 'block';
}

// ─────────────────────────────────────────
// NOTIFICATIONS SYSTEM
// ─────────────────────────────────────────
let READ_NOTIFS = [];
let pollingInterval = null;

function loadReadNotifs() {
  if (!ME) return;
  try {
    const stored = localStorage.getItem(`meu_read_notifs_${ME.id}`);
    READ_NOTIFS = stored ? JSON.parse(stored) : [];
  } catch(e) { READ_NOTIFS = []; }
}

function saveReadNotifs() {
  if (!ME) return;
  try {
    localStorage.setItem(`meu_read_notifs_${ME.id}`, JSON.stringify(READ_NOTIFS));
  } catch(e) {}
}

function playNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1046.5, now); // C6
    osc2.frequency.exponentialRampToValueAtTime(1318.5, now + 0.12); // E6

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.45);
    osc2.stop(now + 0.45);
  } catch(e) { console.error('Audio play error:', e); }
}

function getNotifications() {
  if (!ME || !POSTS) return [];
  const list = [];
  const partnerId = ME.id === 'user1' ? 'user2' : 'user1';
  const partner = CFG.users[partnerId] || { name: 'Votre partenaire', emoji: '❤️' };

  POSTS.forEach(p => {
    // 1. Partner shared a moment
    if (p.userId === partnerId) {
      list.push({
        id: `post_${p.id}`,
        postId: p.id,
        type: 'post',
        icon: 'image',
        text: `<strong>${partner.name}</strong> a partagé un nouveau moment`,
        ts: p.ts
      });
    }

    // 2. Partner commented
    (p.comments || []).forEach((c, idx) => {
      if (c.userId === partnerId) {
        const snippet = c.text.length > 35 ? c.text.slice(0, 35) + '…' : c.text;
        const targetLabel = p.userId === ME.id ? 'votre moment' : 'un moment';
        list.push({
          id: `cmt_${p.id}_${c.ts}_${idx}`,
          postId: p.id,
          type: 'comment',
          icon: 'message-square',
          text: `<strong>${partner.name}</strong> a commenté ${targetLabel} : <em>« ${esc(snippet)} »</em>`,
          ts: c.ts
        });
      }
    });

    // 3. Partner reacted
    (p.reactions || []).forEach(r => {
      if (r.userId === partnerId) {
        const targetLabel = p.userId === ME.id ? 'votre moment' : 'un moment';
        list.push({
          id: `rxn_${p.id}_${r.userId}_${r.emoji}`,
          postId: p.id,
          type: 'reaction',
          icon: 'heart',
          text: `<strong>${partner.name}</strong> a réagi ${r.emoji} à ${targetLabel}`,
          ts: p.ts || Date.now()
        });
      }
    });
  });

  return list.sort((a,b) => b.ts - a.ts);
}

function updateNotificationsUI() {
  loadReadNotifs();
  const notifs = getNotifications();
  const unreadList = notifs.filter(n => !READ_NOTIFS.includes(n.id));
  const badge = document.getElementById('notif-badge');
  const listEl = document.getElementById('notif-list');

  if (unreadList.length > 0) {
    badge.textContent = unreadList.length > 99 ? '99+' : unreadList.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }

  if (!listEl) return;

  if (notifs.length === 0) {
    listEl.innerHTML = `
      <div class="notif-empty">
        <span class="icon" style="opacity:0.5"><i data-lucide="bell-off" width="26" height="26"></i></span>
        <span>Aucune notification pour le moment</span>
      </div>`;
    lucide.createIcons({ nodes: [listEl] });
    return;
  }

  listEl.innerHTML = notifs.map(n => {
    const isUnread = !READ_NOTIFS.includes(n.id);
    const dateStr = formatNotifTime(n.ts);
    return `
      <div class="notif-item${isUnread ? ' unread' : ''}" onclick="clickNotification('${n.id}', '${n.postId}')">
        <div class="notif-icon-box icon">
          <i data-lucide="${n.icon}" width="16" height="16"></i>
        </div>
        <div class="notif-body">
          <div class="notif-msg">${n.text}</div>
          <div class="notif-date">${dateStr}</div>
        </div>
      </div>`;
  }).join('');

  lucide.createIcons({ nodes: [listEl] });
}

function formatNotifTime(ts) {
  if (!ts) return '';
  const now = Date.now();
  const diff = Math.floor((now - ts) / 1000);
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function toggleNotifPanel() {
  const panel = document.getElementById('notif-panel');
  const btn = document.getElementById('notif-btn');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  btn.classList.toggle('active', isOpen);

  if (isOpen) {
    updateNotificationsUI();
    setTimeout(() => {
      const closeHandler = (e) => {
        if (!panel.contains(e.target) && !btn.contains(e.target)) {
          panel.classList.remove('open');
          btn.classList.remove('active');
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 10);
  }
}

function clickNotification(notifId, postId) {
  if (!READ_NOTIFS.includes(notifId)) {
    READ_NOTIFS.push(notifId);
    saveReadNotifs();
    updateNotificationsUI();
  }

  document.getElementById('notif-panel')?.classList.remove('open');
  document.getElementById('notif-btn')?.classList.remove('active');

  const card = document.getElementById(`card-${postId}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('highlight-target');
    void card.offsetWidth;
    card.classList.add('highlight-target');
    setTimeout(() => card.classList.remove('highlight-target'), 2500);
  }
}

function markAllNotifsRead() {
  const notifs = getNotifications();
  notifs.forEach(n => {
    if (!READ_NOTIFS.includes(n.id)) READ_NOTIFS.push(n.id);
  });
  saveReadNotifs();
  updateNotificationsUI();
  showToast('Toutes les notifications sont marquées comme lues', 'success');
}

async function requestSystemNotifPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications non supportées par ce navigateur', 'error');
    return;
  }

  if (Notification.permission === 'granted') {
    await subscribeToPush();
    showToast('Notifications activées 🔔', 'success');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    const subscribed = await subscribeToPush();
    showToast('Notifications activées !', 'success');
    updatePushToggleUI();
    new Notification('Me&U', {
      body: subscribed
        ? 'Vous recevrez désormais les notifications, même app fermée !'
        : 'Vous recevrez les notifications quand l\'app est ouverte.',
      icon: 'favicon.ico'
    });
  } else {
    showToast('Autorisation refusée', 'error');
  }
}

function updatePushToggleUI() {
  const btn = document.getElementById('push-toggle-btn');
  if (!btn) return;
  if ('Notification' in window && Notification.permission === 'granted') {
    btn.classList.add('active');
    btn.title = "Notifications push activées";
  } else {
    btn.classList.remove('active');
    btn.title = "Activer les notifications push";
  }
}

function sendSystemNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, icon: 'favicon.ico' });
    } catch(e) {}
  }
}

// ─────────────────────────────────────────
// PUSH RÉEL (fonctionne app fermée)
// ─────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

async function subscribeToPush() {
  if (!CFG.push || !CFG.push.workerUrl || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(CFG.push.vapidPublicKey)
      });
    }
    await fetch(`${CFG.push.workerUrl}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CFG.push.secret}` },
      body: JSON.stringify({ userId: ME.id, subscription: sub.toJSON() })
    });
    return true;
  } catch(e) {
    console.error('Push subscribe error:', e);
    return false;
  }
}

async function unsubscribeFromPush() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      if (CFG.push && CFG.push.workerUrl && ME) {
        fetch(`${CFG.push.workerUrl}/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CFG.push.secret}` },
          body: JSON.stringify({ userId: ME.id, endpoint })
        }).catch(() => {});
      }
    }
  } catch(e) { console.error('Push unsubscribe error:', e); }
}

// Envoie un push réel au partenaire (arrive même si son app est fermée)
async function sendPushToPartner(title, body, postId) {
  if (!CFG.push || !CFG.push.workerUrl || !ME) return;
  try {
    await fetch(`${CFG.push.workerUrl}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${CFG.push.secret}` },
      body: JSON.stringify({
        userId: getPartnerId(),
        title,
        body,
        url: postId ? `./#post-${postId}` : './',
        tag: 'meu'
      })
    });
  } catch(e) {
    console.error('Push send error:', e);
  }
}

async function silentCheckForUpdates() {
  if (!ME) return;
  try {
    const file = await ghGet('data.json');
    if (!file || file.sha === DATA_SHA) return;

    const json = decodeURIComponent(escape(atob(file.content.replace(/\n/g,''))));
    const newPosts = JSON.parse(json).posts || [];
    DATA_SHA = file.sha;

    const oldNotifIds = getNotifications().map(n => n.id);
    POSTS = newPosts;
    const currentNotifs = getNotifications();
    const freshNotifs = currentNotifs.filter(n => !oldNotifIds.includes(n.id) && !READ_NOTIFS.includes(n.id));

    renderFeed();
    updateNotificationsUI();

    if (freshNotifs.length > 0) {
      playNotificationSound();
      const latest = freshNotifs[0];
      const cleanMsg = latest.text.replace(/<[^>]*>/g, '');
      showToast(cleanMsg, 'success');
      sendSystemNotification('Me&U — Nouvelle activité', cleanMsg);
    }
  } catch(e) {
    // Silent fail in background polling
  }
}

function startBackgroundPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(silentCheckForUpdates, 30000);
}

async function checkAndNotifyOnLogin() {
  if (!ME) return;

  // 1. Demander automatiquement la permission navigateur si pas encore configurée
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
      updatePushToggleUI();
    } catch(e) {}
  }
  // S'assurer que l'abonnement push est bien enregistré (utile après une mise à jour de l'app)
  if ('Notification' in window && Notification.permission === 'granted') {
    subscribeToPush();
  }

  // 2. Vérifier s'il y a des notifications non lues lors de la connexion
  loadReadNotifs();
  const notifs = getNotifications();
  const unreadList = notifs.filter(n => !READ_NOTIFS.includes(n.id));

  if (unreadList.length > 0) {
    playNotificationSound();
    const partnerId = ME.id === 'user1' ? 'user2' : 'user1';
    const partner = CFG.users[partnerId] || { name: 'Votre partenaire' };
    const title = `Me&U — Bon retour ${ME.name} !`;
    const body = unreadList.length === 1
      ? unreadList[0].text.replace(/<[^>]*>/g, '')
      : `Vous avez ${unreadList.length} nouvelle(s) notification(s) de ${partner.name}.`;

    showToast(body, 'success');
    sendSystemNotification(title, body);
  } else {
    showToast(`Bienvenue ${ME.name} ! ✨`, 'success');
  }
}

// ─────────────────────────────────────────
// GITHUB HELPERS
// ─────────────────────────────────────────
function getToken() {
  if (CFG._tk) return atob([...CFG._tk].reverse().join(''));
  return CFG.token || '';
}
const GH = () => ({
  base: `https://api.github.com/repos/${CFG.owner}/${CFG.repo}/contents`,
  headers: {
    Authorization: `token ${getToken()}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  }
});
async function ghGet(path) {
  const { base, headers } = GH();
  const r = await fetch(`${base}/${path}`, { headers });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub GET ${path}: ${r.status}`);
  return r.json();
}
async function ghPut(path, content, sha, message) {
  const { base, headers } = GH();
  const body = { message, content: btoa(unescape(encodeURIComponent(content))) };
  if (sha) body.sha = sha;
  const r = await fetch(`${base}/${path}`, { method:'PUT', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`GitHub PUT ${path}: ${r.status}`);
  return r.json();
}
async function ghPutBinary(path, arrayBuffer, sha, message) {
  const { base, headers } = GH();
  const bytes = new Uint8Array(arrayBuffer);
  const CHUNK = 8192; let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  const body = { message, content: btoa(binary) };
  if (sha) body.sha = sha;
  const r = await fetch(`${base}/${path}`, { method:'PUT', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    let detail = r.status;
    try { const j = await r.json(); detail = j.message || r.status; } catch(_) {}
    throw new Error(`GitHub ${r.status}: ${detail}`);
  }
  return r.json();
}

// ─────────────────────────────────────────
// SKELETON LOADERS
// ─────────────────────────────────────────
function showSkeletons(count = 3) {
  const feed = document.getElementById('feed');
  document.getElementById('feed-empty').style.display = 'none';
  for (let i = 0; i < count; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton-card';
    sk.innerHTML = `
      <div style="padding:13px 14px 10px;display:flex;align-items:center;gap:10px">
        <div class="skel" style="width:36px;height:36px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1;display:flex;flex-direction:column;gap:6px">
          <div class="skel" style="height:12px;width:40%"></div>
          <div class="skel" style="height:10px;width:25%"></div>
        </div>
      </div>
      <div class="skel" style="margin:0;border-radius:0;aspect-ratio:4/3;width:100%"></div>
      <div style="padding:13px 14px 18px;display:flex;flex-direction:column;gap:8px">
        <div class="skel" style="height:12px;width:90%"></div>
        <div class="skel" style="height:12px;width:65%"></div>
      </div>`;
    feed.appendChild(sk);
  }
}
function clearSkeletons() {
  document.getElementById('feed').querySelectorAll('.skeleton-card').forEach(s => s.remove());
}

// ─────────────────────────────────────────
// DATA.JSON
// ─────────────────────────────────────────
async function loadPosts() {
  showSkeletons(3);
  try {
    const file = await ghGet('data.json');
    if (file) {
      DATA_SHA = file.sha;
      const json = decodeURIComponent(escape(atob(file.content.replace(/\n/g,''))));
      const parsed = JSON.parse(json);
      POSTS = parsed.posts || [];
      PROFILES = parsed.profiles || {};
    } else {
      const res = await ghPut('data.json', '{"posts":[],"profiles":{}}', null, 'Init data.json');
      DATA_SHA = res.content.sha;
      POSTS = []; PROFILES = {};
    }
  } catch(e) {
    console.error(e);
    POSTS = []; PROFILES = {};
    showToast('Erreur de chargement', 'error');
  }
  clearSkeletons();
  updateHeaderUserUI();
  renderFeed();
  updateNotificationsUI();
}

async function refreshFeed() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  await loadPosts();
  btn.classList.remove('spinning');
  showToast('Fil mis à jour', 'success');
}

async function savePosts() {
  const json = JSON.stringify({ posts: POSTS, profiles: PROFILES }, null, 2);
  try {
    const res = await ghPut('data.json', json, DATA_SHA, 'Update data.json');
    DATA_SHA = res.content.sha;
  } catch(e) {
    if (e.message && (e.message.includes('409') || e.message.includes('422'))) {
      const file = await ghGet('data.json');
      if (file) DATA_SHA = file.sha;
      const res2 = await ghPut('data.json', json, DATA_SHA, 'Update data.json');
      DATA_SHA = res2.content.sha;
    } else throw e;
  }
}

// ─────────────────────────────────────────
// FEED
// ─────────────────────────────────────────
function renderFeed() {
  const feed = document.getElementById('feed');
  feed.querySelectorAll('.post-card').forEach(c => c.remove());
  if (!POSTS.length) { document.getElementById('feed-empty').style.display = 'block'; return; }
  document.getElementById('feed-empty').style.display = 'none';
  [...POSTS].sort((a,b) => b.ts - a.ts).forEach(p => feed.appendChild(buildCard(p)));
  lucide.createIcons();
}

function buildCard(post) {
  const div = document.createElement('div');
  div.className = 'post-card';
  div.id = `card-${post.id}`;
  div.style.position = 'relative';

  const author = getUserProfile(post.userId);
  const isOwn  = post.userId === ME.id;
  const ts = new Date(post.ts).toLocaleDateString('fr-FR', {
    day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'
  });

  const cmtCount = (post.comments || []).length;
  const comments = (post.comments || []).map(c => {
    const cu = getUserProfile(c.userId);
    return `<div class="comment-item">
      ${renderAvatarHtml(c.userId, 'c-avatar')}
      <div class="c-bubble"><div class="c-author">${esc(cu.name)}</div><div class="c-text">${esc(c.text)}</div></div>
    </div>`;
  }).join('');

  const toggleLabel = cmtCount === 0 ? 'Commenter'
    : cmtCount === 1 ? '1 commentaire' : `${cmtCount} commentaires`;

  const imgSrc = post.imgPath
    ? `https://raw.githubusercontent.com/${CFG.owner}/${CFG.repo}/main/${post.imgPath}`
    : null;

  const imgHtml = imgSrc
    ? `<div class="post-img-wrap" onclick="openLightbox('${imgSrc}')" title="Voir en grand">
         <div class="img-skeleton" id="il-${post.id}">
           <span class="icon"><i data-lucide="image" width="32" height="32"></i></span>
         </div>
         <img class="post-img" src="${imgSrc}" alt="photo" loading="lazy"
              onload="document.getElementById('il-${post.id}')?.remove()"
              onerror="this.parentElement.innerHTML='<div style=\\'padding:40px;text-align:center;color:var(--text-muted);display:flex;align-items:center;justify-content:center;gap:8px\\'><i data-lucide=\\'image-off\\' width=\\'24\\'></i> Photo indisponible</div>'; lucide.createIcons()">
       </div>`
    : '';

  const deleteHtml = isOwn
    ? `<button class="post-del" onclick="toggleDeleteConfirm('${post.id}')" title="Supprimer">
         <i data-lucide="trash-2" width="16" height="16"></i>
       </button>
       <div class="delete-confirm" id="dc-${post.id}">
         <span class="del-label">Supprimer ?</span>
         <button class="del-no" onclick="toggleDeleteConfirm('${post.id}')">
           <i data-lucide="x" width="12" height="12"></i> Non
         </button>
         <button class="del-yes" onclick="deletePost('${post.id}')">
           <i data-lucide="trash-2" width="12" height="12"></i> Oui
         </button>
       </div>`
    : '';

  div.innerHTML = `
    <div class="post-header">
      ${renderAvatarHtml(post.userId, 'post-avatar')}
      <div class="post-meta">
        <div class="post-author">${author.name}</div>
        <div class="post-time">${ts}</div>
      </div>
      ${deleteHtml}
    </div>
    ${imgHtml}
    <div class="post-body">
      ${post.caption ? `<div class="post-caption">${esc(post.caption)}</div>` : ''}
      <div class="reactions-row" id="rxrow-${post.id}">${renderReactionsRow(post, ME.id)}</div>
    </div>
    <div id="epwrap-${post.id}"></div>
    <div class="comments-wrap">
      <button class="comments-toggle" id="ctbtn-${post.id}" onclick="toggleComments('${post.id}')">
        <span class="icon ct-arrow"><i data-lucide="chevron-down" width="14" height="14"></i></span>
        <span id="ct-label-${post.id}">${toggleLabel}</span>
      </button>
      <div class="comments-list" id="cmts-${post.id}">${comments}
        <div class="c-input-row">
          <input class="c-input" type="text" placeholder="Un commentaire…" id="ci-${post.id}"
                 onkeydown="if(event.key==='Enter')sendComment('${post.id}')">
          <button class="c-send" onclick="sendComment('${post.id}')">
            <i data-lucide="send" width="14" height="14"></i>
          </button>
        </div>
      </div>
    </div>`;

  return div;
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// ─────────────────────────────────────────
// DELETE CONFIRM (inline)
// ─────────────────────────────────────────
function toggleDeleteConfirm(pid) {
  const dc = document.getElementById(`dc-${pid}`);
  if (!dc) return;
  const isOpen = dc.classList.toggle('open');
  if (isOpen) {
    // Close on outside click
    setTimeout(() => {
      const close = (e) => {
        if (!dc.contains(e.target)) { dc.classList.remove('open'); document.removeEventListener('click', close); }
      };
      document.addEventListener('click', close);
    }, 10);
  }
}

// ─────────────────────────────────────────
// COMMENTS
// ─────────────────────────────────────────
function toggleComments(pid) {
  const list = document.getElementById(`cmts-${pid}`);
  const btn  = document.getElementById(`ctbtn-${pid}`);
  const isOpen = list.classList.toggle('open');
  btn.classList.toggle('open', isOpen);
  if (isOpen) setTimeout(() => document.getElementById(`ci-${pid}`)?.focus(), 100);
}
function openComments(pid) {
  document.getElementById(`cmts-${pid}`)?.classList.add('open');
  document.getElementById(`ctbtn-${pid}`)?.classList.add('open');
}
function updateCommentToggleLabel(pid) {
  const post = POSTS.find(p => p.id === pid); if (!post) return;
  const c = (post.comments || []).length;
  const label = c === 0 ? 'Commenter' : c === 1 ? '1 commentaire' : `${c} commentaires`;
  const el = document.getElementById(`ct-label-${pid}`);
  if (el) el.textContent = label;
}
async function sendComment(pid) {
  const input = document.getElementById(`ci-${pid}`);
  const text = input.value.trim(); if (!text) return;
  input.value = '';
  const post = POSTS.find(p => p.id === pid); if (!post) return;
  post.comments = post.comments || [];
  post.comments.push({ userId: ME.id, text, ts: Date.now() });
  const inputRow = input.closest('.c-input-row');
  const div = document.createElement('div');
  div.className = 'comment-item';
  const meProfile = getUserProfile(ME.id);
  div.innerHTML = `${renderAvatarHtml(ME.id, 'c-avatar')}<div class="c-bubble"><div class="c-author">${esc(meProfile.name)}</div><div class="c-text">${esc(text)}</div></div>`;
  inputRow.parentNode.insertBefore(div, inputRow);
  updateCommentToggleLabel(pid);
  openComments(pid);
  try {
    await savePosts();
    const snippet = text.length > 60 ? text.slice(0, 60) + '…' : text;
    sendPushToPartner(`${meProfile.name} a commenté`, snippet, pid);
  } catch(e) { console.error('Comment save failed:', e); showToast('Erreur de sauvegarde', 'error'); }
}

// ─────────────────────────────────────────
// REACTIONS
// ─────────────────────────────────────────
function renderReactionsRow(post, meId) {
  const rxMap = {};
  (post.reactions || []).forEach(r => {
    if (!rxMap[r.emoji]) rxMap[r.emoji] = { count:0, mine:false };
    rxMap[r.emoji].count++;
    if (r.userId === meId) rxMap[r.emoji].mine = true;
  });
  const rxBtns = Object.entries(rxMap).map(([e,v]) =>
    `<button class="rxn-btn${v.mine?' mine':''}" onclick="toggleRxn('${post.id}','${e}')">${e}<span class="cnt">${v.count>1?v.count:''}</span></button>`
  ).join('');
  return `${rxBtns}<button class="add-rxn-btn" onclick="togglePicker('${post.id}')"><i data-lucide="smile-plus" width="15" height="15"></i></button>`;
}
function togglePicker(pid) {
  const wrap = document.getElementById(`epwrap-${pid}`);
  let picker = document.getElementById(`ep-${pid}`);
  if (!picker) {
    const html = document.getElementById('ep-tpl').innerHTML.replaceAll('ID', pid);
    wrap.innerHTML = html;
    picker = document.getElementById(`ep-${pid}`);
    picker.querySelectorAll('.ep-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleRxn(pid, btn.dataset.e));
    });
  }
  picker.classList.toggle('open');
}
async function toggleRxn(pid, emoji) {
  const post = POSTS.find(p => p.id === pid); if (!post) return;
  post.reactions = post.reactions || [];
  const idx = post.reactions.findIndex(r => r.userId === ME.id && r.emoji === emoji);
  const wasAdded = idx < 0;
  if (idx >= 0) post.reactions.splice(idx,1);
  else post.reactions.push({ userId: ME.id, emoji });
  document.getElementById(`ep-${pid}`)?.classList.remove('open');
  const row = document.getElementById(`rxrow-${pid}`);
  if (row) {
    row.innerHTML = renderReactionsRow(post, ME.id);
    lucide.createIcons({ nodes: [row] });
  }
  await savePosts();
  if (wasAdded) {
    const meProfile = getUserProfile(ME.id);
    sendPushToPartner(`${meProfile.name} a réagi ${emoji}`, 'à votre moment', pid);
  }
}

// ─────────────────────────────────────────
// NEW POST
// ─────────────────────────────────────────
let pickedFile = null;

function openModal()  { document.getElementById('modal').classList.add('open'); }
function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('caption').value = '';
  document.getElementById('file-in').value = '';
  document.getElementById('preview').style.display = 'none';
  document.getElementById('uz').style.display = 'block';
  document.getElementById('up-status').textContent = '';
  document.getElementById('btn-post').disabled = false;
  document.getElementById('char-count').textContent = '0 / 500';
  document.getElementById('char-count').classList.remove('warn');
  pickedFile = null;
}
function bgClose(e) { if (e.target === e.currentTarget) closeModal(); }

function updateCharCount() {
  const len = document.getElementById('caption').value.length;
  const el = document.getElementById('char-count');
  el.textContent = `${len} / 500`;
  el.classList.toggle('warn', len > 450);
}

function previewImg(e) {
  pickedFile = e.target.files[0]; if (!pickedFile) return;
  const prev = document.getElementById('preview');
  prev.src = URL.createObjectURL(pickedFile);
  prev.style.display = 'block';
  document.getElementById('uz').style.display = 'none';
}

function setStatus(msg, showSpinner = false) {
  const el = document.getElementById('up-status');
  if (!msg) { el.textContent = ''; return; }
  el.innerHTML = showSpinner ? `<div class="spinner"></div> ${msg}` : msg;
}

async function submitPost() {
  const caption = document.getElementById('caption').value.trim();
  if (!pickedFile && !caption) return;
  document.getElementById('btn-post').disabled = true;
  let imgPath = null;

  if (pickedFile) {
    if (pickedFile.size > 10 * 1024 * 1024) {
      setStatus('Photo trop lourde (max 10 Mo)');
      showToast('Photo trop lourde — max 10 Mo', 'error');
      document.getElementById('btn-post').disabled = false; return;
    }
    setStatus('Upload de la photo…', true);
    try {
      const ext = pickedFile.name.split('.').pop().toLowerCase();
      imgPath = `photos/${Date.now()}_${Math.random().toString(36).slice(2,6)}.${ext}`;
      await ghPutBinary(imgPath, await pickedFile.arrayBuffer(), null, `Photo: ${imgPath}`);
    } catch(e) {
      console.error('Upload error:', e);
      setStatus('Erreur upload : ' + e.message);
      showToast('Échec de l\'upload', 'error');
      document.getElementById('btn-post').disabled = false; return;
    }
  }

  setStatus('Sauvegarde…', true);
  const post = {
    id: `p${Date.now()}${Math.random().toString(36).slice(2,5)}`,
    userId: ME.id, caption, imgPath, ts: Date.now(), reactions: [], comments: []
  };
  POSTS.unshift(post);
  try {
    await savePosts();
    closeModal();
    renderFeed();
    showToast('Moment partagé !', 'success');
    const meProfile = getUserProfile(ME.id);
    const snippet = caption ? (caption.length > 60 ? caption.slice(0, 60) + '…' : caption) : 'Nouvelle photo à découvrir 📸';
    sendPushToPartner(`${meProfile.name} a partagé un nouveau moment`, snippet, post.id);
  } catch(e) {
    POSTS.shift();
    setStatus('Erreur de sauvegarde');
    showToast('Erreur de sauvegarde', 'error');
    document.getElementById('btn-post').disabled = false;
  }
}

// ─────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────
async function deletePost(pid) {
  POSTS = POSTS.filter(p => p.id !== pid);
  document.getElementById(`card-${pid}`)?.remove();
  if (!POSTS.length) document.getElementById('feed-empty').style.display = 'block';
  await savePosts();
  showToast('Moment supprimé', '');
}
