# CLRE-Launcher

Un launcher de jeux pour Windows qui réunit toute ta bibliothèque au même endroit : Steam, Epic Games, GOG, Ubisoft Connect, EA app, Xbox / Game Pass PC, Battle.net, Riot, Amazon Games, itch.io, et les jeux que tu ajoutes toi-même.

Il lit directement les fichiers que chaque plateforme garde sur ton PC : pour tout afficher et lancer, tu n'as aucun compte à connecter, et tes données restent sur ta machine.

Il sait aussi **installer tes jeux GOG et Epic sans GOG Galaxy ni le Epic Games Launcher**. Là, et seulement là, il faut connecter ton compte GOG ou Epic.

> **Fork macOS** — ce guide décrit la version Windows d'origine. Sur macOS, l'interface et
> les fiches de jeu sont les mêmes, mais les plateformes détectées et les fonctions
> disponibles diffèrent : voir [ROADMAP.md](../ROADMAP.md) et
> [docs/PORTAGE-macOS.md](PORTAGE-macOS.md).

---

## Sommaire

1. [Installer et lancer](#installer-et-lancer)
2. [Installer des jeux GOG et Epic sans leur launcher](#installer-des-jeux-gog-et-epic-sans-leur-launcher)
3. [Plateformes reconnues](#plateformes-reconnues)
4. [Tour de l'interface](#tour-de-linterface)
5. [La fiche d'un jeu](#la-fiche-dun-jeu)
6. [Toutes les fonctions](#toutes-les-fonctions)
7. [Réglages](#réglages)
8. [Ce qui demande une petite configuration](#ce-qui-demande-une-petite-configuration)
9. [Raccourcis](#raccourcis)
10. [Tes données](#tes-données)
11. [Limites connues](#limites-connues)
12. [Pour les développeurs](#pour-les-développeurs)

---

## Installer et lancer

- **Version prête à l'emploi** : télécharge `CLRE-Launcher.exe` dans la page *Releases* du dépôt GitHub. C'est un exécutable portable : rien à installer, tu peux le copier où tu veux. Pour le construire toi-même : `npm install` puis `npm run dist` (il sort dans `dist/`).
- **Version de développement** : `npm install` une fois, puis `npm start`, ou double-clique sur `CLRE-Launcher.vbs` (ça évite d'ouvrir une console).

Une seule fenêtre peut tourner à la fois : relancer l'exe ramène simplement la fenêtre ouverte.

---

## Installer des jeux GOG et Epic sans leur launcher

Sur un jeu GOG ou Epic pas installé, **Installer** le télécharge et l'installe directement depuis CLRE-Launcher. Le jeu apparaît ensuite dans **Téléchargements** avec sa progression, sa vitesse, et les boutons Pause, Reprendre et Annuler. Un téléchargement interrompu reprend où il en était, même après avoir fermé le launcher.

**Connexion.** La première installation te demande de connecter ton compte (ou va dans Réglages, pages **GOG** et **Epic Games**) :
- **Se connecter** ouvre la page de connexion officielle dans une fenêtre du launcher, qui se ferme toute seule ;
- **Ouvrir dans le navigateur** sert si tu te connectes avec Google, Apple, Facebook… : tu te connectes dans ton navigateur, puis tu colles dans le launcher l'adresse (GOG) ou le texte (Epic) de la page finale.

Ton mot de passe n'est jamais vu par le launcher : il ne garde qu'un jeton de connexion sur ton PC (chiffré par Windows pour GOG).

### GOG
- Le launcher télécharge l'**installateur officiel** du jeu (le même que sur gog.com) et l'installe en silence. Windows te demande une autorisation à la fin : c'est l'installateur de GOG qui en a besoin.
- Les **DLC** que tu possèdes s'installent avec le jeu, avec une seule autorisation Windows.
- **Désinstaller** passe par le désinstalleur du jeu, sans GOG Galaxy.
- **Mises à jour** : le launcher compare ce qui est installé avec la dernière version publiée par GOG (toutes les 6 h). Le bouton devient « Mettre à jour » quand un nouvel installateur existe.
- Dossier par défaut : `C:\GOG Games`, à changer dans Réglages, GOG.

### Epic Games
- Le launcher passe par [Legendary](https://github.com/legendary-gl/legendary), un outil open-source (GPLv3) qui sert aussi de moteur à Heroic. Il le télécharge une seule fois depuis GitHub (17 Mo) à ta première connexion, et vérifie son empreinte SHA-256 avant de s'en servir.
- Les jeux installés ainsi **se lancent et se désinstallent sans le Epic Games Launcher**. Les composants Windows dont un jeu a besoin (Visual C++, DirectX) sont installés après lui, avec une autorisation Windows.
- **Mises à jour** : vérifiées toutes les 6 h ; le bouton devient « Mettre à jour ».
- Les jeux déjà installés avec le Epic Games Launcher continuent de passer par lui. Tu peux aussi choisir « Via Epic Games Launcher » au moment d'installer.
- Dossier par défaut : `C:\Epic Games`, à changer dans Réglages, Epic Games.

### Ce qui reste impossible
- **Steam** : les jeux ont presque tous besoin du client Steam pour se lancer, donc l'installation passe toujours par Steam.
- **Ubisoft Connect, EA app, Battle.net, Xbox / Game Pass, Riot** : il n'existe pas de moyen fiable d'installer leurs jeux sans leur client. C'est aussi le cas des jeux Epic publiés par Ubisoft ou EA.

---

## Plateformes reconnues

| Plateforme | Ce qui est lu | Lancement | Temps de jeu |
|---|---|---|---|
| **Steam** | Bibliothèque, jeux installés, temps de jeu, collections, téléchargements, succès, captures | `steam://` | Celui de Steam |
| **Epic Games** | Jeux installés et possédés | Epic Games Launcher, ou CLRE pour les jeux qu'il a installés | Mesuré par CLRE |
| **GOG** | Jeux installés, et tous tes jeux si ton compte est connecté | Exécutable du jeu | Mesuré par CLRE |
| **Ubisoft Connect** | Jeux installés | `uplay://` | Mesuré par CLRE |
| **EA app** | Jeux installés | `origin2://` | Mesuré par CLRE |
| **Xbox / Game Pass PC** | Jeux du Microsoft Store et du Game Pass installés | Directement | Mesuré par CLRE |
| **Battle.net** | Jeux Blizzard installés | Client Battle.net | Mesuré par CLRE |
| **Riot** | League of Legends, VALORANT, Legends of Runeterra, 2XKO | Riot Client | Mesuré par CLRE |
| **Amazon Games** | Jeux installés | `amazon-games://` | Mesuré par CLRE |
| **itch.io** | Jeux installés avec l'app itch | Exécutable du jeu | Mesuré par CLRE |
| **Ajoutés à la main** | N'importe quel `.exe`, `.lnk`, `.bat` ou `.url` | Directement | Mesuré par CLRE |

Chaque jeu porte un petit picto de sa plateforme sur sa jaquette. Les jaquettes manquantes sont cherchées automatiquement (API GOG ou magasin Steam), puis gardées en cache.

> Pour les jeux hors Steam, le launcher compte le temps de jeu lui-même en surveillant le processus du jeu. Il faut donc que CLRE-Launcher soit ouvert (même réduit dans la barre des tâches) pendant que tu joues.

---

## Tour de l'interface

### Barre du haut
- **Magasin / Bibliothèque / Amis** : les trois grandes sections.
- **Rechercher** (`Ctrl K`) : par nom, studio ou éditeur.
- **Mode canapé** (icône manette) : interface agrandie, pilotable à la manette.
- **Resynchroniser** : relit toutes les plateformes. Ça se fait aussi tout seul dès que Steam ou Epic change quelque chose.
- **Compte et réglages** (rond à droite).

### Barre latérale
- **Pour toi** : l'accueil, avec une grande bannière « Ce soir » (le jeu à reprendre), tes téléchargements, des idées selon l'ambiance (Chill, Intense, Histoire, Entre amis) et ta pile de jeux jamais lancés.
- **Tous les jeux, Installés, Favoris, Historique.**
- **Téléchargements** : les téléchargements Steam en direct.
- **Captures** : toutes tes captures Steam, jeu par jeu.
- **Stockage** : la place prise par disque et les jeux à désinstaller (pas lancés depuis 6 mois).
- **Récap** : ton temps de jeu de la semaine, du mois ou de l'année, et ta story.
- **Sauvegardes** : copies de sécurité des sauvegardes de tes jeux.
- **Journal** : ta vie de joueur, jour par jour.
- **Vitrine** : tes succès les plus rares.
- **Progression** : À faire, En cours, Terminé, Abandonné.
- **Mes collections**, **Plateformes** et **Collections Steam**.
- **Ajouter un jeu** (en bas).

### Confort
- **Clic droit sur une jaquette** : Jouer, fiche, favori, statut, ajouter à une collection, dossier, raccourci Bureau, masquer (aussi avec la touche Menu ou `Maj F10`).
- **Annuler** : après masquer, favori, statut ou collection, un bouton « Annuler » reste 5 secondes.
- **Recherche tolérante** : fautes de frappe (« isac rebrth »), sigles (« cs2 », « botw »), studio, tags.
- **Retour** : revenir d'une fiche te remet au même endroit de la liste.
- **Premier lancement guidé** : plateformes trouvées, thème et accent, options.
- **Pages vides utiles** et **erreurs claires** (hors ligne, service indisponible) avec un bouton pour réessayer ; bandeau « Hors ligne » quand la connexion tombe.

### Listes de jeux
- Vue **grille** (jaquettes) ou **liste** (tableau).
- **Tri** : nom, dernière session, temps de jeu, taille, avis Steam, succès les plus avancés.
- **Filtres** (les filtres actifs s'affichent en pastilles, un clic sur × les retire) : plateforme, état (installé ou non), statut, ambiance, prise en charge de la manette, **tag Steam** (Roguelike, Coop, Monde ouvert…).
- **Page Tags** (barre latérale) : tous les tags de ta bibliothèque avec leur nombre de jeux ; un clic affiche les jeux correspondants. Les tags d'un jeu sont aussi cliquables sur sa fiche.
- Sur chaque jaquette :
  - le picto de la plateforme et le % de succès, en ambre à 100 % ;
  - un cœur si le jeu est en favori ;
  - le bouton « Jouer » ou « Installer » au survol.

---

## La fiche d'un jeu

En haut, une **bannière plein cadre**. Après 2 secondes, le trailer du jeu prend le relais de l'image, en fondu et sans le son. Les couleurs de l'interface prennent la teinte de la jaquette.

Juste en dessous, une ligne de chiffres :

| Temps de jeu | Dernière session | Succès | Pour le finir | Note | Taille |
|---|---|---|---|---|---|
| Steam ou mesuré par CLRE | Date relative | Débloqués / total | Durée de l'histoire (HowLongToBeat) | Avis Steam + Metacritic, ou note des joueurs HowLongToBeat | Place sur le disque |

### Onglets
- **Aperçu** :
  - description, trailer, tags, captures officielles en plein écran ;
  - configuration requise comparée à ton PC ;
  - actions rapides : dossier du jeu, page du magasin, désinstaller.
- **Succès** : progression, les plus faciles qu'il te reste (avec le % de joueurs qui les ont), puis ceux que tu as débloqués.
- **Actualités** : les annonces officielles du studio.
- **Captures** : tes captures Steam du jeu.
- **Sessions** : chaque partie, avec sa date et sa durée.
- **Sauvegardes** : où sont les sauvegardes, les copies faites, et la restauration en un clic.
- **Mods** : les mods Steam Workshop installés.
- **Journal** : l'histoire de tes parties sur ce jeu.
- **Performances** : processeur, carte graphique, mémoire et FPS de tes dernières sessions.

### Colonne de droite
- **Progression** : ton statut et une note perso.
- **Durée de vie** : trois barres (histoire, avec les extras, 100 %) remplies selon ton temps de jeu, et le temps qu'il te reste.
- **Mes collections**.
- **Lancement** : options de lancement, raccourci sur le Bureau, jaquette perso, masquer le jeu.
- **Informations** : studio, éditeur, sortie, manette, emplacement.

---

## Toutes les fonctions

### Jouer
- **Écran de lancement cinéma** : l'image du jeu floutée en plein écran, son logo en grand, puis « Bonne partie » dès que le jeu tourne. `Échap` le ferme.
- **Options de lancement** :
  - des arguments passés au jeu (Steam, GOG, itch.io et jeux ajoutés à la main) ;
  - des applis à ouvrir avant de jouer (par exemple Discord ou un logiciel de manette) ;
  - des applis à fermer avant de jouer.
- **Raccourci Bureau** : un raccourci avec l'icône du jeu, qui passe par le launcher pour que la session soit comptée.
- **Icône dans la barre des tâches** : les 5 derniers jeux en un clic droit.

### Infos en jeu
- `Ctrl Alt O` affiche par-dessus le jeu l'heure, la date, le jeu en cours et la durée de la session.
- **Rappel de pause** automatique, toutes les 2 h par défaut (réglable).
- Ça fonctionne avec les jeux en mode **fenêtré sans bordure**. En plein écran exclusif, Windows le cache.

### Succès
- Lus directement dans les fichiers de Steam, **sans clé API**, pour tous les jeux que tu as déjà lancés.
- Le **% de joueurs** qui possèdent chaque succès vient des statistiques mondiales Steam.
- **Vitrine** :
  - le total de tes succès et tes jeux à 100 % ;
  - le top 10 de tes succès les plus rares, avec un podium.

### Journal
- Une frise jour par jour : sessions, succès débloqués (avec leurs icônes) et captures.
- Elle remonte loin dans le temps grâce aux dates des succès Steam.

### Récap et story
- **Récap** de la semaine, du mois ou de l'année : temps total, jeu le plus joué, série de jours, jour et moment préférés. Exportable en image.
- **Story** (bouton « Voir ma story ») : jusqu'à 9 pages animées au format vertical.
  - Tu les fais défiler en cliquant à gauche ou à droite, ou avec les flèches.
  - Pages : temps total comparé à la période d'avant, jeu n°1, top 5, rythme, plus longue session, succès débloqués et le plus rare, nouveaux jeux, ton profil de joueur (« Le fidèle », « Le noctambule », « Le marathonien »…), et un résumé.
  - **Exporter en vidéo** : 1080×1920, en MP4 (ou WebM), prête pour TikTok ou Instagram.
  - **Image de cette page** : la page affichée en PNG.
- Une notification te prévient quand le récap de la semaine, du mois ou de l'année est prêt.

### Durée de vie (HowLongToBeat)
- Le temps moyen pour finir l'histoire, l'histoire avec les extras, ou tout à 100 %, pour toutes les plateformes.
- Les résultats sont gardés 30 jours sur ton PC.

### Performances
Pendant chaque partie, un relevé toutes les 5 secondes. Sur la fiche, tu retrouves les moyennes, les pics et des courbes pour tes 6 dernières sessions.

| Mesure | Ce qu'il faut |
|---|---|
| Processeur, carte graphique, mémoire vidéo, RAM | Rien à installer |
| FPS moyens et 1 % bas | PresentMon (voir la configuration plus bas) |
| Températures processeur et carte graphique | LibreHardwareMonitor ouvert |

### Sauvegardes de jeux
- Reconnaît les sauvegardes de plus de 140 de tes jeux grâce à la base communautaire Ludusavi, mise à jour chaque semaine.
- **Copie automatique** à la fin de chaque partie. Le launcher garde 10 copies par jeu.
- **Restauration** en un clic, avec une copie de sécurité de l'état actuel juste avant.
- Dossier par défaut : `Documents\CLRE-Launcher\Sauvegardes`. Mets-le dans OneDrive ou Google Drive pour retrouver tes sauvegardes sur un autre PC.

### Magasin
Le magasin Steam, refait dans le style de l'app à partir des données publiques de Steam (aucun compte à connecter).
- **À la une** : grande bannière qui tourne (promos, meilleures ventes), puis **Gratuit sur Epic**, **Pour toi** (les jeux les mieux notés dans tes tags favoris, que tu n'as pas), **Promos du moment**, **Meilleures ventes**, **Nouveautés**, **À venir**.
- Onglets **Promos**, **Meilleures ventes**, **Nouveautés**, **À venir**, **Gratuits**, **Liste de souhaits**, filtre par **tag** et **recherche** dans tout le magasin Steam.
- Sur chaque carte : prix, réduction, % d'avis positifs, et « Déjà à toi » si tu l'as.
- **Fiche d'un jeu du magasin** : bannière avec trailer, prix et fin de la promo, avis Steam, durée de vie HowLongToBeat, Metacritic, description, captures, configuration requise comparée à ton PC, tags cliquables.
- **Acheter** ouvre le jeu dans l'appli Steam : le paiement se fait chez Steam, jamais dans le launcher, et le jeu arrive ensuite tout seul dans ta bibliothèque. Idem pour la liste de souhaits.

### Notifications Windows
Chaque type s'active ou se coupe séparément dans les réglages :
- téléchargement terminé ;
- promo sur ta liste de souhaits, ou jeu gratuit sur Epic ;
- ami qui lance un jeu que tu as (clé API requise) ;
- mise à jour d'un jeu « En cours » ;
- disque presque plein (une fois par jour au maximum) ;
- récap prêt.

### Organisation
- **Progression** : À faire, En cours, Terminé, Abandonné, plus une note perso.
- **Favoris**, **Mes collections** et **Collections Steam**.
- **Jeux masqués** : ils disparaissent des listes, et tu les retrouves dans une section dédiée.
- **Jaquette perso** pour n'importe quel jeu.

### Mode canapé
Interface agrandie, sans barre latérale, pilotable à la manette. Elle s'ouvre avec le bouton Start ou l'icône manette.

### Discord
Ton profil Discord affiche « Joue à … » pour tous tes jeux, quelle que soit la plateforme (voir la configuration plus bas).

---

## Réglages

Ouvre-les avec le rond en haut à droite (« Compte et réglages »).

- **Compte Steam** : choix du compte si plusieurs utilisent ce PC, et clé Steam Web API (optionnelle).
- **GOG** et **Epic Games** : connexion du compte, et dossier où installer les jeux.
- **Système** :
  - garder le launcher dans la barre des tâches à la fermeture ;
  - le raccourci `Ctrl Alt L` ;
  - le démarrage avec Windows (version `.exe` seulement).
- **Apparence** :
  - couleur d'accent ;
  - thème Sombre, Clair ou Comme Windows ;
  - taille des jaquettes.
- **Effets** : bannières vivantes, et couleur de l'interface qui suit le jeu.
- **Notifications Windows** : chaque type séparément.
- **Infos en jeu** : affichage avec `Ctrl Alt O` et fréquence du rappel de pause.
- **Performances** : emplacement de PresentMon pour les FPS.
- **Sauvegardes de jeux** : dossier de destination et copie automatique.
- **Statut Discord** : ID de l'application Discord.
- **Mises à jour du launcher** : dépôt GitHub à surveiller.
- **Mes données** : export et import.

---

## Ce qui demande une petite configuration

Tout le reste marche sans rien faire. Ces options sont facultatives.

### Clé Steam Web API (amis, jeux jamais lancés)
1. Va sur https://steamcommunity.com/dev/apikey (c'est gratuit).
2. Colle la clé dans **Compte et réglages**.

Elle débloque la liste d'amis en ligne, les notifications « un ami joue à… » et les succès des jeux jamais lancés sur ce PC.

### Statut Discord
1. Va sur https://discord.com/developers/applications, puis crée une application nommée **CLRE-Launcher**.
2. Copie son **Application ID** et colle-le dans **Réglages, Statut Discord**.

### FPS (PresentMon)
1. Télécharge PresentMon, l'outil gratuit et open source d'Intel : https://github.com/GameTechDev/PresentMon/releases.
2. Dans **Réglages, Performances**, clique sur **Choisir…** et indique `PresentMon.exe`.

PresentMon peut demander de lancer CLRE-Launcher en administrateur.

### Températures
Lance **LibreHardwareMonitor** pendant que tu joues. Le launcher lit ses capteurs tout seul.

### Mises à jour automatiques du launcher
Publie tes versions de `CLRE-Launcher.exe` dans les *Releases* d'un dépôt GitHub. Indique ensuite ce dépôt (`propriétaire/dépôt`) dans les réglages.

---

## Raccourcis

| Touche | Action |
|---|---|
| `Ctrl K` | Rechercher |
| `Échap` | Retour, ou fermer une fenêtre |
| `Ctrl Alt L` | Afficher ou masquer le launcher, de n'importe où |
| `Ctrl Alt O` | Infos en jeu |
| `←` `→` `Espace` | Naviguer dans la story |
| **Manette** | A valider · B retour · Y rechercher · LB/RB changer de section · Start mode canapé |

---

## Tes données

Rien n'est envoyé vers un serveur à toi ou à nous. Le launcher contacte seulement des services publics :
- le magasin et l'API Steam ;
- l'API GOG, et les serveurs de téléchargement GOG si tu installes un jeu ;
- l'Epic Games Store, pour les jeux gratuits, et les serveurs d'Epic si tu installes un jeu (par Legendary) ;
- HowLongToBeat ;
- GitHub, si tu as activé les mises à jour, et une fois pour télécharger Legendary ;
- la base Ludusavi.

Tout est rangé dans `%APPDATA%\launcher` :

| Fichier | Contenu |
|---|---|
| `prefs.json` | Réglages, statuts, notes, collections, options de lancement, jeux ajoutés |
| `sessions.json` | Chaque session de jeu (début, fin) |
| `perf\` | Mesures de performances, une par session |
| `art-cache.json` | Jaquettes trouvées pour les jeux hors Steam |
| `hltb.json` | Durées HowLongToBeat |
| `ach-global.json` | Statistiques mondiales des succès |
| `gog-auth.bin` | Jeton de connexion GOG, chiffré par Windows |
| `gog-queue.json`, `epic-queue.json` | Téléchargements en cours |
| `legendary\` | Connexion Epic et jeux installés par Legendary |
| `tools\` | Legendary |

Les copies de sauvegardes vont dans `Documents\CLRE-Launcher\Sauvegardes`, ou le dossier que tu as choisi.

**Export / import** (Réglages, Mes données) : un seul fichier avec tes statuts, notes, collections, sessions, jeux ajoutés et options de lancement. Pratique pour changer de PC.

---

## Limites connues

- **Temps de jeu hors Steam** : il n'est compté que si le launcher est ouvert pendant la partie.
- **Succès** : seulement ceux de Steam. Sans clé API, il faut avoir lancé le jeu au moins une fois.
- **Infos en jeu** : invisibles en plein écran exclusif, il faut passer en fenêtré sans bordure.
- **HowLongToBeat** : pas d'API officielle. Si leur site change, la durée affichera « — » sans rien casser d'autre.
- **Riot** : pas d'image de jaquette publique. Ajoute une jaquette perso depuis la fiche du jeu.
- **EA app** : elle ne dit pas où les jeux sont installés, donc c'est elle qui lance le jeu ou propose de l'installer.
- **Options de lancement (arguments)** : elles ne fonctionnent pas pour Epic, Ubisoft et EA, qui ne les acceptent pas.
- **Installations GOG** : elles passent par les installateurs hors-ligne. Les versions bêta et les « branches » de GOG Galaxy ne sont pas proposées.
- **Mises à jour GOG** : un jeu installé par GOG Galaxy peut aussi être mis à jour par CLRE ; l'installateur s'installe alors par-dessus.

---

## Pour les développeurs

Application **Electron** (Chromium + Node.js) en JavaScript, sans framework.

```bash
npm install
```

```bash
npm start
```

```bash
npm run dist
```

```bash
npm run icons
```

- `npm install` installe les dépendances.
- `npm start` lance la version de développement.
- `npm run dist` construit `dist/CLRE-Launcher.exe` (portable).
- `npm run icons` régénère les icônes depuis `assets/logo*.svg`.

### Structure

```
src/
  main.js            Processus principal : synchronisation, lancement, IPC, notifications, barre des tâches
  preload.js         Pont sécurisé entre la fenêtre et le processus principal (window.launcher)
  steam.js           Lecture de Steam (VDF, appinfo.vdf binaire, temps de jeu, collections)
  epic.js            Lecture d'Epic Games
  epicdl.js          Installation, lancement et mises à jour Epic sans le Epic Games Launcher (Legendary)
  gog.js             Connexion GOG, installation, DLC, désinstallation et mises à jour sans GOG Galaxy
  platforms.js       GOG, Ubisoft, EA, jeux ajoutés, recherche des jaquettes
  platforms2.js      Xbox / Game Pass, Battle.net, Riot, Amazon Games, itch.io
  extras.js          Sessions, téléchargements, captures, actus, amis, liste de souhaits, disques
  gameinfo.js        Succès locaux, HowLongToBeat, jeux gratuits Epic
  binkv.js           Lecteur du format KeyValues binaire de Steam
  journal.js         Journal de jeu et rareté des succès
  perf.js            Mesure des performances pendant les sessions
  store.js           Fiche magasin Steam, configuration du PC
  saves.js           Sauvegardes de jeux (base Ludusavi, traitée dans saves-worker.js)
  workshop.js        Mods Steam Workshop
  system.js          Discord, raccourcis Bureau, mises à jour
  overlay.js         Fenêtre « Infos en jeu »
  renderer/
    index.html       Fenêtre principale
    app.js           Vues de base, navigation, réglages
    features.js      Activité, captures, stockage, amis, liste de souhaits, mode canapé
    features2.js     Fiche enrichie, collections, filtres, récap, sauvegardes, durée de vie, jeux gratuits
    features3.js     Bannières vivantes, teinte du jeu, écran de lancement, journal, vitrine, story, performances
    gog.js           Installation GOG : connexion, confirmation, téléchargements, réglages
    epicdl.js        Installation Epic : connexion, confirmation, désinstallation, réglages
    styles.css       Thème sombre
    theme-light.css  Thème clair
    features3.css    Styles de la 3e vague
    overlay.html     Contenu de la fenêtre « Infos en jeu »
assets/              Logo et icônes
scripts/             Génération des icônes
```

Captures automatiques de l'interface pour tester (en dev seulement) :

```bash
LAUNCHER_SNAP=dossier SNAP_W=1440 SNAP_H=900 npm start
```

Variables en plus : `SNAP_ROUTES` (liste JSON de pages à capturer) et `SNAP_THEME` (`dark` ou `light`).

---

Conception de l'interface : passe *unslop* de @heydamir (CC BY 4.0).

## Licence

Code publié sous licence [MIT](../LICENSE). Legendary, téléchargé à part pour les installations Epic, reste sous sa propre licence (GPLv3) et n'est pas inclus dans ce dépôt. CLRE-Launcher n'est affilié à aucune des plateformes citées ; leurs noms et logos appartiennent à leurs propriétaires.
