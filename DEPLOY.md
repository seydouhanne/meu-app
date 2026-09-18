# Déploiement du Worker — guide

Le Worker fait maintenant deux choses : (1) envoyer les notifications
push, comme avant, et (2) tenir le token GitHub côté serveur et servir
de passerelle pour toutes les lectures/écritures de `data.json` et des
photos. **L'app ne peut plus se connecter du tout tant que le Worker
n'est pas déployé** — ce n'est plus une fonctionnalité optionnelle.

⚠️ Si tu avais un ancien token GitHub généré via l'écran Setup de
l'app (stocké dans `config.js`), il a été exposé publiquement — révoque-le
sur https://github.com/settings/tokens et crées-en un nouveau pour
l'étape 4 ci-dessous. `config.js` ne contient plus aucun secret
maintenant : plus besoin de garder le repo privé pour ça.

## 1. Prérequis

- Un compte Cloudflare gratuit → https://dash.cloudflare.com/sign-up
- Node.js installé sur ton ordi
- Un nouveau token GitHub (scope `repo` uniquement) → https://github.com/settings/tokens/new?scopes=repo&description=MeU-App

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

Cette dernière commande affiche un `id`. Ouvre `worker/wrangler.toml` et
remplace `REPLACE_WITH_KV_NAMESPACE_ID` par cet id.

Vérifie aussi `ALLOWED_ORIGIN`, `GITHUB_OWNER` et `GITHUB_REPO` dans
`worker/wrangler.toml` — `ALLOWED_ORIGIN` doit correspondre à l'URL de
ton site déployé.

## 4. Configurer les secrets

Depuis `worker/` :

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put USER1_HASH
npx wrangler secret put USER2_HASH
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put APP_SECRET
```

- `GITHUB_TOKEN` : le nouveau token créé à l'étape 1. Ne va **jamais**
  dans `config.js` ni dans le repo.
- `USER1_HASH` / `USER2_HASH` : générés par l'écran Setup de l'app en
  même temps que `config.js` (section "Copie ces valeurs" sous le
  code généré). Ce sont des hash, pas les mots de passe eux-mêmes.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` : génère ta propre paire
  (depuis `worker/`, où `web-push` est déjà installé) :

  ```bash
  npx web-push generate-vapid-keys
  ```

  Copie la clé publique dans `config.js` (`push.vapidPublicKey`) en
  plus de la mettre en secret ici — c'est la seule des deux qui va
  aussi côté client, et ce n'est pas sensible (elle est faite pour
  être publique).
- `APP_SECRET` : une valeur aléatoire à toi, par exemple :

  ```bash
  node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
  ```

  Colle-la aussi dans `config.js` (`push.secret`) — les deux copies
  doivent être identiques.

Ne mets aucune de ces valeurs dans un fichier commité autre que
`config.js` pour la clé publique VAPID et le secret app — ni dans ce
guide, ni ailleurs. C'est exactement le problème que ce Worker existe
pour éviter côté token GitHub ; pas de raison de le recréer ici.

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

par l'URL réelle obtenue à l'étape 5, puis pousse `config.js` sur le
repo. **Sans cette étape, personne ne peut se connecter** (le login
passe désormais par le Worker).

## 7. Pousser les fichiers vers ton repo GitHub

Ajoute/remplace ces fichiers à la racine du repo `meu-app` :

- `index.html`, `app.js`, `data-store.js`, `style.css` (modifiés)
- `config.js` (modifié — plus de token, plus de hash, `workerUrl` à jour)
- `sw.js`, `manifest.json`, les icônes (déjà en place)

Le dossier `worker/` peut rester dans ce repo (il n'affecte pas le
site statique) ou vivre à part — seul `npx wrangler deploy` compte
pour lui, pas le déploiement du site.

## 8. Tester

1. Ouvrez l'app — l'écran de connexion doit maintenant passer par le
   Worker. Un mauvais mot de passe doit toujours afficher "Mot de
   passe incorrect" (le Worker répond 401, l'app ne distingue pas ce
   cas d'une panne réseau côté message).
2. Postez/commentez/réagissez — chaque action passe maintenant par
   `POST/GET /gh/*` sur le Worker plutôt que par `api.github.com`
   directement.
3. Cliquez sur la cloche 🔔 → l'icône `bell-ring`, autorisez les
   notifications.
4. **Sur iPhone** : *Partager → Sur l'écran d'accueil*, ouvrez l'app
   depuis cette icône avant d'autoriser les notifications.
5. **Sur Android/desktop** : ça marche directement depuis le
   navigateur.
6. Fermez l'app sur un téléphone, postez depuis l'autre → la
   notification doit arriver en quelques secondes.

## Sécurité — bon à savoir

Le token GitHub et les hash par défaut des mots de passe vivent
uniquement dans les secrets du Worker maintenant — jamais dans le
code servi au navigateur. `APP_SECRET` reste utilisé tel quel pour
les routes push (`/subscribe`, `/unsubscribe`, `/send`) : le pire cas
avec ce secret reste l'envoi de fausses notifications, pas un accès
aux données. Les routes `/gh/*` utilisent un jeton de session
distinct, signé par le Worker et valable 24h, obtenu uniquement après
une connexion réussie.
