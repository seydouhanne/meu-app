const test = require('node:test');
const assert = require('node:assert/strict');
const { getNotifications, formatNotifTime } = require('./notifications.js');

test('empty posts produce no notifications', () => {
  assert.deepEqual(getNotifications([], 'user1', 'Antiss'), []);
});

test('missing meId or posts returns an empty list rather than throwing', () => {
  assert.deepEqual(getNotifications([{ id: 'p1', userId: 'user2', ts: 1 }], null, 'Antiss'), []);
  assert.deepEqual(getNotifications(null, 'user1', 'Antiss'), []);
});

test('a post from the partner produces a notification, one from me does not', () => {
  const posts = [
    { id: 'p1', userId: 'user2', ts: 100, comments: [], reactions: [] },
    { id: 'p2', userId: 'user1', ts: 200, comments: [], reactions: [] }
  ];
  const notifs = getNotifications(posts, 'user1', 'Antiss');
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].postId, 'p1');
  assert.equal(notifs[0].type, 'post');
  assert.match(notifs[0].text, /Antiss/);
});

test('a comment from the partner on my own post is labelled "votre moment"', () => {
  const posts = [{
    id: 'p1', userId: 'user1', ts: 100,
    comments: [{ userId: 'user2', text: 'Bravo !', ts: 150 }],
    reactions: []
  }];
  const notifs = getNotifications(posts, 'user1', 'Antiss');
  assert.equal(notifs.length, 1);
  assert.match(notifs[0].text, /votre moment/);
});

test('a comment from the partner on their own post is labelled "un moment"', () => {
  const posts = [{
    id: 'p1', userId: 'user2', ts: 100,
    comments: [{ userId: 'user2', text: 'Bravo !', ts: 150 }],
    reactions: []
  }];
  const notifs = getNotifications(posts, 'user1', 'Antiss');
  // One for the post itself, one for the comment.
  assert.equal(notifs.length, 2);
  const comment = notifs.find(n => n.type === 'comment');
  assert.match(comment.text, /un moment/);
});

test('a comment from me does not produce a notification', () => {
  const posts = [{
    id: 'p1', userId: 'user2', ts: 100,
    comments: [{ userId: 'user1', text: 'Merci !', ts: 150 }],
    reactions: []
  }];
  const notifs = getNotifications(posts, 'user1', 'Antiss');
  assert.equal(notifs.filter(n => n.type === 'comment').length, 0);
});

test('a long comment is truncated and HTML-escaped in the notification text', () => {
  const longText = 'a'.repeat(50) + ' <script>';
  const posts = [{
    id: 'p1', userId: 'user1', ts: 100,
    comments: [{ userId: 'user2', text: longText, ts: 150 }],
    reactions: []
  }];
  const notifs = getNotifications(posts, 'user1', 'Antiss');
  assert.ok(!notifs[0].text.includes('<script>'));
  assert.ok(notifs[0].text.includes('…'));
});

test('a reaction from the partner produces a notification', () => {
  const posts = [{
    id: 'p1', userId: 'user1', ts: 100, comments: [],
    reactions: [{ userId: 'user2', emoji: '❤️' }]
  }];
  const notifs = getNotifications(posts, 'user1', 'Antiss');
  assert.equal(notifs.length, 1);
  assert.equal(notifs[0].type, 'reaction');
});

test('notifications are sorted newest-first', () => {
  const posts = [
    { id: 'p1', userId: 'user2', ts: 100, comments: [], reactions: [] },
    { id: 'p2', userId: 'user2', ts: 300, comments: [], reactions: [] },
    { id: 'p3', userId: 'user2', ts: 200, comments: [], reactions: [] }
  ];
  const notifs = getNotifications(posts, 'user1', 'Antiss');
  assert.deepEqual(notifs.map(n => n.ts), [300, 200, 100]);
});

test('formatNotifTime handles the recent buckets', () => {
  const now = Date.now();
  assert.equal(formatNotifTime(now), "À l'instant");
  assert.match(formatNotifTime(now - 5 * 60 * 1000), /min$/);
  assert.match(formatNotifTime(now - 5 * 3600 * 1000), / h$/);
});

test('formatNotifTime handles no timestamp', () => {
  assert.equal(formatNotifTime(null), '');
  assert.equal(formatNotifTime(undefined), '');
});
