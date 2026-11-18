// Fiche magasin enrichie (description, trailers, captures, tags, configuration requise)
// et caractéristiques du PC pour comparer avec la configuration demandée.
const fs = require('fs');

const cache = new Map();

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = (html) => decode(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, ' '))
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');

// "<li><strong>Processeur :</strong> Intel Core i3</li>" → [{ label, value }]
function parseRequirements(html) {
  if (!html || typeof html !== 'string') return [];
  const rows = [];
  for (const li of html.split(/<li>/i).slice(1)) {
    const m = li.match(/<strong>([^<]+?)\s*:?\s*<\/strong>\s*([\s\S]*?)(<\/li>|$)/i);
    if (m) rows.push({ label: decode(m[1]).replace(/\s*\*?\s*:?\s*$/, '').trim(), value: text(m[2]).replace(/\n/g, ' ') });
    else { const t = text(li); if (t) rows.push({ label: '', value: t }); }
  }
  return rows;
}

async function storeDetails(appid) {
  const hit = cache.get(appid);
  if (hit && hit.t > Date.now() - 6 * 3600e3) return hit.v;
  const r = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=french&cc=FR`);
  if (!r.ok) throw new Error(`Fiche magasin indisponible (HTTP ${r.status})`);
  const j = ((await r.json()) || {})[appid];
  if (!j || !j.success) throw new Error('Ce jeu n’a plus de page sur le magasin Steam');
  const d = j.data;
  const v = {
    short: decode(d.short_description || ''),
    about: text(d.about_the_game || d.detailed_description || '').slice(0, 2400),
    movies: (d.movies || []).slice(0, 4).map((m) => ({ name: m.name, thumb: m.thumbnail, hls: m.hls_h264 || '', mp4: (m.mp4 && (m.mp4.max || m.mp4['480'])) || '' })).filter((m) => m.hls || m.mp4),
    screenshots: (d.screenshots || []).slice(0, 12).map((s) => ({ thumb: s.path_thumbnail, full: s.path_full })),
    genres: (d.genres || []).map((g) => g.description),
    categories: (d.categories || []).map((c) => c.description),
    release: d.release_date ? d.release_date.date : '',
    website: d.website || '',
    metacritic: d.metacritic ? d.metacritic.score : null,
    languages: text(d.supported_languages || '').split('\n')[0].slice(0, 200),
    min: parseRequirements(d.pc_requirements && d.pc_requirements.minimum),
    rec: parseRequirements(d.pc_requirements && d.pc_requirements.recommended),
  };
  cache.set(appid, { t: Date.now(), v });
  return v;
}

// ---------- Caractéristiques de la machine ----------
// Windows (CIM), macOS (system_profiler) et Linux sont décrits par la couche plateforme.
function pcSpecs() {
  return require('./platform').pcSpecs();
}

// "8 GB de mémoire" / "16 Go" / "512 MB" → Go
function sizeGb(s) {
  const m = String(s || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(TB|To|GB|Go|MB|Mo)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return /T/i.test(m[2]) ? n * 1024 : /M/i.test(m[2]) ? n / 1024 : n;
}

function freeGb(dir) {
  try { const s = fs.statfsSync(dir); return (s.bavail * s.bsize) / 1024 ** 3; } catch { return null; }
}

module.exports = { storeDetails, pcSpecs, sizeGb, freeGb };
