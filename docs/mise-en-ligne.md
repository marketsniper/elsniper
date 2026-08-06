# Mise en ligne de zanziGo — pas à pas

Deux façons de faire pour chaque étape : **vous cliquez** (5 minutes, guidé
ci-dessous), ou **vous donnez une clé d'accès à Claude** qui fait tout à
distance. Les deux mènent au même résultat.

## Étape 1 — Mettre le serveur en ligne (Render, gratuit)

Tout est déjà configuré dans le dépôt ([`render.yaml`](../render.yaml) :
base PostgreSQL + API + secrets générés + migrations automatiques).

**Option A — vous cliquez :**

1. Créez un compte sur [render.com](https://render.com) → « Sign up with GitHub ».
2. Cliquez « New → Blueprint ».
3. Choisissez le dépôt `marketsniper/elsniper` → « Connect ».
4. Render lit `render.yaml` et affiche « zanzigo-api » + « zanzigo-db » → « Apply ».
5. Attendez ~3 minutes. L'URL publique de l'API s'affiche sur la page du
   service `zanzigo-api` (ex. `https://zanzigo-api.onrender.com`).
6. Vérifiez : ouvrez `https://<votre-url>/health` → doit répondre `{"status":"ok"}`.

**Option B — Claude s'en charge :** dans Render, « Account Settings →
API Keys → Create API Key », et collez la clé dans la conversation Claude.

> Plans gratuits : l'API s'endort après 15 min d'inactivité (1er appel plus
> lent), et la base gratuite expire après 30 jours — passer en payant
> (~7 $/mois) avant un vrai lancement.

## Étape 2 — Construire l'app installable (Expo / EAS)

Le dépôt est déjà connecté à votre compte Expo. Il reste deux réglages puis
le build.

**Option A — vous cliquez :**

1. Sur [expo.dev](https://expo.dev), ouvrez votre projet.
2. Dans le projet : « Settings » (ou l'onglet GitHub) → **Base directory** :
   mettez `mobile` (l'app est dans le sous-dossier `mobile/` du dépôt).
3. Toujours dans le projet, copiez le **Project ID** (visible dans
   l'aperçu du projet) et donnez-le à Claude — il doit être inscrit dans
   `mobile/app.json` pour que les builds passent. (Ou collez-le vous-même
   dans `app.json` : `"extra": { "eas": { "projectId": "<ID>" } }`.)
4. Onglet « Builds » → « Build from GitHub » → branche par défaut →
   profil **preview** → plateforme **Android**.
5. À la fin (~15 min), le build donne un lien/QR : ouvrez-le sur un
   téléphone Android → le fichier APK s'installe directement. Partagez ce
   lien à qui vous voulez (votre père, des testeurs).

**Option B — Claude s'en charge :** sur expo.dev, cliquez votre avatar →
« Account settings → Access tokens → Create token », et collez le jeton
dans la conversation Claude. Il fera la liaison, le build et vous enverra
le lien d'installation.

> iPhone : l'installation hors App Store nécessite un compte Apple
> Developer (99 $/an) ou TestFlight — à prévoir plus tard. Android suffit
> pour les premiers tests.

## Étape 3 — Brancher l'app sur le serveur en ligne

Quand l'URL Render est connue : elle doit être inscrite dans
`mobile/eas.json` (champ `EXPO_PUBLIC_API_URL`, actuellement
`https://zanzigo-api.onrender.com/api`). Si votre URL Render est
différente, donnez-la à Claude (ou modifiez les deux occurrences) puis
relancez un build preview.

## Étape 4 — Le numéro WhatsApp de l'équipe

Les boutons « Contacter l'équipe » de l'app ouvrent WhatsApp vers le numéro
configuré sur le serveur (`TEAM_WHATSAPP_NUMBER`, dashboard Render →
zanzigo-api → Environment). Mettez votre propre numéro au format
international (ex. `+33612345678`) pour les tests.

## Plus tard (avant le vrai lancement)

- Clés **Pesapal** (compte marchand) → active le paiement réel, sans
  changer le code.
- **Cloudflare R2** (ou S3) → stockage durable des photos et documents.
- Fournisseur **SMS** (Twilio / Africa's Talking) → vrais codes OTP par SMS.
- Passage des plans Render en payant + sauvegardes de la base.
