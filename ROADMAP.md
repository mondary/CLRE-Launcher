# Roadmap — CLRE-Launcher macOS

Fork macOS de [jclementc/CLRE-Launcher](https://github.com/jclementc/CLRE-Launcher) (MIT).
Objectif : un launcher unique sur macOS, puis une version Steam Deck. Windows reste la
référence : la couche plateforme ne doit rien changer à son comportement.

Dernière mise à jour : 2026-11-18 · version `2026.11.4`.

## État actuel

| Chantier | État | Détail |
|---|---|---|
| Démarrage de l'app sur macOS | ✅ | fenêtre, tray, thèmes, protocoles, 105 handlers IPC |
| Steam | ✅ | 709 jeux lus sur la machine de test, compte, collections, succès, lancement |
| Epic Games Launcher | ✅ | 140 jeux Mac possédés, manifestes, lancement |
| GOG Galaxy | ✅ | bundles `.app` reconnus par `goggame-<id>.info` |
| Heroic (Epic/GOG/Amazon) | ✅ | `installed.json` de Legendary/gogdl/Nile + bibliothèques possédées ; Mac natif ou Wine |
| EA app | ✅ | bundles `.app` de `/Applications/EA Games` ou identifiant `com.ea.*` |
| itch.io | ✅ | reçus `.itch/receipt.json.gz` de `~/Library/Application Support/itch/apps` |
| Amazon Games | ✅ | bibliothèque Prime complète via Heroic/Nile, lancement par `heroic://` |
| Battle.net | 🟡 | jeux Blizzard détectés dans `/Applications`, lancement par URI |
| Riot (LoL) | 🟡 | bundle natif détecté, lancement par `open` |
| Jeux ajoutés à la main | ✅ | `.app`, exécutables, arguments, jaquettes |
| Temps de jeu hors Steam | ✅ | relevé `ps` toutes les 5 s |
| Temps de jeu Steam | ✅ | `localconfig.vdf` |
| Sauvegardes | ❌ | la base Ludusavi n'a pas de chemins macOS |
| Performances CPU/GPU/FPS | ❌ | compteurs Windows (PerfMon/PresentMon) |
| Réticule / overlay | ❌ / ✅ | réticule lié à `user32` ; l'overlay de pause fonctionne |
| Mise à jour intégrée | ❌ | l'updater remplace un `.exe` portable |
| Signature / notarisation | ❌ | Gatekeeper bloque une app non signée |
| Steam Deck | ⬜ | squelette Linux seulement |

Légende : ✅ fonctionne · 🟡 partiel ou à valider à l'écran · ❌ absent · ⬜ pas commencé.

## Phase 1 — Rendre macOS utilisable (en cours)

- [x] Couche plateforme `win32` / `darwin` / `linux`, Windows inchangé.
- [x] Steam, Epic, GOG, Battle.net, Riot, jeux manuels.
- [x] Lancement des bundles `.app` par `open`, jamais le binaire interne.
- [x] Relevé des processus et temps de jeu.
- [x] Tests Node sur fixtures + diagnostic machine.
- [ ] **Validation à l'écran** : barre de titre, glissement de fenêtre, tray, thèmes,
      ajout d'un jeu `.app`, lancement d'un jeu Steam.
- [ ] Vérifier les cas réels : un jeu Steam installé, un jeu Epic installé.

## Phase 2 — Parité raisonnable

- [ ] **Installer un jeu sans launcher** : télécharger et monter le `.dmg`/`.pkg` officiel
      GOG, ou déléguer à `legendary`/`gogdl` (binaires macOS) pour Epic/GOG.
- [ ] **Sauvegardes** : chemins macOS (`~/Library/Application Support`, `~/Documents`),
      soit en complétant le manifeste Ludusavi, soit avec une table maison pour les jeux
      les plus joués.
- [ ] **Performances** : CPU/RAM par processus via `ps` ; GPU/FPS via `powermetrics`
      (droits root) ou `Metal HUD` — à décider.
- [ ] **Réticule** : géométrie de fenêtre via `CGWindowListCopyWindowInfo` (petit helper
      Swift) ou `System Events` (permission Accessibilité).
- [ ] **Raccourci Bureau** : alias Finder ou petit `.app` généré par `osacompile`.
- [x] **Heroic** : lecture des manifestes Legendary/gogdl/Nile, builds Mac natifs et
      builds Windows lancés par `heroic://launch`.
- [x] **itch.io** : reçus `.itch/receipt.json.gz` dans `~/Library/Application Support/itch/apps`.
- [x] **EA app** : bundles `.app` de `EA Games` ou identifiant `com.ea.*`.
- [x] **Amazon Games** : bibliothèque Prime (possédés + installés) lue dans Nile ; Heroic
      reste obligatoire pour installer et lancer (aucun client Amazon macOS).
- [ ] **Battle.net** : trouver la source locale fiable (base du client, pas une liste de
      noms codée en dur), et couvrir les jeux hors `/Applications`.
- [ ] **Saves / récap / journal** : vérifier les succès et captures Steam sur macOS
      (les chemins `appcache/stats` et `760/remote` fonctionnent déjà).

## Phase 3 — Distribution macOS

- [ ] Compte Apple Developer (99 $/an), certificat Developer ID.
- [ ] Signature, hardened runtime, entitlements, notarisation.
- [ ] DMG stylé (voir la skill `dmgly-dmg-install` du hub).
- [ ] Mise à jour intégrée : Sparkle ou `electron-updater`, avec appcast GitHub.
- [ ] Build universel arm64 + x64.
- [ ] Homebrew cask.
- [ ] Rebranding du fork (nom, icône, bundle id) — **décision utilisateur requise**.
      Tant que ce n'est pas fait, le fork s'appelle CLRE-Launcher et crédite l'auteur.

## Phase 4 — Steam Deck / Linux

Architecture différente : Decky Loader (React dans l'interface Steam) ou Flatpak en mode
Desktop. Electron en mode Gaming est un mauvais fit (gamescope, manette, démarrage).
La couche `platform/linux.js` existe pour préparer les chemins Steam ; il reste :

- [ ] Sources : Heroic, Lutris, Bottles, ÉmuDeck, jeux non-Steam de Steam.
- [ ] Lancement : `.desktop`, AppImage, Flatpak, préfixes Proton.
- [ ] Relevé des processus via `/proc`.
- [ ] Intégration Decky Loader ou Flatpak + manette.

## Proposition au dépôt d'origine

Deux lots séparés, dans cet ordre :

1. **Couche plateforme + Steam macOS** : `src/platform/*`, `steam.js` qui délègue,
   `epic.js` paramétré, aucune fonctionnalité visible sous Windows. C'est le lot
   réellement reviewable en PR.
2. **Le reste du fork** (lecteurs GOG/Battle.net/Riot, réglages masqués, build macOS) :
   à garder dans le fork tant que l'auteur n'a pas dit qu'il veut un target macOS.

Le texte prêt à poster est dans `docs/UPSTREAM.md`. **Ne rien envoyer sans accord.**

## Définition de « ça marche »

- `npm test` vert.
- `npm run doctor` liste Steam + Epic + au moins une plateforme locale.
- L'app s'ouvre, la bibliothèque s'affiche, un jeu se lance et le temps de jeu se met à jour.
- Aucune régression Windows : `platform/win32.js` reproduit les fonctions d'origine.
