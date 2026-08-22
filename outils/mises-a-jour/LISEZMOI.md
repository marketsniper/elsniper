# Les mises à jour de l'application, en clair

## Ce qui part tout seul, et ce qui ne part pas

L'application installée sur un téléphone est faite de deux couches.

| Couche | Ce que c'est | Comment elle change |
|---|---|---|
| **Le JavaScript** | Tous les écrans, les textes, les couleurs, les prix, les images | **Part tout seul** en quelques secondes, à la prochaine ouverture |
| **Le socle natif** | L'appareil photo, le GPS, le flou, le lecteur de code-barres, les paiements | **Ne bouge JAMAIS** sans réinstaller l'application |

Neuf modifications sur dix ne touchent que le JavaScript : elles partent
seules. La dixième — ajouter une carte, des notifications, un module de
paiement — exige une nouvelle application à réinstaller chez tout le monde.

## Le vrai danger n'est pas celui qu'on croit

On imagine qu'envoyer du JavaScript trop récent fait planter les téléphones.
**C'est faux dans le cas qu'on redoute, et vrai dans celui qu'on ne voit pas.**

Chaque application porte un **socle**, gravé dedans le jour de sa
construction. Aujourd'hui : `exposdk:54.0.0`. Chaque mise à jour publiée porte
elle aussi un socle. La règle du système est une égalité stricte.

- **Socles différents** → la mise à jour n'est même pas téléchargée.
  L'application continue sur son JavaScript d'origine. **Pas de plantage —
  du silence.** C'est le pire : on corrige un défaut pendant des semaines
  pour quelqu'un qui ne l'a jamais reçu.
- **Socles identiques mais natif différent** → l'application accepte la mise
  à jour, puis appelle du code qu'elle n'a pas. **C'est là que ça casse.**

Et c'est exactement ce que produit notre réglage actuel : le socle
`exposdk:54.0.0` **ne bouge pas** quand on ajoute un module natif. Rien ne
nous arrête.

## C'est arrivé le 21 août 2026

`expo-blur` (le verre dépoli des cartes) est entré dans le projet ce jour-là.
L'application des chauffeurs datait du 16 août et ne le contenait pas. Le
garde écrit à l'époque — un `try / catch` autour du chargement — ne gardait
rien : ce module ne lève pas d'erreur quand il manque, il se contente d'un
avertissement, et seulement en développement. Chaque carte de chaque écran a
donc monté une vue que le téléphone ne connaissait pas.

Deux corrections en sont sorties :

1. **Une vraie sonde**, `requireOptionalNativeModule('ExpoBlurView')`, qui
   renvoie « absent » au lieu de faire semblant.
2. **Un test qui refuse la publication**, `backend/test/imports-natifs.test.js`.
   Il lit `mobile/binaire.json` — la liste de ce que l'application installée
   sait vraiment faire — et compare au code. Vérifié en le cassant : il
   retrouve la faute d'expo-blur et échoue.

## Le fichier qui fait autorité : `mobile/binaire.json`

Il décrit **l'application réellement distribuée** : son socle, sa date, son
lien de téléchargement, et les 33 modules natifs qu'elle contient.

Il se met à jour **à la main, le jour où une nouvelle application est
diffusée**. C'est volontaire : s'il se recalculait depuis `package.json`, il
dirait toujours que tout va bien — `package.json` est précisément ce qui
dérive.

## Les trois commandes

```bash
# Publier une mise à jour (le test de sûreté tourne d'abord)
bash outils/mises-a-jour/publier.sh "ce que change cette version"

# Le frein d'urgence — l'application est cassée sur les téléphones
bash outils/mises-a-jour/frein-durgence.sh

# Savoir sur quel socle on est
cd mobile && node node_modules/expo-updates/bin/cli.js runtimeversion:resolve --platform android
```

Le frein renvoie les téléphones au JavaScript **du jour où l'application a
été construite**. Plus cette application vieillit, plus le frein recule loin.
D'où une règle simple : **reconstruire l'APK régulièrement, même sans rien
changer** — pas pour livrer, pour rapprocher le filet.

## Le jour où il faudra du natif

Notifications sur le téléphone du chauffeur, vraie carte glissante, module de
paiement mobile : chacun coûte une nouvelle application à réinstaller chez
tout le monde. **Les regrouper**, donc, plutôt que de les faire arriver un
par un.

Le jour venu :

1. Construire la nouvelle application, la diffuser, mettre `binaire.json` à
   jour.
2. Publier le même code pour les deux générations, le temps que les
   chauffeurs réinstallent :
   ```bash
   bash outils/mises-a-jour/publier.sh "…" --aussi exposdk:54.0.0
   ```
   (Il n'existe aucun drapeau pour choisir le socle d'une publication : la
   seule voie est de modifier `app.json` entre deux publications. Le script
   le fait puis le défait.)

## Pourquoi on ne bascule PAS sur le réglage « empreinte » aujourd'hui

Le réglage `fingerprint` calcule le socle à partir de tout ce qui touche au
natif — il aurait bloqué l'affaire d'expo-blur tout seul. C'est le réglage
correct **à terme**.

Mais son empreinte inclut aussi `eas.json` **et les icônes de
l'application** : changer une adresse de serveur ou remplacer une icône
suffirait à créer un nouveau socle et à **couper des mises à jour toutes les
applications déjà installées**, sans qu'une ligne de code natif ait bougé. On
remplacerait un risque de casse visible par un risque de silence, qui est
bien plus difficile à voir.

**Décision : on reste sur `sdkVersion`, le test tient la garde, et on
basculera sur `fingerprint` le jour du prochain vrai build natif** — quand il
y aura de toute façon une nouvelle application à installer, donc rien à
orpheliner.

## Comment savoir, depuis un téléphone, si les mises à jour arrivent

Dans l'application : **Mon compte → Version de l'application**. Deux lignes y
apparaissent désormais :

- « Cette application reçoit bien les mises à jour. » — tout va bien.
- « Cette application **ne reçoit plus** les mises à jour — réinstallez-la. »
  — le socle ne correspond plus. C'est le témoin qui manquait.

Suivi du socle et du canal en dessous. Ces lignes n'existent que dans
l'application installée : sur le web, il n'y a pas de mise à jour à distance.
