// Implémentation Linux (squelette, pour le futur Steam Deck).
// Le launcher démarre et la couche Steam est déjà utilisable : SteamOS et les distributions
// classiques écrivent la même arborescence que macOS (~/.steam/steam, registry.vdf).
// Reste à brancher : Heroic, Lutris, lancement des .desktop / AppImage, détection via /proc.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile, spawn } = require('child_process');

const HOME = os.homedir();
const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };

const STEAM_DIRS = [
  path.join(HOME, '.steam', 'steam'),
  path.join(HOME, '.local', 'share', 'Steam'),
  path.join(HOME, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
];
function steamPath() {
  if (process.env.CLRE_STEAM_PATH) return process.env.CLRE_STEAM_PATH; // tests et diagnostic
  for (const p of STEAM_DIRS) if (exists(path.join(p, 'steamapps'))) return p;
  return null;
}
function steamRunningAppIdSync() {
  const root = steamPath();
  if (!root) return 0;
  try {
    const m = fs.readFileSync(path.join(root, 'registry.vdf'), 'utf8').match(/"RunningAppID"\s+"(\d+)"/);
    return m ? Number(m[1]) : 0;
  } catch { return 0; }
}

function processNames() {
  return new Promise((resolve) => {
    const set = new Set();
    try {
      for (const pid of fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d))) {
        try {
          const comm = fs.readFileSync(path.join('/proc', pid, 'comm'), 'utf8').trim().toLowerCase();
          if (comm) set.add(comm);
        } catch { /* processus disparu */ }
      }
    } catch { /* pas de /proc */ }
    resolve(set);
  });
}
async function runningAmong(wanted) {
  const wantedSet = wanted instanceof Set ? wanted : new Set(wanted || []);
  const running = await processNames();
  return new Set([...wantedSet].filter((w) => running.has(String(w).toLowerCase())));
}

const isLocalFile = (f) => typeof f === 'string' && path.isAbsolute(f) && !f.includes('\0');
const isProgram = (f) => isLocalFile(f) && exists(f);

function startFile(file, argStr, cwd, onError) {
  const args = String(argStr || '').trim().match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  try {
    const child = spawn(file, args.map((a) => a.replace(/^"|"$/g, '')), { cwd, detached: true, stdio: 'ignore' });
    child.on('error', (e) => onError(e.message));
    child.unref();
  } catch (e) { onError(e.message); }
}

const pcSpecs = () => Promise.resolve({
  cpu: (os.cpus()[0] || {}).model || '',
  threads: os.cpus().length,
  ramGb: Math.round(os.totalmem() / 1024 ** 3),
  gpus: [],
  os: `Linux ${os.release()}`,
});

module.exports = {
  id: 'linux',
  isMac: false,
  isWin: false,
  supported: false, // squelette : pas encore de sources de jeux hors Steam
  platformIds: ['steam', 'custom'],
  supports: {
    overlay: false, crosshair: false, perf: false, shortcuts: false,
    autoUpdate: false, saves: false, directDownloads: false,
  },
  accelerators: { window: 'Control+Alt+L', overlay: 'Control+Alt+O', crosshair: 'Control+Alt+X' },
  programFilter: { name: 'Exécutables', extensions: ['AppImage', 'desktop', 'sh'] },
  programLabel: 'Exécutables ou fichiers .desktop',
  processNameRe: /^[\w .()\[\]-]{1,120}$/,
  launchExts: ['.AppImage', '.desktop', '.sh'],
  steamPath,
  steamRunningAppId: () => Promise.resolve(steamRunningAppIdSync()),
  steamRunningAppIdSync,
  processNames,
  runningAmong,
  killProcess: (name) => execFile('pkill', ['-x', name], () => {}),
  isLocalFile,
  isProgram,
  startFile,
  createShortcut: null,
  loginItem: () => {},
  epicDataDir: '',
  loadEpic: () => ({ available: false, games: [] }),
  loadPlatforms: () => [],
  loadMorePlatforms: async () => [],
  pcSpecs,
};
