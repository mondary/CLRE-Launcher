# Journal des modifications

Les versions suivent le calendrier : `AAAA.MM.PATCH`. Le fork macOS garde sa propre
numérotation ; le dépôt d'origine utilise encore SemVer (`2.0.0`), d'où l'écart assumé
avec `package.json` en amont.

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
