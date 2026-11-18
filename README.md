<div align="center">

<img src="assets/logo.svg" width="96" alt="">

# CLRE-Launcher

**Tous tes jeux, un seul launcher.**
Steam, Epic, GOG, Ubisoft, EA, Xbox / Game Pass, Battle.net, Riot, Amazon, itch.io et tes propres `.exe`, au même endroit.

Gratuit · Open source (MIT) · Windows · macOS (fork expérimental) · Aucun compte à connecter

<img src="docs/screens/accueil.jpg" alt="Accueil de CLRE-Launcher">

</div>

> ## Fork macOS (expérimental)
>
> Cette copie est un **fork macOS** de [jclementc/CLRE-Launcher](https://github.com/jclementc/CLRE-Launcher),
> sous licence MIT. Windows reste la référence ; le portage ne change pas son comportement.
>
> ```sh
> npm install
> npm run doctor   # ce que le launcher trouve sur cette machine
> npm test         # lecteurs Steam/Epic/GOG sur fixtures
> npm start        # lancer l'application
> npm run dist:mac # construire un DMG (arm64, non signé)
> ```
>
> **Fonctionne sur macOS** : Steam (bibliothèque, temps de jeu, succès, collections,
> lancement), Epic Games Launcher, GOG Galaxy (bundles `.app`), Battle.net, League of
> Legends, jeux ajoutés à la main (`.app`), temps de jeu hors Steam, présence Discord.
>
> **Pas encore** : sauvegardes Ludusavi, réticule, perf CPU/GPU/FPS, raccourci Bureau,
> mise à jour intégrée, signature/notarisation, installation directe GOG/Epic.
>
> Détail et état à jour : [ROADMAP.md](ROADMAP.md) · architecture :
> [docs/PORTAGE-macOS.md](docs/PORTAGE-macOS.md) · journal : [CHANGELOG.md](CHANGELOG.md).

## Installer

1. Télécharge `CLRE-Launcher.exe` dans les [Releases](../../releases).
2. Lance-le. C'est portable : rien à installer.

Le launcher trouve tout seul les jeux de chaque plateforme installée sur ton PC.

## Ce qu'il fait

<img src="docs/screens/bibliotheque.jpg" alt="Bibliothèque">

- **Une seule bibliothèque** : tri, filtres par plateforme, tag ou ambiance, et une recherche qui comprend « isac rebrth » ou « cs2 ».
- **Une fiche par jeu** : temps de jeu, succès, durée de vie (HowLongToBeat), notes, trailer, captures.
- **Installer tes jeux GOG et Epic sans leur launcher**, avec pause et reprise.
- **Temps de jeu compté** pour toutes les plateformes, pas seulement Steam.
- **Sauvegardes** copiées après chaque partie et restaurables en un clic.
- **Récap et story** de ta semaine, de ton mois ou de ton année, exportable en vidéo.
- **Performances** de chaque session : processeur, carte graphique, FPS.
- **Mode canapé** jouable à la manette.
- **18 thèmes**, et tu peux [créer les tiens](THEMES.md).

<table>
<tr>
<td><img src="docs/screens/fiche.jpg" alt="Fiche d'un jeu"></td>
<td><img src="docs/screens/fiche-apercu.jpg" alt="Aperçu d'un jeu"></td>
</tr>
<tr>
<td><img src="docs/screens/vitrine.jpg" alt="Vitrine des succès"></td>
<td><img src="docs/screens/recap.jpg" alt="Récap"></td>
</tr>
<tr>
<td><img src="docs/screens/canape.jpg" alt="Mode canapé"></td>
<td><img src="docs/screens/magasin.jpg" alt="Magasin"></td>
</tr>
</table>

<img src="docs/screens/themes.jpg" alt="Neuf des dix-huit thèmes">

## Tes données restent chez toi

Le launcher lit les fichiers que chaque plateforme garde sur ton PC. Rien n'est envoyé vers un serveur à nous : il ne contacte que des services publics (Steam, GOG, Epic, HowLongToBeat…). Un compte n'est demandé que pour installer un jeu GOG ou Epic.

## Développer

```bash
npm install
```

```bash
npm start
```

```bash
npm test          # tests Node, sans Electron
npm run doctor    # diagnostic des sources de jeux sur la machine
npm run dist      # Windows : dist/CLRE-Launcher.exe
npm run dist:mac  # macOS : DMG + ZIP arm64 (non signés)
```

`npm run dist` construit `dist/CLRE-Launcher.exe`.

## En savoir plus

Le [guide complet](docs/GUIDE.md) détaille chaque fonction, les réglages, les raccourcis, les options à configurer (clé Steam, Discord, FPS) et les limites connues.

## Licence

[MIT](LICENSE). CLRE-Launcher n'est affilié à aucune des plateformes citées ; leurs noms et logos appartiennent à leurs propriétaires.
