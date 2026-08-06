# zanziGo — application mobile

Application Expo (React Native + TypeScript + expo-router) pour zanziGo :
courses taxi et livraison de colis à Zanzibar. Elle consomme l'API du
backend situé dans `../backend`.

## Prérequis

- Node 22+
- L'application **Expo Go** sur votre téléphone (Android / iOS)
- Le backend zanziGo démarré : `cd ../backend && npm run dev` (port 3000)

## Configuration de l'API

L'URL de base de l'API se règle via la variable `EXPO_PUBLIC_API_URL`
(défaut : `http://localhost:3000/api`, qui ne fonctionne **que** sur un
émulateur tournant sur la même machine que le backend).

Avec Expo Go sur un vrai téléphone, utilisez l'**IP locale** de la machine
qui héberge le backend (téléphone et machine sur le même réseau Wi-Fi) :

```bash
# Exemple : la machine de dev a l'IP 192.168.1.10
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000/api npx expo start
```

Vous pouvez aussi créer un fichier `.env` à la racine de `mobile/` :

```
EXPO_PUBLIC_API_URL=http://192.168.1.10:3000/api
```

Astuce : `npx expo start` affiche l'IP utilisée par Metro (`exp://192.168.x.x`),
c'est généralement la bonne IP à réutiliser pour l'API.

## Lancer l'application

```bash
cd mobile
npm install
npx expo start
```

Puis scannez le QR code affiché avec Expo Go (Android) ou l'appareil photo
(iOS).

## Comptes de test (flux OTP en mode dev)

Hors production, le backend renvoie le code OTP directement dans la réponse
de `POST /auth/request-otp` (champ `devCode`). L'écran de saisie du code
l'affiche automatiquement : « Mode dev — code : 123456 ».

Parcours type :

1. **Nouveau client** : entrez n'importe quel numéro au format international
   (ex. `+255 712 345 678`), validez le `devCode` affiché, choisissez
   « Je suis client » et remplissez le formulaire (nom, e-mail optionnel,
   langue). La vérification « résident » est ensuite activée par l'équipe
   (`PATCH /users/:id/verify`) et apparaît en badge sur le profil.
2. **Chauffeur** : connectez-vous avec le numéro d'un chauffeur existant côté
   backend (table `drivers`) : l'application bascule automatiquement en mode
   chauffeur (onglets « Mes courses » / « Scanner » / « Profil »).
3. **Hôtel** : idem avec le numéro d'un hôtel existant ; l'envoi de colis se
   fait alors au nom de l'hôtel et la liste des colis vient de
   `GET /hotels/:id/packages`.

## Fonctionnalités

- **Réserver** : formule de course (privée, navette touristes, partagée
  locale, retour affiché), départ/arrivée, distance estimée, course
  programmée optionnelle. Estimation locale du prix (même barème que le
  serveur : 3 000 TZS + 1 500 TZS/km, minimum 5 000 TZS) ; le prix officiel
  est calculé et **figé** par le backend à la création du trajet.
- **Mes trajets** : suivi des statuts (en attente → chauffeur assigné → en
  cours → terminée), paiement Pesapal via le `payment_link` renvoyé par
  `POST /trips/:id/payment`, notation 1 à 5 étoiles quand la course est
  terminée (`POST /trips/:id/rating {stars, comment}`), contact WhatsApp.
- **Colis** : création d'un envoi (destinataire + téléphone international,
  distance), affichage du QR code `ZG-…` à présenter au chauffeur, suivi
  en attente de collecte → récupéré → livré, paiement de l'envoi.
- **Mode chauffeur** : ouverture d'une course par son identifiant (transmis
  par le dispatch de l'équipe — l'API n'expose pas encore de liste par
  chauffeur), démarrage/fin de course par scan du QR du véhicule, scan d'un
  QR colis (`ZG-…`) pour la collecte et la livraison avec photo de preuve
  (envoyée vers `/uploads`).

## Notes techniques

- Le jeton JWT est stocké dans `expo-secure-store` et envoyé en
  `Authorization: Bearer` sur chaque requête (`src/lib/api.ts`).
- Les erreurs backend `{error:{code,message,details}}` sont converties en
  `ErreurApi` et affichées en français dans les écrans.
- La liste des colis d'un **utilisateur** est reconstituée à partir des ids
  mémorisés localement (SecureStore), l'API n'exposant pas de liste par
  expéditeur ; les hôtels utilisent `GET /hotels/:id/packages`.
- Vérification TypeScript : `npx tsc --noEmit`.
