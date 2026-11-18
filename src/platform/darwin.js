// Implémentation macOS.
// Sources de jeux natives : Steam, Epic Games Launcher, GOG Galaxy, Battle.net, Riot, jeux
// ajoutés à la main. Tout ce qui n'a pas d'équivalent macOS (registre, PerfMon, PresentMon,
// raccourcis .lnk, installateurs GOG/Epic) est désactivé proprement via `supports`.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFile, execFileSync, spawn } = require('child_process');
const { base } = require('../platforms');

const HOME = os.homedir();
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

// ---------- Steam ----------
const STEAM_DIRS = [
  path.join(HOME, 'Library', 'Application Support', 'Steam'),
  path.join(HOME, '.steam', 'steam'),
];

function steamPath() {
  if (process.env.CLRE_STEAM_PATH) return process.env.CLRE_STEAM_PATH; // tests et diagnostic
  for (const p of STEAM_DIRS) if (exists(path.join(p, 'steamapps'))) return p;
  return null;
}

// Steam maintient un faux registre dans registry.vdf (même format que sous Windows) :
// c'est là que RunningAppID est écrit quand un jeu tourne.
function steamRunningAppIdSync() {
  const root = steamPath();
  if (!root) return 0;
  try {
    const txt = fs.readFileSync(path.join(root, 'registry.vdf'), 'utf8');
    const m = txt.match(/"RunningAppID"\s+"(\d+)"/);
    return m ? Number(m[1]) : 0;
  } catch { return 0; }
}

const steamRunningAppId = () => Promise.resolve(steamRunningAppIdSync());

// ---------- Processus ----------
// ps -axo comm= donne le chemin complet de l'exécutable ; le nom qui compte pour un jeu
// est le dernier segment (ex. « LeagueClientUx », « The Sims 4 »).
function processNames() {
  return new Promise((resolve) => {
    execFile('ps', ['-axo', 'comm='], { maxBuffer: 16 * 1024 * 1024, timeout: 4000 }, (err, out) => {
      if (err) return resolve(new Set());
      const set = new Set();
      for (const line of String(out).split('\n')) {
        const p = line.trim();
        if (!p) continue;
        const name = p.slice(p.lastIndexOf('/') + 1).toLowerCase();
        if (name) set.add(name);
      }
      resolve(set);
    });
  });
}

async function runningAmong(wanted) {
  const wantedSet = wanted instanceof Set ? wanted : new Set(wanted || []);
  if (!wantedSet.size) return new Set();
  const running = await processNames();
  return new Set([...wantedSet].filter((w) => running.has(String(w).toLowerCase())));
}

function killProcess(name) {
  execFile('pkill', ['-x', name], { timeout: 4000 }, () => {});
}

// ---------- Lancement ----------
const LAUNCH_EXT = new Set(['.app', '.command', '.sh']);

function isLocalFile(f) {
  return typeof f === 'string' && path.isAbsolute(f) && !f.startsWith('//') && !f.includes('\0');
}

// Accepte un bundle .app, un script exécutable ou un binaire du type .command.
function isProgram(f) {
  if (typeof f !== 'string' || !path.isAbsolute(f) || f.includes('\0')) return false;
  try {
    const st = fs.statSync(f);
    if (st.isDirectory()) return /\.app$/i.test(f);
    return st.isFile() && (st.mode & 0o111) !== 0;
  } catch { return false; }
}

const launchExts = [...LAUNCH_EXT];

function parseArgs(s) {
  return String(s || '').trim().match(/(?:[^\s"]+|"[^"]*")+/g) || [];
}

// Un .app se lance toujours par « open » : lancer son binaire interne casse le contexte de
// bundle (signature, ressources, LSUIElement). open transmet les arguments via --args.
function startFile(file, argStr, cwd, onError) {
  const args = parseArgs(argStr).map((a) => a.replace(/^"|"$/g, ''));
  try {
    if (/\.app$/i.test(file)) {
      const argv = ['-a', file];
      if (args.length) argv.push('--args', ...args);
      const child = spawn('open', argv, { detached: true, stdio: 'ignore' });
      child.on('error', (e) => onError(e.message));
      child.on('close', (code) => { if (code) onError(`open a refusé de lancer ${path.basename(file)} (${code})`); });
      child.unref();
      return;
    }
    const child = spawn(file, args, { cwd: cwd || path.dirname(file), detached: true, stdio: 'ignore' });
    child.on('error', (e) => onError(e.message));
    child.unref();
  } catch (e) { onError(e.message); }
}

// ---------- Bundles .app ----------
// Nom de l'exécutable déclaré par le bundle : c'est lui qui apparaît dans `ps` pendant
// que le jeu tourne, donc la clé pour mesurer le temps de jeu.
const execCache = new Map();
function bundleExecutable(appPath) {
  if (execCache.has(appPath)) return execCache.get(appPath);
  let name = '';
  try {
    name = execFileSync('plutil', ['-extract', 'CFBundleExecutable', 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')], { encoding: 'utf8', timeout: 4000 }).trim();
  } catch { /* bundle sans Info.plist lisible */ }
  if (!name) name = path.basename(appPath, '.app');
  execCache.set(appPath, name);
  return name;
}

function appProcessNames(appPath) {
  const exe = bundleExecutable(appPath);
  return [...new Set([exe.toLowerCase(), path.basename(appPath, '.app').toLowerCase()])].filter(Boolean);
}

const APP_DIRS = ['/Applications', path.join(HOME, 'Applications')];

function listApps(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && /\.app$/i.test(d.name))
      .map((d) => path.join(dir, d.name));
  } catch { return []; }
}

// Identifiant du bundle, lu avec plutil (Info.plist binaire ou XML).
const idCache = new Map();
function bundleIdentifier(appPath) {
  if (idCache.has(appPath)) return idCache.get(appPath);
  let id = '';
  try {
    id = execFileSync('plutil', ['-extract', 'CFBundleIdentifier', 'raw', '-o', '-', path.join(appPath, 'Contents', 'Info.plist')], { encoding: 'utf8', timeout: 4000 }).trim();
  } catch { /* bundle sans identifiant */ }
  idCache.set(appPath, id);
  return id;
}

// Recherche rapide dans l'Info.plist brut : un plist binaire garde ses chaînes en clair,
// ce qui évite d'appeler plutil pour chaque application de /Applications.
function plistMentions(appPath, needle) {
  try { return fs.readFileSync(path.join(appPath, 'Contents', 'Info.plist')).includes(needle); } catch { return false; }
}

// Cherche le premier bundle .app dans un dossier de jeu (profondeur limitée).
function findAppIn(dir, depth = 3) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return ''; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (/\.app$/i.test(e.name)) return path.join(dir, e.name);
  }
  if (depth <= 0) return '';
  for (const e of entries) {
    if (!e.isDirectory() || /^(\.itch|unins|crash|setup|redist|vc_|dxsetup|ue4prereq)/i.test(e.name)) continue;
    const hit = findAppIn(path.join(dir, e.name), depth - 1);
    if (hit) return hit;
  }
  return '';
}

// Un manifeste donne un exécutable relatif (Game.app/Contents/MacOS/Game) : on remonte au bundle,
// parce que c'est lui qu'il faut ouvrir avec « open -a ».
function appFromExecutable(installPath, executable) {
  if (!installPath) return '';
  const abs = executable ? (path.isAbsolute(executable) ? executable : path.join(installPath, executable)) : '';
  const i = abs.indexOf('.app/');
  if (i >= 0) return abs.slice(0, i + 4);
  if (/\.app$/i.test(abs)) return abs;
  return findAppIn(installPath);
}

const isMacPlatform = (p) => !p || /^(mac|osx|darwin)/i.test(String(p));

// ---------- GOG Galaxy ----------
// GOG installe ses jeux en bundles .app et laisse un marqueur goggame-<id>.info dans les
// ressources : c'est la source la plus fiable, indépendante de la base interne de Galaxy.
function gogGameFromApp(app) {
  const res = path.join(app, 'Contents', 'Resources');
  let files = [];
  try { files = fs.readdirSync(res); } catch { return null; }
  for (const f of files) {
    const m = f.match(/^goggame-(\d+)\.info$/i);
    if (!m) continue;
    let info = {};
    try { info = JSON.parse(fs.readFileSync(path.join(res, f), 'utf8')); } catch { continue; }
    // DLC : rootGameId différent du gameId
    if (info.rootGameId && String(info.rootGameId) !== String(info.gameId || m[1])) continue;
    if (info.category && !/^(game|demo)$/i.test(String(info.category))) continue;
    return {
      id: String(info.gameId || m[1]),
      name: info.name || path.basename(app, '.app'),
      app,
    };
  }
  return null;
}

function loadGogGalaxy() {
  const games = [];
  const seen = new Set();
  for (const dir of APP_DIRS) {
    for (const app of listApps(dir)) {
      const g = gogGameFromApp(app);
      if (!g || seen.has(g.id)) continue;
      seen.add(g.id);
      games.push(base('gog', g.id, g.name, {
        installed: true, installDir: app, library: dir, exe: app,
        processNames: appProcessNames(app),
      }));
    }
  }
  return games;
}

// ---------- EA app ----------
// EA installe ses jeux en bundles .app, par défaut dans /Applications/EA Games.
// Les bundles portent un identifiant com.ea.* : c'est le marqueur qui les distingue des
// autres applications quand l'utilisateur a changé de dossier d'installation.
const EA_DIRS = [path.join('/Applications', 'EA Games'), path.join(HOME, 'Applications', 'EA Games')];
const EA_SELF = /^(EA app|Origin)\.app$/i;

function loadEa(roots = [...EA_DIRS, ...APP_DIRS]) {
  const games = [];
  const seen = new Set();
  for (const root of roots) {
    const isEaFolder = /\/EA Games$/i.test(root);
    for (const app of listApps(root)) {
      if (seen.has(app)) continue;
      if (EA_SELF.test(path.basename(app))) continue;
      // Hors du dossier EA Games, on lit d'abord l'Info.plist brut : plutil sur chaque
      // application de /Applications coûterait plusieurs secondes.
      if (!isEaFolder && !plistMentions(app, 'com.ea.')) continue;
      const id = bundleIdentifier(app);
      if (/eaapp|origin/i.test(id)) continue;
      if (!exists(app)) continue;
      seen.add(app);
      const name = path.basename(app, '.app');
      games.push(base('ea', id || name.toLowerCase().replace(/\s+/g, '-'), name, {
        installed: true, installDir: app, library: path.dirname(app), exe: app,
        processNames: appProcessNames(app),
      }));
    }
  }
  return games;
}

// ---------- itch.io ----------
// L'app itch installe chaque jeu dans un dossier de apps/ avec un reçu .itch/receipt.json.gz.
// Le reçu est la source de vérité : il survit à une réinitialisation de la base butler.db.
const ITCH_ROOTS = [
  path.join(HOME, 'Library', 'Application Support', 'itch', 'apps'),
  path.join(HOME, 'Library', 'Application Support', 'kitch', 'apps'),
];

function itchReceipt(dir) {
  const metaDir = path.join(dir, '.itch');
  try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(metaDir, 'receipt.json.gz'))).toString('utf8')); } catch { /* format compressé absent */ }
  return readJson(path.join(metaDir, 'receipt.json'));
}

function loadItch(roots = ITCH_ROOTS) {
  const games = [];
  const seen = new Set();
  for (const root of roots) {
    let dirs = [];
    try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()); } catch { continue; }
    for (const d of dirs) {
      if (d.name === 'downloads') continue;
      const dir = path.join(root, d.name);
      const receipt = itchReceipt(dir);
      if (!receipt) continue;
      const game = receipt.game || {};
      const id = String(game.id || receipt.game_id || d.name);
      if (seen.has(id)) continue;
      seen.add(id);
      const app = findAppIn(dir, 3);
      if (!app) continue; // build Windows : à lancer par itch, pas par le launcher
      games.push(base('itch', id, game.title || receipt.title || d.name, {
        installed: true, installDir: dir, library: root, exe: app, workingDir: path.dirname(app),
        processNames: appProcessNames(app),
        customCover: game.stillCoverUrl || game.coverUrl || '',
      }));
    }
  }
  return games;
}

// ---------- Heroic (Epic / GOG / Amazon) ----------
// Heroic s'appuie sur Legendary, gogdl et Nile ; chacun écrit la liste des jeux installés
// dans un JSON. On ne garde que les builds macOS natifs, lançables par « open -a ».
const HEROIC_ROOTS = [
  path.join(HOME, 'Library', 'Application Support', 'heroic'),
  path.join(HOME, 'Library', 'Application Support', 'Heroic'),
  path.join(HOME, '.config', 'heroic'),
];

function heroicFiles(rel, roots) {
  const out = roots.map((r) => path.join(r, rel));
  // Legendary peut aussi vivre seul, hors de Heroic.
  if (/^legendaryConfig/.test(rel)) out.push(path.join(HOME, '.config', 'legendary', rel.split('/').pop()));
  return out;
}

function firstJson(paths) {
  for (const p of paths) {
    const j = readJson(p);
    if (j) return j;
  }
  return null;
}

function heroicHostedGame(installPath, executable, platform) {
  if (!isMacPlatform(platform) || !installPath || !exists(installPath)) return '';
  const app = appFromExecutable(installPath, executable);
  return app && exists(app) ? app : '';
}

// Lecture pure, sans cache : utilisée par les tests et par heroicData().
function readHeroic(roots = HEROIC_ROOTS) {
  const epic = [];
  const gog = [];
  const amazon = [];

  // Legendary : objet indexé par AppName
  const legendary = firstJson(heroicFiles('legendaryConfig/legendary/installed.json', roots));
  for (const [key, v] of Object.entries(legendary && typeof legendary === 'object' ? legendary : {})) {
    if (!v || typeof v !== 'object') continue;
    const appName = v.app_name || key;
    const app = heroicHostedGame(v.install_path, v.executable, v.platform);
    if (!app) continue;
    epic.push(base('epic', appName, v.title || appName, {
      installed: true, viaHeroic: true, installDir: v.install_path, library: path.dirname(v.install_path),
      exe: app, workingDir: path.dirname(app), processNames: appProcessNames(app),
    }));
  }

  // gogdl : { installed: [...] }, sans titre ; les titres sont dans store_cache/gog_library.json
  const gogInstalled = firstJson(heroicFiles('gog_store/installed.json', roots));
  const gogLibrary = firstJson(heroicFiles('store_cache/gog_library.json', roots)) || firstJson(heroicFiles('gog_store/library.json', roots));
  const titles = new Map(((gogLibrary && gogLibrary.games) || []).map((g) => [String(g.app_name), g.title]));
  for (const it of (gogInstalled && gogInstalled.installed) || []) {
    if (!it || typeof it !== 'object') continue;
    const appName = String(it.appName || it.app_name || '');
    if (!appName) continue;
    const app = heroicHostedGame(it.install_path, it.executable, it.platform);
    if (!app) continue;
    gog.push(base('gog', appName, titles.get(appName) || path.basename(it.install_path), {
      installed: true, viaHeroic: true, installDir: it.install_path, library: path.dirname(it.install_path),
      exe: app, workingDir: path.dirname(app), processNames: appProcessNames(app),
    }));
  }

  // Nile (Amazon) : structure tolérante (liste, objet indexé ou { installed: [...] })
  const nileRaw = firstJson(heroicFiles('nile_config/nile/installed.json', roots));
  const nile = !nileRaw ? [] : Array.isArray(nileRaw) ? nileRaw
    : Array.isArray(nileRaw.installed) ? nileRaw.installed
      : Object.entries(nileRaw).map(([k, v]) => ({ app_name: k, ...(v && typeof v === 'object' ? v : {}) }));
  const amazonLib = firstJson(heroicFiles('store_cache/amazon_library.json', roots));
  const amazonTitles = new Map(((amazonLib && (amazonLib.games || amazonLib)) || []).map((g) => [String(g.app_name || g.id), g.title]));
  for (const it of nile) {
    if (!it || typeof it !== 'object') continue;
    const appName = String(it.app_name || it.appName || it.id || '');
    if (!appName) continue;
    const installPath = it.path || it.install_path || it.installPath || '';
    const app = heroicHostedGame(installPath, it.executable, it.platform);
    if (!app) continue;
    amazon.push(base('amazon', appName, it.title || amazonTitles.get(appName) || path.basename(installPath), {
      installed: true, viaHeroic: true, installDir: installPath, library: path.dirname(installPath),
      exe: app, workingDir: path.dirname(app), processNames: appProcessNames(app),
    }));
  }

  return { epic, gog, amazon };
}

// Le sync appelle loadEpic puis loadPlatforms : on évite de relire les mêmes fichiers deux fois.
let heroicCache = { t: 0, data: null };
function loadHeroic() {
  if (heroicCache.data && Date.now() - heroicCache.t < 5000) return heroicCache.data;
  heroicCache = { t: Date.now(), data: readHeroic() };
  return heroicCache.data;
}

// Fusionne les entrées GOG de Galaxy et de Heroic (même clé gog:<id>).
function loadGog() {
  const byKey = new Map();
  for (const g of [...loadGogGalaxy(), ...loadHeroic().gog]) {
    const cur = byKey.get(g.key);
    if (!cur) { byKey.set(g.key, g); continue; }
    if (!cur.exe && g.exe) { cur.exe = g.exe; cur.workingDir = g.workingDir; }
    if (!cur.installed || !exists(cur.installDir)) { cur.installed = g.installed; cur.installDir = g.installDir; }
    cur.processNames = [...new Set([...(cur.processNames || []), ...(g.processNames || [])])];
  }
  return [...byKey.values()];
}

// Blizzard installe chaque jeu dans un dossier de /Applications ; le client répond aux URI
// battlenet://<code>. Pas de base locale exploitable sans rouvrir le format du client.
const BNET_APPS = [
  ['World of Warcraft', 'WoW'],
  ['Diablo IV', 'Fen'],
  ['Overwatch', 'Pro'],
  ['Hearthstone', 'WTCG'],
  ['StarCraft II', 'S2'],
  ['Heroes of the Storm', 'Hero'],
  ['Warcraft III', 'W3'],
  ['Diablo III', 'D3'],
];
function bnetInstalled(name) {
  return ['', '.app'].some((ext) => exists(path.join('/Applications', name + ext)) || exists(path.join(HOME, 'Applications', name + ext)));
}
function loadBattleNet() {
  if (!exists('/Applications/Battle.net.app')) return [];
  return BNET_APPS.filter(([name]) => bnetInstalled(name)).map(([name, code]) => base('battlenet', code, name, {
    installed: true, bnetCode: code, bnetExe: '', library: '/Applications',
  }));
}

// ---------- Riot ----------
function loadRiot() {
  const lol = '/Applications/League of Legends.app';
  if (!exists(lol)) return [];
  return [base('riot', 'league_of_legends', 'League of Legends', {
    installed: true, installDir: lol, library: '/Applications', exe: lol,
    processNames: ['leagueclientux', 'leagueoflegends', 'leagueclient'],
  })];
}

// ---------- Jeux ajoutés à la main ----------
function loadCustom(list = []) {
  return list.filter((c) => c && c.id && c.exe).map((c) => base('custom', c.id, c.name, {
    installed: exists(c.exe), installDir: c.exe, library: path.dirname(c.exe),
    exe: c.exe, args: c.args || '', workingDir: path.dirname(c.exe),
    processNames: /\.app$/i.test(c.exe) ? appProcessNames(c.exe) : [path.basename(c.exe).toLowerCase()],
    customCover: c.cover || '',
  }));
}

// ---------- Epic Games Launcher ----------
const EPIC_DATA_CANDIDATES = [
  path.join(HOME, 'Library', 'Application Support', 'Epic', 'EpicGamesLauncher', 'Data'),
  '/Users/Shared/Epic/EpicGamesLauncher/Data',
];
const epicDataDir = EPIC_DATA_CANDIDATES.find(exists) || EPIC_DATA_CANDIDATES[0];

// Les jeux Epic installés par Heroic/Legendary complètent ceux du Epic Games Launcher.
// On mémorise ceux déjà fusionnés pour ne pas les remettre dans la liste « autres » (visuels).
let heroicMerged = new Set();
function loadEpic(stats) {
  const egl = require('../epic').loadEpic(stats, { dataDir: epicDataDir, platform: 'mac' });
  heroicMerged = new Set();
  for (const h of loadHeroic().epic) {
    const ex = egl.games.find((g) => g.appName === h.appName);
    if (!ex) continue;
    heroicMerged.add(h.appName);
    Object.assign(ex, {
      installed: true, viaHeroic: true, installDir: h.installDir, library: h.library,
      exe: h.exe, workingDir: h.workingDir,
      processNames: [...new Set([...(ex.processNames || []), ...(h.processNames || [])])],
    });
  }
  return egl;
}

// ---------- Caractéristiques du Mac ----------
let specs = null;
function pcSpecs() {
  if (specs) return Promise.resolve(specs);
  return new Promise((resolve) => {
    execFile('system_profiler', ['SPDisplaysDataType', '-json'], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      let gpus = [];
      try {
        const arr = JSON.parse(out || '{}').SPDisplaysDataType || [];
        gpus = arr.map((d) => d.sppci_model || d._name).filter(Boolean);
      } catch { /* profiler indisponible */ }
      const cpus = os.cpus();
      specs = {
        cpu: (cpus[0] ? cpus[0].model : '').replace(/\s+/g, ' ').trim(),
        threads: cpus.length,
        ramGb: Math.round(os.totalmem() / 1024 ** 3),
        gpus,
        os: `macOS ${os.release()}`,
      };
      resolve(specs);
    });
  });
}

module.exports = {
  id: 'darwin',
  isMac: true,
  isWin: false,
  supported: true,
  platformIds: ['steam', 'epic', 'gog', 'ea', 'battlenet', 'riot', 'amazon', 'itch', 'custom'],
  supports: {
    overlay: true,
    crosshair: false, // la géométrie de fenêtre passe par user32 sous Windows
    perf: false, // compteurs PerfMon / PresentMon
    shortcuts: false, // pas de raccourci Bureau .lnk ; à remplacer par un alias
    autoUpdate: false, // l'updater remplace un .exe portable
    saves: false, // la base Ludusavi ne fournit pas de chemins macOS
    directDownloads: false, // installateurs GOG/Epic = binaires Windows
  },
  accelerators: { window: 'Command+Alt+L', overlay: 'Command+Alt+O', crosshair: 'Command+Alt+X' },
  programFilter: { name: 'Applications', extensions: ['app', 'command', 'sh'] },
  programLabel: 'Applications (.app) ou exécutables',
  processNameRe: /^[\w .()\[\]-]{1,120}$/,
  launchExts,
  steamPath,
  steamRunningAppId,
  steamRunningAppIdSync,
  processNames,
  runningAmong,
  killProcess,
  isLocalFile,
  isProgram,
  startFile,
  createShortcut: null,
  loginItem: (app, openAtLogin) => app.setLoginItemSettings({ openAtLogin }),
  epicDataDir,
  loadEpic,
  loadPlatforms: (customGames) => {
    const h = loadHeroic();
    // Jeux Epic qu'Heroic a installés mais que le cache du Epic Games Launcher ne connaît pas :
    // ils passent par la liste « autres » pour recevoir leurs visuels (recherche Steam).
    const epicOnly = h.epic.filter((g) => !heroicMerged.has(g.appName));
    return [
      ...loadGog(), ...loadEa(), ...loadItch(), ...loadBattleNet(), ...loadRiot(),
      ...loadCustom(customGames), ...epicOnly, ...h.amazon,
    ];
  },
  loadMorePlatforms: async () => [],
  pcSpecs,
  // Exposé pour les tests et le diagnostic
  _internal: {
    gogGameFromApp, appProcessNames, bundleExecutable, listApps,
    loadEa, loadItch, loadGogGalaxy, readHeroic, readHeroicCached: loadHeroic, itchReceipt, findAppIn, bundleIdentifier,
  },
};
