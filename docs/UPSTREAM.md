# Proposition au dépôt d'origine (brouillon, non envoyé)

À poster comme **issue** (pas comme PR) sur `jclementc/CLRE-Launcher`, après validation.
Remplacer `<lien>` et `<pseudo>` avant envoi.

---

## Titre

Portage macOS : couche plateforme + Steam, et une question sur la suite

## Corps

Bonjour,

Bravo pour le projet — l'interface et le mode canapé sont une vraie réussite.

Je viens d'en faire un fork expérimental pour macOS, et je préfère demander avant d'aller
plus loin plutôt que d'arriver avec une PR de 3 000 lignes.

**Ce qui marche déjà** dans le fork (testé sur une machine réelle) : Steam (709 jeux lus,
compte, collections, succès, lancement), Epic Games Launcher (140 jeux Mac possédés,
manifestes, lancement), GOG Galaxy (bundles `.app` reconnus par `goggame-<id>.info`),
Battle.net, League of Legends et les jeux ajoutés à la main (`.app`). Relevé `ps` pour le
temps de jeu, présence Discord, caractéristiques machine.

**Ce qui n'a pas d'équivalent macOS** et que je désactive proprement : réticule et
géométrie de fenêtre (`user32`), perf (`PerfMon`/`PresentMon`), sauvegardes
(la base Ludusavi n'a pas de chemins macOS), mise à jour intégrée (l'updater remplace un
`.exe`), raccourcis Bureau (`.lnk`), installation directe GOG/Epic (installateurs Windows).

**Ce que je propose de séparer en deux lots :**

1. **PR reviewable, sans effet sous Windows** : `src/platform/{index,win32,darwin,linux}.js`
   (interface unique : chemin Steam, processus, lancement, sources de jeux), `steam.js`
   qui délègue la localisation et le `RunningAppID` (registre ou `registry.vdf`),
   `epic.js` paramétré par dossier de données et plateforme cible. `win32.js` recopie le
   comportement actuel à l'identique — l'objectif est zéro régression.
2. **Le reste du fork** : lecteurs GOG/Battle.net/Riot, build macOS, réglages masqués,
   signature/notarisation. À garder chez moi tant que tu n'as pas dit que tu veux un
   target macOS dans ce dépôt.

**Ma question :** tu préfères quoi ?

- **(a)** un target macOS ici, avec les PR du lot 1 puis le lot 2, et des releases macOS
  signées à terme ;
- **(b)** le lot 1 seulement ici (ça t'apporte l'abstraction et le Steam cross-platform),
  et je publie le fork macOS de mon côté, crédité et rebrandé ;
- **(c)** ni l'un ni l'autre pour l'instant, et je reste en fork.

Dans tous les cas : MIT respectée, crédit visible, et je ne réutilise ni le nom ni l'icône
sans ton accord.

Le fork est ici : <lien>. Le détail technique est dans `docs/PORTAGE-macOS.md`.

Merci !
<pseudo>

---

## Notes avant envoi

- Ne pas joindre de capture de l'interface macOS sans accord (marque).
- Ne pas promettre de délai de maintenance.
- Si réponse (a) : ouvrir la PR du lot 1 depuis une branche basée sur `upstream/main`,
  sans bump de version ni fichiers macOS-only.
- Si réponse (b) : publier le fork sous un autre nom, attribution « basé sur
  CLRE-Launcher par jclementc », licence MIT conservée.
