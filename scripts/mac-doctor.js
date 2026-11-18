#!/usr/bin/env node
// Diagnostic macOS, sans Electron et sans fenêtre.
// Il dit exactement ce que le launcher va voir sur cette machine : sources trouvées,
// nombre de jeux, chemins, et fonctionnalités actives ou non.
//
//   npm run doctor
const fs = require('fs');
const path = require('path');
const platform = require('../src/platform');

const ok = (b) => (b ? 'oui' : 'non');
const line = (k, v) => console.log(`  ${k.padEnd(22)} ${v}`);
const time = (label, fn) => {
  const t = Date.now();
  const r = fn();
  return Promise.resolve(r).then((v) => ({ v, ms: Date.now() - t }));
};

(async () => {
  console.log(`\nCLRE-Launcher — diagnostic ${platform.id}\n`);
  line('Plateforme supportée', ok(platform.supported));
  line('Fenêtre / tray', 'oui');
  line('Overlay pause', ok(platform.supports.overlay));
  line('Réticule', ok(platform.supports.crosshair));
  line('Performances (CPU/GPU/FPS)', ok(platform.supports.perf));
  line('Raccourcis Bureau', ok(platform.supports.shortcuts));
  line('Mise à jour intégrée', ok(platform.supports.autoUpdate));
  line('Sauvegardes Ludusavi', ok(platform.supports.saves));
  line('Installation GOG/Epic directe', ok(platform.supports.directDownloads));
  line('Raccourcis clavier', Object.values(platform.accelerators).join(' · '));

  console.log('\nSteam');
  const steamPath = platform.steamPath();
  line('Dossier', steamPath || 'introuvable');
  line('Jeu en cours', String(platform.steamRunningAppIdSync()));
  if (steamPath) {
    try {
      const { loadLibrary } = require('../src/steam');
      const { v, ms } = await time('lib', () => loadLibrary({}));
      line('Compte', `${v.user.name} (${v.user.id64})`);
      line('Jeux lus', `${v.games.length} en ${ms} ms · ${v.games.filter((g) => g.installed).length} installés`);
      line('Collections', String(v.collections.length));
      line('Dossiers surveillés', v.watchPaths.length);
    } catch (e) {
      line('Lecture', `ERREUR : ${e.message}`);
    }
  }

  console.log('\nEpic Games Launcher');
  line('Dossier de données', platform.epicDataDir || 'introuvable');
  const epic = platform.loadEpic({});
  line('Disponible', ok(epic.available));
  line('Jeux Mac', `${epic.games.length} · ${epic.games.filter((g) => g.installed).length} installés`);
  for (const g of epic.games.slice(0, 3)) line('  exemple', `${g.name}${g.installed ? ' (installé)' : ''}`);

  console.log('\nAutres plateformes');
  const others = platform.loadPlatforms([]);
  const byStore = {};
  for (const g of others) (byStore[g.store] = byStore[g.store] || []).push(g);
  for (const [store, list] of Object.entries(byStore)) line(store, `${list.length} jeu(x) · ${list.slice(0, 2).map((g) => g.name).join(', ')}`);
  if (!others.length) line('installés', 'aucun jeu détecté dans /Applications');

  console.log('\nProcessus');
  const { v: procs, ms } = await time('ps', () => platform.processNames());
  line('Relevé', `${procs.size} processus en ${ms} ms`);

  console.log('\nMachine');
  const specs = await platform.pcSpecs();
  line('CPU', `${specs.cpu} · ${specs.threads} threads`);
  line('RAM', `${specs.ramGb} Go`);
  line('GPU', specs.gpus.join(', ') || 'non détecté');
  line('OS', specs.os);

  console.log('\nFichiers de données');
  const dataDir = path.join(process.env.HOME, 'Library', 'Application Support', 'launcher');
  line('Dossier', dataDir);
  line('Existe', ok(fs.existsSync(dataDir)));
  console.log('');
})().catch((e) => {
  console.error('\nDiagnostic impossible :', e);
  process.exitCode = 1;
});
