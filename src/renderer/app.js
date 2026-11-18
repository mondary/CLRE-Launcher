'use strict';
const api = window.launcher;

// ---------- État ----------
const state = {
  lib: null,
  local: { favAdd: [], favRemove: [], layout: 'grid', sort: 'name' },
  route: { view: 'home' },
  history: [],
  running: [],
  home: { scope: 'installed', mood: 'all', spotIndex: 0, spotPool: [] },
  search: '',
  syncing: false,
};
const VIEWS = {}; // vues ajoutées par features.js

// ---------- Utilitaires ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

function fmtPlaytime(min) {
  if (!min) return 'Jamais lancé';
  if (min < 60) return `${min} min`;
  const m = Math.round(min); const h = Math.floor(m / 60), r = m % 60; return h >= 100 || !r ? `${Math.round(m / 60)}h` : `${h}h${String(r).padStart(2, '0')}`;
}
function fmtRel(ts) {
  if (!ts) return 'Jamais';
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const days = Math.floor((d0.getTime() / 1000 - ts) / DAY) + 1;
  if (ts >= d0.getTime() / 1000) return "Aujourd’hui";
  if (days <= 1) return 'Hier';
  if (days < 7) return `Il y a ${days} jours`;
  if (days < 31) return `Il y a ${Math.round(days / 7)} sem.`;
  if (days < 365) return `Il y a ${Math.round(days / 30)} mois`;
  return new Date(ts * 1000).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}
function fmtSize(bytes) {
  if (!bytes) return '—';
  const go = bytes / 1e9;
  return go >= 1 ? `${go.toFixed(1).replace('.', ',')} Go` : `${Math.round(bytes / 1e6)} Mo`;
}
const STORE_NAME = { steam: 'Steam', epic: 'Epic Games' };
const storeOf = (g) => STORE_NAME[g.store] || 'Steam';
// Pictos de plateforme, dessinés au trait comme le reste de l'interface
const PLAT_PATHS = {
  steam: '<circle cx="12" cy="12" r="9.5"/><circle cx="15.5" cy="9" r="3"/><circle cx="8.5" cy="15.5" r="2.2"/><path d="m10.4 14.2 2.9-3.1"/>',
  epic: '<path d="M5.5 3h13v14.2L12 21l-6.5-3.8Z"/><path d="M14.2 7.5H10v7h4.2M10 11h3.4"/>',
  gog: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="10.8" r="2.8"/><path d="M14.8 10.8v3.4a2.8 2.8 0 0 1-5 1.7"/>',
  ubisoft: '<circle cx="12" cy="12" r="9.5"/><path d="M17 12a5 5 0 1 1-5-5"/><circle cx="12" cy="12" r="1.4"/>',
  ea: '<circle cx="12" cy="12" r="9.5"/><path d="M10.6 9H7.4l-.9 6h3.6M7 12h2.8"/><path d="m11.8 15 2.6-6 2.6 6M12.8 13.2h3.2"/>',
  xbox: '<circle cx="12" cy="12" r="9.5"/><path d="M7 6.6c2.6 1.9 5 5.1 5 5.1s2.4-3.2 5-5.1M6.4 17.8c1.9-3.6 5.6-6.1 5.6-6.1s3.7 2.5 5.6 6.1"/>',
  battlenet: '<circle cx="12" cy="12" r="9.5"/><path d="M9.6 6.5V17"/><circle cx="12.4" cy="14.2" r="2.8"/>',
  riot: '<path d="M4 6.6 17.6 3.6 20 16.4l-5.4 1.5-1-3-2.4.5.4 3.4-4 1Z"/>',
  amazon: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M7 13.8c3 2 7 2 10 0M15.2 12.8l1.8.9-.5 1.9"/>',
  itch: '<path d="M4 9.5 5.5 5h13L20 9.5V11a2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0 2 2 0 0 1-4 0Z"/><path d="M5.2 12.6V19h13.6v-6.4M10 15.5h4"/>',
  custom: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><path d="M12 8.5v7M8.5 12h7"/>',
};
const platIcon = (store, size = 16) => `<svg class="plat-ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PLAT_PATHS[store] || PLAT_PATHS.steam}</svg>`;
const platBadge = (g) => `<span class="plat-badge" title="${esc(storeOf(g))}">${platIcon(g.store || 'steam', 14)}</span>`;
const achPct = (g) => (g.ach && g.ach.total ? g.ach.done / g.ach.total : -1);
const TROPHY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4M17 6h2.5a2.5 2.5 0 0 1-2.5 4M12 14v3.5M8.5 20h7"/></svg>';
const achBadge = (g) => (g.ach && g.ach.done ? `<span class="ach-badge ${g.ach.done === g.ach.total ? 'full' : ''}" title="${g.ach.done} succès sur ${g.ach.total}">${TROPHY}${g.ach.done * 100 < g.ach.total ? '< 1' : Math.floor((g.ach.done / g.ach.total) * 100)} %</span>` : '');
const isRunning = (g) => state.running.includes(g.key);
// Epic n'enregistre pas le temps de jeu : on ne compte que ce que le launcher a mesuré.
const playtimeLabel = (g) => (g.store === 'epic' && !g.playtime ? 'Pas encore suivi' : fmtPlaytime(g.playtime));
// Fond de secours quand une image manque : un seul neutre, jamais un dégradé de teintes.
function fallbackBg() { return 'var(--art-fallback-flat)'; }
// La veilleuse : ambre quand le jeu est prêt à lancer, avec un anneau quand il tourne.
const lamp = (g) => (isRunning(g) ? '<span class="lamp live" aria-hidden="true"></span>' : g.installed ? '<span class="lamp" aria-hidden="true"></span>' : '');
function caption(g) {
  if (isRunning(g)) return 'En cours';
  if (g.lastPlayed) return `${g.playtime ? fmtPlaytime(g.playtime) + " · " : ""}${fmtRel(g.lastPlayed)}`;
  if (g.managed) return storeOf(g);
  if (g.store !== "steam") return g.installed ? `${storeOf(g)} · prêt` : storeOf(g);
  return g.installed ? 'Prêt · jamais lancé' : 'Pas installé';
}

const MOODS = { chill: 'Chill', intense: 'Intense', histoire: 'Histoire', amis: 'Entre amis' };

const ICONS = {
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 4l14 8-14 8z"/></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
  star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-5-3.6-5 3.6 1.9-5.8L4 8.8h6.1z"/></svg>',
  grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  drive: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
  heart: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  heartFill: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  history: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/></svg>',
  moon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
  shuffle: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/></svg>',
  clock: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>',
  bag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>',
  ext: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
  list: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  update: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
};

// ---------- Données ----------
const games = () => (state.lib ? state.lib.games.filter((g) => !g.hidden && !(state.local.hidden || []).includes(g.key)) : []);
// Index par clé, refait seulement quand la bibliothèque change (byId est appelé dans des boucles :
// journal, activité, historique… une recherche linéaire à chaque fois coûtait cher).
let byIdIndex = { lib: null, map: null };
const byId = (id) => {
  if (!state.lib) return state.lib;
  if (byIdIndex.lib !== state.lib) byIdIndex = { lib: state.lib, map: new Map(state.lib.games.map((g) => [g.key, g])) };
  return byIdIndex.map.get(String(id));
};
function isFav(g) {
  if (state.local.favAdd.includes(g.key)) return true;
  if (state.local.favRemove.includes(g.key)) return false;
  return g.favorite;
}
const byRecent = (a, b) => b.lastPlayed - a.lastPlayed;

function saveLocal() { api.setLocal(state.local); }

// ---------- Fallback d'images (CSP : pas de onerror inline) ----------
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const next = img.dataset.alt;
  if (next) { img.dataset.alt = ''; img.src = next; return; }
  if (img.dataset.onfail === 'hide-show-title') {
    const t = img.parentElement.querySelector('.title-fallback');
    if (t) t.hidden = false;
    img.style.display = 'none';
  } else img.style.visibility = 'hidden'; // garde la place, le fond dégradé + titre reste visible
}, true);

// ---------- Composants ----------
function playButton(g, cls = 'btn btn-primary') {
  if (g.managed && !isRunning(g)) return `<button type="button" class="${cls}" data-act="play" data-id="${g.key}">${ICONS.play}Ouvrir dans ${storeOf(g)}</button>`;
  if (!g.installed && g.store === 'ubisoft') return `<button type="button" class="${cls.replace('btn-primary', 'btn-light')}" data-act="play" data-id="${g.key}">${ICONS.download}Ouvrir dans Ubisoft Connect</button>`;
  if (isRunning(g)) return `<button type="button" class="btn btn-running ${cls.includes('btn-big') ? 'btn-big' : ''}" data-act="details" data-id="${g.key}"><span class="lamp live" aria-hidden="true"></span>En cours</button>`;
  if (!g.installed) return `<button type="button" class="${cls.replace('btn-primary', 'btn-light')}" data-act="install" data-id="${g.key}">${ICONS.download}Installer</button>`;
  if (g.needsUpdate) return `<button type="button" class="${cls}" data-act="play" data-id="${g.key}">${ICONS.update}Mettre à jour</button>`;
  return `<button type="button" class="${cls}" data-act="play" data-id="${g.key}">${ICONS.play}Jouer</button>`;
}

function coverCard(g, sub) {
  const quick = g.installed
    ? `<span class="quick" data-act="play" data-id="${g.key}" role="button" tabindex="-1">${ICONS.play}Jouer</span>`
    : `<span class="quick install" data-act="install" data-id="${g.key}" role="button" tabindex="-1">${ICONS.download}Installer</span>`;
  return `<button type="button" data-part="game-card" class="card ${g.installed || g.managed ? "" : "dim"}" data-open="${g.key}" title="${esc(g.name)}">
    <div class="cover" data-part="cover" style="background:${fallbackBg(g)}">
      <span class="fallback">${esc(g.name)}</span>
      <img src="${esc(g.art.cover)}" alt="" loading="lazy">
      ${g.art.header ? `<img class="art-wide" src="${esc(g.art.header)}" alt="" loading="lazy">` : ''}
      <div class="shade"></div>
      ${platBadge(g)}
      ${achBadge(g)}
      ${typeof dlOf === 'function' && dlOf(g) ? `<div class="cover-dl" title="Téléchargement"><div style="width:${Math.round(dlOf(g).progress * 100)}%"></div></div>` : ''}
      ${isFav(g) ? `<span class="fav-mark" title="Favori">${ICONS.heartFill.replace(/16/g, '12')}</span>` : ''}
      ${quick}
    </div>
    <span class="t">${esc(g.name)}</span>
    <span class="s">${lamp(g)}<span>${esc(sub ?? caption(g))}</span></span>
  </button>`;
}

function emptyBox(title, text, btn) {
  return `<div class="empty"><strong>${esc(title)}</strong><span>${esc(text)}</span>${btn || ''}</div>`;
}

// ---------- Sidebar ----------
function renderSidebar() {
  const all = games();
  const r = state.route;
  const item = (view, icon, label, count, extra = '') => `<button type="button" class="nav-item ${r.view === view && !extra ? 'active' : ''}" data-nav="${view}" title="${esc(label)}">${icon}<span class="label">${esc(label)}</span>${count != null ? `<span class="count">${count}</span>` : ''}</button>`;
  $('#nav-main').innerHTML =
    item('home', ICONS.star, 'Pour toi') +
    item('all', ICONS.grid, 'Tous les jeux', all.length) +
    item('installed', ICONS.drive, 'Installés', all.filter((g) => g.installed).length) +
    item('favorites', ICONS.heart, 'Favoris', all.filter(isFav).length) +
    item('history', ICONS.history, 'Historique') +
    sidebarExtras(all);

  const cols = (state.lib && state.lib.collections) || [];
  const small = (view, id, label, n, ico) => `<button type="button" class="nav-item small ${r.view === view && r.id === id ? 'active' : ''}" data-nav="${view}" data-id="${esc(id)}" title="${esc(label)}">${ico || '<span class="dot"></span>'}<span class="label">${esc(label)}</span><span class="count">${n}</span></button>`;
  const stores = Object.keys(STORE_NAME).map((id) => [id, all.filter((g) => g.store === id).length]).filter(([, n]) => n);
  const parts = [sidebarProgress(all)];
  if (stores.length > 1) parts.push(`<p class="nav-title">Plateformes</p>${stores.map(([id, n]) => small('store', id, STORE_NAME[id], n, platIcon(id, 16))).join('')}`);
  if (cols.length) parts.push(`<p class="nav-title">Collections Steam</p>${cols.map((c) => small('collection', c.id, c.name, c.apps.length)).join('')}`);
  $('#nav-collections').innerHTML = parts.join('<div class="nav-gap"></div>');

  // Carte du bas : un chiffre, son libellé, et le dernier jeu lancé
  const twoWeeks = all.reduce((s, g) => s + (g.playtime2wks || 0), 0);
  const last = [...all].sort(byRecent)[0];
  const weekAgo = now() - 7 * DAY;
  const weekGames = all.filter((g) => g.lastPlayed >= weekAgo).length;
  $('#week-card').innerHTML = `
    <span class="k">${twoWeeks ? 'Temps de jeu sur 2 semaines' : 'Jeux lancés sur 7 jours'}</span>
    <span class="v">${twoWeeks ? fmtPlaytime(twoWeeks) : weekGames}</span>
    <span class="sub">${last && last.lastPlayed ? `Dernier lancé : ${esc(last.name)}` : 'Aucune session récente'}</span>`;
}

// ---------- Textes de la bannière « Pour toi » ----------
// Le moment de la journée remplace le « Ce soir » fixe : ce matin, ce midi, cet après-midi, ce soir, cette nuit
// (et « ce week-end » en journée le samedi et le dimanche).
function moment(d = new Date()) {
  const h = d.getHours(), wk = d.getDay() === 0 || d.getDay() === 6;
  if (h >= 5 && h < 11) return { label: wk ? 'Ce week-end' : 'Ce matin', when: 'ce matin', part: 'matin' };
  if (h >= 11 && h < 14) return { label: wk ? 'Ce week-end' : 'Ce midi', when: 'ce midi', part: 'midi' };
  if (h >= 14 && h < 18) return { label: wk ? 'Ce week-end' : 'Cet après-midi', when: 'cet après-midi', part: 'aprem' };
  if (h >= 18 && h < 23) return { label: 'Ce soir', when: 'ce soir', part: 'soir' };
  return { label: 'Cette nuit', when: 'cette nuit', part: 'nuit' };
}
// Choix stable : le même jeu garde sa phrase pendant la journée, mais elle change d'un jeu et d'un jour à l'autre.
function seedPick(list, seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return list[(h >>> 0) % list.length];
}
function spotlightText(g) {
  const m = moment();
  const day = new Date().toDateString();
  const pick = (list, salt) => seedPick(list, `${g.key}|${day}|${salt}`);
  const hours = (g.playtime || 0) / 60;
  const status = typeof statusOf === 'function' ? statusOf(g) : '';
  const daysAgo = g.lastPlayed ? (now() - g.lastPlayed) / DAY : Infinity;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const playedToday = g.lastPlayed >= today.getTime() / 1000;
  // Durée en toutes lettres, pour qu'elle se lise bien dans une phrase (« 3 semaines », « plus d'un an »)
  const d = Math.max(1, Math.round(daysAgo));
  const since = d < 7 ? `${d} jour${d > 1 ? 's' : ''}` : d < 11 ? 'une semaine' : d < 31 ? `${Math.round(d / 7)} semaines`
    : d < 45 ? 'un mois' : d < 365 ? `${Math.round(d / 30)} mois` : d < 730 ? 'plus d’un an' : `${Math.floor(d / 365)} ans`;
  const ach = g.ach && g.ach.total ? g.ach : null;
  const achPctV = ach ? Math.floor((ach.done / ach.total) * 100) : 0;
  // Tags Steam classés par votes : les premiers disent le vrai genre du jeu
  const tags = (g.tags || []).slice(0, 8).map((t) => (typeof tagName === 'function' ? tagName(t) : '').toLowerCase()).filter(Boolean);

  // 1. Où tu en es avec ce jeu
  const facts = [];
  if (!g.lastPlayed) {
    facts.push(...[
      'Installé, mais jamais lancé.',
      'Il attend son premier lancement.',
      'Toujours pas essayé : c’est le moment de le découvrir.',
      'Tu l’as installé, il n’attend plus que toi.',
    ]);
    if (g.reviewPct >= 90) facts.push(`${g.reviewPct} % d’avis positifs sur Steam : il a bonne réputation.`);
    else if (g.reviewPct >= 75) facts.push(`${g.reviewPct} % d’avis positifs sur Steam.`);
  } else {
    if (daysAgo < 2) {
      const w = playedToday ? 'aujourd’hui' : 'hier';
      facts.push(`Tu y as joué ${w}, l’élan est encore là.`, `Ta dernière partie date d’${w} : reprends où tu en étais.`);
    } else if (daysAgo < 14) facts.push(`Ta dernière session remonte à ${since}.`, `Pas lancé depuis ${since} : tu t’en souviens encore bien.`);
    else if (daysAgo < 120) facts.push(`Ça fait ${since} que tu n’y as pas touché.`, `Pas lancé depuis ${since}, il te manque peut-être.`);
    else facts.push(`Tu ne l’as pas lancé depuis ${since} : une bonne occasion de le redécouvrir.`, 'Un vieil ami de ta bibliothèque, laissé de côté depuis longtemps.');
    if (hours >= 100) facts.push(`${fmtPlaytime(g.playtime)} au compteur : c’est l’un de tes jeux de cœur.`, `Plus de ${Math.floor(hours)} heures passées dessus, tu connais la maison.`);
    else if (hours >= 20) facts.push(`${fmtPlaytime(g.playtime)} de jeu au compteur.`, `Déjà ${fmtPlaytime(g.playtime)} passées dessus.`);
    else if (hours >= 2) facts.push(`${fmtPlaytime(g.playtime)} de jeu : tu n’as fait qu’effleurer le jeu.`, `Seulement ${fmtPlaytime(g.playtime)} de jeu pour l’instant.`);
    else facts.push('À peine commencé, tout reste à découvrir.');
    if (g.playtime2wks >= 120) facts.push(`${fmtPlaytime(g.playtime2wks)} sur les deux dernières semaines : tu es dedans en ce moment.`);
    if (ach && ach.done === ach.total) facts.push(`Tous les succès débloqués (${ach.total}) : un 100 % dans les règles.`);
    else if (ach && achPctV >= 70) facts.push(`${achPctV} % des succès débloqués : le 100 % n’est plus très loin.`);
    else if (ach && ach.done > 0) facts.push(`${ach.done} succès sur ${ach.total} débloqués.`);
    if (status === 'playing') facts.push('Marqué « en cours » : la suite t’attend.');
    if (status === 'done') facts.push('Déjà terminé, mais on y revient toujours avec plaisir.');
  }
  if (isFav(g)) facts.push('Un de tes favoris, ça ne se refuse pas.');

  // 2. Une petite phrase selon le genre
  const GENRE_LINES = [
    [/roguelike|roguelite/, ['Une dernière run ? Ce n’est jamais la dernière.', 'Cette fois, c’est la bonne run.', 'Un nouveau build à tester, peut-être.']],
    [/souls/, ['Le boss ne va pas se battre tout seul.', 'Respire, apprends ses attaques, réessaie.']],
    [/difficile|impitoyable/, ['Respire, concentre-toi, réessaie.', 'Ce passage difficile va finir par céder.', 'Tu progresses à chaque essai, même raté.']],
    [/horreur/, ['Éteins la lumière, si tu oses.', 'Garde ton sang-froid.', 'Monte le son… ou pas.']],
    [/grande stratégie|stratégie complexe|4x|guerre/, ['Quelques tours, promis.', 'L’empire ne va pas se construire tout seul.', 'Le monde attend tes ordres.']],
    [/stratégie|tactique/, ['Prends le temps de bien réfléchir.', 'Quelques coups bien pensés, promis.', 'Un bon plan, et c’est parti.']],
    [/construction de villes|city builder/, ['Ta ville a sûrement un embouteillage à régler.', 'Un nouveau quartier à dessiner ?']],
    [/incrémental|idle/, ['Les chiffres ont grimpé pendant ton absence.', 'Va voir combien tu as accumulé.']],
    [/gestion|construction|automatisation|simulation/, ['Ta base a sûrement besoin d’une petite optimisation.', 'Encore une petite amélioration, et après on arrête.', 'Tout tourne mieux avec un peu d’organisation.']],
    [/survie|fabrication/, ['Prépare de quoi tenir.', 'Les ressources ne vont pas se ramasser seules.', 'Ton abri mérite une petite amélioration.']],
    [/rpg|jeu de rôle/, ['Une quête t’attend quelque part.', 'Ton personnage aimerait bien monter de niveau.', 'Il reste des PNJ à qui parler.']],
    [/monde ouvert|exploration|aventure/, ['Il reste des coins de la carte à explorer.', 'Pars à l’aventure, sans itinéraire.']],
    [/course|conduite/, ['Ton record ne va pas se battre tout seul.', 'Pied au plancher.', 'Un tour de chauffe ?']],
    [/sport|football/, ['Un petit match ?', 'L’équipe t’attend sur le terrain.']],
    [/cartes|deckbuilding|decks/, ['Le deck parfait est à une pioche près.', 'Une partie, juste une.']],
    [/casse-tête|puzzle|réflexion/, ['Une énigme pour garder l’esprit vif.', 'Le genre de jeu qui fait du bien au cerveau.']],
    [/coop|multijoueur|en ligne|jcj|mmo/, ['Parfait pour une partie entre amis.', 'Vois si l’équipe est en ligne.']],
    [/détente|relaxant|réconfortant|mignon|casual/, ['Idéal pour décompresser.', 'Pas de pression, juste un bon moment.']],
    [/fps|tir|shooter/, ['Échauffe ton viseur.', 'Quelques parties nerveuses ?']],
    [/plateforme/, ['Quelques sauts bien placés et ça repart.']],
    [/rythme|musique/, ['Monte le son et garde le rythme.']],
    [/bac à sable/, ['Laisse parler ta créativité.', 'Aucune règle, que des idées.']],
  ];
  let genre = null;
  for (const t of tags) { genre = GENRE_LINES.find(([re]) => re.test(t)); if (genre) break; }

  // 3. Une invitation selon le moment de la journée
  const nudges = {
    matin: ['Une petite partie avant de commencer la journée ?', 'Le café et une partie, ça se tente.', 'Bien réveillé ? Le jeu aussi.'],
    midi: ['Parfait pour une pause du midi.', 'Une partie rapide pendant la pause ?', 'Le temps d’une pause, c’est jouable.'],
    aprem: ['L’après-midi est à toi.', 'Une session tranquille cet après-midi ?', 'Le bon moment pour t’y remettre.'],
    soir: ['C’est peut-être le bon soir.', 'La soirée s’y prête bien.', 'Une partie pour finir la journée ?'],
    nuit: ['Une dernière avant de dormir ?', 'Les nuits sont faites pour ça, non ?', 'Encore éveillé ? Il l’est aussi.'],
  };
  const weekend = [0, 6].includes(new Date().getDay()) && m.part !== 'soir' && m.part !== 'nuit';
  const nudgeList = weekend ? ['C’est le week-end, prends ton temps.', 'Le week-end, c’est fait pour les longues sessions.'] : nudges[m.part];

  // Mise à jour ou jeu non installé : l'info utile passe avant le reste
  const ready = g.needsUpdate ? 'Une mise à jour l’attend avant de jouer.' : !g.installed ? 'Il faudra l’installer d’abord.' : '';
  const parts = [pick(facts, 'fact')];
  if (ready) parts.push(ready);
  else parts.push(genre && pick([0, 1], 'g') ? pick(genre[1], 'genre') : pick(nudgeList, 'nudge'));
  return { kicker: m.label, text: parts.join(' ') };
}

// ---------- Vues ----------
function viewHome() {
  const all = games();
  const installed = all.filter((g) => g.installed);
  const played = all.filter((g) => g.lastPlayed).sort(byRecent);

  // Spotlight : jeux installés récents + jeux installés jamais lancés
  if (!state.home.spotPool.length) {
    const recent = installed.filter((g) => g.lastPlayed).sort(byRecent).slice(0, 5);
    const fresh = installed.filter((g) => !g.lastPlayed);
    state.home.spotPool = [...recent, ...fresh].map((g) => g.key);
    if (!state.home.spotPool.length) state.home.spotPool = played.slice(0, 5).map((g) => g.key);
  }
  const spot = byId(state.home.spotPool[state.home.spotIndex % Math.max(1, state.home.spotPool.length)]);

  let spotHtml = '';
  if (spot) {
    const { kicker, text: reason } = spotlightText(spot);
    spotHtml = `
    <section aria-label="${esc(kicker)}" class="spotlight-frame" id="home-hero" data-hero-key="${spot.key}">
      <div class="spotlight" data-part="spotlight" style="background:${fallbackBg(spot)}">
        <img class="bg" src="${esc(spot.art.hero)}" alt="">
        <div class="shade"></div>
        <div class="body">
          <span class="kicker">${lamp(spot)}${esc(kicker)}</span>
          <img class="logo" src="${esc(spot.art.logo)}" alt="${esc(spot.name)}" data-onfail="hide-show-title">
          <h1 class="title-fallback" hidden>${esc(spot.name)}</h1>
          <p>${esc(reason)}</p>
          <div class="meta-row">
            ${spot.developer ? `<span>${esc(spot.developer)}</span>` : ''}
            ${spot.installed ? `<span class="num">${fmtSize(spot.sizeOnDisk)}</span>` : ''}
            ${spot.moods.length ? `<span>${spot.moods.map((m) => MOODS[m]).join(' · ')}</span>` : ''}
          </div>
          <div class="actions">
            ${playButton(spot)}
            <button type="button" class="btn btn-glass" data-open="${spot.key}">Voir la fiche</button>
          </div>
        </div>
      </div>
    </section>`;
  }

  // Envie
  const h = state.home;
  const pool = (h.scope === 'installed' ? installed : all).filter((g) => h.mood === 'all' || g.moods.includes(h.mood));
  const results = [...pool].sort((a, b) => (b.installed - a.installed) || byRecent(a, b) || b.reviewPct - a.reviewPct);
  const shown = results.slice(0, 12);
  const moodHtml = `
    <section class="stack" style="gap:20px">
      <div class="section-head">
        <div class="stack-6">
          <h2 class="section big">Tu as envie de quoi ?</h2>
          <p class="section-sub">Choisis une humeur, on pioche dans tes jeux selon leurs tags Steam</p>
        </div>
        <button type="button" class="btn btn-ghost" data-act="shuffle">${ICONS.shuffle}Surprends-moi</button>
      </div>
      <div class="filters">
        <div class="seg-chips" role="group" aria-label="Portée">
          <button type="button" class="${h.scope === 'installed' ? 'on' : ''}" data-scope="installed">Prêts à jouer</button>
          <button type="button" class="${h.scope === 'all' ? 'on' : ''}" data-scope="all">Toute la biblio</button>
        </div>
        <div class="chips" role="group" aria-label="Humeur">
          ${[['all', 'Tout'], ...Object.entries(MOODS)].map(([id, l]) => `<button type="button" class="chip ${h.mood === id ? 'on' : ''}" data-mood="${id}">${l}</button>`).join('')}
        </div>
        <span class="count">${results.length} jeu${results.length > 1 ? 'x' : ''}</span>
      </div>
      ${shown.length
        ? `<div class="grid">${shown.map((g) => coverCard(g)).join('')}</div>${results.length > shown.length ? `<div><button type="button" class="btn-ghost btn" data-nav="all" data-mood-filter="${h.mood}">Voir les ${results.length} jeux</button></div>` : ''}`
        : emptyBox('Rien ne colle exactement', 'Élargis à toute la bibliothèque ou change d’humeur',`<button type="button" class="btn btn-ghost" data-act="reset-mood">Tout afficher</button>`)}
    </section>`;

  // Reprendre
  const resume = played.slice(0, 6);
  const maxPt = Math.max(1, ...resume.map((g) => g.playtime));
  const resumeHtml = resume.length ? `
    <section class="stack">
      <div class="section-head"><h2 class="section">Reprendre là où tu t’es arrêté</h2><button type="button" class="link-btn" data-nav="history">Historique</button></div>
      <div class="resume">${resume.map((g) => `
        <div class="resume-card" data-part="resume-card" data-open="${g.key}" role="button" tabindex="0">
          <div class="thumb" style="background:${fallbackBg(g)}"><img src="${esc(g.art.cover)}" alt="" loading="lazy"></div>
          <div class="info">
            <span class="t">${esc(g.name)}</span>
            <span class="s">${isRunning(g) ? 'En cours' : esc(fmtRel(g.lastPlayed))}</span>
            <div class="meter" title="Temps de jeu comparé à tes autres jeux récents"><div style="width:${Math.max(4, (g.playtime / maxPt) * 100)}%"></div></div>
            <span class="s">${g.playtime ? `${esc(fmtPlaytime(g.playtime))} au total` : 'Temps non enregistré'}</span>
          </div>
          ${g.installed ? `<button type="button" class="play" data-act="play" data-id="${g.key}" aria-label="Jouer à ${esc(g.name)}">${ICONS.play}</button>` : `<button type="button" class="play" data-act="install" data-id="${g.key}" aria-label="Installer ${esc(g.name)}">${ICONS.download}</button>`}
        </div>`).join('')}
      </div>
    </section>` : '';

  // Jamais lancés
  const backlog = all.filter((g) => !g.lastPlayed && !g.playtime && !g.isDemo && g.store !== 'epic').sort((a, b) => (b.installed - a.installed) || b.reviewPct - a.reviewPct);
  const backlogHtml = backlog.length ? `
    <section class="stack">
      <div class="stack-6">
        <h2 class="section">Jamais lancés</h2>
        <p class="section-sub">${backlog.length} jeu${backlog.length > 1 ? 'x' : ''} qui t’attendent${backlog.filter((g) => g.reviewPct >= 85).length ? `, dont ${backlog.filter((g) => g.reviewPct >= 85).length} très bien notés` : ''}</p>
      </div>
      <div class="tiles">${backlog.slice(0, 6).map((g) => `
        <article class="tile" data-part="tile" data-open="${g.key}" style="background:${fallbackBg(g)}">
          <img src="${esc(g.art.header)}" alt="" loading="lazy">
          <div class="shade"></div>
          <div class="row">
            <div class="stack-6" style="gap:4px;min-width:0"><span class="t">${esc(g.name)}</span><span class="s">${g.installed ? `Installé · ${fmtSize(g.sizeOnDisk)}` : 'Pas installé'}${g.reviewPct ? ` · ${g.reviewPct} % positifs` : ''}</span></div>
            <button type="button" class="go" data-act="${g.installed ? 'play' : 'install'}" data-id="${g.key}">${g.installed ? 'Essayer' : 'Installer'}</button>
          </div>
        </article>`).join('')}
      </div>
    </section>` : '';

  return spotHtml + homeExtras('afterHero') + moodHtml + resumeHtml + homeExtras('afterResume') + backlogHtml;
}

const SORTS = {
  name: ['Nom', (a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })],
  recent: ['Dernière session', byRecent],
  playtime: ['Temps de jeu', (a, b) => b.playtime - a.playtime],
  size: ['Taille sur le disque', (a, b) => b.sizeOnDisk - a.sizeOnDisk],
  rating: ['Avis Steam', (a, b) => b.reviewPct - a.reviewPct],
  ach: ['Succès les plus avancés', (a, b) => achPct(b) - achPct(a) || (b.ach ? b.ach.done : 0) - (a.ach ? a.ach.done : 0)],
};

function viewList() {
  const r = state.route;
  let list = games();
  let title = 'Tous les jeux';
  let sub = '';
  let sort = state.local.sort;
  if (r.view === 'installed') { list = list.filter((g) => g.installed); title = 'Installés'; sub = `${fmtSize(list.reduce((s, g) => s + g.sizeOnDisk, 0))} sur le disque`; }
  if (r.view === 'favorites') { list = list.filter(isFav); title = 'Favoris'; sub = 'Synchronisés avec tes favoris Steam'; }
  if (r.view === 'history') { list = list.filter((g) => g.lastPlayed); title = 'Historique'; sort = 'recent'; }
  if (r.view === 'collection') {
    const c = state.lib.collections.find((x) => x.id === r.id);
    title = c ? c.name : 'Collection';
    list = c ? list.filter((g) => c.apps.includes(g.key)) : [];
    sub = 'Collection Steam';
  }
  if (r.view === 'store') {
    list = list.filter((g) => g.store === r.id);
    title = STORE_NAME[r.id];
    if (r.id !== 'steam') sub = 'Temps de jeu mesuré par le launcher';
  }
  if (r.view === 'search') { title = `Résultats pour « ${state.search} »`; list = typeof searchGames === 'function' ? searchGames(list, state.search) : list.filter((g) => g.name.toLowerCase().includes(state.search.toLowerCase())); }
  if (r.mood && r.mood !== 'all') { list = list.filter((g) => g.moods.includes(r.mood)); title += ` · ${MOODS[r.mood]}`; }
  if (r.view === 'mycoll' || r.view === 'hidden') ({ list, title, sub } = specialList(r, list, title, sub));
  const unfiltered = list.length;
  list = applyFilters(list);
  // Recherche : par pertinence tant que l'utilisateur n'a pas choisi un autre tri que le nom
  if (!(r.view === 'search' && sort === 'name')) list = [...list].sort(SORTS[sort][1]);

  const layout = state.local.layout;
  const toolbar = `
    <div class="toolbar">
      <div class="stack-6"><h1>${esc(title)}</h1><span class="sub">${list.length} jeu${list.length > 1 ? "x" : ""}${list.length !== unfiltered ? ` sur ${unfiltered}` : ""}${sub ? " · " + esc(sub) : ""}</span></div>
      <div class="actions" style="align-items:center">
        ${r.view !== 'history' ? `<label class="sr-only" for="sort">Trier par</label><select id="sort" class="select">${Object.entries(SORTS).map(([k, [l]]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>Trier : ${l}</option>`).join('')}</select>` : ''}
        <div class="seg-chips" role="group" aria-label="Affichage">
          <button type="button" class="${layout === 'grid' ? 'on' : ''}" data-layout="grid" aria-label="Grille">${ICONS.grid}</button>
          <button type="button" class="${layout === 'list' ? 'on' : ''}" data-layout="list" aria-label="Liste">${ICONS.list}</button>
        </div>
      </div>
    </div>
    ${filterBar(unfiltered)}`;

  const activity = r.view === 'history' ? activityHtml() : '';
  if (!list.length) {
    const msg = r.view === 'search' ? ['Aucun jeu trouvé', 'Vérifie l’orthographe ou cherche par studio'] : r.view === 'favorites' ? ['Pas encore de favoris', 'Ajoute un jeu depuis sa fiche avec le cœur, ou dans Steam'] : ['Rien ici pour l’instant', 'Resynchronise si tu viens d’installer quelque chose'];
    return toolbar + activity + emptyBox(msg[0], msg[1]);
  }
  if (layout === 'list') {
    return toolbar + activity + `<div class="list" role="list">
      <div class="row-item list-head" aria-hidden="true"><span></span><span>Jeu</span><span>Temps de jeu</span><span>Dernière session</span><span>Taille</span><span></span></div>
      ${list.map((g) => `<div class="row-item" role="listitem" data-open="${g.key}" tabindex="0">
        <img src="${esc(g.art.header)}" alt="" loading="lazy">
        <span class="t">${lamp(g) || '<span style="width:6px;flex:none"></span>'}<span class="plat-inline" title="${esc(storeOf(g))}">${platIcon(g.store || 'steam', 14)}</span><span>${esc(g.name)}${isRunning(g) ? ' · en cours' : ''}</span></span>
        <span class="m">${g.playtime ? fmtPlaytime(g.playtime) : '—'}</span>
        <span class="m">${g.lastPlayed ? fmtRel(g.lastPlayed) : '—'}</span>
        <span class="m">${g.installed ? fmtSize(g.sizeOnDisk) : 'Non installé'}</span>
        <span>${g.installed ? `<button type="button" class="btn btn-ghost" data-act="play" data-id="${g.key}">Jouer</button>` : `<button type="button" class="btn btn-ghost" data-act="install" data-id="${g.key}">Installer</button>`}</span>
      </div>`).join('')}</div>`;
  }
  return toolbar + activity + `<div class="grid">${list.map((g) => coverCard(g, sort === 'size' && g.installed ? fmtSize(g.sizeOnDisk) : undefined)).join('')}</div>`;
}

function viewGame() {
  const g = byId(state.route.id);
  if (!g) return emptyBox('Jeu introuvable', 'Il a peut-être été retiré de ta bibliothèque');
  const year = g.releaseDate ? new Date(g.releaseDate * 1000).getFullYear() : '';
  const kicker = [g.developer, year].filter(Boolean).join(' · ');
  const controller = { full: 'Prise en charge complète', partial: 'Prise en charge partielle' }[g.controller] || 'Non indiquée';
  const fav = isFav(g);
  return `
    <section class="game-hero" data-part="game-hero" id="game-hero" data-hero-key="${g.key}" style="background:${fallbackBg(g)}">
      <img class="bg" src="${esc(g.art.hero)}" alt="" data-alt="${esc(g.art.header)}">
      <div class="shade"></div>
      <div class="inner">
        <div class="title">
          <button type="button" class="back" data-act="back">${ICONS.back}Retour</button>
          ${kicker || g.installed ? `<span class="kicker">${lamp(g)}${esc(kicker || storeOf(g))}</span>` : ''}
          <img class="logo" src="${esc(g.art.logo)}" alt="${esc(g.name)}" data-onfail="hide-show-title">
          <h1 class="title-fallback" hidden>${esc(g.name)}</h1>
        </div>
        <div class="actions">
          ${playButton(g, 'btn btn-primary btn-big')}
          <button type="button" class="btn btn-glass btn-sq btn-big" data-act="fav" data-id="${g.key}" aria-label="${fav ? 'Retirer des favoris' : 'Ajouter aux favoris'}" aria-pressed="${fav}">${fav ? ICONS.heartFill : ICONS.heart}</button>
          <button type="button" class="btn btn-glass btn-sq btn-big" data-act="details" data-id="${g.key}" aria-label="Ouvrir dans ${storeOf(g)}">${ICONS.ext}</button>
        </div>
      </div>
    </section>

    ${gameStats(g)}

    ${gameTabs(g)}
    ${state.route.tab && state.route.tab !== 'overview' ? `<div class="tab-body">${gameTabContent(g)}</div>` : ''}
    <div class="cols" ${state.route.tab && state.route.tab !== 'overview' ? 'hidden' : ''}>
      <div class="col-main">
        ${richOverview(g)}
        <section class="panel">
          <h2>Actions rapides</h2>
          <div class="action-grid">
            ${g.installed ? `<button type="button" class="action" data-act="folder" data-id="${g.key}"><span class="ic">${ICONS.folder}</span><span>Ouvrir le dossier<small>Fichiers du jeu</small></span></button>` : ''}
            <button type="button" class="action" data-act="store" data-id="${g.key}"><span class="ic">${ICONS.bag}</span><span>Page du magasin<small>DLC, avis, actus</small></span></button>
            <button type="button" class="action" data-act="details" data-id="${g.key}"><span class="ic">${ICONS.ext}</span><span>${g.store === 'steam' ? 'Fiche dans Steam<small>Succès, propriétés</small>' : g.store === 'custom' ? 'Fiche du jeu<small>Ajouté à la main</small>' : `${esc(storeOf(g))}<small>Options, vérification</small>`}</span></button>
            ${g.store === 'custom'
              ? `<button type="button" class="action danger" data-act="remove-custom" data-id="${g.key}"><span class="ic">${ICONS.trash}</span><span>Retirer du launcher<small>Le jeu reste sur ton disque</small></span></button>`
              : !(g.installed
                ? (api.platform === 'darwin' ? g.store === 'steam' : ['steam', 'epic', 'gog'].includes(g.store))
                : ['steam', 'epic', 'gog', 'amazon'].includes(g.store)) ? ''
              : g.installed
              ? `<button type="button" class="action danger" data-act="uninstall" data-id="${g.key}"><span class="ic">${ICONS.trash}</span><span>Désinstaller<small>${g.store === 'gog' ? 'Sans GOG Galaxy' : g.store === 'epic' ? (g.viaLegendary ? 'Sans le Epic Games Launcher' : 'Depuis la bibliothèque Epic') : 'Steam te demandera confirmation'}</small></span></button>`
              : `<button type="button" class="action" data-act="install" data-id="${g.key}"><span class="ic">${ICONS.download}</span><span>Installer<small>Via ${storeOf(g)}</small></span></button>`}
          </div>
        </section>
        ${g.moods.length ? `<section class="panel"><h2>Ambiance</h2><div class="mood-tags">${g.moods.map((m) => `<span class="mood-tag">${MOODS[m]}</span>`).join('')}</div></section>` : ''}
      </div>
      <aside class="col-side">
        ${progressPanel(g)}
        ${howLongPanel(g)}
        ${gamePanels(g)}
        <section class="panel">
          <h2>Informations</h2>
          ${[['Développeur', g.developer || '—'], ['Éditeur', g.publisher || '—'], ['Sortie', g.releaseDate ? new Date(g.releaseDate * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'], ['Manette', controller], ['Emplacement', g.installed ? g.library : 'Non installé'], ['Plateforme', storeOf(g)], ...(g.store === 'steam' ? [['AppID', g.appid]] : g.store === 'epic' ? [['AppName', g.appName]] : g.exe ? [['Programme', g.exe]] : [])]
            .map(([k, v], i) => `${i ? '<div class="sep"></div>' : ''}<div class="kv"><span>${k}</span><span title="${esc(v)}">${esc(v)}</span></div>`).join('')}
        </section>
      </aside>
    </div>`;
}

function viewLoading() {
  return `<div class="skeleton" style="height:440px;border-radius:16px"></div>
    <div class="grid">${'<div class="skeleton" style="aspect-ratio:2/3"></div>'.repeat(6)}</div>`;
}

function viewError(msg) {
  return emptyBox('Impossible de lire ta bibliothèque Steam', msg, `<button type="button" class="btn btn-ghost" data-act="sync">Réessayer</button>`);
}

// ---------- Rendu ----------
function updateToolbar() {
  const bar = $('.topbar');
  const hero = $('#game-hero') || $('#home-hero');
  const y = $('#content').scrollTop;
  const limit = hero ? hero.offsetHeight - bar.offsetHeight * 2 : 0;
  bar.classList.toggle('material', y > Math.max(0, limit));
}
$('#content').addEventListener('scroll', updateToolbar, { passive: true });

// Retrouve l'élément qui avait le focus après un redessin (utile à la manette)
function focusKey(el) {
  if (!el || el === document.body) return null;
  for (const a of ['data-note', 'data-open', 'data-act', 'data-nav', 'data-tab', 'data-status', 'data-mood', 'data-scope']) {
    if (el.hasAttribute(a)) return `[${a}="${CSS.escape(el.getAttribute(a))}"]${el.dataset.id ? `[data-id="${CSS.escape(el.dataset.id)}"]` : ''}`;
  }
  return el.id ? '#' + CSS.escape(el.id) : null;
}

function render(opts = {}) {
  const v = state.route.view;
  const el = $('#view');
  if (!state.lib) { el.innerHTML = state.error ? viewError(state.error) : viewLoading(); return; }
  const active = document.activeElement;
  const focused = focusKey(active);
  // Champ de saisie en cours (note perso…) : on garde le focus et la position du curseur.
  const typing = active && el.contains(active) && /^(TEXTAREA|INPUT)$/.test(active.tagName) && typeof active.selectionStart === 'number'
    ? { start: active.selectionStart, end: active.selectionEnd, scroll: active.scrollTop } : null;
  document.body.dataset.view = v;
  renderSidebar();
  el.innerHTML = VIEWS[v] ? VIEWS[v]() : v === 'home' ? viewHome() : v === 'game' ? viewGame() : viewList();
  if (!opts.quiet && !typing) { el.classList.remove('view-enter'); void el.offsetWidth; el.classList.add('view-enter'); }
  if (focused && (opts.quiet || typing)) {
    const f = document.querySelector(focused);
    if (f) {
      f.focus({ preventScroll: true });
      if (typing && typeof f.setSelectionRange === 'function') { try { f.setSelectionRange(typing.start, typing.end); f.scrollTop = typing.scroll; } catch { /* type sans curseur */ } }
    }
  }
  document.querySelectorAll('.segmented [data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === v || (b.dataset.nav === 'home' && !['wishlist', 'friends'].includes(v))));
  // L'art du jeu passe sous la barre d'outils, qui devient translucide une fois l'art dépassé
  const hero = $('#game-hero') || $('#home-hero');
  $('.topbar').classList.toggle('over-hero', !!hero);
  if (hero) hero.style.marginTop = `-${$('.topbar').offsetHeight + 4}px`;
  updateToolbar();
  const initials = (state.lib.user.name || '?').split(/\s+/).map((s) => s[0]).join('').slice(0, 2).toUpperCase();
  $('#profile-btn').textContent = initials;
}

function go(route, push = true) {
  // On retient où on en était dans la page qu'on quitte, pour y revenir au même endroit
  if (push) state.history.push({ ...state.route, scroll: $('#content').scrollTop });
  state.route = route;
  $('#content').scrollTo({ top: 0 });
  render();
}

function back() {
  const prev = state.history.pop() || { view: 'home' };
  const y = prev.scroll || 0;
  delete prev.scroll;
  go(prev, false);
  // La page peut s'allonger en chargeant : on recale plusieurs fois
  const c = $('#content');
  [0, 120, 400, 900].forEach((ms) => setTimeout(() => { if (c.scrollTop < y - 4) c.scrollTo({ top: y }); }, ms));
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Une synchro demandée pendant qu'une autre tourne renvoie la même promesse (l'appelant attend
// vraiment la nouvelle bibliothèque), puis une synchro discrète est relancée à la fin pour ne rien rater.
let syncRun = null, syncAgain = false;
function sync(silent) {
  if (syncRun) { syncAgain = true; return syncRun; }
  syncRun = syncOnce(silent).finally(() => {
    syncRun = null;
    if (syncAgain) { syncAgain = false; return sync(true); }
    return undefined;
  });
  return syncRun;
}

async function syncOnce(silent) {
  state.syncing = true;
  $('#sync-btn').classList.add('spinning');
  try {
    state.lib = await api.library(!silent); // bouton « Synchroniser » : liste Steam redemandée, sans cache
    // Les libellés de statut sont les noms de tes collections Steam (▶️ PLAYING, ✅ DONE…).
    if (state.lib.statusLabels) Object.assign(STATUSES, state.lib.statusLabels);
    state.error = null;
    state.running = state.lib.running || [];
    state.home.spotPool = [];
    // Données dérivées à recharger
    for (const k of ['disks', 'sessions', 'shotsAll']) delete state.cache[k];
    if (!silent) {
      const n = (state.lib.platforms || []).filter((p) => p.count).map((p) => STORE_NAME[p.id]);
      toast(`${state.lib.games.length} jeux synchronisés · ${n.join(', ')}`);
    }
    if (state.lib.apiError && !silent) toast(`Synchro locale OK — Web API : ${state.lib.apiError}`);
  } catch (e) {
    state.error = e.message || String(e);
  } finally {
    state.syncing = false;
    $('#sync-btn').classList.remove('spinning');
    renderSoon({ quiet: !!silent }); // synchro discrète : pas d'animation d'entrée
  }
}

// Fenêtre cachée (barre des tâches, réduite) : inutile de reconstruire toute la page à chaque changement
// de Steam ou de jeu lancé. On note qu'il y a du nouveau et on redessine une seule fois au retour.
let renderPending = false;
function renderSoon(opts) {
  if (document.hidden && state.lib) { renderPending = true; return; }
  render(opts);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !renderPending) return;
  renderPending = false;
  render({ quiet: true });
});

// ---------- Réglages ----------
async function openSettings() {
  const prefs = await api.getPrefs();
  const lib = state.lib;
  const dlg = $('#settings');
  dlg.innerHTML = `<form method="dialog" class="m-body" id="settings-form">
    <h2>Compte et synchronisation</h2>
    <p>Le launcher lit ta bibliothèque directement dans les fichiers de Steam : jeux installés, temps de jeu, dernières sessions, favoris et collections. Il se met à jour tout seul quand Steam change quelque chose.</p>
    ${lib ? `<label class="field">Compte Steam
      <select name="steamId">${lib.users.map((u) => `<option value="${u.id64}" ${u.id64 === lib.user.id64 ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select>
    </label>` : ''}
    <label class="field">Clé Steam Web API (optionnelle)
      <input name="apiKey" type="password" placeholder="${prefs.hasApiKey ? esc(prefs.apiKey) + ' (enregistrée)' : 'Colle ta clé ici'}" autocomplete="off">
      <small>Sans clé, tu vois les jeux installés et ceux déjà lancés sur ce PC. Avec une clé, tu vois <strong>tous</strong> les jeux que tu possèdes, même jamais lancés. Elle se crée sur <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer">steamcommunity.com/dev/apikey</a> et reste sur ton PC.</small>
    </label>
    ${prefs.hasApiKey ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" name="clearKey"> Supprimer la clé enregistrée</label>` : ''}
    ${lib && lib.apiError ? `<div class="note err">Web API : ${esc(lib.apiError)}</div>` : ''}
    ${settingsSystem(prefs)}
    ${lib ? `<div class="note">Steam : ${esc(lib.steamPath)}<br>Dernière synchro : ${new Date(lib.syncedAt).toLocaleTimeString('fr-FR')}</div>` : ''}
    <div class="m-actions">
      <button type="button" class="btn btn-ghost" value="cancel" data-close>Annuler</button>
      <button type="submit" class="btn btn-light" style="height:40px;border-radius:10px;font-size:13px" value="save">Enregistrer et resynchroniser</button>
    </div>
  </form>`;
  dlg.showModal();
  $('[data-close]', dlg).onclick = () => dlg.close();
  $('#settings-form').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const patch = {};
    if (f.get('steamId')) patch.steamId = f.get('steamId');
    if (f.get('apiKey')) patch.apiKey = String(f.get('apiKey')).trim();
    if (f.get('clearKey')) patch.apiKey = null;
    patch.system = { closeToTray: !!f.get('closeToTray'), shortcut: !!f.get('shortcut'), autostart: !!f.get('autostart') };
    patch.settings = readExtraSettings(f);
    await api.setPrefs(patch);
    for (const k of ['friends', 'wishlist']) delete state.cache[k];
    state.cache.ach = {};
    dlg.close();
    sync();
  };
}

// ---------- Actions ----------
async function doAction(act, id, el) {
  const g = id ? byId(id) : null;
  switch (act) {
    case 'play':
      api.play(id);
      toast(g && g.needsUpdate ? `Mise à jour de ${g.name} via ${storeOf(g)}…` : `Lancement de ${g ? g.name : 'du jeu'}…`);
      break;
    case 'install': api.install(id); toast(`Installation de ${g ? g.name : 'du jeu'} demandée à ${g ? storeOf(g) : 'Steam'}`); break;
    case 'uninstall': api.uninstall(id); break;
    case 'store': api.store(id); break;
    case 'details': api.details(id); break;
    case 'folder': if (g && g.installDir) api.openFolder(g.key); break;
    case 'fav': {
      const fav = isFav(g);
      state.local.favAdd = state.local.favAdd.filter((x) => x !== g.key);
      state.local.favRemove = state.local.favRemove.filter((x) => x !== g.key);
      if (fav && g.favorite) state.local.favRemove.push(g.key);
      if (!fav && !g.favorite) state.local.favAdd.push(g.key);
      saveLocal();
      toast(fav ? 'Retiré des favoris du launcher' : 'Ajouté aux favoris du launcher');
      render();
      break;
    }
    case 'shuffle': {
      const pool = games().filter((g2) => g2.installed);
      if (pool.length > 1) {
        const cur = state.home.spotPool[state.home.spotIndex % state.home.spotPool.length];
        let pick; do { pick = pool[Math.floor(Math.random() * pool.length)].key; } while (pick === cur);
        state.home.spotPool.splice(state.home.spotIndex + 1, 0, pick);
        state.home.spotIndex++;
      }
      render();
      break;
    }
    case 'reset-mood': state.home.mood = 'all'; state.home.scope = 'all'; render(); break;
    case 'back': back(); break;
    case 'sync': sync(); break;
    case 'settings': openSettings(); break;
    case 'add-game': openAddGame(); break;
    case 'couch': setCouch(!state.couch); break;
    case 'open-friends': api.openFriends(); break;
    case 'store-home': api.openStoreHome(); break;
    case 'remove-custom':
      await api.removeCustom(id);
      toast(`${g ? g.name : 'Le jeu'} a été retiré du launcher`);
      await sync(true);
      go({ view: 'all' }, false);
      break;
  }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act],[data-open],[data-nav],[data-mood],[data-scope],[data-layout],[data-action]');
  if (!t) return;
  if (t.dataset.act) { e.stopPropagation(); doAction(t.dataset.act, t.dataset.id || null, t); return; }
  if (t.dataset.open) { go({ view: 'game', id: t.dataset.open }); return; }
  if (t.dataset.nav) {
    state.search = ''; $('#search').value = '';
    // Données vivantes : on recharge en entrant dans la vue
    if (t.dataset.nav === 'friends') delete state.cache.friends;
    if (['storage', 'screenshots', 'history'].includes(t.dataset.nav)) for (const k of ['disks', 'shotsAll', 'sessions']) delete state.cache[k];
    go({ view: t.dataset.nav, id: t.dataset.id, mood: t.dataset.moodFilter });
    return;
  }
  if (t.dataset.mood) { state.home.mood = t.dataset.mood; render(); return; }
  if (t.dataset.scope) { state.home.scope = t.dataset.scope; render(); return; }
  if (t.dataset.layout) { state.local.layout = t.dataset.layout; saveLocal(); render(); return; }
  if (t.dataset.action === 'store-home') api.openStoreHome();
  if (t.dataset.action === 'friends') api.openFriends();
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'sort') { state.local.sort = e.target.value; saveLocal(); render(); }
});

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); $('#search').select(); return; }
  if (e.key === 'Escape' && !$('#settings').open) {
    if (document.activeElement === $('#search') && $('#search').value) { $('#search').value = ''; $('#search').dispatchEvent(new Event('input')); return; }
    if (state.route.view === 'game') back();
  }
  if (e.key === 'Enter' && e.target.matches('[data-open][role]')) go({ view: 'game', id: e.target.dataset.open });
});
document.addEventListener('mouseup', (e) => { if (e.button === 3) back(); });

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = e.target.value.trim();
    if (state.search) {
      if (state.route.view === 'search') { render(); return; }
      go({ view: 'search' });
    } else if (state.route.view === 'search') back();
  }, 120);
});
$('#search').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !state.search) return;
  const q = state.search.toLowerCase();
  const hit = games().find((g) => g.name.toLowerCase().includes(q));
  if (hit) go({ view: 'game', id: hit.key });
});

$('#sync-btn').addEventListener('click', () => sync());
$('#profile-btn').addEventListener('click', openSettings);

api.onLibraryChanged(() => sync(true));
api.onRunningChanged((keys) => {
  const before = state.running;
  state.running = keys || [];
  // Premier relevé après l'ouverture : les jeux déjà lancés ne méritent pas de notification
  const started = state.seenRunning ? state.running.filter((k) => !before.includes(k)) : [];
  state.seenRunning = true;
  const stopped = before.filter((k) => !state.running.includes(k));
  for (const k of started) { const g = byId(k); if (g) toast(`${g.name} est lancé`); }
  if (stopped.length) delete state.cache.sessions; // une session vient de se terminer
  if (stopped.some((k) => !k.includes(':'))) sync(true); // partie Steam finie : nouveau temps de jeu
  else renderSoon({ quiet: true });
});

// ---------- Démarrage ----------
(async () => {
  render();
  try { state.local = { ...state.local, ...(await api.getLocal()) }; } catch { /* rien */ }
  // Anciennes versions : favoris stockés en nombres
  state.local.favAdd = (state.local.favAdd || []).map(String);
  state.local.favRemove = (state.local.favRemove || []).map(String);
  state.local.notes = state.local.notes || {};
  sync(true);
})();
