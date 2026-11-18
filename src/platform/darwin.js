// Implémentation macOS.
// Sources de jeux natives : Steam, Epic Games Launcher, GOG Galaxy, Battle.net, Riot, jeux
// ajoutés à la main. Tout ce qui n'a pas d'équivalent macOS (registre, PerfMon, PresentMon,
// raccourcis .lnk, installateurs GOG/Epic) est désactivé proprement via `supports`.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');
const { base } = require('../platforms');

const HOME = os.homedir();
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };

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

function loadGog() {
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

// ---------- Battle.net ----------
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
const loadEpic = (stats) => require('../epic').loadEpic(stats, { dataDir: epicDataDir, platform: 'mac' });

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
  platformIds: ['steam', 'epic', 'gog', 'battlenet', 'riot', 'custom'],
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
  loadPlatforms: (customGames) => [...loadGog(), ...loadBattleNet(), ...loadRiot(), ...loadCustom(customGames)],
  loadMorePlatforms: async () => [],
  pcSpecs,
  // Exposé pour les tests et le diagnostic
  _internal: { gogGameFromApp, appProcessNames, bundleExecutable, listApps },
};
