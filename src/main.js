const { app, BrowserWindow, ipcMain, shell, protocol, net, Tray, Menu, nativeImage, globalShortcut, dialog, Notification, nativeTheme, session } = require('electron');
const { Overlay } = require('./overlay');
const { Crosshair } = require('./crosshair');
const { Perf } = require('./perf');
const journal = require('./journal');
const { readJsonSafe, writeJsonAtomic } = require('./fsutil');
const { Tags } = require('./tags');
const storefront = require('./storefront');
const { Presence } = require('./presence');
const { Parties, commonGames } = require('./party');
// Application Discord de CLRE-Launcher, intégrée : le statut et le logo marchent chez tout le monde sans rien régler
const DISCORD_APP_ID = '1568079866841137202';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const platform = require('./platform');
const { loadLibrary } = require('./steam');
const { epicUri, makeGame: makeEpicGame } = require('./epic');
const { EpicDl } = require('./epicdl');
const { applyArt, resolveArt, base } = require('./platforms');
const { Gog } = require('./gog');
const extras = require('./extras');
const gameinfo = require('./gameinfo');
const store = require('./store');
const { workshopMods } = require('./workshop');
const { Saves } = require('./saves');
const sys = require('./system');
const steamCollections = require('./steam-collections');
const { Themes } = require('./themes');

// Le nom d'app a changé (Launcher → CLRE-Launcher) : on garde l'ancien dossier de données
// pour conserver la clé API, les favoris et le temps de jeu déjà mesuré.
app.setName('CLRE-Launcher');
app.setPath('userData', path.join(app.getPath('appData'), 'launcher'));
// Captures de dev (LAUNCHER_SNAP_DATA) : dossier de données à part, pour tourner à côté du launcher installé sans toucher à ses données
if (process.env.LAUNCHER_SNAP_DATA && !app.isPackaged) app.setPath('userData', process.env.LAUNCHER_SNAP_DATA);

if (!app.requestSingleInstanceLock()) { app.quit(); process.exit(0); }

protocol.registerSchemesAsPrivileged([
  { scheme: 'steamart', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  // corsEnabled : Chromium charge les masques CSS (mask: url(…)) et les polices en mode CORS.
  // Sans ça, depuis Electron 45, la page (file://) n'a plus le droit de les lire et le masque disparaît.
  { scheme: 'clre-theme', privileges: { standard: true, secure: true, corsEnabled: true } },
]);

// ---------- Durcissement ----------
// Autorisations Chromium : tout est refusé, sauf ce dont la fenêtre principale se sert vraiment
// (export vidéo de la story, plein écran des bandes-annonces, copie d'une invitation).
// Les fenêtres de connexion GOG / Epic (pages web) n'obtiennent rien : ni micro, ni caméra, ni position.
const ALLOWED_PERMISSIONS = new Set(['display-capture', 'fullscreen', 'clipboard-sanitized-write']);
const isMainContents = (wc) => !!(wc && win && !win.isDestroyed() && wc === win.webContents);
function hardenSession(s) {
  s.setPermissionRequestHandler((wc, permission, cb) => cb(isMainContents(wc) && ALLOWED_PERMISSIONS.has(permission)));
  s.setPermissionCheckHandler((wc, permission) => isMainContents(wc) && ALLOWED_PERMISSIONS.has(permission));
}
app.on('session-created', hardenSession);
// Aucune page du launcher n'utilise <webview>
app.on('web-contents-created', (_e, wc) => wc.on('will-attach-webview', (e) => e.preventDefault()));

// Fichier local sur un disque. Sous Windows : jamais un partage réseau (\\serveur\…), qui
// enverrait les identifiants à un serveur choisi par quelqu'un d'autre.
const isLocalFile = platform.isLocalFile;
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const hasExt = (f, set) => set.has(path.extname(String(f)).toLowerCase());
// Programme choisi par l'utilisateur (jeu ajouté à la main, appli à ouvrir avant un jeu) :
// .exe/.lnk sous Windows, bundle .app sous macOS.
const isProgram = platform.isProgram;
// Nom de fichier proposé dans une boîte « Enregistrer » : sans séparateur ni caractère interdit
const safeFileName = (s, fallback) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 80).trim() || fallback;
// Options de lancement d'un jeu : mêmes règles à l'enregistrement et à l'import d'un fichier de données
const PROC_RE = platform.processNameRe;
function cleanLaunchOpts(o) {
  o = o && typeof o === 'object' ? o : {};
  return {
    args: String(o.args || '').slice(0, 500),
    open: (Array.isArray(o.open) ? o.open : []).filter(isProgram).slice(0, 5),
    close: (Array.isArray(o.close) ? o.close : []).filter((x) => typeof x === 'string' && PROC_RE.test(x)).slice(0, 10),
  };
}

const dataFile = (name) => path.join(app.getPath('userData'), name);

// Boîte « Ouvrir » qui repart du dernier dossier utilisé pour ce type de choix (jeu, jaquette, thème…).
// Depuis Electron 43, sans defaultPath elle s'ouvrirait toujours sur Téléchargements.
async function pickPath(kind, opts) {
  const p = readPrefs();
  const dirs = p.dialogDirs && typeof p.dialogDirs === 'object' ? p.dialogDirs : {};
  const last = typeof dirs[kind] === 'string' && fs.existsSync(dirs[kind]) ? dirs[kind] : undefined;
  const r = await dialog.showOpenDialog(win, { defaultPath: last, ...opts });
  if (!r.canceled && r.filePaths[0]) {
    const dir = opts.properties && opts.properties.includes('openDirectory') ? r.filePaths[0] : path.dirname(r.filePaths[0]);
    const q = readPrefs();
    q.dialogDirs = { ...(q.dialogDirs || {}), [kind]: dir };
    writePrefs(q);
  }
  return r;
}
function readJson(name, fallback = {}) { return readJsonSafe(dataFile(name), fallback); }
function writeJson(name, v) { writeJsonAtomic(dataFile(name), v, true); }
// prefs.json n'est écrit que par le launcher : on le garde en mémoire au lieu de le relire
// plusieurs fois par relevé. Chaque appel reçoit une copie, qu'il peut modifier sans risque.
let prefsCache = null;
const readPrefs = () => structuredClone(prefsCache || (prefsCache = readJson('prefs.json')));
const writePrefs = (p) => { writeJson('prefs.json', p); prefsCache = structuredClone(p); };
const system = () => ({ closeToTray: true, autostart: false, shortcut: true, ...(readPrefs().system || {}) });
// Réglages des fonctions en plus (notifications, Discord, sauvegardes, mises à jour)
const settings = () => {
  const s = readPrefs().settings || {};
  return {
    notify: { downloads: true, promos: true, friends: true, updates: true, storage: true, recaps: true, party: true, ...(s.notify || {}) },
    theme: 'dark', // le launcher n'a plus de mode clair
    overlay: { enabled: true, pauseMin: 120, ...(s.overlay || {}) },
    // Réticule : style commun, et les jeux où il s'affiche tout seul (clé du jeu -> true)
    crosshair: { enabled: true, style: {}, games: {}, ...(s.crosshair || {}) },
    presentMon: s.presentMon || '',
    liveBanners: s.liveBanners !== false,
    gameTint: s.gameTint !== false,
    discordId: s.discordId || '', // ID perso (facultatif) ; vide = celui intégré à l'app
    discordAppId: s.discordId || DISCORD_APP_ID,
    discordAppIdDefault: DISCORD_APP_ID,
    discordEnabled: s.discordEnabled !== false,
    discordBrowse: s.discordBrowse !== false,
    updateRepo: s.updateRepo || '',
    backupDir: s.backupDir || path.join(app.getPath('documents'), 'CLRE-Launcher', 'Sauvegardes'),
    gogDir: s.gogDir || (platform.isWin ? path.join(process.env.SystemDrive || 'C:', '\\', 'GOG Games') : path.join(app.getPath('documents'), 'GOG Games')),
    epicDir: s.epicDir || (platform.isWin ? path.join(process.env.SystemDrive || 'C:', '\\', 'Epic Games') : path.join(app.getPath('documents'), 'Epic Games')),
    autoBackup: s.autoBackup !== false,
    themeCatalog: s.themeCatalog === undefined ? null : s.themeCatalog, // null = catalogue par défaut
  };
};

let win;
let tray;
let quitting = false;
let watchers = [];
let games = new Map(); // key -> jeu
let lib = null;
let running = [];
let sessions;
let saves;
let gog = null;
let epicDl = null;
const discord = new sys.Discord();
const POLL_MS = 5000;

// ---------- Notifications Windows ----------
function notify(kind, title, body, route) {
  // Centre de notifications du launcher : on garde les 50 dernières, même si Windows ne les affiche pas
  try {
    const p = readPrefs();
    const item = { t: Date.now(), kind, title, body, route: route || null };
    p.inbox = [item, ...(p.inbox || [])].slice(0, 50);
    writePrefs(p);
    if (win) win.webContents.send('inbox', item);
  } catch { /* rien */ }
  if (!Notification.isSupported() || !settings().notify[kind]) return;
  const n = new Notification({ title, body, icon: path.join(__dirname, '..', 'assets', 'icon-256.png'), silent: false });
  n.on('click', () => { showWindow(); if (route && win) win.webContents.send('navigate', route); });
  n.show();
}

// ---------- Doublons entre plateformes ----------
// Un jeu Ubisoft, EA ou Battle.net acheté sur Steam (ou Epic) s'enregistre aussi chez son éditeur.
// On garde l'entrée Steam / Epic, qui sait lancer et mettre à jour le jeu, et on masque la copie.
const normDir = (d) => (d ? path.resolve(String(d)).replace(/[\\/]+$/, '').toLowerCase() : '');
function dedupeStores(all) {
  const primary = all.filter((g) => g.store === 'steam' || g.store === 'epic');
  const dirs = new Map();
  for (const g of primary) if (g.installDir) dirs.set(normDir(g.installDir), g);
  const names = new Map();
  for (const g of primary) if (g.name) names.set(normName(g.name), g);
  const steamCommon = /[\\/]steamapps[\\/]common[\\/]/i;
  return all.filter((g) => {
    if (g.store === 'steam' || g.store === 'epic' || g.store === 'custom' || g.store === 'gog') return true;
    const dir = normDir(g.installDir);
    let twin = dir && dirs.get(dir);
    // Installé dans un dossier Steam : forcément la version Steam, même si son nom diffère.
    if (!twin && dir && steamCommon.test(dir + path.sep)) twin = names.get(normName(g.name)) || { alsoOn: [] };
    // EA ne dit pas où le jeu est installé : on se fie au nom.
    if (!twin && g.store === 'ea') twin = names.get(normName(g.name));
    if (!twin) return true;
    if (twin.key) twin.alsoOn = [...new Set([...(twin.alsoOn || []), g.store])];
    return false;
  });
}

// ---------- Collections Steam ----------
// Le launcher n'a pas de collections à lui : les statuts et les collections sont celles de
// Steam. Une modification est écrite dans cloud-storage-namespace-<n>.json, ou mise en
// attente si Steam tourne (Steam réécrirait le fichier).
function ensureSteamStatusMap(libObj, prefs) {
  const ids = new Set((libObj.collections || []).map((c) => c.id));
  const current = prefs.steamStatusMap || {};
  const detected = steamCollections.detectStatusMap(libObj.collections || []);
  const next = { todo: null, playing: null, done: null, dropped: null, ...current };
  let changed = false;
  for (const s of ['todo', 'playing', 'done', 'dropped']) {
    const id = next[s];
    if (id && ids.has(id)) continue; // association valide : on n'y touche pas
    // Collection supprimée ou jamais associée : on reprend la détection par nom.
    next[s] = detected[s] || null;
    if (next[s] !== id) changed = true;
  }
  if (!prefs.steamStatusMap || changed) {
    prefs.steamStatusMap = next;
    writePrefs(prefs);
  }
  return next;
}

const steamPending = () => readPrefs().steamPending || {};
const pendingSteamCount = () => Object.keys(steamPending()).length;
const steamRunning = () => !!(lib && lib.steamPath && steamCollections.isSteamRunning(lib.steamPath));

function newCollectionId() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789*+';
  return 'uc-' + Array.from(crypto.randomBytes(12)).map((b) => alphabet[b % alphabet.length]).join('');
}

// Fusionne des intentions (ajouter/retirer un appid) dans la file d'attente, puis tente
// de les écrire. Si Steam tourne, elles restent en attente et partiront à sa fermeture.
function queueSteamOps(ops) {
  const p = readPrefs();
  const q = p.steamPending || {};
  for (const op of ops || []) {
    if (!op || !op.id) continue;
    const cur = q[op.id] || { id: op.id, add: [], remove: [], create: false, name: '', delete: false };
    cur.add = (cur.add || []).map(Number);
    cur.remove = (cur.remove || []).map(Number);
    for (const a of (op.add || []).map(Number).filter(Number.isFinite)) {
      cur.add = [...new Set([...cur.add.filter((x) => x !== a), a])];
      cur.remove = cur.remove.filter((x) => x !== a);
    }
    for (const a of (op.remove || []).map(Number).filter(Number.isFinite)) {
      cur.remove = [...new Set([...cur.remove.filter((x) => x !== a), a])];
      cur.add = cur.add.filter((x) => x !== a);
    }
    if (op.create) cur.create = true;
    if (op.name) cur.name = op.name;
    if (op.delete) cur.delete = true;
    q[op.id] = cur;
  }
  p.steamPending = q;
  writePrefs(p);
  return flushSteamPending();
}

// Applique les changements en attente à la liste lue sur le disque : l'interface montre
// l'état voulu même quand Steam est ouvert (le fichier, lui, n'est pas encore écrit).
function applyPendingToCollections(libObj, pending, libraryKeys) {
  const q = pending || {};
  const byId = new Map((libObj.collections || []).map((c) => [c.id, c]));
  for (const [id, op] of Object.entries(q)) {
    if (!op) continue;
    if (op.delete) {
      libObj.collections = (libObj.collections || []).filter((c) => c.id !== id);
      byId.delete(id);
      continue;
    }
    let c = byId.get(id);
    if (!c && op.create) {
      c = { id, name: op.name || id, appids: [], apps: [] };
      libObj.collections = [...(libObj.collections || []), c];
      byId.set(id, c);
    }
    if (!c) continue;
    if (op.name) c.name = op.name;
    for (const a of op.add || []) c.appids = [...new Set([...(c.appids || []), Number(a)])];
    for (const a of op.remove || []) c.appids = (c.appids || []).filter((x) => x !== Number(a));
    c.apps = c.appids.map(String).filter((k) => libraryKeys.has(k));
  }
}

function flushSteamPending() {  const p = readPrefs();
  const q = p.steamPending || {};
  const ids = Object.keys(q);
  if (!ids.length) return { ok: true, pending: 0 };
  if (!lib || !lib.steamPath || !lib.user || !lib.user.accountId) return { error: 'Steam introuvable', pending: ids.length };
  if (steamRunning()) return { queued: true, pending: ids.length };
  try {
    const res = steamCollections.apply(lib.steamPath, lib.user.accountId, ids.map((id) => q[id]), { backupDir: dataFile('steam-collections') });
    p.steamPending = {};
    writePrefs(p);
    if (win) win.webContents.send('library-changed');
    return { ok: true, changed: res.changed, pending: 0 };
  } catch (e) {
    return { error: e.message, code: e.code, pending: ids.length };
  }
}

// Attend la fermeture effective de Steam (il peut mettre plusieurs secondes à rendre la main).
async function waitForSteamExit(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (!lib || !lib.steamPath || !steamCollections.isSteamRunning(lib.steamPath)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}


// ---------- Synchronisation de toutes les plateformes ----------
async function sync(fresh) {
  const prefs = readPrefs();
  let steamError = null;
  try {
    lib = await loadLibrary({ apiKey: prefs.apiKey, steamId: prefs.steamId, fresh });
  } catch (e) {
    steamError = e.message;
    lib = { steamPath: null, user: { name: '?', id64: null }, users: [], games: [], collections: [], watchPaths: [] };
  }
  const epicStats = readJson('epic-stats.json');
  const epic = platform.loadEpic(epicStats);
  // Jeux Epic gérés sans le Epic Games Launcher (Legendary) : possédés et installés
  if (epicDl && platform.supports.directDownloads) {
    const byApp = new Map(epic.games.map((g) => [g.appName, g]));
    const owned = epicDl.ownedGames(() => win && win.webContents.send('library-changed'));
    const fromOwned = (o) => makeEpicGame({ id: o.catalogItemId, namespace: o.namespace, title: o.title, developer: o.developer, keyImages: o.keyImages }, null, o.appName, epicStats);
    for (const o of owned) {
      if (byApp.has(o.appName)) { byApp.get(o.appName).thirdParty = o.thirdParty; continue; }
      const g = fromOwned(o);
      g.thirdParty = o.thirdParty;
      byApp.set(o.appName, g);
      epic.games.push(g);
    }
    for (const [app, i] of Object.entries(epicDl.installedMap())) {
      let g = byApp.get(app);
      if (!g) { g = fromOwned({ appName: app, title: i.title || app }); byApp.set(app, g); epic.games.push(g); }
      Object.assign(g, {
        installed: true, viaLegendary: true, needsUpdate: epicDl.needsUpdate(app), installDir: i.install_path, library: path.dirname(i.install_path),
        sizeOnDisk: Number(i.install_size || 0) || g.sizeOnDisk,
        processNames: [...new Set([...g.processNames, ...(i.executable ? [path.basename(i.executable).toLowerCase()] : [])])],
      });
    }
    epicDl.checkUpdates(() => win && win.webContents.send('library-changed'));
  }
  let more = [];
  try { more = await platform.loadMorePlatforms(); } catch { more = []; }
  const others = [...platform.loadPlatforms(prefs.customGames || []), ...more];
  // Jeux GOG possédés mais pas installés (compte GOG connecté dans le launcher)
  if (gog) {
    const have = new Set(others.filter((g) => g.store === 'gog').map((g) => g.platformId));
    let owned = [];
    try { owned = await gog.ownedGames(); } catch (e) { console.warn('GOG : jeux possédés indisponibles :', e.message); }
    for (const o of owned || []) if (!have.has(o.id)) others.push(base('gog', o.id, o.title));
    // Mises à jour GOG : résultat connu tout de suite, vérification en fond (au plus toutes les 6 h par jeu)
    const gogInstalled = others.filter((g) => g.store === 'gog' && g.installed);
    for (const g of gogInstalled) g.needsUpdate = gog.updateFlag(g.platformId);
    gog.checkUpdates(gogInstalled).then((changed) => { if (changed && win) win.webContents.send('library-changed'); }).catch(() => {});
  }
  const artCache = readJson('art-cache.json');
  applyArt(others, artCache);

  // Temps de jeu hors Steam : ce que le launcher a mesuré lui-même
  const totals = sessions.totals();
  for (const g of [...epic.games, ...others]) {
    const t = totals[g.key];
    if (!t) continue;
    g.playtime += Math.round(t.seconds / 60);
    g.lastPlayed = Math.max(g.lastPlayed, t.last);
  }

  const all = dedupeStores([...lib.games, ...epic.games, ...others]);
  if (steamError && !all.length) throw new Error(steamError);
  // Les changements en attente (Steam ouvert) sont reflétés dans l'interface.
  applyPendingToCollections(lib, prefs.steamPending, new Set(all.map((g) => g.key)));
  // Statuts : lus dans les collections Steam de l'utilisateur, jamais dans un champ local.
  const statusMap = ensureSteamStatusMap(lib, prefs);
  for (const g of all) g.status = g.store === 'steam' ? steamCollections.statusForApp(lib.collections || [], statusMap, g.appid) : '';
  lib.statusMap = statusMap;
  lib.statusLabels = Object.fromEntries(Object.entries(statusMap).filter(([, id]) => id)
    .map(([s, id]) => [s, ((lib.collections || []).find((c) => c.id === id) || {}).name || s]));
  lib.dynamicCollections = lib.dynamicCollections || [];
  lib.steamPending = pendingSteamCount();
  lib.steamRunning = steamRunning();
  // Des changements ont été mis en attente pendant que Steam tournait : on tente l'écriture
  // dès que Steam est fermé (au démarrage, ou quand il vient de quitter).
  if (lib.steamPending && !lib.steamRunning) setTimeout(() => flushSteamPending(), 500);
  // Jaquettes choisies à la main
  const covers = prefs.coverOverrides || {};
  for (const g of all) if (covers[g.key]) { g.art = { ...g.art, cover: covers[g.key] }; g.coverCustom = true; }
  // Mise à jour disponible pour un jeu marqué « En cours »
  const status = (prefs.local && prefs.local.status) || {};
  for (const g of all) {
    if (g.needsUpdate && status[g.key] === 'playing' && !notifiedUpdates.has(g.key)) {
      notifiedUpdates.add(g.key);
      notify('updates', `Mise à jour pour ${g.name}`, g.store === 'steam' ? 'Steam va la télécharger avant ta prochaine partie' : 'Clique sur « Mettre à jour » dans le launcher', { view: 'game', id: g.key });
    }
  }
  // Succès lus en local : compteur par jeu Steam
  try {
    const sums = gameinfo.achievementSummaries(lib.steamPath, lib.user.accountId, lib.games.filter((g) => g.store === 'steam').map((g) => g.appid));
    for (const g of all) if (g.store === 'steam' && sums[g.appid]) g.ach = sums[g.appid];
  } catch {}
  lib.games = all.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));
  lib.platforms = platform.platformIds.map((s) => ({ id: s, count: all.filter((g) => g.store === s).length }));
  lib.steamError = steamError;
  lib.running = running;
  lib.hasApiKey = !!prefs.apiKey;
  lib.canAutostart = app.isPackaged;
  games = new Map(all.map((g) => [g.key, g]));
  setTimeout(checkDisks, 8000);

  const paths = [...lib.watchPaths];
  if (epic.available) paths.push(path.join(platform.epicDataDir, 'Manifests'));
  watch(paths);
  delete lib.watchPaths;
  updateTray();

  // Visuels manquants (GOG, Ubisoft, EA, jeux ajoutés) cherchés en arrière-plan
  // Tags du magasin Steam : noms en français + tags des jeux hors Steam reliés à une fiche
  tags = tags || new Tags(dataFile('tag-names.json'), dataFile('tags-cache.json'));
  lib.tagNames = tags.names.map;
  const missing = tags.apply(all);
  (async () => {
    const before = Object.keys(tags.names.map).length;
    await tags.loadNames();
    const more = missing.length ? await tags.fetchMissing(missing) : false;
    if ((more || (!before && Object.keys(tags.names.map).length)) && win) win.webContents.send('library-changed');
  })();
  resolveArt(others, artCache).then((changed) => {
    if (!changed) return;
    writeJson('art-cache.json', artCache);
    if (win) win.webContents.send('library-changed');
  });
  return lib;
}

// Pendant un téléchargement, Steam réécrit sans arrêt ses manifestes et le dossier « downloading » :
// ça ne doit pas relancer toute la synchro. On ne réagit qu'aux jeux ajoutés ou retirés (création ou
// suppression d'un manifeste) et aux changements de bibliothèques ; la fin d'un téléchargement est
// repérée par le relevé des téléchargements (pollDownloads).
const IGNORED_STEAMAPPS = /^(downloading|temp|shadercache|workshop|compatdata|sourcemods)([\\/]|$)/i;
function watch(paths) {
  watchers.forEach((w) => w.close());
  watchers = [];
  let timer;
  const later = () => { clearTimeout(timer); timer = setTimeout(() => win && win.webContents.send('library-changed'), 1500); };
  for (const p of paths) {
    const steamapps = /[\\/]steamapps$/i.test(p);
    const userConfig = /[\\/]userdata[\\/]\d+[\\/]config$/i.test(p);
    try {
      watchers.push(fs.watch(p, (ev, name) => {
        // Steam écrit sans arrêt dans userdata/<id>/config : seuls le temps de jeu (localconfig.vdf)
        // et les collections (cloudstorage) intéressent la bibliothèque.
        if (userConfig && !/^(localconfig\.vdf|cloudstorage)([\\/]|$)/i.test(String(name || ''))) return;
        if (steamapps) {
          const f = String(name || '');
          if (IGNORED_STEAMAPPS.test(f)) return;
          if (/^appmanifest_\d+\.acf$/i.test(f) && ev === 'change') return;
        }
        later();
      }));
    } catch { /* dossier absent */ }
  }
}

// ---------- Jeux en cours + sessions ----------
// Le relevé des processus dépend de l'OS : tasklist/qprocess sous Windows, ps sous macOS.

// Un relevé à la fois : si le relevé est lent, le suivant attend au lieu de s'empiler.
let polling = false;
async function pollRunningSafe() {
  if (polling) return;
  polling = true;
  try { await pollRunning(); } catch (e) { console.warn('Relevé des jeux lancés :', e.message); } finally { polling = false; }
}

async function pollRunning() {
  const now = [];
  const watched = [...games.values()].filter((g) => g.store !== 'steam' && g.installed && g.processNames && g.processNames.length);
  // Registre Steam (registry.vdf sous macOS) et liste des processus lus en même temps, sans bloquer l'interface
  const [steamId, procs] = await Promise.all([platform.steamRunningAppId(), watched.length ? platform.runningAmong(new Set(watched.flatMap((g) => g.processNames))) : null]);
  if (steamId) now.push(String(steamId));
  if (procs) for (const g of watched) if (g.processNames.some((p) => procs.has(p))) now.push(g.key);
  const names = Object.fromEntries(now.map((k) => [k, (games.get(k) || {}).name || k]));
  sessions.tick(now, names);

  for (const k of now) if (!runStart[k]) { runStart[k] = Date.now(); pauseShown[k] = 0; if (perf && platform.supports.perf) perf.start(k, (games.get(k) || {}).processNames || []); }
  for (const k of Object.keys(runStart)) if (!now.includes(k)) {
    delete runStart[k]; delete pauseShown[k];
    const done = perf && platform.supports.perf && perf.stop(k, (games.get(k) || {}).name || k);
    if (done && win) win.webContents.send('perf-saved', k);
  }
  checkPause();
  const prev = running;
  running = now;
  if (prev.join('|') === now.join('|')) return;
  syncCrosshair();
  if (win) win.webContents.send('running-changed', now);
  const stopped = prev.filter((k) => !now.includes(k));
  // Une partie vient de finir : on rafraîchit pour afficher le nouveau temps de jeu
  // (jeux hors Steam, et jeux Steam dont l'appid vient de disparaître).
  if (win && stopped.some((k) => k.includes(':') || /^\d+$/.test(k))) win.webContents.send('library-changed');

  // Statut Discord : le premier jeu en cours (phrases qui tournent), sinon la navigation dans le launcher
  if (presence) presence.setGame(now.find((k) => games.has(k)) || null);

  // Sauvegarde automatique des sauvegardes à la fin d'une partie
  if (settings().autoBackup && platform.supports.saves) {
    for (const k of stopped) {
      const sg = games.get(k);
      if (!sg) continue;
      saves.backup(sg, [...games.values()], lib && lib.user.accountId, 'fin de partie')
        .then(() => win && win.webContents.send('saves-changed', k))
        .catch(() => { /* jeu absent de la base ou sans sauvegarde locale */ });
    }
  }
}

let lastDownloads = [];
let lastSig = '';
// Vitesse Steam : Steam n'écrit que les octets reçus, on la calcule d'un relevé à l'autre (moyenne lissée)
const steamRate = new Map(); // key -> { bytes, t, speed }
function withSteamSpeed(list) {
  const now = Date.now();
  for (const d of list) {
    const prev = steamRate.get(d.key);
    let speed = 0;
    if (prev && d.phase === 'downloading' && d.bytes >= prev.bytes && now > prev.t) {
      const inst = ((d.bytes - prev.bytes) * 1000) / (now - prev.t);
      speed = d.bytes === prev.bytes ? prev.speed * 0.6 : prev.speed ? prev.speed * 0.6 + inst * 0.4 : inst;
      if (speed < 1024) speed = 0;
    }
    // Les octets ne bougent pas entre deux écritures du manifeste : on garde l'ancien point de départ
    steamRate.set(d.key, prev && d.bytes === prev.bytes ? { ...prev, speed } : { bytes: d.bytes, t: now, speed });
    d.speed = d.phase === 'downloading' ? Math.round(speed) : 0;
  }
  for (const k of steamRate.keys()) if (!list.some((d) => d.key === k)) steamRate.delete(k);
  return list;
}
const allDownloads = () => [...(lib && lib.steamPath ? withSteamSpeed(extras.steamDownloads(lib.steamPath)) : []), ...(gog ? gog.list() : []), ...(epicDl ? epicDl.list() : [])];
let dlSkipped = 0;
function pollDownloads(force) {
  if (!win) return;
  // Fenêtre cachée ou réduite, et rien ne télécharge : un relevé sur quatre suffit (12 s au lieu de 3).
  // Chaque relevé relit le dossier de chaque bibliothèque Steam.
  const away = !win.isVisible() || win.isMinimized();
  if (force !== true && away && !lastDownloads.some((d) => d.active) && ++dlSkipped % 4) return;
  const list = allDownloads();
  const sig = JSON.stringify(list);
  if (sig === lastSig) return;
  // Un téléchargement Steam vraiment commencé qui disparaît de la liste : il est fini (GOG et Epic préviennent eux-mêmes)
  const finished = lastDownloads.filter((d) => d.store === 'steam' && d.phase !== 'scheduled' && !list.some((x) => x.key === d.key));
  for (const d of finished) notify('downloads', `${d.name} est prêt`, d.kind === 'update' ? 'Mise à jour terminée' : 'Téléchargement terminé, tu peux lancer le jeu', { view: 'game', id: d.key });
  if (finished.length) win.webContents.send('library-changed');
  lastDownloads = list;
  lastSig = sig;
  win.webContents.send('downloads', list);
}

// ---------- Veille en arrière-plan : promos de la liste de souhaits, amis ----------
const notifiedUpdates = new Set();
const normName = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '');
function ownsByName(name) { const n = normName(name); return [...games.values()].some((g) => normName(g.name) === n); }
async function checkEpicFree() {
  try {
    const list = (await gameinfo.epicFree()).filter((x) => x.now && !ownsByName(x.name));
    const p = readPrefs();
    const seen = new Set(p.seenEpicFree || []);
    const fresh = list.filter((x) => !seen.has(x.id));
    p.seenEpicFree = [...new Set([...seen, ...list.map((x) => x.id)])].slice(-60);
    writePrefs(p);
    if (fresh.length) notify('promos', fresh.length === 1 ? `${fresh[0].name} est gratuit sur Epic` : `${fresh.length} jeux gratuits sur Epic`, fresh.length === 1 ? 'À récupérer cette semaine, il reste à toi ensuite' : fresh.map((x) => x.name).join(' · '), { view: 'wishlist' });
  } catch { /* hors ligne */ }
}
async function checkPromos() {
  checkEpicFree();
  if (!lib || !lib.user.id64) return;
  try {
    const w = await extras.wishlist(lib.user.id64);
    if (!w.list) return;
    const p = readPrefs();
    const seen = p.seenDiscounts || {};
    const fresh = w.list.filter((x) => x.discount > 0 && (seen[x.appid] || 0) < x.discount);
    p.seenDiscounts = Object.fromEntries(w.list.filter((x) => x.discount > 0).map((x) => [x.appid, x.discount]));
    writePrefs(p);
    if (fresh.length === 1) notify('promos', `${fresh[0].name} est en promo`, `−${fresh[0].discount} % · ${fresh[0].price}`, { view: 'wishlist' });
    else if (fresh.length > 1) notify('promos', `${fresh.length} jeux de ta liste en promo`, fresh.slice(0, 3).map((x) => `${x.name} −${x.discount} %`).join(' · '), { view: 'wishlist' });
  } catch { /* hors ligne */ }
}
let friendGames = null;
async function checkFriends() {
  const key = readPrefs().apiKey;
  if (!key || !lib || !lib.user.id64) return;
  try {
    const f = await extras.friends(key, lib.user.id64);
    if (!f.list) return;
    const nowGames = Object.fromEntries(f.list.map((p) => [p.id, p.gameId]));
    if (friendGames) {
      for (const p of f.list) {
        if (!p.gameId || friendGames[p.id] === p.gameId) continue;
        const g = games.get(p.gameId);
        if (g) notify('friends', `${p.name} joue à ${g.name}`, 'Tu as le jeu aussi', { view: 'game', id: g.key });
      }
    }
    friendGames = nowGames;
  } catch { /* hors ligne */ }
}

// ---------- Actions ----------
// Options de lancement par jeu : arguments, applis à ouvrir avant, applis à fermer avant.
const launchOpts = (key) => (readPrefs().launchOpts || {})[key] || {};
function beforeLaunch(key) {
  const o = launchOpts(key);
  for (const proc of o.close || []) {
    if (PROC_RE.test(proc)) platform.killProcess(proc);
  }
  for (const exe of o.open || []) {
    if (isProgram(exe) && fs.existsSync(exe)) platform.startFile(exe, '', path.dirname(exe), () => {});
  }
  return o.args || '';
}

// Démarre un programme : .exe/.lnk/.bat via la couche Windows, bundle .app via « open » sous macOS.
function startFile(file, argStr, cwd, onError) {
  platform.startFile(file, argStr, cwd, onError);
}

function launchExe(g, extra = '') {
  startFile(g.exe, `${g.args || g.launchParam || ''} ${extra}`, g.workingDir || path.dirname(g.exe),
    () => win && win.webContents.send('toast', `Impossible de lancer ${g.name}`));
}

// Heroic sait lancer ses jeux (y compris les builds Windows via Wine) par son protocole.
// gui=false évite d'ouvrir sa fenêtre quand tout se passe bien.
const heroicUri = (g) => `heroic://launch?appName=${encodeURIComponent(g.platformId || g.appName || '')}&runner=${encodeURIComponent(g.heroicRunner || 'legendary')}&gui=false`;

function action(key, kind) {
  const g = games.get(String(key));
  if (!g) return;
  const open = (uri) => shell.openExternal(uri);
  const search = (site) => open(site + encodeURIComponent(g.name));
  const extra = kind === 'play' ? beforeLaunch(g.key) : '';
  switch (g.store) {
    case 'epic':
      // Géré par Heroic (bundle macOS natif ou build Windows via Wine) : c'est lui qui lance.
      if (g.viaHeroic) {
        if (kind === 'play') return g.exe ? launchExe(g, extra) : open(heroicUri(g));
        if (kind === 'install') return open(heroicUri(g));
      }
      // Installés par le launcher (Legendary) : lancement et désinstallation sans le Epic Games Launcher
      if (g.viaLegendary && kind === 'play' && g.needsUpdate) return epicDl.enqueue(g.appName, g.name, { update: true }).catch((e) => ({ error: e.message }));
      if (g.viaLegendary && kind === 'play') return epicDl.launch(g.appName);
      if (g.viaLegendary && kind === 'uninstall') return epicDl.uninstall(g.appName).then(() => { if (win) win.webContents.send('library-changed'); return { ok: true }; }).catch((e) => ({ error: e.message }));
      if (kind === 'play') return open(epicUri(g, 'launch'));
      if (kind === 'install-egl') return open(epicUri(g, 'install'));
      if (kind === 'install' && epicDl && platform.supports.directDownloads) {
        if (!epicDl.user()) return { needLogin: true };
        return epicDl.enqueue(g.appName, g.name).catch((e) => ({ error: e.message, needLogin: e.code === 'nologin' }));
      }
      if (kind === 'install') return open(epicUri(g, 'install'));
      if (kind === 'store') return search('https://store.epicgames.com/browse?q=');
      return open('com.epicgames.launcher://store/library');
    case 'gog':
      // Installé ou possédé via Heroic : lancement (ou proposition d'installation) par Heroic.
      if (g.viaHeroic) {
        if (kind === 'play') return g.exe ? launchExe(g, extra) : open(heroicUri(g));
        if (kind === 'install') return open(heroicUri(g));
      }
      // Mise à jour disponible : le bouton « Mettre à jour » réinstalle par-dessus avec le dernier installateur
      if (kind === 'play' && g.needsUpdate && gog && gog.auth) {
        return gog.enqueue(g.platformId, g.name, { installDir: g.installDir }).catch((e) => ({ error: e.message }));
      }
      if (kind === 'play' && g.exe) return launchExe(g, extra);
      if (kind === 'store') return search('https://www.gog.com/fr/games?query=');
      if (kind === 'uninstall' && gog) {
        return gog.uninstall(g.installDir, g.platformId).then(() => { if (win) win.webContents.send('library-changed'); return { ok: true }; }).catch((e) => ({ error: e.message }));
      }
      // Installation directe, sans GOG Galaxy, quand le compte GOG est connecté
      if (kind === 'install' && gog && platform.supports.directDownloads) {
        if (!gog.auth) return { needLogin: true };
        return gog.enqueue(g.platformId, g.name).catch((e) => ({ error: e.message, needLogin: e.code === 'nologin' }));
      }
      return open(`goggalaxy://openGameView/${g.platformId}`);
    case 'ubisoft':
      if (kind === 'store') return search('https://store.ubisoft.com/fr/search?q=');
      return open(`uplay://launch/${g.platformId}/0`);
    case 'ea':
      if (kind === 'play' && g.exe) return launchExe(g, extra);
      if (kind === 'store') return search('https://www.ea.com/fr-fr/games/library?q=');
      return open(`origin2://game/launch?offerIds=${encodeURIComponent(g.platformId)}`);
    case 'xbox':
      if (kind === 'store') return open(g.storeId ? `ms-windows-store://pdp/?productid=${g.storeId}` : `ms-windows-store://search/?query=${encodeURIComponent(g.name)}`);
      if (kind === 'play') return spawn('explorer.exe', ['shell:AppsFolder\\' + g.aumid], { detached: true, stdio: 'ignore' }).unref();
      return open('xbox://');
    case 'battlenet':
      if (kind === 'play' && g.bnetExe && g.bnetCode) return spawn(g.bnetExe, [`--exec=launch ${g.bnetCode}`], { detached: true, stdio: 'ignore' }).unref();
      if (kind === 'store') return search('https://shop.battle.net/fr-fr/search?q=');
      return open(g.bnetCode ? `battlenet://${g.bnetCode}` : 'battlenet://');
    case 'riot':
      if (platform.isMac && g.exe && kind === 'play') return launchExe(g, extra);
      if (g.riotClient && (kind === 'play' || kind === 'install')) return spawn(g.riotClient, [`--launch-product=${g.platformId}`, '--launch-patchline=live'], { detached: true, stdio: 'ignore' }).unref();
      return open('https://www.riotgames.com/fr');
    case 'amazon':
      if (g.viaHeroic) {
        if (kind === 'play') return g.exe ? launchExe(g, extra) : open(heroicUri(g));
        if (kind === 'install') return open(heroicUri(g));
      }
      if (kind === 'play' && g.exe) return launchExe(g, extra);
      if (kind === 'store') return search('https://gaming.amazon.com/search?q=');
      return open(kind === 'play' ? `amazon-games://play/${g.platformId}` : 'amazon-games://');
    case 'itch':
      if (kind === 'play' && g.exe) return launchExe(g, extra);
      if (kind === 'store') return search('https://itch.io/search?q=');
      return open(`itch://games/${g.platformId}`);
    case 'custom':
      if (kind === 'play') return launchExe(g, extra);
      return undefined;
    default: {
      const id = Number(g.appid);
      // Avec des arguments, Steam les transmet via steam://run/<id>//<args>/
      const play = extra ? `steam://run/${id}//${encodeURIComponent(extra)}/` : `steam://rungameid/${id}`;
      const uris = { play, install: `steam://install/${id}`, uninstall: `steam://uninstall/${id}`, store: `steam://store/${id}`, details: `steam://nav/games/details/${id}` };
      if (uris[kind]) open(uris[kind]);
    }
  }
}

// ---------- Fenêtre, barre des tâches, raccourci ----------
// Logo « Pile de jaquettes » : variantes dessinées pour 16 et 32 px (tray.png + tray@2x.png)
const ASSETS = path.join(__dirname, '..', 'assets');
function trayIcon() {
  const img = nativeImage.createFromPath(path.join(ASSETS, 'tray.png'));
  const hi = nativeImage.createFromPath(path.join(ASSETS, 'tray@2x.png'));
  if (!hi.isEmpty()) img.addRepresentation({ scaleFactor: 2, buffer: hi.toPNG() });
  return img;
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function updateTray() {
  if (!tray) return;
  const recent = [...games.values()].filter((g) => g.installed && g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 5);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir CLRE-Launcher', click: showWindow },
    { type: 'separator' },
    ...(recent.length ? [{ label: 'Jouer à', enabled: false }, ...recent.map((g) => ({ label: g.name, click: () => action(g.key, 'play') })), { type: 'separator' }] : []),
    ...(themes && themes.active().id !== 'graphite' ? [{ label: 'Revenir au thème par défaut', click: resetTheme }, { type: 'separator' }] : []),
    { label: 'Quitter', click: () => { quitting = true; app.quit(); } },
  ]));
}

// ---------- Fenêtre : sombre par défaut ; un thème peut demander le clair et une matière Windows 11 ----------
// Windows 11 22H2+ : la matière n'apparaît que si la fenêtre est CRÉÉE avec (l'activer ensuite ne fait rien).
// On la crée donc toujours avec Mica ; les thèmes normaux gardent un fond plein par-dessus.
const MATERIAL_OK = process.platform === 'win32' && Number(String(process.getSystemVersion()).split('.')[2] || 0) >= 22621;
function applyTheme() {
  const t = themes ? themes.active() : { colorScheme: 'dark', windowMaterial: 'none' };
  const light = t.colorScheme === 'light';
  const material = t.windowMaterial || 'none';
  // La matière (Mica…) teinte selon le mode clair/sombre de l'application
  nativeTheme.themeSource = material !== 'none' && light ? 'light' : 'dark';
  if (win && !win.isDestroyed()) {
    // Mica ne se voit qu'à travers une fenêtre transparente ; sinon le fond sombre habituel le recouvre
    if (MATERIAL_OK && material !== 'none') { try { win.setBackgroundMaterial(material); } catch { /* matière refusée */ } }
    win.setBackgroundColor(material !== 'none' ? '#00000000' : '#111113');
    if (!platform.isMac) { try { win.setTitleBarOverlay({ color: '#00000000', symbolColor: light ? '#1f1f1f' : '#a1a1a6', height: 36 }); } catch { /* fenêtre sans barre personnalisée */ } }
  }
}

// ---------- Thèmes de la communauté ----------
// Sans échec : CLRE-Launcher.exe --safe-mode démarre avec le thème par défaut, sans toucher au choix enregistré.
let themes = null;
// Catalogue par défaut : index.json du dépôt public des thèmes (modifiable dans les réglages)
const THEME_CATALOG = 'https://raw.githubusercontent.com/jclementc/clre-themes/main/index.json';
function resetTheme() {
  if (!themes) return;
  themes.reset();
  themes.watch();
  applyTheme();
  if (win && !win.isDestroyed()) win.webContents.reload();
  updateTray();
}

// ---------- Infos en jeu ----------
const overlay = new Overlay();
const runStart = {};
let perf = null;
let presence = null;
let tags = null;
let rarity = null;
const pauseShown = {};
function overlayInfo(message) {
  const k = running.find((x) => games.has(x));
  const g = k ? games.get(k) : null;
  return { game: g ? g.name : '', start: g ? runStart[k] || Date.now() : Date.now(), message: message || '' };
}
function checkPause() {
  const st = settings().overlay;
  if (!st.enabled || !st.pauseMin) return;
  for (const k of running) {
    const mins = Math.floor((Date.now() - (runStart[k] || Date.now())) / 60000);
    const step = Math.floor(mins / st.pauseMin);
    if (step >= 1 && (pauseShown[k] || 0) < step) {
      pauseShown[k] = step;
      const h = Math.floor(mins / 60); const m = mins % 60;
      overlay.show(overlayInfo(`Ça fait ${h ? `${h}h${m ? String(m).padStart(2, '0') : ''}` : `${m} min`} que tu joues. Pense à faire une pause : bois un verre d’eau, regarde au loin.`), 12000);
    }
  }
}

// ---------- Réticule ----------
const crosshair = new Crosshair();
let crossManual = false; // affiché à la main hors d'un jeu reconnu
function syncCrosshair() {
  if (!platform.supports.crosshair) return;
  const c = settings().crosshair;
  const want = c.enabled && (crossManual || running.some((k) => c.games[k]));
  // Exécutables du jeu en cours (jeux hors Steam), pour centrer sur sa fenêtre
  const k = running.find((x) => c.games[x]) || running.find((x) => games.has(x));
  const names = (k && (games.get(k) || {}).processNames) || [];
  if (want) { if (crosshair.visible) crosshair.update(c.style); else crosshair.show(c.style, names); } else crosshair.hide();
}
// Ctrl + Alt + X : dans un jeu, allume ou éteint le réticule et retient le choix pour ce jeu ;
// hors jeu, l'affiche ou le cache simplement.
function toggleCrosshair() {
  const k = running.find((x) => games.has(x));
  if (!k) { crossManual = !crosshair.visible; syncCrosshair(); return; }
  const p = readPrefs();
  const c = settings().crosshair;
  const list = { ...c.games };
  const on = !crosshair.visible;
  if (on) list[k] = true; else delete list[k];
  crossManual = false;
  p.settings = { ...(p.settings || {}), crosshair: { ...((p.settings || {}).crosshair || {}), games: list } };
  writePrefs(p);
  syncCrosshair();
  if (win) win.webContents.send('crosshair-games', list);
}

// ---------- Récaps prêts (semaine, mois, année) ----------
function periodIds(d = new Date()) {
  const day = (d.getDay() + 6) % 7; // lundi = 0
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return { week: monday.toISOString().slice(0, 10), month: `${d.getFullYear()}-${d.getMonth() + 1}`, year: String(d.getFullYear()), monday };
}
function checkRecaps() {
  try {
    const p = readPrefs();
    const seen = p.recapSeen || {};
    const ids = periodIds();
    const d = new Date();
    const prev = {
      week: [ids.monday.getTime() / 1000 - 7 * 86400, ids.monday.getTime() / 1000],
      month: [new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime() / 1000, new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000],
      year: [new Date(d.getFullYear() - 1, 0, 1).getTime() / 1000, new Date(d.getFullYear(), 0, 1).getTime() / 1000],
    };
    const label = { week: 'de la semaine', month: 'du mois', year: 'de l’année' };
    let sent = false;
    for (const k of ['year', 'month', 'week']) {
      if (seen[k] === ids[k]) continue;
      const first = !seen[k];
      seen[k] = ids[k];
      if (first || sent) continue; // pas de notification au tout premier lancement
      const [from, to] = prev[k];
      const secs = sessions.list.filter((x) => x.end > from && x.start < to).reduce((a, x) => a + Math.min(x.end, to) - Math.max(x.start, from), 0);
      if (secs < 600) continue;
      notify('recaps', `Ton récap ${label[k]} est prêt`, `${Math.floor(secs / 3600)}h${String(Math.round((secs % 3600) / 60)).padStart(2, '0')} de jeu. Ouvre ta story`, { view: 'recap', story: k, offset: -1 });
      sent = true;
    }
    p.recapSeen = seen;
    writePrefs(p);
  } catch { /* rien */ }
}

// ---------- Disque presque plein ----------
function checkDisks() {
  try {
    const p = readPrefs();
    const last = p.diskAlerts || {};
    const DAY = 86400000;
    for (const d of extras.disks([...games.values()])) {
      if (!d.total) continue;
      const low = d.free < 0.08 * d.total || d.free < 25e9;
      if (!low || (last[d.root] || 0) > Date.now() - DAY) continue;
      last[d.root] = Date.now();
      const old = [...games.values()].filter((g) => g.installed && g.sizeOnDisk && g.installDir && g.installDir.toUpperCase().startsWith(d.root) && (!g.lastPlayed || g.lastPlayed < Date.now() / 1000 - 180 * 86400));
      const gb = Math.round(old.reduce((s2, g) => s2 + g.sizeOnDisk, 0) / 1e9);
      const label = d.root.replace(/[\\/]+$/, '') || (platform.isMac ? 'Macintosh HD' : d.root);
      notify('storage', `Disque ${label} presque plein`, `${Math.round(d.free / 1e9)} Go libres${gb ? ` · ${gb} Go récupérables sur ${old.length} jeu${old.length > 1 ? 'x' : ''} pas lancé${old.length > 1 ? 's' : ''} depuis 6 mois` : ''}`, { view: 'storage' });
    }
    p.diskAlerts = last;
    writePrefs(p);
  } catch { /* rien */ }
}

function applySystem() {
  const s = system();
  globalShortcut.unregisterAll();
  if (s.shortcut) globalShortcut.register(platform.accelerators.window, () => (win && win.isVisible() && win.isFocused() ? win.hide() : showWindow()));
  const st = settings();
  if (st.overlay.enabled && platform.supports.overlay) globalShortcut.register(platform.accelerators.overlay, () => overlay.toggle(overlayInfo()));
  else overlay.hide();
  if (st.crosshair.enabled && platform.supports.crosshair) globalShortcut.register(platform.accelerators.crosshair, toggleCrosshair);
  syncCrosshair();
  applyTheme();
  if (app.isPackaged) platform.loginItem(app, !!s.autostart);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: !process.argv.includes('--hidden') && !playArg(process.argv),
    backgroundColor: (nativeTheme.themeSource = 'dark', '#111113'),
    ...(MATERIAL_OK ? { backgroundMaterial: 'mica' } : {}),
    icon: path.join(ASSETS, 'icon-256.png'),
    // macOS : barre native avec les feux de circulation, la zone de glissement vient du CSS.
    ...(platform.isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 14 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#00000000', symbolColor: '#a1a1a6', height: 36 } }),
    // sandbox : la page tourne dans le bac à sable de Chromium ; le preload n'a besoin que d'ipcRenderer
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Un fichier déposé à côté d'une zone prévue ne doit pas remplacer la page du launcher
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(pathToFileURL(path.join(__dirname, 'renderer')).href)) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  if (presence && !win.isVisible()) presence.visible = false; // lancé réduit dans la barre des tâches
  for (const ev of ['show', 'restore', 'focus']) win.on(ev, () => presence && presence.setVisible(true));
  for (const ev of ['hide', 'minimize']) win.on(ev, () => presence && presence.setVisible(false));
  win.on('close', (e) => {
    if (!quitting && system().closeToTray) { e.preventDefault(); win.hide(); }
  });
  setInterval(pollRunningSafe, POLL_MS);
  setInterval(pollDownloads, 3000);
}

// Raccourci Bureau : CLRE-Launcher.exe --play=<clé>
const playArg = (argv) => { const a = argv.find((x) => x.startsWith('--play=')); return a ? a.slice(7) : null; };
async function playFromArgs(argv) {
  const key = playArg(argv);
  if (!key) return false;
  if (!games.size) { try { await sync(); } catch { return false; } }
  action(key, 'play');
  const g = games.get(key);
  if (g && win) win.webContents.send('toast', `Lancement de ${g.name}…`);
  return true;
}
app.on('second-instance', async (_e, argv) => { if (!(await playFromArgs(argv))) showWindow(); });
// macOS : cliquer sur l'icône du Dock quand la fenêtre est fermée la rouvre
app.on('activate', () => showWindow());
app.on('before-quit', () => { quitting = true; });

app.whenReady().then(() => {
  sessions = new extras.Sessions(dataFile('sessions.json'));
  perf = new Perf(dataFile('perf'), () => settings().presentMon);
  rarity = new journal.Rarity(dataFile('ach-global.json'));
  // Export vidéo du récap : la page filme sa propre fenêtre
  // On filme directement la page (capture d'onglet) : pas de capture d'écran de Windows, qui échouait
  // (« Error starting capture ») et qui aurait aussi filmé ce qui passe par-dessus la fenêtre.
  hardenSession(session.defaultSession);
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    // Seule la page du launcher peut se filmer elle-même
    if (win && !win.isDestroyed() && req.frame && req.frame === win.webContents.mainFrame) { cb({ video: req.frame }); return; }
    cb({});
  });
  setTimeout(checkRecaps, 20000);
  setInterval(checkRecaps, 6 * 3600 * 1000);
  saves = new Saves({ dataDir: app.getPath('userData'), documents: app.getPath('documents'), getBackupDir: () => settings().backupDir });
  const coversDir = dataFile('covers');
  if (platform.supports.directDownloads) {
    gog = new Gog({
      dataDir: app.getPath('userData'),
      getDir: () => settings().gogDir,
      onChange: () => pollDownloads(true),
      onDone: (j) => {
        notify('downloads', `${j.name} est installé`, 'Tu peux lancer le jeu', { view: 'game', id: j.key });
        if (win) win.webContents.send('library-changed');
      },
    });
    epicDl = new EpicDl({
      dataDir: app.getPath('userData'),
      getDir: () => settings().epicDir,
      onChange: () => pollDownloads(true),
      onDone: (j) => {
        notify('downloads', `${j.name} est installé`, 'Tu peux lancer le jeu', { view: 'game', id: j.key });
        if (win) win.webContents.send('library-changed');
      },
    });
  } else {
    const { NoopDownloads } = require('./platform/noop-downloads');
    gog = new NoopDownloads('gog');
    epicDl = new NoopDownloads('epic');
  }

  protocol.handle('steamart', (req) => {
    let file;
    try { file = path.normalize(decodeURIComponent(new URL(req.url).pathname.slice(1))); } catch { return new Response('', { status: 400 }); }
    // Uniquement des images, sur un disque local, dans les dossiers d'images de Steam ou les jaquettes du launcher
    const ok = isLocalFile(file) && hasExt(file, IMAGE_EXT)
      && (/[\\/]appcache[\\/]librarycache[\\/]/i.test(file) || /[\\/]760[\\/]remote[\\/]/.test(file) || file.toLowerCase().startsWith(coversDir.toLowerCase() + path.sep));
    if (!ok) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  themes = new Themes({
    builtinDir: path.join(__dirname, 'themes'),
    userDir: dataFile('themes'),
    getPrefs: () => readPrefs().appearance || {},
    setPrefs: (a) => { const p = readPrefs(); p.appearance = a; writePrefs(p); },
    safeMode: process.argv.includes('--safe-mode'),
    materialSupported: MATERIAL_OK,
    fetch: (url, opts) => net.fetch(url, opts),
    catalogUrl: () => { const c = (readPrefs().settings || {}).themeCatalog; return c === undefined || c === null ? THEME_CATALOG : c; },
  });
  // Rechargement à chaud : une modification du dossier du thème actif est appliquée tout de suite
  themes.watch((a) => { applyTheme(); if (win && !win.isDestroyed()) win.webContents.send('theme-changed', a); });
  protocol.handle('clre-theme', (req) => {
    const hit = themes.resolve(req.url);
    if (!hit) return new Response('', { status: 404 });
    // fs lit aussi dans app.asar (thèmes intégrés de l'exe)
    // Fichiers statiques du thème (CSS, images, polices) : lisibles par la page en CORS, sans cookie ni identifiant.
    return fs.promises.readFile(hit.file).then((b) => new Response(b, { headers: { 'content-type': hit.type, 'access-control-allow-origin': '*' } }), () => new Response('', { status: 404 }));
  });
  // Lecture synchrone au chargement de la page : le thème est en place avant le premier affichage.
  ipcMain.on('themes:boot', (e) => { try { e.returnValue = themes.active(); } catch { e.returnValue = null; } });
  ipcMain.handle('themes:list', () => ({ themes: themes.list(), active: themes.active(), userDir: themes.userDir }));
  ipcMain.handle('themes:set', (_e, choice) => { const a = themes.set(choice); themes.watch(); applyTheme(); updateTray(); return a; });
  ipcMain.handle('themes:reset', () => { themes.reset(); themes.watch(); applyTheme(); updateTray(); return themes.active(); });
  // Import d'une archive : chemin déposé sur la fenêtre, ou choisi dans une boîte de dialogue
  ipcMain.handle('themes:import', async (_e, file) => {
    if (!file) {
      const res = await pickPath('theme', { title: 'Importer un thème', filters: [{ name: 'Thème (.zip)', extensions: ['zip'] }], properties: ['openFile'] });
      if (res.canceled || !res.filePaths[0]) return null;
      file = res.filePaths[0];
    }
    file = String(file);
    if (path.extname(file).toLowerCase() !== '.zip') throw new Error('Il faut une archive .zip');
    const st = await fs.promises.stat(file);
    if (!st.isFile() || st.size > 20 * 1024 * 1024) throw new Error('Archive trop grosse (20 Mo au plus)');
    return themes.installZip(await fs.promises.readFile(file), { sourceName: path.basename(file, '.zip') });
  });
  // Suppression : le dossier part à la corbeille (récupérable)
  ipcMain.handle('themes:remove', async (_e, id) => {
    const dir = themes.removeDir(String(id));
    await shell.trashItem(dir);
    themes.watch();
    applyTheme();
    updateTray();
    return themes.active();
  });
  ipcMain.handle('themes:catalog', (_e, force) => themes.catalog({ force: !!force }));
  ipcMain.handle('themes:install', async (_e, id) => { const m = await themes.installFromCatalog(String(id)); updateTray(); return m; });
  ipcMain.handle('themes:open-folder', () => shell.openPath(themes.userDir));

  const prefs = () => readPrefs();
  const steamAppId = (key) => { const g = games.get(String(key)); return g ? (g.store === 'steam' ? g.appid : g.steamAppId) : null; };

  // Une seule synchro à la fois : un appel pendant une synchro en cours reçoit le même résultat.
  let syncing = null;
  ipcMain.handle('library', (_e, fresh) => syncing || (syncing = sync(fresh === true).finally(() => { syncing = null; })));
  for (const kind of ['play', 'install', 'uninstall', 'store', 'details']) ipcMain.handle(kind, (_e, key) => action(key, kind));

  // ---------- Collections Steam (statuts et collections de l'utilisateur) ----------
  const setLocalMembership = (id, appid, on) => {
    const c = (lib.collections || []).find((x) => x.id === id);
    if (!c) return;
    if (on) {
      c.appids = [...new Set([...(c.appids || []), appid])];
      c.apps = [...new Set([...(c.apps || []), String(appid)])];
    } else {
      c.appids = (c.appids || []).filter((a) => a !== appid);
      c.apps = (c.apps || []).filter((a) => a !== String(appid));
    }
  };
  ipcMain.handle('steam:state', () => ({
    running: steamRunning(),
    pending: pendingSteamCount(),
    map: readPrefs().steamStatusMap || {},
    labels: (lib && lib.statusLabels) || {},
  }));
  ipcMain.handle('steam:set-status', (_e, key, status) => {
    const g = games.get(String(key));
    if (!g) throw new Error('Jeu introuvable');
    if (g.store !== 'steam') throw new Error('Seuls les jeux Steam peuvent être classés dans les collections Steam');
    const map = readPrefs().steamStatusMap || {};
    const target = status ? map[status] : null;
    if (status && !target) throw new Error('Aucune collection Steam associée à ce statut');
    const appid = Number(g.appid);
    const ops = Object.entries(map).filter(([, id]) => id)
      .map(([, id]) => (id === target ? { id, add: [appid] } : { id, remove: [appid] }));
    const res = queueSteamOps(ops);
    if (target) setLocalMembership(target, appid, true);
    for (const id of Object.values(map)) if (id && id !== target) setLocalMembership(id, appid, false);
    g.status = status || '';
    return res;
  });
  ipcMain.handle('steam:toggle-collection', (_e, id, key, on) => {
    const g = games.get(String(key));
    if (!g) throw new Error('Jeu introuvable');
    if (g.store !== 'steam') throw new Error('Steam ne peut pas ranger les jeux d’un autre store');
    const c = (lib.collections || []).find((x) => x.id === String(id));
    if (!c) throw new Error('Collection introuvable');
    const appid = Number(g.appid);
    const res = queueSteamOps([{ id: c.id, [on ? 'add' : 'remove']: [appid] }]);
    setLocalMembership(c.id, appid, !!on);
    return res;
  });
  ipcMain.handle('steam:create-collection', (_e, name) => {
    name = String(name || '').trim().slice(0, 80);
    if (!name) throw new Error('Nom de collection vide');
    const id = newCollectionId();
    const res = queueSteamOps([{ id, name, create: true }]);
    lib.collections = [...(lib.collections || []), { id, name, appids: [], apps: [] }];
    return { ...res, id, name };
  });
  ipcMain.handle('steam:rename-collection', (_e, id, name) => {
    const c = (lib.collections || []).find((x) => x.id === String(id));
    if (!c) throw new Error('Collection introuvable');
    name = String(name || '').trim().slice(0, 80);
    if (!name) throw new Error('Nom de collection vide');
    c.name = name;
    return queueSteamOps([{ id: c.id, name }]);
  });
  ipcMain.handle('steam:delete-collection', (_e, id) => {
    const c = (lib.collections || []).find((x) => x.id === String(id));
    if (!c) throw new Error('Collection introuvable');
    lib.collections = (lib.collections || []).filter((x) => x.id !== c.id);
    return queueSteamOps([{ id: c.id, delete: true }]);
  });
  ipcMain.handle('steam:apply', () => flushSteamPending());
  ipcMain.handle('steam:apply-now', async () => {
    if (!pendingSteamCount()) return { ok: true, pending: 0 };
    if (!lib || !lib.steamPath) return { error: 'Steam introuvable' };
    const wasRunning = steamCollections.isSteamRunning(lib.steamPath);
    if (wasRunning) {
      // Ne jamais fermer Steam pendant une partie.
      if (platform.steamRunningAppIdSync() || (lib.running || []).some((k) => /^\d+$/.test(k))) {
        return { error: 'Un jeu Steam est en cours : ferme-le avant d’appliquer.' };
      }
      const opts = {
        type: 'question',
        buttons: ['Fermer Steam et appliquer', 'Annuler'],
        defaultId: 0,
        cancelId: 1,
        title: 'Écrire dans tes collections Steam',
        message: 'Steam va être fermé, tes collections écrites, puis Steam relancé.',
        detail: `${pendingSteamCount()} changement(s) en attente. Steam sera indisponible quelques secondes ; ses téléchargements reprendront ensuite.`,
      };
      const ans = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts);
      if (ans.response !== 0) return { cancelled: true, pending: pendingSteamCount() };
      if (!steamCollections.quitSteam()) return { error: 'Steam n’a pas pu être fermé. Quitte-le à la main, puis réessaie.' };
      if (!(await waitForSteamExit(40000))) return { error: 'Steam ne s’est pas fermé à temps. Réessaie une fois fermé à la main.' };
    }
    const res = flushSteamPending();
    const relaunched = wasRunning ? steamCollections.launchSteam() : false;
    return { ...res, relaunched };
  });
  ipcMain.handle('steam:set-status-map', (_e, map) => {
    const allowed = new Set((lib.collections || []).map((c) => c.id));
    const clean = {};
    for (const s of ['todo', 'playing', 'done', 'dropped']) {
      const id = map && map[s];
      clean[s] = id && allowed.has(String(id)) ? String(id) : null;
    }
    const p = readPrefs();
    p.steamStatusMap = clean;
    writePrefs(p);
    if (lib) {
      for (const g of games.values()) if (g.store === 'steam') g.status = steamCollections.statusForApp(lib.collections, clean, g.appid);
      lib.statusMap = clean;
      lib.statusLabels = Object.fromEntries(Object.entries(clean).filter(([, id]) => id)
        .map(([s, id]) => [s, ((lib.collections || []).find((c) => c.id === id) || {}).name || s]));
    }
    if (win) win.webContents.send('library-changed');
    return clean;
  });

  ipcMain.handle('open-store-home', () => shell.openExternal('steam://store'));
  ipcMain.handle('open-friends', () => shell.openExternal('steam://open/friends'));
  // Liens web (actus, Epic, HowLongToBeat, sites officiels) et liens steam://.
  // On n'ouvre que https et steam : jamais file:, ms-*, ou un autre protocole qui lancerait un programme.
  ipcMain.handle('open-url', (_e, url) => {
    let u;
    try { u = new URL(String(url)); } catch { return false; }
    if (u.protocol === 'steam:' || (u.protocol === 'https:' && !u.username && !u.password)) { shell.openExternal(u.href); return true; }
    return false;
  });
  ipcMain.handle('open-folder', (_e, key) => {
    const g = games.get(String(key));
    if (!g || !g.installDir || !fs.existsSync(g.installDir)) return;
    // Un bundle .app est un dossier : l'ouvrir par openPath lancerait le jeu.
    const dir = /\.app$/i.test(g.installDir) ? path.dirname(g.installDir) : g.installDir;
    shell.openPath(dir);
  });
  ipcMain.handle('open-screenshot', (_e, file) => {
    // Une capture Steam, et rien d'autre : openPath lancerait un programme si on lui en donnait un
    if (!isLocalFile(file)) return;
    const f = path.normalize(file);
    if (hasExt(f, IMAGE_EXT) && /[\\/]760[\\/]remote[\\/]/.test(f) && fs.existsSync(f)) shell.openPath(f);
  });

  // Données en plus
  ipcMain.handle('downloads', () => allDownloads());
  // ---------- GOG sans Galaxy ----------
  ipcMain.handle('gog:status', () => gog.status());
  ipcMain.handle('gog:login', async () => { const s = await gog.login(win); if (win) win.webContents.send('library-changed'); return s; });
  ipcMain.handle('gog:login-browser', () => shell.openExternal(gog.authUrl()));
  ipcMain.handle('gog:login-code', async (_e, text) => { const s = await gog.loginWithPasted(text); if (win) win.webContents.send('library-changed'); return s; });
  ipcMain.handle('gog:logout', async () => { const s = await gog.logout(); if (win) win.webContents.send('library-changed'); return s; });
  for (const k of ['pause', 'resume', 'cancel']) ipcMain.handle(`gog:${k}`, (_e, key) => gog[k](String(key)));
  // ---------- Epic sans le Epic Games Launcher ----------
  ipcMain.handle('epic:status', () => epicDl.status());
  ipcMain.handle('epic:login', async () => { const s = await epicDl.login(win); if (win) win.webContents.send('library-changed'); return s; });
  ipcMain.handle('epic:login-browser', () => shell.openExternal(epicDl.authUrl()));
  ipcMain.handle('epic:login-code', async (_e, text) => { await epicDl.ensureBin(); const s = await epicDl.loginWithPasted(text); if (win) win.webContents.send('library-changed'); return s; });
  ipcMain.handle('epic:logout', async () => { const s = await epicDl.logout(); if (win) win.webContents.send('library-changed'); return s; });
  ipcMain.handle('epic:install-egl', (_e, key) => action(key, 'install-egl'));
  for (const k of ['pause', 'resume', 'cancel']) ipcMain.handle(`epic:${k}`, (_e, key) => epicDl[k](String(key)));
  ipcMain.handle('epic:pick-dir', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Dossier d’installation des jeux Epic', defaultPath: settings().epicDir, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return null;
    const p = readPrefs();
    p.settings = { ...(p.settings || {}), epicDir: r.filePaths[0] };
    writePrefs(p);
    return r.filePaths[0];
  });
  ipcMain.handle('gog:pick-dir', async () => {
    const r = await dialog.showOpenDialog(win, { title: 'Dossier d’installation des jeux GOG', defaultPath: settings().gogDir, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled) return null;
    const p = readPrefs();
    p.settings = { ...(p.settings || {}), gogDir: r.filePaths[0] };
    writePrefs(p);
    return r.filePaths[0];
  });
  ipcMain.handle('sessions', () => sessions.list);
  ipcMain.handle('disks', () => extras.disks([...games.values()]));
  ipcMain.handle('screenshots', (_e, key) => {
    const id = steamAppId(key);
    return lib && lib.steamPath && id ? extras.steamScreenshots(lib.steamPath, lib.user.accountId, id) : [];
  });
  ipcMain.handle('screenshots-all', () => {
    if (!lib || !lib.steamPath) return [];
    return extras.screenshotApps(lib.steamPath, lib.user.accountId).map((appid) => {
      const g = games.get(appid);
      return { key: appid, name: g ? g.name : `App ${appid}`, shots: extras.steamScreenshots(lib.steamPath, lib.user.accountId, appid) };
    }).filter((x) => x.shots.length).sort((a, b) => b.shots[0].time - a.shots[0].time);
  });
  ipcMain.handle('news', async (_e, key) => {
    const id = steamAppId(key);
    if (!id) return { error: 'nosteam' };
    try { return { list: await extras.news(id, 6) }; } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('news-home', async () => {
    const recent = [...games.values()].filter((g) => g.store === 'steam' && g.installed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 10);
    const res = await Promise.allSettled(recent.map((g) => extras.news(g.appid, 3).then((l) => l.map((n) => ({ ...n, key: g.key, game: g.name })))));
    const cutoff = Date.now() / 1000 - 45 * 86400;
    const out = [];
    // Accueil : uniquement les annonces officielles des studios
    for (const r of res) if (r.status === 'fulfilled') { const n = r.value.find((x) => x.date > cutoff && x.official); if (n) out.push(n); }
    return out.sort((a, b) => b.date - a.date).slice(0, 6);
  });
  ipcMain.handle('achievements', async (_e, key) => {
    const id = steamAppId(key);
    const g = games.get(String(key));
    if (!id || !g || g.store !== 'steam') return { error: 'nosteam' };
    // D'abord le cache local de Steam (sans clé), sinon l'API Web si une clé est configurée
    const local = lib.steamPath && lib.user.accountId ? gameinfo.localAchievements(lib.steamPath, lib.user.accountId, id) : null;
    if (local && local.total) {
      const pct = await gameinfo.globalPercents(id);
      for (const a of local.list) a.global = pct[a.id] ?? null;
      return local;
    }
    if (!prefs().apiKey) return local ? local : { error: 'nolocal' };
    try { return await extras.achievements(prefs().apiKey, lib.user.id64, id); } catch (e) { return { error: e.message }; }
  });
  let howLong = null;
  presence = new Presence(discord, {
    settings,
    games: () => [...games.values()],
    lib: () => lib,
    local: () => readPrefs().local || {},
    howLong: (key) => { const h = howLong && howLong.db[key]; return h && h.v; },
  });
  ipcMain.on('presence', (_e, ctx) => presence.setBrowse(ctx || {}));
  // Soirées jeu entre amis
  const parties = new Parties(readPrefs, writePrefs, (title, body, ev) => {
    notify('party', title, body, ev.key ? { view: 'game', id: ev.key } : { view: 'party' });
    if (win) win.webContents.send('parties-changed');
  });
  ipcMain.handle('inbox:get', () => readPrefs().inbox || []);
  ipcMain.handle('inbox:clear', () => { const p = readPrefs(); p.inbox = []; writePrefs(p); return true; });
  ipcMain.handle('party:list', () => parties.list());
  ipcMain.handle('party:save', (_e, ev) => parties.save(ev || {}));
  ipcMain.handle('party:remove', (_e, id) => parties.remove(id));
  ipcMain.handle('party:common', async (_e, ids) => {
    try { return await commonGames(readPrefs().apiKey, ids || [], [...games.values()], (lib && lib.tagNames) || {}); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('howlong', async (_e, key) => {
    const g = games.get(String(key));
    if (!g) return null;
    howLong = howLong || new gameinfo.HowLong(dataFile('hltb.json'));
    try { return await howLong.get(g.key, g.name); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('friends', async () => {
    try { return await extras.friends(prefs().apiKey, lib && lib.user.id64); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('epic-free', async () => {
    try { return (await gameinfo.epicFree()).map((x) => ({ ...x, owned: ownsByName(x.name) })); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('wishlist', async () => {
    if (!lib || !lib.user.id64) return { error: 'Compte Steam introuvable' };
    try { return await extras.wishlist(lib.user.id64); } catch (e) { return { error: e.message }; }
  });

  // Jeux ajoutés à la main
  ipcMain.handle('pick-exe', async () => {
    const r = await pickPath('exe', { title: 'Choisir le jeu', properties: ['openFile'], filters: [platform.programFilter, { name: 'Tous les fichiers', extensions: ['*'] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('pick-image', async () => {
    const r = await pickPath('image', { title: 'Choisir une jaquette', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('custom:add', (_e, { name, exe, args, cover } = {}) => {
    if (typeof exe !== 'string' || !path.isAbsolute(exe) || !fs.existsSync(exe)) throw new Error('Fichier introuvable');
    if (!isProgram(exe)) throw new Error(`Ce type de fichier ne se lance pas. ${platform.programLabel}`);
    args = String(args || '').slice(0, 500);
    const p = readPrefs();
    const id = Date.now().toString(36);
    let coverUrl = '';
    // La jaquette est copiée dans le dossier du launcher : uniquement une image
    if (isLocalFile(cover) && hasExt(cover, IMAGE_EXT) && fs.existsSync(cover)) {
      fs.mkdirSync(coversDir, { recursive: true });
      const dest = path.join(coversDir, id + path.extname(cover).toLowerCase());
      fs.copyFileSync(cover, dest);
      coverUrl = 'steamart://local/' + encodeURIComponent(dest);
    }
    p.customGames = [...(p.customGames || []), { id, name: String(name || path.basename(exe, path.extname(exe))).trim(), exe, args: args || '', cover: coverUrl }];
    writePrefs(p);
    return 'custom:' + id;
  });
  ipcMain.handle('custom:remove', (_e, key) => {
    const id = String(key).replace(/^custom:/, '');
    const p = readPrefs();
    p.customGames = (p.customGames || []).filter((c) => c.id !== id);
    writePrefs(p);
    return true;
  });

  // Réglages
  // ---------- Fiche enrichie, mods, sauvegardes ----------
  ipcMain.handle('store-details', async (_e, key) => {
    const id = steamAppId(key);
    if (!id) return { error: 'nosteam' };
    try { return await store.storeDetails(id); } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('pc-specs', async (_e, key) => {
    const s = await store.pcSpecs();
    const g = games.get(String(key));
    const dir = g && g.installDir ? g.installDir : (lib && lib.steamPath) || 'C:\\';
    return { ...s, freeGb: store.freeGb(path.parse(dir).root) };
  });
  ipcMain.handle('workshop', async (_e, key) => {
    const g = games.get(String(key));
    if (!g || g.store !== 'steam' || !lib.steamPath) return [];
    return workshopMods(lib.steamPath, g.appid);
  });
  ipcMain.handle('open-mod', (_e, id) => { if (/^\d+$/.test(String(id))) shell.openExternal(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`); });
  const all = () => [...games.values()];
  ipcMain.handle('saves:find', async (_e, key) => {
    const g = games.get(String(key));
    if (!g) return { known: false };
    try { return { ...(await saves.find(g, all(), lib.user.accountId)), backups: saves.list(g), dir: saves.gameDir(g) }; } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('saves:overview', async () => {
    try {
      const idx = await saves.buildIndex(all());
      return all().filter((g) => idx[g.key] && (g.installed || g.lastPlayed)).map((g) => {
        const b = saves.list(g);
        return { key: g.key, name: g.name, cloud: !!(idx[g.key].cloud && Object.values(idx[g.key].cloud).some(Boolean)), last: b[0] ? b[0].time : 0, count: b.length };
      }).sort((a, b) => b.last - a.last || a.name.localeCompare(b.name, 'fr'));
    } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('saves:backup', async (_e, key) => {
    const g = games.get(String(key));
    return saves.backup(g, all(), lib.user.accountId, 'manuel');
  });
  ipcMain.handle('saves:restore', async (_e, key, id) => {
    const g = games.get(String(key));
    if (!/^[\d_-]+$/.test(String(id))) throw new Error('Instantané invalide');
    if (running.includes(String(key))) throw new Error('Ferme le jeu avant de restaurer');
    return saves.restore(g, id);
  });
  ipcMain.handle('saves:open', (_e, key) => {
    const g = games.get(String(key));
    const dir = g ? saves.gameDir(g) : settings().backupDir;
    fs.mkdirSync(dir, { recursive: true });
    shell.openPath(dir);
  });
  ipcMain.handle('pick-folder', async () => {
    const r = await pickPath('folder', { title: 'Choisir un dossier', properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });

  // ---------- Raccourcis, options de lancement, jaquettes ----------
  ipcMain.handle('shortcut:create', (_e, key) => {
    if (!platform.createShortcut) throw new Error('Le raccourci sur le Bureau n’est pas encore disponible sur macOS');
    const g = games.get(String(key));
    if (!g) throw new Error('Jeu introuvable');
    return sys.createShortcut(app, shell, g);
  });
  ipcMain.handle('launch-opts:get', (_e, key) => launchOpts(String(key)));
  ipcMain.handle('launch-opts:set', (_e, key, o) => {
    key = String(key);
    if (!games.has(key)) throw new Error('Jeu introuvable');
    const p = readPrefs();
    p.launchOpts = p.launchOpts || {};
    const clean = cleanLaunchOpts(o);
    if (!clean.args && !clean.open.length && !clean.close.length) delete p.launchOpts[key]; else p.launchOpts[key] = clean;
    writePrefs(p);
    return true;
  });
  ipcMain.handle('cover:set', async (_e, key) => {
    const r = await pickPath('image', { title: 'Choisir une jaquette (format portrait)', properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }] });
    if (r.canceled) return null;
    fs.mkdirSync(coversDir, { recursive: true });
    const dest = path.join(coversDir, `cover-${String(key).replace(/[^\w-]/g, '_')}-${Date.now().toString(36)}${path.extname(r.filePaths[0]).toLowerCase()}`);
    fs.copyFileSync(r.filePaths[0], dest);
    const p = readPrefs();
    p.coverOverrides = { ...(p.coverOverrides || {}), [key]: 'steamart://local/' + encodeURIComponent(dest) };
    writePrefs(p);
    return true;
  });
  ipcMain.handle('cover:reset', (_e, key) => { const p = readPrefs(); if (p.coverOverrides) delete p.coverOverrides[key]; writePrefs(p); return true; });

  // ---------- Récap : export de la carte en image ----------
  // ---------- Magasin Steam ----------
  const ownedAppids = () => [...games.values()].map((g) => Number(g.store === 'steam' ? g.appid : g.steamAppId)).filter(Boolean);
  const favTags = () => {
    const c = new Map();
    for (const g of games.values()) {
      const w = 1 + Math.min(20, (g.playtime || 0) / 120); // les jeux auxquels tu joues comptent plus
      (g.tags || []).slice(0, 6).forEach((t, i) => c.set(t, (c.get(t) || 0) + w * (6 - i)));
    }
    // On écarte les tags trop génériques
    const generic = new Set([492, 19, 21, 4182, 3859, 3871, 4166, 1774, 4191, 597, 113, 7368, 1664, 3839, 4305]);
    return [...c].filter(([t]) => !generic.has(t)).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 6);
  };
  const wrap = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { return { error: e.message }; } };
  ipcMain.handle('store:featured', wrap(() => storefront.featured()));
  ipcMain.handle('store:search', wrap((_e, opts) => storefront.search(opts || {})));
  ipcMain.handle('store:foryou', wrap(async () => ({ tags: favTags().slice(0, 3), items: await storefront.forYou(favTags(), ownedAppids()) })));
  ipcMain.handle('store:item', wrap(async (_e, appid) => (await storefront.items([appid]))[0] || null));
  ipcMain.handle('store:details', wrap((_e, appid) => store.storeDetails(Number(appid))));
  ipcMain.handle('store:owned', () => ownedAppids());
  ipcMain.handle('store:howlong', wrap(async (_e, appid, name) => {
    howLong = howLong || new gameinfo.HowLong(dataFile('hltb.json'));
    return howLong.get(`steam-store:${appid}`, name);
  }));
  // Achat et liste de souhaits : dans l'appli Steam (le paiement ne passe jamais par le launcher)
  ipcMain.handle('store:open', (_e, appid, kind) => {
    const id = Number(appid);
    if (!id) return false;
    shell.openExternal(kind === 'web' ? `https://store.steampowered.com/app/${id}` : `steam://store/${id}`);
    return true;
  });
  ipcMain.handle('journal', (_e, key) => journal.buildJournal(lib, [...games.values()], sessions.list, key || null));
  ipcMain.handle('showcase', async () => { try { return await rarity.showcase(lib, [...games.values()]); } catch (e) { return { error: e.message }; } });
  ipcMain.handle('ach-period', (_e, from, to) => journal.unlockedAchievements(lib, [...games.values()]).filter((a) => a.t >= from && a.t < to));
  ipcMain.handle('ach-rarity', async (_e, items) => {
    const pct = await rarity.percents([...new Set(items.map((a) => a.appid))]);
    return items.map((a) => ({ ...a, global: (pct[a.appid] || {})[a.id] ?? null }));
  });
  ipcMain.handle('perf', (_e, key) => (perf ? perf.list(key) : []));
  ipcMain.handle('pick-presentmon', async () => {
    const r = await pickPath('presentmon', { title: 'Choisir PresentMon.exe', properties: ['openFile'], filters: [{ name: 'PresentMon', extensions: ['exe'] }] });
    return r.canceled ? null : r.filePaths[0];
  });
  // Teinte dominante d'une image (jaquette) : réduite à 32×32, la teinte la plus présente parmi les pixels colorés
  const tintCache = new Map();
  ipcMain.handle('art-color', async (_e, url) => {
    if (!url || typeof url !== 'string') return null;
    if (tintCache.has(url)) return tintCache.get(url);
    try {
      // Une jaquette : image locale servie par steamart:// ou image d'un CDN en https. Jamais file:// ni http://
      const proto = new URL(url).protocol;
      if (proto !== 'https:' && proto !== 'steamart:') return null;
      const res = await net.fetch(url);
      if (!res.ok || Number(res.headers.get('content-length') || 0) > 20 * 1024 * 1024) return null;
      if (tintCache.size > 800) tintCache.clear();
      const img = nativeImage.createFromBuffer(Buffer.from(await res.arrayBuffer())).resize({ width: 32, height: 32, quality: 'good' });
      const px = img.toBitmap(); // BGRA
      const bins = Array.from({ length: 24 }, () => ({ w: 0, r: 0, g: 0, b: 0 }));
      for (let i = 0; i < px.length; i += 4) {
        const b = px[i], g = px[i + 1], r = px[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max ? (max - min) / max : 0;
        if (max < 40 || sat < 0.25) continue;
        let h = 0;
        if (max === r) h = ((g - b) / (max - min)) % 6; else if (max === g) h = (b - r) / (max - min) + 2; else h = (r - g) / (max - min) + 4;
        const bin = bins[Math.floor(((h * 60 + 360) % 360) / 15)];
        const w = sat * (max / 255);
        bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
      }
      const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
      const out = best.w > 1.5 ? [Math.round(best.r / best.w), Math.round(best.g / best.w), Math.round(best.b / best.w)] : null;
      tintCache.set(url, out);
      return out;
    } catch { return null; }
  });
  ipcMain.handle('save-video', async (_e, buf, name, ext) => {
    ext = ext === 'mp4' ? 'mp4' : 'webm';
    name = safeFileName(name, 'recap');
    // Captures de dev : enregistrement direct dans un dossier, sans boîte de dialogue
    if (process.env.LAUNCHER_SNAP_SAVE && !app.isPackaged) { const f = path.join(process.env.LAUNCHER_SNAP_SAVE, `${name || 'recap'}.${ext}`); fs.writeFileSync(f, Buffer.from(buf)); return f; }
    const res = await dialog.showSaveDialog(win, { title: 'Enregistrer la vidéo du récap', defaultPath: path.join(app.getPath('videos'), `${name || 'recap'}.${ext}`), filters: [{ name: 'Vidéo', extensions: [ext] }] });
    if (res.canceled) return null;
    fs.writeFileSync(res.filePath, Buffer.from(buf));
    return res.filePath;
  });
  ipcMain.handle('capture', async (_e, rect, name) => {
    const r = { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
    const img = await win.webContents.capturePage(r);
    const res = await dialog.showSaveDialog(win, { title: 'Enregistrer le récap', defaultPath: path.join(app.getPath('pictures'), `${safeFileName(name, 'recap')}.png`), filters: [{ name: 'Image PNG', extensions: ['png'] }] });
    if (res.canceled) return null;
    fs.writeFileSync(res.filePath, img.toPNG());
    return res.filePath;
  });

  // ---------- Export / import des données du launcher ----------
  ipcMain.handle('data:export', async () => {
    const res = await dialog.showSaveDialog(win, { title: 'Exporter mes données', defaultPath: path.join(app.getPath('documents'), `clre-launcher-${new Date().toISOString().slice(0, 10)}.json`), filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (res.canceled) return null;
    const p = readPrefs();
    const data = { app: 'CLRE-Launcher', version: 1, exportedAt: new Date().toISOString(), local: p.local || {}, customGames: p.customGames || [], launchOpts: p.launchOpts || {}, settings: p.settings || {}, sessions: sessions.list, epicStats: readJson('epic-stats.json') };
    fs.writeFileSync(res.filePath, JSON.stringify(data, null, 2));
    return res.filePath;
  });
  ipcMain.handle('data:import', async () => {
    const res = await pickPath('data', { title: 'Importer des données', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (res.canceled) return null;
    if (fs.statSync(res.filePaths[0]).size > 50 * 1024 * 1024) throw new Error('Fichier trop gros pour un export de CLRE-Launcher');
    const d = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf8'));
    if (!d || d.app !== 'CLRE-Launcher') throw new Error('Ce fichier ne vient pas de CLRE-Launcher');
    // Le fichier peut venir de quelqu'un d'autre : on ne reprend que des entrées bien formées, et les
    // programmes à lancer passent par les mêmes règles que ceux choisis dans le launcher.
    const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    d.local = obj(d.local);
    d.customGames = (Array.isArray(d.customGames) ? d.customGames : [])
      .filter((c) => c && typeof c.id === 'string' && /^[\w-]{1,40}$/.test(c.id) && isLocalFile(c.exe) && isProgram(c.exe))
      .map((c) => ({ id: c.id, name: String(c.name || path.basename(c.exe, path.extname(c.exe))).slice(0, 200), exe: c.exe, args: String(c.args || '').slice(0, 500), cover: typeof c.cover === 'string' && c.cover.startsWith('steamart://local/') ? c.cover : '' }));
    d.launchOpts = Object.fromEntries(Object.entries(obj(d.launchOpts)).slice(0, 5000).map(([k, v]) => { const c = cleanLaunchOpts(v); return [k, { ...c, open: c.open.filter(isLocalFile) }]; }));
    d.sessions = (Array.isArray(d.sessions) ? d.sessions : [])
      .filter((s) => s && typeof s.key === 'string' && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start)
      .map((s) => ({ key: s.key, name: String(s.name || s.key).slice(0, 200), start: s.start, end: s.end }));
    const p = readPrefs();
    const l = p.local || {};
    const il = d.local || {};
    p.local = {
      ...il, ...l,
      status: { ...(il.status || {}), ...(l.status || {}) },
      notes: { ...(il.notes || {}), ...(l.notes || {}) },
      favAdd: [...new Set([...(il.favAdd || []), ...(l.favAdd || [])])],
      hidden: [...new Set([...(il.hidden || []), ...(l.hidden || [])])],
      collections: [...(l.collections || []), ...(il.collections || []).filter((c) => !(l.collections || []).some((x) => x.id === c.id))],
    };
    p.customGames = [...(p.customGames || []), ...(d.customGames || []).filter((c) => !(p.customGames || []).some((x) => x.id === c.id))];
    p.launchOpts = { ...(d.launchOpts || {}), ...(p.launchOpts || {}) };
    writePrefs(p);
    const seen = new Set(sessions.list.map((s) => `${s.key}@${s.start}`));
    sessions.list.push(...(d.sessions || []).filter((s) => s && s.key && !seen.has(`${s.key}@${s.start}`)));
    sessions.list.sort((a, b) => a.start - b.start);
    sessions.save();
    return { sessions: (d.sessions || []).length, file: res.filePaths[0] };
  });

  // ---------- Mise à jour du launcher ----------
  let pendingUpdate = null;
  // L'adresse et l'empreinte du fichier restent ici : le renderer ne peut pas choisir ce qui est téléchargé.
  let checkedUpdate = null;
  ipcMain.handle('update:check', async () => {
    if (!platform.supports.autoUpdate) return { error: 'La mise à jour intégrée n’est pas encore disponible sur macOS : télécharge la nouvelle version sur GitHub.' };
    checkedUpdate = null;
    try {
      const u = await sys.checkUpdate(settings().updateRepo, app.getVersion());
      if (u.available) checkedUpdate = u.asset;
      const { asset, ...pub } = u;
      return pub;
    } catch (e) { return { error: e.message }; }
  });
  ipcMain.handle('update:download', async () => {
    if (!app.isPackaged) throw new Error('La mise à jour automatique ne marche que depuis le .exe');
    if (!checkedUpdate) throw new Error('Vérifie d\'abord s\'il existe une nouvelle version');
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    pendingUpdate = { tmp: await sys.downloadUpdate(checkedUpdate, exe), exe };
    return true;
  });
  ipcMain.handle('update:install', () => {
    if (!pendingUpdate) throw new Error('Aucune mise à jour téléchargée');
    sys.installUpdate(pendingUpdate.tmp, pendingUpdate.exe);
    quitting = true;
    app.quit();
  });
  ipcMain.handle('app-version', () => app.getVersion());

  ipcMain.handle('prefs:get', () => {
    const p = readPrefs();
    return { steamId: p.steamId, apiKey: p.apiKey ? '••••' + p.apiKey.slice(-4) : '', hasApiKey: !!p.apiKey, system: system(), settings: settings(), canAutostart: app.isPackaged };
  });
  ipcMain.handle('prefs:set', (_e, patch) => {
    const p = readPrefs();
    for (const [k, v] of Object.entries(patch && typeof patch === 'object' ? patch : {})) {
      if ((k === 'system' || k === 'settings') && (!v || typeof v !== 'object' || Array.isArray(v))) continue;
      if ((k === 'apiKey' || k === 'steamId') && v !== null && typeof v !== 'string') continue;
      if (k === 'system') { p.system = { ...system(), ...v }; continue; }
      if (k === 'settings') { p.settings = { ...(p.settings || {}), ...v, notify: { ...((p.settings || {}).notify || {}), ...(v.notify || {}) }, overlay: { ...((p.settings || {}).overlay || {}), ...(v.overlay || {}) }, crosshair: { ...((p.settings || {}).crosshair || {}), ...(v.crosshair || {}) } }; continue; }
      if (!['apiKey', 'steamId'].includes(k)) continue;
      if (v === null || v === '') delete p[k]; else p[k] = v;
    }
    writePrefs(p);
    applySystem();
    if (presence) presence.push(true);
    return true;
  });
  ipcMain.handle('local:get', () => readPrefs().local || {});
  ipcMain.handle('local:set', (_e, local) => { const p = readPrefs(); p.local = local; writePrefs(p); return true; });
  ipcMain.handle('fullscreen', (_e, on) => { if (win) win.setFullScreen(on === undefined ? !win.isFullScreen() : !!on); return win && win.isFullScreen(); });

  createWindow();
  tray = new Tray(trayIcon());
  tray.setToolTip('CLRE-Launcher');
  tray.on('click', showWindow);
  updateTray();
  applySystem();
  playFromArgs(process.argv);
  // Veille : promos toutes les 6 h, amis toutes les 3 min
  setTimeout(checkPromos, 60e3);
  setInterval(checkPromos, 6 * 3600e3);
  setInterval(checkFriends, 3 * 60e3);
  // Collections Steam : les changements en attente partent dès que Steam est fermé.
  setInterval(() => { if (pendingSteamCount() && !steamRunning()) flushSteamPending(); }, 30e3);
  if (process.env.LAUNCHER_SNAP && !app.isPackaged) require('./dev-snap')(win, process.env.LAUNCHER_SNAP);
});

app.on('will-quit', () => { if (pendingSteamCount() && !steamRunning()) flushSteamPending(); if (sessions && sessions.open.size) sessions.save(); globalShortcut.unregisterAll(); overlay.destroy(); crosshair.destroy(); if (perf) perf.stopAll(); });
app.on('window-all-closed', () => { if (quitting) app.quit(); });
