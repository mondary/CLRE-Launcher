// Lecture de la bibliothèque Epic Games depuis les fichiers locaux du Epic Games Launcher.
// - Jeux installés : ProgramData\Epic\EpicGamesLauncher\Data\Manifests\*.item
// - Jeux possédés + visuels : Data\Catalog\catcache.bin (JSON en base64)
// Epic ne stocke pas le temps de jeu en local : le launcher le mesure lui-même (voir main.js).
const fs = require('fs');
const path = require('path');

const DATA = path.join(process.env.ProgramData || 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data');
const BAD_CATEGORIES = /^(addons|testing|hidden|engines|software|assets|plugins|projects|bundles|points|subscription|developer|audience$)/;

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }

function readCatalog(dataDir) {
  try {
    const raw = fs.readFileSync(path.join(dataDir, 'Catalog', 'catcache.bin'), 'utf8');
    const items = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

const img = (item, ...types) => {
  for (const t of types) {
    const k = (item.keyImages || []).find((x) => x.type === t);
    if (k) return k.url;
  }
  return '';
};

function loadEpic(stats = {}, opts = {}) {
  const dataDir = opts.dataDir || DATA;
  const wantMac = opts.platform === 'mac';
  if (!fs.existsSync(dataDir)) return { available: false, games: [] };

  const installed = new Map(); // catalogItemId -> manifest
  let manifests = [];
  try { manifests = fs.readdirSync(path.join(dataDir, 'Manifests')).filter((f) => f.endsWith('.item')); } catch { /* aucun */ }
  for (const f of manifests) {
    const m = readJson(path.join(dataDir, 'Manifests', f));
    if (!m || m.bIsIncompleteInstall || m.MainGameAppName && m.MainGameAppName !== m.AppName) continue;
    if (!(m.AppCategories || []).includes('games')) continue;
    installed.set(m.CatalogItemId, m);
  }

  const games = new Map();
  for (const item of readCatalog(dataDir)) {
    const cats = (item.categories || []).map((c) => c.path);
    if (!cats.includes('games') || cats.some((c) => BAD_CATEGORIES.test(c))) continue;
    if (item.mainGameItem && item.mainGameItem.id) continue; // DLC
    const rel = (item.releaseInfo || []).find((r) => (r.platform || []).some((p) => (wantMac ? /^mac/i.test(p) : /^win/i.test(p))));
    if (!rel) continue;
    const m = installed.get(item.id);
    const appName = m ? m.AppName : rel.appId;
    games.set(item.id, makeGame(item, m, appName, stats));
  }
  // Installés absents du cache catalogue
  for (const [id, m] of installed) if (!games.has(id)) games.set(id, makeGame({ id, namespace: m.CatalogNamespace, title: m.DisplayName }, m, m.AppName, stats));

  return { available: true, games: [...games.values()] };
}

// Le cache Epic enregistre les caractères non ASCII (™, ®, espaces insécables, accents) comme « ? »
// et le texte d'origine n'est disponible nulle part ailleurs sans connexion : on reconstruit au mieux.
function cleanTitle(t) {
  return String(t)
    .replace(/ /g, ' ')
    .replace(/(\p{Ll})\?(?=\p{Lu})/gu, '$1 ')            // Monument?Valley → Monument Valley
    .replace(/(\p{L})\?(?=\p{N})/gu, '$1 ')               // PAYDAY?2 → PAYDAY 2
    .replace(/(\p{L})\?(?=s\b)/gu, '$1’')                 // Director?s Cut → Director’s Cut
    .replace(/([\p{L}\p{N}])\?(?=[\s:,.)]|$)/gu, '$1')   // LEGO? Star, WARS?: → ™ / ® retirés
    .replace(/ \? /g, ' – ')                              // Firestone ? Idle → tiret
    .replace(/(^|[\s'’(])\?(?=\p{Ll})/gu, '$1é')          // ?dition → édition
    .replace(/(\p{L})\?(?=\p{Ll})/gu, '$1é')              // D?tective, ann?e → é (le plus fréquent en français)
    .replace(/\s+/g, ' ')
    .trim();
}

function makeGame(item, m, appName, stats) {
  const s = stats[appName] || {};
  const attrs = item.customAttributes || {};
  const procs = String((attrs.ProcessNames || {}).value || '').split(',').map((p) => p.trim()).filter(Boolean);
  if (m && m.LaunchExecutable) procs.push(path.basename(m.LaunchExecutable));
  const cover = img(item, 'DieselGameBoxTall', 'OfferImageTall', 'Thumbnail');
  const wide = img(item, 'DieselGameBox', 'OfferImageWide', 'Featured');
  return {
    key: 'epic:' + appName,
    store: 'epic',
    appName,
    namespace: item.namespace || (m && m.CatalogNamespace),
    catalogItemId: item.id,
    name: cleanTitle(item.title || (m && m.DisplayName) || appName),
    developer: item.developer || '',
    publisher: '',
    installed: !!m,
    needsUpdate: false,
    sizeOnDisk: m ? Number(m.InstallSize || 0) : 0,
    installDir: m ? m.InstallLocation : '',
    library: m ? path.dirname(m.InstallLocation) : '',
    playtime: Math.round((s.seconds || 0) / 60),
    lastPlayed: s.lastPlayed || 0,
    releaseDate: 0,
    reviewPct: 0,
    controller: '',
    moods: [],
    favorite: false,
    hidden: false,
    processNames: [...new Set(procs.map((p) => p.toLowerCase()))],
    art: { cover: cover || wide, hero: wide || cover, logo: img(item, 'DieselGameBoxLogo'), header: wide || cover },
  };
}

function epicUri(g, action) {
  return `com.epicgames.launcher://apps/${encodeURIComponent(`${g.namespace}:${g.catalogItemId}:${g.appName}`)}?action=${action}&silent=true`;
}

module.exports = { loadEpic, epicUri, makeGame, EPIC_DATA: DATA };
