// Lecture de la bibliothèque Steam directement depuis les fichiers locaux du client.
// Aucune clé API requise : jeux installés, temps de jeu, dernière session, collections
// et favoris viennent de ce que Steam écrit sur le disque. Une clé Web API (optionnelle)
// ajoute les jeux possédés jamais lancés sur ce PC.
const fs = require('fs');
const path = require('path');
const platform = require('./platform');

// ---------- VDF texte ----------
function parseVdf(text) {
  const root = {};
  const stack = [root];
  let i = 0;
  const n = text.length;
  let pendingKey = null;
  const readStr = () => {
    i++; // skip "
    let s = '';
    while (i < n && text[i] !== '"') {
      if (text[i] === '\\' && i + 1 < n) { const c = text[i + 1]; s += c === 'n' ? '\n' : c === 't' ? '\t' : c; i += 2; continue; }
      s += text[i++];
    }
    i++;
    return s;
  };
  while (i < n) {
    const c = text[i];
    if (c === '"') {
      const s = readStr();
      if (pendingKey === null) pendingKey = s;
      else { stack[stack.length - 1][pendingKey] = s; pendingKey = null; }
    } else if (c === '{') {
      const obj = {};
      if (pendingKey !== null) stack[stack.length - 1][pendingKey] = obj;
      stack.push(obj); pendingKey = null; i++;
    } else if (c === '}') {
      stack.pop(); i++;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') i++;
    } else i++;
  }
  return root;
}

const readVdf = (file) => { try { return parseVdf(fs.readFileSync(file, 'utf8')); } catch { return null; } };

// Accès insensible à la casse (Steam mélange "apps"/"Apps")
function get(obj, ...keys) {
  let cur = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    const lk = k.toLowerCase();
    const found = Object.keys(cur).find((x) => x.toLowerCase() === lk);
    cur = found === undefined ? undefined : cur[found];
  }
  return cur;
}

// ---------- appinfo.vdf binaire (v28 / v29) ----------
function parseAppInfo(file, wanted) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return new Map(); }
  // Fichier vide, tronqué (Steam le réécrit) ou format inconnu : on garde ce qui a pu être lu,
  // au lieu de faire disparaître toute la bibliothèque Steam.
  const out = new Map();
  try { parseAppInfoBuf(buf, wanted, out); } catch (e) { console.warn('appinfo.vdf illisible en partie :', e.message); }
  return out;
}

function parseAppInfoBuf(buf, wanted, out) {
  if (buf.length < 16) return;
  const magic = buf.readUInt32LE(0);
  const v29 = magic === 0x07564429;
  if (!v29 && magic !== 0x07564428) throw new Error(`format inconnu (0x${magic.toString(16)})`);
  let off = 8;
  let strings = null;
  if (v29) {
    const tableOff = Number(buf.readBigInt64LE(off)); off += 8;
    const count = buf.readUInt32LE(tableOff);
    strings = new Array(count);
    let p = tableOff + 4;
    for (let k = 0; k < count; k++) { const e = buf.indexOf(0, p); strings[k] = buf.toString('utf8', p, e); p = e + 1; }
  }
  const readCStr =(p) => { const e = buf.indexOf(0, p); return [buf.toString('utf8', p, e), e + 1]; };
  function readKV(p, end) {
    const obj = {};
    while (p < end) {
      const type = buf[p++];
      if (type === 0x08) break;
      let key;
      if (v29) { key = strings[buf.readUInt32LE(p)]; p += 4; } else { [key, p] = readCStr(p); }
      if (type === 0x00) { const r = readKV(p, end); obj[key] = r[0]; p = r[1]; }
      else if (type === 0x01) { const r = readCStr(p); obj[key] = r[0]; p = r[1]; }
      else if (type === 0x02 || type === 0x04 || type === 0x06) { obj[key] = buf.readInt32LE(p); p += 4; }
      else if (type === 0x03) { obj[key] = buf.readFloatLE(p); p += 4; }
      else if (type === 0x07 || type === 0x0a) { obj[key] = buf.readBigUInt64LE(p).toString(); p += 8; }
      else if (type === 0x05) { let e = p; while (buf.readUInt16LE(e) !== 0) e += 2; obj[key] = buf.toString('utf16le', p, e); p = e + 2; }
      else break;
    }
    return [obj, p];
  }
  while (off < buf.length - 4) {
    const appid = buf.readUInt32LE(off); off += 4;
    if (appid === 0) break;
    const size = buf.readUInt32LE(off); off += 4;
    const end = off + size;
    if (end > buf.length) break; // fichier tronqué
    if (!wanted || wanted.has(appid)) {
      try {
        const [kv] = readKV(off + 60, end);
        const common = get(kv, 'appinfo', 'common');
        if (common) out.set(appid, common);
      } catch { /* entrée corrompue : on ignore */ }
    }
    off = end;
  }
}

// ---------- Localisation de Steam ----------
// Le dossier de Steam ne change pas en cours de route : on ne relance pas reg.exe (≈40 ms, bloquant)
// à chaque synchro tant que le dossier trouvé existe toujours.
let steamPathCache = null;
function findSteamPath() {
  if (steamPathCache && fs.existsSync(path.join(steamPathCache, 'steamapps'))) return steamPathCache;
  return (steamPathCache = platform.steamPath());
}

const STEAM64_BASE = 76561197960265728n;

function findUsers(steamPath) {
  const lu = readVdf(path.join(steamPath, 'config', 'loginusers.vdf'));
  const users = get(lu, 'users') || {};
  return Object.entries(users).map(([id64, u]) => ({
    id64,
    accountId: String(BigInt(id64) - STEAM64_BASE),
    name: u.PersonaName || u.AccountName,
    mostRecent: u.MostRecent === '1',
    timestamp: Number(u.Timestamp || 0),
  })).sort((a, b) => (b.mostRecent - a.mostRecent) || (b.timestamp - a.timestamp));
}

// ---------- Tags / ambiances ----------
// Identifiants de tags du magasin Steam (store_tags dans appinfo) → ambiance du launcher.
const MOOD_TAGS = {
  chill: [597, 1654, 1664, 599, 87918, 3810, 1702, 4136, 5350, 1643, 97376],
  intense: [19, 1663, 1774, 4026, 1716, 3959, 29482, 1667, 1773, 4747, 1625],
  histoire: [1742, 122, 21, 4166, 5984, 5608, 3799],
  amis: [3859, 1685, 3843, 1775, 3841, 7368, 128, 4508],
};
// Catégories Steam : coop et multijoueur en ligne
const FRIEND_CATEGORIES = new Set([9, 24, 27, 36, 37, 38, 39, 47, 48, 49]);

function moodsFor(common) {
  // Les tags sont triés par pertinence : on ne garde que les plus représentatifs.
  const tags = new Set(Object.values(get(common, 'store_tags') || {}).slice(0, 6).map(Number));
  const cats = Object.keys(get(common, 'category') || {}).map((k) => Number(k.replace('category_', '')));
  const moods = [];
  for (const [mood, ids] of Object.entries(MOOD_TAGS)) if (ids.some((id) => tags.has(id))) moods.push(mood);
  if (!moods.includes('amis') && cats.some((c) => FRIEND_CATEGORIES.has(c))) moods.push('amis');
  return moods;
}

// ---------- Assemblage de la bibliothèque ----------
function libraryFolders(steamPath) {
  const lf = readVdf(path.join(steamPath, 'steamapps', 'libraryfolders.vdf'));
  const folders = Object.values(get(lf, 'libraryfolders') || {}).filter((f) => f && f.path).map((f) => path.normalize(f.path));
  if (!folders.length) folders.push(steamPath);
  return [...new Set(folders)];
}

function readSteamCollections(steamPath, accountId) {
  const file = path.join(steamPath, 'userdata', accountId, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json');
  const result = { favorites: new Set(), hidden: new Set(), collections: [] };
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return result; }
  for (const [key, entry] of data) {
    if (!key.startsWith('user-collections.') || entry.is_deleted || !entry.value) continue;
    let v; try { v = JSON.parse(entry.value); } catch { continue; }
    const added = (v.added || []).map(Number);
    if (v.id === 'favorite') added.forEach((a) => result.favorites.add(a));
    else if (v.id === 'hidden') added.forEach((a) => result.hidden.add(a));
    else if (!v.filterSpec) result.collections.push({ id: v.id, name: v.name, apps: added });
  }
  return result;
}

const EXCLUDED_IDS = new Set([228980, 250820, 1070560, 1391110, 1628350, 1826330, 1493710, 2180100]); // Steamworks, SteamVR, runtimes Linux…

// Les synchros discrètes (Steam a écrit un fichier, une partie se termine) réutilisent la dernière
// réponse pendant 5 min ; le bouton « Synchroniser » redemande toujours la liste à Steam.
let ownedCache = { k: '', t: 0, list: null };
async function ownedGames(apiKey, steamId, fresh) {
  const k = `${apiKey}|${steamId}`;
  if (!fresh && ownedCache.list && ownedCache.k === k && Date.now() - ownedCache.t < 5 * 60e3) return ownedCache.list;
  const list = await fetchOwnedGames(apiKey, steamId);
  ownedCache = { k, t: Date.now(), list };
  return list;
}

async function fetchOwnedGames(apiKey, steamId) {
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${encodeURIComponent(apiKey)}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Steam Web API : HTTP ${res.status}`);
  const json = await res.json();
  return (json.response && json.response.games) || [];
}

async function loadLibrary({ apiKey, steamId: forcedId, fresh } = {}) {
  const steamPath = findSteamPath();
  if (!steamPath) throw new Error('Steam introuvable sur ce PC.');
  const users = findUsers(steamPath);
  const user = (forcedId && users.find((u) => u.id64 === forcedId)) || users[0];
  if (!user) throw new Error('Aucun compte Steam connecté trouvé.');

  const games = new Map();
  const ensure = (appid) => {
    if (!games.has(appid)) games.set(appid, { appid, name: null, installed: false, playtime: 0, lastPlayed: 0, sizeOnDisk: 0 });
    return games.get(appid);
  };

  // 1. Jeux installés (appmanifest_*.acf de chaque bibliothèque)
  for (const folder of libraryFolders(steamPath)) {
    const dir = path.join(folder, 'steamapps');
    let files = [];
    try { files = fs.readdirSync(dir).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      const st = get(readVdf(path.join(dir, f)), 'AppState');
      if (!st) continue;
      const g = ensure(Number(st.appid));
      g.name = st.name || g.name;
      const flags = Number(st.StateFlags || 0);
      g.installed = true;
      g.needsUpdate = (flags & 2) !== 0 || (flags & 1024) !== 0;
      g.sizeOnDisk = Number(st.SizeOnDisk || 0);
      g.installDir = path.join(dir, 'common', st.installdir || '');
      g.library = folder;
      g.lastPlayed = Math.max(g.lastPlayed, Number(st.LastPlayed || 0));
    }
  }

  // 2. Temps de jeu + dernière session du compte actif
  const lc = readVdf(path.join(steamPath, 'userdata', user.accountId, 'config', 'localconfig.vdf'));
  const apps = get(lc, 'UserLocalConfigStore', 'Software', 'Valve', 'Steam', 'apps') || {};
  for (const [id, a] of Object.entries(apps)) {
    const lp = Number(a.LastPlayed || 0);
    const pt = Number(a.Playtime || a.playtime || 0);
    if (!lp && !pt && !games.has(Number(id))) continue;
    const g = ensure(Number(id));
    g.lastPlayed = Math.max(g.lastPlayed, lp);
    g.playtime = Math.max(g.playtime, pt);
    g.playtime2wks = Number(a.Playtime2wks || 0);
  }

  // 3. Collections et favoris Steam
  const coll = readSteamCollections(steamPath, user.accountId);
  for (const c of coll.collections) c.apps.forEach((id) => ensure(id));
  coll.favorites.forEach((id) => ensure(id));

  // 4. (optionnel) Tous les jeux possédés via la Web API
  let apiError = null;
  if (apiKey) {
    try {
      for (const o of await ownedGames(apiKey, user.id64, fresh)) {
        const g = ensure(o.appid);
        g.owned = true;
        g.name = g.name || o.name;
        g.playtime = Math.max(g.playtime, o.playtime_forever || 0);
        g.playtime2wks = Math.max(g.playtime2wks || 0, o.playtime_2weeks || 0);
        g.lastPlayed = Math.max(g.lastPlayed, o.rtime_last_played || 0);
      }
    } catch (e) { apiError = e.message; }
  }

  // 5. Métadonnées depuis le cache du client (nom, type, développeur, tags)
  const info = parseAppInfo(path.join(steamPath, 'appcache', 'appinfo.vdf'), new Set(games.keys()));
  const list = [];
  for (const g of games.values()) {
    const c = info.get(g.appid);
    const type = c ? String(get(c, 'type') || '').toLowerCase() : '';
    if (EXCLUDED_IDS.has(g.appid)) continue;
    if (c && type && type !== 'game' && type !== 'demo' && type !== 'mod') continue;
    if (!c && !g.installed && !g.owned) continue;
    g.name = g.name || (c && get(c, 'name'));
    if (!g.name) continue;
    if (c) {
      const assoc = Object.values(get(c, 'associations') || {});
      g.developer = (assoc.find((a) => a.type === 'developer') || {}).name || '';
      g.publisher = (assoc.find((a) => a.type === 'publisher') || {}).name || '';
      g.releaseDate = Number(get(c, 'steam_release_date') || get(c, 'original_release_date') || 0);
      g.reviewPct = Number(get(c, 'review_percentage') || 0);
      g.controller = String(get(c, 'controller_support') || '');
      g.moods = moodsFor(c);
      g.tags = Object.values(get(c, 'store_tags') || {}).slice(0, 12).map(Number).filter(Boolean);
      g.isDemo = type === 'demo';
      const ci = get(c, 'clienticon');
      if (ci) { const ico = path.join(steamPath, 'steam', 'games', ci + '.ico'); if (fs.existsSync(ico)) g.clientIcon = ico; }
    } else g.moods = [];
    g.favorite = coll.favorites.has(g.appid);
    g.hidden = coll.hidden.has(g.appid);
    g.art = artFor(steamPath, g.appid);
    g.key = String(g.appid);
    g.store = 'steam';
    list.push(g);
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }));

  return {
    steamPath,
    user: { name: user.name, id64: user.id64, accountId: user.accountId },
    users: users.map((u) => ({ name: u.name, id64: u.id64 })),
    games: list,
    collections: coll.collections
      .map((c) => ({ id: c.id, name: c.name, apps: c.apps.filter((id) => list.some((g) => g.appid === id)).map(String) }))
      .filter((c) => c.apps.length),
    runningAppId: platform.steamRunningAppIdSync(),
    syncedAt: Date.now(),
    apiError,
    watchPaths: [
      ...libraryFolders(steamPath).map((f) => path.join(f, 'steamapps')),
      path.join(steamPath, 'userdata', user.accountId, 'config'),
    ],
  };
}

// ---------- Visuels (cache local du client, sinon CDN Steam) ----------
// Nom CDN classique, puis variantes rangées dans des sous-dossiers hachés par les clients récents.
const ART_FILES = { cover: 'library_600x900.jpg', hero: 'library_hero.jpg', logo: 'logo.png', header: 'header.jpg' };
const ART_LOCAL = {
  cover: ['library_600x900.jpg', 'library_capsule.jpg'],
  hero: ['library_hero.jpg'],
  logo: ['logo.png'],
  header: ['header.jpg', 'library_header.jpg'],
};
function artFor(steamPath, appid) {
  const dir = path.join(steamPath, 'appcache', 'librarycache', String(appid));
  const files = new Map();
  const walk = (d, depth) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory() && depth < 2) walk(path.join(d, e.name), depth + 1);
      else if (!files.has(e.name)) files.set(e.name, path.join(d, e.name));
    }
  };
  walk(dir, 0);
  const found = {};
  for (const [k, names] of Object.entries(ART_LOCAL)) {
    const hit = names.find((n) => files.has(n));
    if (hit) found[k] = files.get(hit);
  }
  const cdn = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/`;
  const art = {};
  for (const [k, f] of Object.entries(ART_FILES)) art[k] = found[k] ? 'steamart://local/' + encodeURIComponent(found[k]) : cdn + f;
  return art;
}

module.exports = { loadLibrary, findSteamPath, parseVdf, parseAppInfo, readVdf, get, libraryFolders };
