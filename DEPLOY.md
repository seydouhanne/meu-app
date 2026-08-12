# Activer les notifications push — Guide de déploiement

Ce que ça change : quand Saidou ou Antiss poste, commente ou réagit, l'autre
reçoit une vraie notification sur son téléphone/ordi, **même app fermée**.

Il y a deux parties à déployer : le **Worker** (le petit service qui envoie
les push) et les **fichiers de l'app** (à pousser dans ton repo GitHub comme
d'habitude).

Clés déjà générées pour toi (à utiliser telles quelles, ou à régénérer si tu préfères) :

```
VAPID_PUBLIC_KEY  = BEMZA5KNxjQu_VhUTdtCJ3hybLxnpLLVr3Iq0I9BR_BUuKndqUhZ5FzvdbIIxrSIQaMDm6rq-lnDjjOM0wsBnaA
VAPID_PRIVATE_KEY = LLGaXKuRQHozFPBvCFAsdmJqAjf40uC_iB7clDxA0Mk
APP_SECRET        = HrcgcqMs9HJEjUFLqfKlpR0ueC1KCg3_
```

⚠️ `VAPID_PRIVATE_KEY` et `APP_SECRET` ne doivent **jamais** aller dans
`config.js` ou GitHub — uniquement dans les secrets du Worker (étape 4).
La clé publique VAPID, elle, est déjà dans `config.js` : rien à faire.

## 1. Prérequis

- Un compte Cloudflare gratuit → https://dash.cloudflare.com/sign-up
- Node.js installé sur ton ordi

## 2. Installer les dépendances du Worker

```bash
cd worker
npm install
```

## 3. Se connecter à Cloudflare et créer le stockage

```bash
npx wrangler login
npx wrangler kv namespace create PUSH_SUBS
```

Cette dernière commande affiche un `id`. Ouvre `wrangler.toml` et remplace
`REPLACE_WITH_KV_NAMESPACE_ID` par cet id.

Vérifie aussi la ligne `ALLOWED_ORIGIN` dans `wrangler.toml` — elle doit
correspondre à l'URL de ton site (`https://seydouhanne.github.io` par
défaut, à changer si tu utilises un domaine personnalisé).

## 4. Configurer les secrets

```bash
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put APP_SECRET
```

Colle la valeur correspondante à chaque invite (voir tableau ci-dessus).

## 5. Déployer

```bash
npx wrangler deploy
```

Note l'URL affichée à la fin, du type :
`https://meu-push.tonpseudo.workers.dev`

## 6. Brancher l'app sur le Worker

Ouvre `config.js` et remplace :

```js
workerUrl: "https://meu-push.YOUR-SUBDOMAIN.workers.dev",
```

par l'URL réelle obtenue à l'étape 5.

## 7. Pousser les fichiers vers ton repo GitHub

Ajoute/remplace ces fichiers à la racine du repo `meu-app` (à côté de
`index.html` existant) :

- `index.html` (modifié)
- `config.js` (modifié)
- `sw.js` (nouveau)
- `manifest.json` (nouveau)
- `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` (nouveaux)

Le dossier `worker/` ne va **pas** dans ce repo — il vit uniquement sur
Cloudflare (déployé à l'étape 5). Tu peux le garder de côté dans un dossier
local, ou dans un repo séparé si tu veux le versionner.

## 8. Tester

1. Ouvrez l'app sur vos téléphones respectifs.
2. Cliquez sur la cloche 🔔 → l'icône `bell-ring` dans le panneau de
   notifications, puis autorisez les notifications.
3. **Sur iPhone** : Safari seul ne suffit pas pour le push app-fermée — il
   faut d'abord faire *Partager → Sur l'écran d'accueil*, puis ouvrir l'app
   depuis cette icône (pas depuis Safari) avant d'autoriser les
   notifications.
4. **Sur Android/desktop** : ça marche directement depuis le navigateur,
   sans installation.
5. Fermez complètement l'app sur un téléphone, postez/commentez/réagissez
   depuis l'autre → la notification doit arriver en quelques secondes.

## Sécurité — bon à savoir

`APP_SECRET` et la clé VAPID publique sont dans `config.js`, donc visibles
par quiconque a accès au code de la page (comme votre token GitHub
actuel). Le pire cas possible : quelqu'un ayant ce secret pourrait envoyer
de fausses notifications à vos deux comptes — pas un accès aux photos ou
aux données. Si un jour tu veux le changer, relance juste
`npx wrangler secret put APP_SECRET` avec une nouvelle valeur et mets à
jour `config.js` en conséquence.
