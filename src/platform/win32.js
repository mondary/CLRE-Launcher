// Implémentation Windows : registre, tasklist/qprocess, lancement .exe/.lnk/.bat.
// Ce fichier reprend à l'identique le comportement d'origine du launcher ; il sert de
// référence pour vérifier que la couche plateforme ne change rien sous Windows.
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');
const { regQuery } = require('../reg');

// ---------- Steam ----------
function steamPath() {
  if (process.env.CLRE_STEAM_PATH) return process.env.CLRE_STEAM_PATH; // tests et diagnostic
  try {
    const out = regQuery('HKCU\\Software\\Valve\\Steam', ['/v', 'SteamPath']);
    const m = out.match(/SteamPath\s+REG_SZ\s+(.+)/);
    if (m) return path.normalize(m[1].trim());
  } catch { /* pas de registre */ }
  for (const p of ['C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam']) if (fs.existsSync(p)) return p;
  return null;
}

function regDword(name) {
  try {
    const out = execFileSync('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', name], { encoding: 'utf8', windowsHide: true });
    const m = out.match(/REG_DWORD\s+0x([0-9a-f]+)/i);
    return m ? parseInt(m[1], 16) : 0;
  } catch { return 0; }
}

function regDwordAsync(name) {
  return new Promise((resolve) => {
    execFile('reg', ['query', 'HKCU\\Software\\Valve\\Steam', '/v', name], { encoding: 'utf8', windowsHide: true, timeout: 4000 }, (err, out) => {
      const m = !err && /REG_DWORD\s+0x([0-9a-f]+)/i.exec(out || '');
      resolve(m ? parseInt(m[1], 16) : 0);
    });
  });
}

const steamRunningAppIdSync = () => regDword('RunningAppID');
const steamRunningAppId = () => regDwordAsync('RunningAppID');

// ---------- Processus ----------
function listProcesses(filter) {
  return new Promise((resolve) => {
    const args = ['/fo', 'csv', '/nh', ...(filter ? ['/fi', `IMAGENAME eq ${filter}`] : [])];
    execFile('tasklist', args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(new Set());
      resolve(new Set(out.split(/\r?\n/).map((l) => (l.match(/^"([^"]+)"/) || [])[1]).filter(Boolean).map((s) => s.toLowerCase())));
    });
  });
}

// qprocess coupe les noms longs à 12 caractères (« fortniteclie... ») : il sert de premier
// tri, et tasklist, limité aux noms coupés qui correspondent, confirme le nom exact.
function qprocessNames() {
  return new Promise((resolve) => {
    execFile('qprocess', ['*'], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out) => {
      if (err) return resolve(null);
      const names = out.split(/\r?\n/).map((l) => (l.match(/\s\d+\s+\d+\s+(\S.*?)\s*$/) || [])[1]).filter(Boolean).map((s) => s.toLowerCase());
      resolve(names.length ? names : null);
    });
  });
}

async function processNames() {
  return listProcesses();
}

async function runningAmong(wanted) {
  const wantedSet = wanted instanceof Set ? wanted : new Set(wanted || []);
  const q = await qprocessNames();
  if (!q) return listProcesses(); // qprocess absent ou illisible : relevé complet comme avant
  const found = new Set();
  const prefixes = new Set();
  for (const n of q) {
    if (!n.endsWith('...')) { if (wantedSet.has(n)) found.add(n); continue; }
    const pre = n.slice(0, -3);
    for (const w of wantedSet) if (w.length > pre.length && w.startsWith(pre)) { prefixes.add(pre); break; }
  }
  for (const set of await Promise.all([...prefixes].map((pre) => listProcesses(pre + '*')))) for (const n of set) if (wantedSet.has(n)) found.add(n);
  return found;
}

function killProcess(name) {
  execFile('taskkill', ['/IM', name], { windowsHide: true }, () => {});
}

// ---------- Lancement ----------
const LAUNCH_EXT = new Set(['.exe', '.lnk', '.url', '.bat', '.cmd']);
const hasExt = (f, set) => set.has(path.extname(String(f)).toLowerCase());

function isLocalFile(f) {
  return typeof f === 'string' && /^[a-z]:[\\/]/i.test(f) && !f.includes('\0');
}

function isProgram(f) {
  return typeof f === 'string' && path.isAbsolute(f) && !f.includes('\0') && hasExt(f, LAUNCH_EXT);
}

// Démarre un programme selon son type :
// - .exe : directement, avec ses arguments ;
// - .lnk / .url : comme un double-clic dans l'Explorateur (le raccourci porte ses propres arguments) ;
// - .bat / .cmd : via cmd.exe (Node refuse de les lancer directement depuis la version 20.12).
function startFile(file, argStr, cwd, onError) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.lnk' || ext === '.url') {
    const { shell } = require('electron');
    shell.openPath(file).then((err) => { if (err) onError(err); });
    return;
  }
  const args = String(argStr || '').trim().match(/(?:[^\s"]+|"[^"]*")+/g) || [];
  try {
    let child;
    if (ext === '.bat' || ext === '.cmd') {
      // Les caractères spéciaux de cmd.exe dans les arguments pourraient enchaîner d'autres commandes.
      if (/[&|<>^%]/.test(argStr || '') || /["%]/.test(file)) { onError('caractère non pris en charge dans les arguments'); return; }
      const line = `/d /s /c ""${file}"${args.length ? ' ' + args.join(' ') : ''}"`;
      child = spawn('cmd.exe', [line], { cwd, detached: true, stdio: 'ignore', windowsVerbatimArguments: true });
    } else {
      child = spawn(file, args.map((a) => a.replace(/^"|"$/g, '')), { cwd, detached: true, stdio: 'ignore' });
    }
    child.on('error', (e) => onError(e.message));
    child.unref();
  } catch (e) { onError(e.message); }
}

// ---------- Raccourcis / démarrage ----------
function createShortcut(app, shell, g) {
  return require('../system').createShortcut(app, shell, g);
}

function loginItem(app, openAtLogin) {
  app.setLoginItemSettings({ openAtLogin, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, args: ['--hidden'] });
}

// ---------- Sources de jeux ----------
const epicDataDir = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data');
const loadEpic = (stats) => require('../epic').loadEpic(stats, { dataDir: epicDataDir, platform: 'win' });
const loadPlatforms = (customGames) => require('../platforms').loadPlatforms(customGames);
const loadMorePlatforms = () => require('../platforms2').loadMorePlatforms();

// ---------- Caractéristiques du PC ----------
let specs = null;
function pcSpecs() {
  if (specs) return Promise.resolve(specs);
  return new Promise((resolve) => {
    const { PS_UTF8 } = require('../reg');
    const ps = PS_UTF8 + 'Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name + "|" + $_.AdapterRAM }; "OS|" + (Get-CimInstance Win32_OperatingSystem).Caption';
    execFile('powershell', ['-NoProfile', '-Command', ps], { windowsHide: true, timeout: 15000 }, (err, out) => {
      const os = require('os');
      const lines = String(out || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const gpus = lines.filter((l) => !l.startsWith('OS|')).map((l) => l.split('|')[0]).filter((n) => n && !/basic display|remote|virtual/i.test(n));
      const osLine = lines.find((l) => l.startsWith('OS|'));
      const cpus = os.cpus();
      specs = {
        cpu: cpus[0] ? cpus[0].model.replace(/\s+/g, ' ').trim() : '',
        threads: cpus.length,
        ramGb: Math.round(os.totalmem() / 1024 ** 3),
        gpus,
        os: osLine ? osLine.slice(3).replace('Microsoft ', '') : `Windows ${os.release()}`,
      };
      resolve(specs);
    });
  });
}

module.exports = {
  id: 'win32',
  isMac: false,
  isWin: true,
  supported: true,
  platformIds: ['steam', 'epic', 'gog', 'ubisoft', 'ea', 'xbox', 'battlenet', 'riot', 'amazon', 'itch', 'custom'],
  supports: {
    overlay: true, crosshair: true, perf: true, shortcuts: true,
    autoUpdate: true, saves: true, directDownloads: true,
  },
  accelerators: { window: 'Control+Alt+L', overlay: 'Control+Alt+O', crosshair: 'Control+Alt+X' },
  programFilter: { name: 'Programmes', extensions: ['exe', 'lnk', 'bat', 'url'] },
  programLabel: 'Programmes (.exe, .lnk, .url, .bat)',
  processNameRe: /^[\w .()-]+\.exe$/i,
  steamPath,
  steamRunningAppId,
  steamRunningAppIdSync,
  processNames,
  runningAmong,
  killProcess,
  isLocalFile,
  isProgram,
  startFile,
  createShortcut,
  loginItem,
  epicDataDir,
  loadEpic,
  loadPlatforms,
  loadMorePlatforms,
  pcSpecs,
};
