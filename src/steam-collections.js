// Collections Steam : lecture et écriture du fichier de collections du client.
//
// Steam stocke les collections dans un « cloud storage » local :
//   userdata/<compte>/config/cloudstorage/cloud-storage-namespace-<n>.json
// Chaque collection est une entrée [clé, { value, version, timestamp, … }] dont `value`
// est un JSON { id, name, added:[appid], removed:[appid], filterSpec? }.
//
// Écrire pendant que Steam tourne est perdu (Steam réécrit le fichier depuis sa mémoire).
// Ce module refuse donc d'écrire si Steam tourne : l'appelant met les changements en
// attente et les applique à la fermeture. Avant chaque écriture : sauvegarde horodatée,
// version incrémentée (Steam accepte la modification), écriture atomique, relecture de
// contrôle. Les collections dynamiques (filterSpec) ne sont jamais modifiées.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const PREFIX = 'user-collections.';
const KEEP_BACKUPS = 10;

const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

// Le namespace qui contient les collections n'est pas toujours 1 : on lit la table
// cloud-storage-namespaces.json et on prend le premier fichier qui parle de collections.
function namespaceFile(steamPath, accountId) {
  const dir = path.join(steamPath, 'userdata', String(accountId), 'config', 'cloudstorage');
  const table = readJson(path.join(dir, 'cloud-storage-namespaces.json'));
  if (Array.isArray(table)) {
    for (const row of table) {
      const ns = Array.isArray(row) ? row[0] : null;
      if (ns == null) continue;
      const file = path.join(dir, `cloud-storage-namespace-${ns}.json`);
      try {
        if (fs.readFileSync(file, 'utf8').includes(PREFIX)) return file;
      } catch { /* namespace vide */ }
    }
  }
  return path.join(dir, 'cloud-storage-namespace-1.json');
}

function parseEntries(file) {
  const data = readJson(file);
  if (!Array.isArray(data)) return { entries: [], maxVersion: 0 };
  let maxVersion = 0;
  for (const row of data) {
    const v = row && row[1];
    if (v && Number(v.version) > maxVersion) maxVersion = Number(v.version);
  }
  return { entries: data, maxVersion };
}

function parseCollection(key, entry) {
  if (!entry || entry.is_deleted || !entry.value) return null;
  let v;
  try { v = JSON.parse(entry.value); } catch { return null; }
  if (!v || typeof v !== 'object') return null;
  const id = String(v.id || key.slice(PREFIX.length));
  const added = Array.isArray(v.added) ? v.added.map(Number).filter(Number.isFinite) : [];
  const removed = Array.isArray(v.removed) ? v.removed.map(Number).filter(Number.isFinite) : [];
  return {
    key,
    id,
    name: String(v.name || id),
    added,
    removed,
    // Membre = ajouté et non retiré (Steam garde des tombstones pour les collections dynamiques)
    apps: added.filter((a) => !removed.includes(a)),
    dynamic: !!v.filterSpec,
    filterSpec: v.filterSpec || null,
  };
}

function listCollections(steamPath, accountId) {
  const file = namespaceFile(steamPath, accountId);
  const { entries } = parseEntries(file);
  const out = [];
  for (const [key, entry] of entries) {
    if (!String(key).startsWith(PREFIX)) continue;
    const c = parseCollection(key, entry);
    if (c) out.push(c);
  }
  return { file, collections: out };
}

// Steam tourne ? SteamPID dans registry.vdf est la source la plus fiable sur macOS/Linux ;
// sous Windows on retombe sur tasklist (registry.vdf y existe aussi, mais pas garanti).
function isSteamRunning(steamPath) {
  let pid = 0;
  try {
    const reg = fs.readFileSync(path.join(steamPath, 'registry.vdf'), 'utf8');
    const m = reg.match(/"SteamPID"\s+"(\d+)"/);
    if (m) pid = Number(m[1]);
  } catch { /* registry.vdf absent */ }
  if (pid > 0) return true;
  // SteamPID peut être remis à 0 avant que le processus ait fini d'écrire : on vérifie aussi.
  if (process.platform === 'win32') {
    try {
      const out = execFileSync('tasklist', ['/fi', 'IMAGENAME eq steam.exe', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 4000 });
      return /steam\.exe/i.test(out);
    } catch { return true; }
  }
  try {
    const out = execFileSync('ps', ['-axo', 'comm='], { encoding: 'utf8', timeout: 4000 });
    return /\/steam_osx\b|\/steam\b/i.test(out);
  } catch { return true; } // dans le doute, on n'écrit pas
}

function backup(file, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(backupDir, `${path.basename(file, '.json')}-${stamp}.json`);
  fs.copyFileSync(file, dest);
  const old = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json')).sort().reverse();
  for (const f of old.slice(KEEP_BACKUPS)) {
    try { fs.unlinkSync(path.join(backupDir, f)); } catch { /* rien */ }
  }
  return dest;
}

function writeAtomic(file, data) {
  const tmp = `${file}.clre-${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, file);
}

// ops : [{ id, name?, create?, delete?, add?: [appid], remove?: [appid] }]
// Renvoie { file, backup, changed } ; lève { code: 'steam-running' } si Steam tourne.
function apply(steamPath, accountId, ops, { backupDir, running = isSteamRunning } = {}) {
  if (running(steamPath)) {
    const e = new Error('Steam est ouvert : les collections ne peuvent pas être modifiées maintenant');
    e.code = 'steam-running';
    throw e;
  }
  const file = namespaceFile(steamPath, accountId);
  const { entries, maxVersion } = parseEntries(file);
  if (!entries.length) throw new Error('Fichier de collections Steam introuvable');

  const byKey = new Map(entries.map((row, i) => [String(row[0]), i]));
  const version = String(maxVersion + 1);
  const now = Math.floor(Date.now() / 1000);
  let changed = 0;

  for (const op of ops || []) {
    if (!op || !op.id) continue;
    const key = PREFIX + op.id;
    const idx = byKey.get(key);
    let current = idx === undefined ? null : parseCollection(key, entries[idx][1]);
    if (current && current.dynamic) continue; // fabriquée par Steam : on n'y touche pas

    if (op.delete) {
      if (idx === undefined) continue;
      entries[idx] = { key, timestamp: now, is_deleted: true, version };
      changed++;
      continue;
    }

    if (!current) {
      if (!op.create) continue;
      current = { id: op.id, name: op.name || op.id, added: [], removed: [] };
    }
    const added = new Set(current.added);
    const removed = new Set(current.removed);
    for (const a of (op.add || []).map(Number).filter(Number.isFinite)) { added.add(a); removed.delete(a); }
    for (const a of (op.remove || []).map(Number).filter(Number.isFinite)) { added.delete(a); removed.add(a); }
    const value = {
      id: current.id,
      name: op.name || current.name,
      added: [...added],
      removed: [...removed],
    };
    // Un filterSpec existant n'est jamais recopié : on ne réécrit que les collections statiques.
    const row = { key, timestamp: now, value: JSON.stringify(value), version, conflictResolutionMethod: 'custom', strMethodId: 'union-collections' };
    if (idx === undefined) { entries.push([key, row]); byKey.set(key, entries.length - 1); } else entries[idx] = [key, row];
    changed++;
  }

  if (!changed) return { file, changed: 0, backup: null };

  const dest = backup(file, backupDir);
  writeAtomic(file, JSON.stringify(entries));
  // Relecture de contrôle : un fichier corrompu serait pire que pas d'écriture du tout.
  if (!Array.isArray(readJson(file))) {
    fs.copyFileSync(dest, file);
    throw new Error('Écriture invalide : sauvegarde restaurée');
  }
  return { file, changed, backup: dest };
}

// ---------- Correspondance statut ↔ collection ----------
// Le launcher ne crée pas de collections « maison » : il s'appuie sur celles de l'utilisateur.
// On reconnaît les noms usuels (▶️ PLAYING, ➡️ Play next, ✅ DONE, ❌ Discarded), sinon rien.
const STATUS_PATTERNS = {
  playing: /\b(playing|en cours|en jeu|currently playing|replaying)\b/,
  todo: /\b(play next|next up|next|a faire|a jouer|backlog|todo|queue|wishlist)\b/,
  done: /\b(done|finished|completed|complete|termine|terminee|termines|finis|fini)\b/,
  dropped: /\b(discard|discarded|dropped|abandonne|abandonnee|abandonnes|abandoned|dropped)\b/,
};
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function detectStatusMap(collections) {
  const map = { todo: null, playing: null, done: null, dropped: null };
  const used = new Set();
  for (const [status, re] of Object.entries(STATUS_PATTERNS)) {
    const hit = collections.find((c) => !c.dynamic && !used.has(c.id) && re.test(norm(c.name)));
    if (hit) { map[status] = hit.id; used.add(hit.id); }
  }
  return map;
}

// Priorité quand un jeu est dans plusieurs collections de statut (Steam n'interdit pas).
function statusForApp(collections, statusMap, appid) {
  const byId = new Map(collections.map((c) => [c.id, c]));
  const id = Number(appid);
  for (const s of ['playing', 'done', 'dropped', 'todo']) {
    const c = byId.get(statusMap[s]);
    if (!c) continue;
    const members = Array.isArray(c.appids) ? c.appids : c.apps;
    if ((members || []).includes(id)) return s;
  }
  return '';
}

module.exports = {
  namespaceFile, listCollections, parseCollection, isSteamRunning, apply,
  detectStatusMap, statusForApp, STATUS_PATTERNS, norm,
};
