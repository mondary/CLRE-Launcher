# Journal des modifications

Les versions suivent le calendrier : `AAAA.MM.PATCH`. Le fork macOS garde sa propre
numérotation ; le dépôt d'origine utilise encore SemVer (`2.0.0`), d'où l'écart assumé
avec `package.json` en amont.

## 2026.11.4 — 2026-11-18

- **Heroic** : les builds Windows/Wine sont désormais listés et lancés par le protocole
  `heroic://launch?appName=…&runner=…&gui=false` (Heroic gère Wine/CrossOver/Game Porting
  Toolkit). Les builds macOS natifs restent lancés directement par `open -a`.
- **Amazon Games** : bibliothèque Prime Gaming complète via `store_cache/nile_library.json`
  (possédés + installés). Un jeu non installé propose « Installer », qui ouvre Heroic sur
  la demande d'installation.
- **GOG** : jeux possédés mais non installés via `store_cache/gog_library.json` de Heroic,
  en complément des bundles `.app` de Galaxy.
- **Epic** : la bibliothèque Legendary (`store_cache/legendary_library.json`) sert de
  source de secours quand le Epic Games Launcher n'est pas installé.
- Le bouton « Installer » est de nouveau proposé sur macOS pour Epic, GOG et Amazon
  (la désinstallation reste réservée à Steam).
- Tests Heroic étendus : build Windows sans bundle, jeux possédés GOG/Amazon/Epic.

## 2026.11.3 — 2026-11-18

- **EA app (macOS)** : les jeux installés en bundles `.app` sont détectés dans
  `/Applications/EA Games` et `~/Applications/EA Games`, ou par leur identifiant
  `com.ea.*` s'ils sont ailleurs. Lancement direct du bundle.
- **itch.io** : lecture des reçus `.itch/receipt.json.gz` (ou `receipt.json`), jeux
  installés dans `~/Library/Application Support/itch/apps` (et `kitch`), lancement du
  bundle `.app`, jaquette du reçu.
- **Heroic Games Launcher** : lecture des jeux installés par Legendary (Epic), gogdl (GOG)
  et Nile (Amazon) dans `~/Library/Application Support/heroic`. Seuls les builds macOS
  natifs sont listés et lançables ; les builds Windows/Wine sont ignorés. Les jeux Epic
  déjà connus du Epic Games Launcher sont fusionnés, les autres reçoivent leurs visuels
  par la recherche Steam.
- Nouveaux tests sur fixtures : EA, itch.io, Heroic (dont un build Windows à ignorer).
- `npm run doctor` liste aussi les clients détectés (Steam, Epic, GOG, Heroic, itch,
  EA app, Battle.net, LoL).

## 2026.11.2 — 2026-11-18

- macOS : zones de glissement de la fenêtre limitées à la barre supérieure et au logo,
  pour que les clics dans la barre latérale (semaine, collections) restent des clics.

## 2026.11.1 — 2026-11-18

Première version macOS jouable du fork. Windows garde le comportement d'origine.

### Ajouté

- **Couche plateforme** (`src/platform/`) : une interface unique (`steamPath`, lancement,
  processus, sources de jeux, caractéristiques machine) avec trois implémentations :
  `win32` (comportement d'origine, à l'identique), `darwin` (nouveau) et `linux`
  (squelette prêt pour le Steam Deck).
- **macOS — Steam** : dossier `~/Library/Application Support/Steam`, comptes, jeux
  installés (appmanifest), temps de jeu, collections, visuels, succès locaux, jeu en cours
  via `registry.vdf`, lancement par `steam://rungameid`.
- **macOS — Epic Games Launcher** : jeux possédés (catcache) filtrés sur les versions Mac,
  jeux installés (manifestes), lancement par `com.epicgames.launcher://`.
- **macOS — GOG Galaxy** : détection des bundles `.app` par leur marqueur
  `goggame-<id>.info`, lancement direct du bundle (sans passer par Galaxy).
- **macOS — Battle.net** : jeux Blizzard installés dans `/Applications`, lancement par
  `battlenet://<code>`.
- **macOS — Riot** : League of Legends détecté en bundle natif.
- **macOS — jeux ajoutés à la main** : bundles `.app`, scripts exécutables, arguments,
  jaquette personnalisée.
- **macOS — temps de jeu hors Steam** : relevé `ps` toutes les 5 s, nom de processus déduit
  du `CFBundleExecutable` du bundle.
- **macOS — Discord Rich Presence** : socket Unix
  `~/Library/Application Support/discord/discord-ipc-N`.
- **macOS — caractéristiques machine** : CPU, RAM, GPU (`system_profiler`) pour comparer
  avec la configuration demandée.
- `npm test` (Node natif, sans Electron) : lecteurs Steam/Epic/GOG sur fixtures.
- `npm run doctor` : diagnostic des sources trouvées sur la machine, sans fenêtre.
- `scripts/smoke-main.js` : démarrage du vrai processus principal avec Electron simulé.
- `npm run dist:mac` : cible DMG + ZIP (arm64).
- `docs/PORTAGE-macOS.md` : architecture et guide pour brancher une nouvelle plateforme.
- `ROADMAP.md` : état, priorités et proposition amont.

### Modifié

- `steam.js` délègue la localisation du client et l'identifiant du jeu en cours à la couche
  plateforme (registre sous Windows, `registry.vdf` ailleurs).
- `epic.js` accepte un dossier de données et une plateforme cible (Mac/Windows).
- `store.js` délègue les caractéristiques machine à la plateforme.
- `main.js` utilise la plateforme pour les processus, le lancement, les raccourcis, les
  disques et les sources de jeux ; les fonctions indisponibles sur macOS sont désactivées
  proprement (réticule, perf, sauvegardes, mise à jour intégrée).
- `settings.js` / réglages : sections sans effet sur macOS masquées, libellés neutres.
- `package.json` : scripts `test`, `doctor`, `dist:mac`, cible macOS.

### Limites connues sur macOS

- Pas d'installation directe GOG/Epic (les installateurs sont des binaires Windows) :
  les boutons ouvrent GOG Galaxy / le Epic Games Launcher.
- Pas de réticule, ni de mesure CPU/GPU/FPS, ni de sauvegardes Ludusavi (pas de chemins
  macOS dans la base communautaire).
- Pas de raccourci sur le Bureau, pas de mise à jour intégrée : téléchargement manuel
  depuis GitHub tant que l'app n'est pas signée/notarisée.
- Ubisoft Connect, Xbox/Game Pass, Amazon Games et itch.io n'ont pas de client macOS
  exploitable : non listés.
