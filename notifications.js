// ─────────────────────────────────────────
// Notifications — pure derivation, no DOM, no fetch, no globals.
// getNotifications(posts, meId, partnerName) is the seam; see
// notifications.test.js. Runs as a classic browser script (defines
// globals) and as a CommonJS module (for `node --test`).
// ─────────────────────────────────────────
function escText(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

function getNotifications(posts, meId, partnerName) {
  if (!meId || !posts) return [];
  const list = [];
  const partnerId = meId === 'user1' ? 'user2' : 'user1';

  posts.forEach(p => {
    // 1. Partner shared a moment
    if (p.userId === partnerId) {
      list.push({
        id: `post_${p.id}`,
        postId: p.id,
        type: 'post',
        icon: 'image',
        text: `<strong>${partnerName}</strong> a partagé un nouveau moment`,
        ts: p.ts
      });
    }

    // 2. Partner commented
    (p.comments || []).forEach((c, idx) => {
      if (c.userId === partnerId) {
        const snippet = c.text.length > 35 ? c.text.slice(0, 35) + '…' : c.text;
        const targetLabel = p.userId === meId ? 'votre moment' : 'un moment';
        list.push({
          id: `cmt_${p.id}_${c.ts}_${idx}`,
          postId: p.id,
          type: 'comment',
          icon: 'message-square',
          text: `<strong>${partnerName}</strong> a commenté ${targetLabel} : <em>« ${escText(snippet)} »</em>`,
          ts: c.ts
        });
      }
    });

    // 3. Partner reacted
    (p.reactions || []).forEach(r => {
      if (r.userId === partnerId) {
        const targetLabel = p.userId === meId ? 'votre moment' : 'un moment';
        list.push({
          id: `rxn_${p.id}_${r.userId}_${r.emoji}`,
          postId: p.id,
          type: 'reaction',
          icon: 'heart',
          text: `<strong>${partnerName}</strong> a réagi ${r.emoji} à ${targetLabel}`,
          ts: p.ts || Date.now()
        });
      }
    });
  });

  return list.sort((a,b) => b.ts - a.ts);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getNotifications, formatNotifTime };
}
