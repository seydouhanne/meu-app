// Me&U — Config
window.CFG = {
  _tk: ["dU15aE5vcWthUUlWYzM0b1Q4Rw==","Z2hwX3NFandtY21tWHpXRUQ3dFJM"],
  owner: "seydouhanne",
  repo:  "meu-app",
  users: {
    user1: { name: "Saidou", emoji: "🦄", hash: "a3cb61aad8ae0c27ada5889dd7f2af97d7c774f42d666893d5a9f2139688f05a" },
    user2: { name: "Antiss", emoji: "👸🏽", hash: "a3cb61aad8ae0c27ada5889dd7f2af97d7c774f42d666893d5a9f2139688f05a" }
  },
  push: {
    // Remplace par l'URL de ton Worker une fois déployé (ex: https://meu-push.tonpseudo.workers.dev)
    workerUrl: "https://meu-push.YOUR-SUBDOMAIN.workers.dev",
    // Clé publique VAPID générée pour cette app — sans risque à exposer côté client.
    vapidPublicKey: "BEMZA5KNxjQu_VhUTdtCJ3hybLxnpLLVr3Iq0I9BR_BUuKndqUhZ5FzvdbIIxrSIQaMDm6rq-lnDjjOM0wsBnaA",
    // Doit être identique à la valeur définie via `wrangler secret put APP_SECRET` sur le Worker.
    secret: "HrcgcqMs9HJEjUFLqfKlpR0ueC1KCg3_"
  }
};