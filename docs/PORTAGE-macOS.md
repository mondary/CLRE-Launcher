# Portage macOS — architecture

Le launcher était écrit pour Windows : le registre, `tasklist`, `powershell`, `user32` et
les `.exe` étaient répartis dans les modules. Le portage ne réécrit pas l'interface : il
isole tout ce qui dépend de l'OS derrière une seule interface.

## La couche plateforme

```
src/platform/
├── index.js        choisit l'implémentation selon process.platform
├── win32.js        comportement d'origine, recopié à l'identique
├── darwin.js       macOS
├── linux.js        squelette (SteamOS)
└── noop-downloads.js  doublure des téléchargeurs directs (GOG/Epic) hors Windows
```

Surface exposée (contrat commun) :

| Membre | Rôle |
|---|---|
| `steamPath()` | dossier du client Steam, ou `null` |
| `steamRunningAppId()` / `…Sync()` | appid du jeu Steam en cours |
| `runningAmong(Set)` | noms de processus en cours parmi une liste |
| `processNames()` | tous les processus, en minuscules |
| `killProcess(name)` | fermer une appli avant de jouer |
| `isLocalFile(p)` / `isProgram(p)` | validation des chemins choisis par l'utilisateur |
| `startFile(file, args, cwd, onError)` | lancer un jeu ou une appli |
| `loadEpic(stats)` | jeux Epic (possédés + installés) |
| `loadPlatforms(custom)` / `loadMorePlatforms()` | autres plateformes |
| `pcSpecs()` | CPU, RAM, GPU, OS |
| `platformIds` | plateformes affichées dans le filtre de la bibliothèque |
| `supports.*` | fonctions réellement disponibles (overlay, perf, saves, updates…) |
| `accelerators` | raccourcis globaux (`Command+Alt+L` sur macOS) |
| `createShortcut` | `null` si la plateforme n'en a pas |

Règle : **un module de `src/` ne doit plus appeler `reg.exe`, `tasklist`, `powershell` ou
`osascript` directement**. S'il en a besoin, la fonction va dans `src/platform/<os>.js`.

## Ce que fait macOS différemment

### Steam
Même arborescence que sous Windows (`steamapps`, `userdata`, `appcache`), autre racine :

```
~/Library/Application Support/Steam
```

Deux différences :

- le **jeu en cours** n'est pas dans le registre mais dans `registry.vdf`, un faux
  registre en texte que Steam écrit dans son dossier ;
- le client n'est pas un `.exe` mais `Steam.app` ; on lance toujours par URI
  (`steam://rungameid/<id>`), jamais le binaire interne.

### Epic
Le cache est dans `~/Library/Application Support/Epic/EpicGamesLauncher/Data`, avec la
même structure que `ProgramData\Epic\...` : `Catalog/catcache.bin` (JSON en base64) et
`Manifests/*.item`. Le catcache contient les jeux de toutes les plateformes ; on ne garde
que ceux dont `releaseInfo[].platform` contient `Mac`. Le lancement passe par
`com.epicgames.launcher://`.

### GOG
GOG Galaxy installe des bundles `.app` et laisse un marqueur dans chacun :

```
/Applications/Celeste.app/Contents/Resources/goggame-1207658924.info
```

C'est plus robuste que la base SQLite interne de Galaxy, et ça marche même si Galaxy n'est
pas lancé. Un DLC a un `rootGameId` différent de son `gameId` : il est ignoré.

### Lancement d'un `.app`
Toujours `open -a <bundle>` (avec `--args` si besoin). Lancer le binaire dans
`Contents/MacOS` casse le contexte du bundle : ressources, signature, `LSUIElement`,
association de fichiers.

### EA app
EA installe ses jeux en bundles `.app`, par défaut dans `/Applications/EA Games`
(ou `~/Applications/EA Games`). Hors de ce dossier, le marqueur fiable est
`CFBundleIdentifier = com.ea.*` : on lit l'`Info.plist` brut pour filtrer vite, puis
`plutil` seulement sur les candidats.

### itch.io
L'app itch installe chaque jeu dans `~/Library/Application Support/itch/apps/<dossier>`
(et `kitch` pour la version canary), avec un reçu `.itch/receipt.json.gz` qui contient
l'id, le titre et les visuels. Le reçu est la source de vérité : il survit à une
réinitialisation de `butler.db`. Les jeux sans bundle `.app` (builds Windows) sont ignorés.

### Heroic Games Launcher
Heroic s'appuie sur trois outils, chacun avec sa liste de jeux installés sous
`~/Library/Application Support/heroic` :

| Outil | Fichier | Store |
|---|---|---|
| Legendary | `legendaryConfig/legendary/installed.json` | Epic |
| gogdl | `gog_store/installed.json` (+ titres dans `store_cache/gog_library.json`) | GOG |
| Nile | `nile_config/nile/installed.json` | Amazon |

Les bibliothèques **possédées** viennent de `store_cache/legendary_library.json`,
`store_cache/gog_library.json` et `store_cache/nile_library.json` (`library` pour
Legendary et Nile, `games` pour GOG).

Deux modes de lancement :

- un bundle `.app` est trouvé dans le dossier d'installation → `open -a`, lancement
  direct et temps de jeu mesurable ;
- sinon (build Windows sous Wine/CrossOver) → protocole Heroic :

```
heroic://launch?appName=<app>&runner=<legendary|gog|nile>&gui=false
```

Heroic exécute le jeu (Wine, préfixe, DXVK/Metal) et `gui=false` évite d'ouvrir sa
fenêtre. Les builds Windows n'ont pas de nom de processus fiable côté macOS : le temps
de jeu n'est pas mesuré pour eux, seulement affiché s'il vient d'ailleurs.

**Amazon** n'a aucun client macOS : Heroic/Nile est la seule voie. La bibliothèque Prime
est lue localement (installés + possédés), et « Installer » ouvre Heroic sur la demande
d'installation.

### Nom de processus
Pour mesurer le temps de jeu, il faut le nom qui apparaît dans `ps`, c'est-à-dire
`CFBundleExecutable` déclaré dans `Contents/Info.plist` (lu avec `plutil`). Le nom du
bundle seul ne suffit pas (`Celeste.app` peut lancer `Celeste`).

## Ajouter une plateforme

1. Trouver la source locale fiable (fichier de manifeste, base du client, bundle).
2. Dans `darwin.js`, écrire un `loadXxx()` qui renvoie des objets `base(store, id, nom, {…})` :
   - `installed`, `installDir`, `library`
   - `exe` (bundle `.app` de préférence)
   - `processNames` (noms `ps`, en minuscules)
3. L'ajouter à `loadPlatforms()` et à `platformIds`.
4. Ajouter un cas dans `action()` (`src/main.js`) pour `play`, `install`, `store`.
5. Écrire un test sur fixture dans `test/platform.test.js` — aucun jeu installé requis.
6. Vérifier avec `npm run doctor`.

## Vérifier sans ouvrir de fenêtre

```sh
npm test                 # lecteurs sur fixtures
npm run doctor           # sources réellement présentes sur la machine
node scripts/smoke-main.js --library
```

`smoke-main.js` remplace Electron par une doublure et exécute le vrai `main.js` :
protocoles, thèmes, 105 handlers IPC, création de fenêtre, puis un `sync()` complet.
C'est ce qui permet de valider le démarrage en CI ou à distance.

## Pièges connus

- **`isLocalFile`** : le test d'origine (`^[a-z]:[\\/]`) refuse tous les chemins macOS.
  Toute validation de chemin doit passer par la plateforme, sinon les jaquettes et les
  jeux ajoutés à la main disparaissent silencieusement.
- **`steamart://`** : l'URL encode le chemin absolu dans le segment (`%2FUsers%2F…`),
  `pathname.slice(1)` puis `decodeURIComponent` donne le bon chemin sur les deux OS.
- **Chemins sensibles à la casse** : contrairement à Windows, `/Applications/Game.app` et
  `/applications/game.app` sont différents. Ne pas comparer en minuscules pour ouvrir.
- **Barre de titre** : `titleBarOverlay` est Windows-only. Sur macOS, `hiddenInset` +
  `trafficLightPosition`, et les zones vides doivent porter `-webkit-app-region: drag`
  (voir `styles.css`, bloc `data-platform="darwin"`).
- **Pas de `.exe`** : tout ce qui télécharge un installateur Windows (GOG, Epic/legendary)
  est remplacé par `NoopDownloads` et les boutons renvoient vers le launcher officiel.
