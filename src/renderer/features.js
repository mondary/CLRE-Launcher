'use strict';
/* Fonctions en plus de la bibliothèque : activité, téléchargements, captures, actus, succès, amis,
   liste de souhaits, stockage, progression, jeux ajoutés à la main et mode canapé.
   Chargé après app.js, dont il réutilise l'état et les utilitaires. */

Object.assign(STORE_NAME, { gog: 'GOG', ubisoft: 'Ubisoft Connect', ea: 'EA app', xbox: 'Xbox', battlenet: 'Battle.net', riot: 'Riot', amazon: 'Amazon Games', itch: 'itch.io', custom: 'Ajouté à la main' });
Object.assign(ICONS, {
  activity: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>',
  image: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
  disk: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  pad: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.5a2.6 2.6 0 0 0 4.7 1.8L8.5 15h7l1.8 1.9a2.6 2.6 0 0 0 4.7-1.8l-.7-6.5a4 4 0 0 0-4-3.6Z"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
});

const STATUSES = { todo: 'À faire', playing: 'En cours', done: 'Terminé', dropped: 'Abandonné' };
state.cache = { news: {}, ach: {}, shots: {} };
state.downloads = [];
state.local.notes = state.local.notes || {};

const statusOf = (g) => g.status || '';
// Les mises à jour seulement prévues par Steam ne s'affichent pas sur les jaquettes
const dlOf = (g) => state.downloads.find((d) => d.key === g.key && d.phase !== 'scheduled');
const fmtDate = (ts) => new Date(ts * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const fmtDur = (sec) => { const m = Math.round(sec / 60); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return h >= 100 || !r ? `${Math.round(m / 60)}h` : `${h}h${String(r).padStart(2, '0')}`; };
const needKey = (what) => emptyBox(`${what} demande ta clé Steam Web API`, 'Ajoute-la dans Compte et réglages, elle est gratuite et reste sur ton PC', `<button type="button" class="btn btn-ghost" data-act="settings">Ouvrir les réglages</button>`);

// Charge une donnée asynchrone une seule fois, puis redessine sans animation.
function load(slot, id, fn) {
  const box = id == null ? state.cache : state.cache[slot];
  const k = id == null ? slot : id;
  if (box[k] !== undefined) return box[k];
  box[k] = 'loading';
  Promise.resolve().then(fn).then((v) => { box[k] = v; }, (e) => { box[k] = { error: e.message || String(e) }; }).then(() => render({ quiet: true }));
  return 'loading';
}
const loading = () => '<div class="skeleton" style="height:120px"></div>';

// ---------- Barre latérale : entrées en plus ----------
function sidebarExtras(all) {
  const r = state.route;
  const item = (view, icon, label, count) => `<button type="button" class="nav-item ${r.view === view ? 'active' : ''}" data-nav="${view}" title="${esc(label)}">${icon}<span class="label">${esc(label)}</span>${count ? `<span class="count">${count}</span>` : ''}</button>`;
  return (state.downloads.length ? item('downloads', ICONS.download, 'Téléchargements', dlCount() || '') : '') +
    item('screenshots', ICONS.image, 'Captures') +
    item('storage', ICONS.disk, 'Stockage');
}
function sidebarProgress(all) {
  const r = state.route;
  const counts = Object.fromEntries(Object.keys(STATUSES).map((s) => [s, all.filter((g) => statusOf(g) === s).length]));
  return `<p class="nav-title">Statut</p>` + Object.entries(STATUSES).map(([id, label]) =>
    `<button type="button" class="nav-item small ${r.view === 'status' && r.id === id ? 'active' : ''}" data-nav="status" data-id="${id}"><span class="dot status-${id}"></span><span class="label">${label}</span><span class="count">${counts[id] || ''}</span></button>`).join('');
}

// ---------- Accueil : étagères en plus ----------
function homeExtras(where) {
  const all = games();
  if (where === 'afterHero') {
    let html = '';
    html += downloadsShelf();
    const playing = all.filter((g) => statusOf(g) === 'playing').sort(byRecent);
    if (playing.length) {
      html += `<section class="stack">
        <div class="section-head"><h2 class="section">Termine ce que tu as commencé</h2><button type="button" class="link-btn" data-nav="status" data-id="playing">Tout voir</button></div>
        <div class="resume">${playing.slice(0, 6).map(resumeCard).join('')}</div></section>`;
    }
    return html;
  }
  if (where === 'afterResume') {
    let html = '';
    const news = load('newsHome', null, () => api.newsHome());
    if (Array.isArray(news) && news.length) {
      html += `<section class="stack">
        <div class="section-head"><h2 class="section">Quoi de neuf dans tes jeux</h2></div>
        <div class="news-grid">${news.map((n) => newsCard(n, true)).join('')}</div></section>`;
    }
    const wish = load('wishlist', null, () => api.wishlist());
    const promos = wish && wish.list ? wish.list.filter((w) => w.discount > 0) : [];
    if (promos.length) {
      html += `<section class="stack">
        <div class="section-head"><h2 class="section">En promo dans ta liste de souhaits</h2><button type="button" class="link-btn" data-nav="wishlist">Tout voir</button></div>
        <div class="tiles">${promos.slice(0, 3).map(wishTile).join('')}</div></section>`;
    }
    return html;
  }
  return '';
}

function resumeCard(g) {
  return `<div class="resume-card" data-part="resume-card" data-open="${g.key}" role="button" tabindex="0">
    <div class="thumb" style="background:${fallbackBg(g)}"><img src="${esc(g.art.cover)}" alt="" loading="lazy"></div>
    <div class="info"><span class="t">${esc(g.name)}</span><span class="s">${g.lastPlayed ? esc(fmtRel(g.lastPlayed)) : 'Pas encore lancé'}</span>
    <span class="s">${g.playtime ? esc(fmtPlaytime(g.playtime)) + ' au total' : esc(storeOf(g))}</span></div>
    ${g.installed || g.managed ? `<button type="button" class="play" data-act="play" data-id="${g.key}" aria-label="Jouer à ${esc(g.name)}">${ICONS.play}</button>` : `<button type="button" class="play" data-act="install" data-id="${g.key}" aria-label="Installer ${esc(g.name)}">${ICONS.download}</button>`}
  </div>`;
}

// ---------- Téléchargements : voir downloads.js ----------

// ---------- Activité (Historique) ----------
function activityHtml() {
  const sessions = load('sessions', null, () => api.sessions());
  if (sessions === 'loading') return loading();
  if (!Array.isArray(sessions) || !sessions.length) {
    return `<section class="panel activity-empty"><h2>Activité</h2><p class="section-sub">Tes sessions s’enregistrent à partir de maintenant, sur toutes les plateformes. Reviens après une partie pour voir ta semaine</p></section>`;
  }
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const today = d0.getTime() / 1000;
  const days = Array.from({ length: 30 }, (_, i) => today - (29 - i) * DAY);
  const perDay = days.map((start) => sessions.reduce((s, x) => s + Math.max(0, Math.min(x.end, start + DAY) - Math.max(x.start, start)), 0));
  // 12 semaines glissantes (la dernière se termine aujourd'hui) : un mois de jours presque vides racontait peu
  const weekStart = (i) => today - ((11 - i) * 7 + 6) * DAY;
  const perWeek = Array.from({ length: 12 }, (_, i) => sessions.reduce((s, x) => s + Math.max(0, Math.min(x.end, weekStart(i) + 7 * DAY) - Math.max(x.start, weekStart(i))), 0));
  const maxW = Math.max(3600, ...perWeek);
  const sum = (from, to) => sessions.reduce((s, x) => s + Math.max(0, Math.min(x.end, to) - Math.max(x.start, from)), 0);
  const week = sum(today - 6 * DAY, today + DAY);
  const prev = sum(today - 13 * DAY, today - 6 * DAY);
  let streak = 0;
  for (let i = perDay.length - 1; i >= 0; i--) { if (perDay[i] > 0) streak++; else if (i === perDay.length - 1) continue; else break; }
  const diffH = Math.round((week - prev) / 360) / 10;
  const month = {};
  for (const x of sessions) if (x.end >= today - 29 * DAY) month[x.key] = (month[x.key] || 0) + (x.end - x.start);
  const top = Object.entries(month).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = top.length ? top[0][1] : 1;
  return `<section class="activity">
    <div class="activity-stats">
      <div><span class="k">7 derniers jours</span><span class="v">${fmtDur(week)}</span><span class="s">${prev ? `${diffH >= 0 ? '+' : '−'}${fmtDur(Math.abs(diffH) * 3600)} vs la semaine d’avant` : 'Première semaine suivie'}</span></div>
      <div><span class="k">Série en cours</span><span class="v">${streak} jour${streak > 1 ? 's' : ''}</span><span class="s">Jours d’affilée avec au moins une session</span></div>
      <div><span class="k">Sessions sur 30 jours</span><span class="v">${sessions.filter((x) => x.end >= today - 29 * DAY).length}</span><span class="s">Toutes plateformes</span></div>
    </div>
    <div class="activity-body">
      <div class="chart" role="img" aria-label="Temps de jeu par semaine sur 12 semaines">
        <div class="chart-head"><span class="k">Par semaine</span><span class="m">${fmtDur(perWeek.reduce((x, y) => x + y, 0))} sur 12 semaines</span></div>
        <div class="bars30 weeks">${perWeek.map((s, i) => `<span class="${i === 11 ? 'today' : ''}" style="height:${s ? Math.max(3, (s / maxW) * 100) : 0}%" title="Semaine du ${fmtDate(weekStart(i))} · ${s ? fmtDur(s) : 'aucune session'}"><i>${s ? fmtDur(s) : ''}</i></span>`).join('')}</div>
        <div class="axis"><span>${fmtDate(weekStart(0))}</span><span>${fmtDate(weekStart(6))}</span><span>Cette semaine</span></div>
      </div>
      <div class="ranked"><h3>Ce mois-ci</h3>${top.map(([k, s]) => { const g = byId(k); return `<button type="button" class="ranked-row" data-open="${esc(k)}"><span class="t">${esc(g ? g.name : k)}</span><span class="m">${fmtDur(s)}</span><span class="bar"><span style="width:${(s / topMax) * 100}%"></span></span></button>`; }).join('')}</div>
    </div>
  </section>`;
}

// ---------- Captures ----------
function shotsGrid(shots, limit) {
  return `<div class="shots">${shots.slice(0, limit || 999).map((s) => `<button type="button" class="shot" data-shot="${esc(s.file)}" title="${fmtDate(s.time)}"><img src="${esc(s.thumb)}" alt="Capture du ${fmtDate(s.time)}" loading="lazy"></button>`).join('')}</div>`;
}
VIEWS.screenshots = () => {
  const all = load('shotsAll', null, () => api.screenshotsAll());
  const head = `<div class="toolbar"><div class="stack-6"><h1>Captures</h1><span class="sub">Tes captures Steam (F12 en jeu)</span></div></div>`;
  if (all === 'loading') return head + loading();
  if (!all.length) return head + emptyBox('Pas encore de captures', 'Appuie sur F12 pendant une partie Steam, elles apparaîtront ici');
  return head + all.map((a) => `<section class="stack"><div class="section-head"><h2 class="section">${esc(a.name)}</h2><button type="button" class="link-btn" data-open="${esc(a.key)}">${a.shots.length} capture${a.shots.length > 1 ? 's' : ''}</button></div>${shotsGrid(a.shots, 8)}</section>`).join('');
};

// ---------- Stockage ----------
VIEWS.storage = () => {
  const disks = load('disks', null, () => api.disks());
  const inst = games().filter((g) => g.installed && g.sizeOnDisk);
  const old = inst.filter((g) => !g.lastPlayed || g.lastPlayed < now() - 180 * DAY).sort((a, b) => b.sizeOnDisk - a.sizeOnDisk);
  const free = old.reduce((s, g) => s + g.sizeOnDisk, 0);
  const row = (g) => `<div class="row-item store-row" data-open="${g.key}" tabindex="0">
    <img src="${esc(g.art.header)}" alt="" loading="lazy"><span class="t"><span>${esc(g.name)}</span></span>
    <span class="m">${fmtSize(g.sizeOnDisk)}</span><span class="m">${g.lastPlayed ? fmtRel(g.lastPlayed) : 'Jamais lancé'}</span><span class="m">${esc(storeOf(g))}</span>
    <span>${(api.platform === 'darwin' ? g.store === 'steam' : ['steam', 'epic', 'gog'].includes(g.store)) ? `<button type="button" class="btn btn-ghost" data-act="uninstall" data-id="${g.key}">Désinstaller</button>` : ''}</span></div>`;
  return `<div class="toolbar"><div class="stack-6"><h1>Stockage</h1><span class="sub">${inst.length} jeux installés · ${fmtSize(inst.reduce((s, g) => s + g.sizeOnDisk, 0))}</span></div></div>
    ${Array.isArray(disks) ? `<div class="disks">${disks.map((d) => {
      const other = Math.max(0, d.total - d.free - d.used);
      return `<div class="disk"><div class="disk-head"><span class="t">Disque ${esc(d.root.replace('\\', ''))}</span><span class="m">${fmtSize(d.free)} libres sur ${fmtSize(d.total)}</span></div>
        <div class="disk-bar"><span class="games" style="width:${(d.used / d.total) * 100}%"></span><span class="other" style="width:${(other / d.total) * 100}%"></span></div>
        <div class="legend"><span><i class="games"></i>Jeux · ${fmtSize(d.used)}</span><span><i class="other"></i>Autres fichiers · ${fmtSize(other)}</span></div></div>`;
    }).join('')}</div>` : loading()}
    ${old.length ? `<section class="stack"><div class="stack-6"><h2 class="section">À libérer</h2><p class="section-sub">${old.length} jeu${old.length > 1 ? 'x' : ''} pas lancé${old.length > 1 ? 's' : ''} depuis 6 mois · ${fmtSize(free)} récupérables</p></div><div class="list">${old.map(row).join('')}</div></section>` : ''}
    <section class="stack"><h2 class="section">Tous les jeux installés</h2><div class="list">${[...inst].sort((a, b) => b.sizeOnDisk - a.sizeOnDisk).map(row).join('')}</div></section>`;
};

// ---------- Amis ----------
VIEWS.friends = () => {
  const head = `<div class="toolbar"><div class="stack-6"><h1>Amis</h1><span class="sub">Qui joue à quoi en ce moment</span></div><button type="button" class="btn btn-ghost" data-act="open-friends">Ouvrir la liste Steam</button></div>`;
  if (!state.lib.hasApiKey) return head + needKey('La liste d’amis');
  const f = load('friends', null, () => api.friends());
  if (f === 'loading') return head + loading();
  if (f.error) return head + emptyBox('Amis indisponibles', f.error === 'nokey' ? 'Ajoute ta clé Steam Web API' : f.error);
  const rank = (p) => (p.gameId ? 0 : p.state > 0 ? 1 : 2);
  const list = [...f.list].sort((a, b) => rank(a) - rank(b) || b.lastOff - a.lastOff);
  const stateText = (p) => p.game ? `Joue à ${p.game}` : ['Hors ligne', 'En ligne', 'Occupé', 'Absent', 'Absent', 'Échange', 'Veut jouer'][p.state] || 'En ligne';
  return head + `<div class="list friends">${list.map((p) => {
    const owned = p.gameId && byId(p.gameId);
    return `<div class="friend ${rank(p) === 2 ? 'off' : ''}">
      <img class="av" src="${esc(p.avatar)}" alt="">
      <div class="info"><span class="t">${esc(p.name)}</span><span class="s">${p.gameId ? '<span class="lamp live"></span>' : ''}${esc(stateText(p))}${!p.state && p.lastOff ? ` · ${esc(fmtRel(p.lastOff).toLowerCase())}` : ''}</span></div>
      ${owned ? `<span class="m">Tu l’as aussi</span><button type="button" class="btn btn-ghost" data-act="${owned.installed ? 'play' : 'install'}" data-id="${owned.key}">${owned.installed ? 'Jouer' : 'Installer'}</button>` : ''}
      <button type="button" class="btn btn-ghost" data-url="${esc(p.url)}">Profil</button>
    </div>`;
  }).join('')}</div>`;
};

// ---------- Liste de souhaits ----------
function wishTile(w) {
  return `<button type="button" class="tile wish" data-steam="steam://store/${w.appid}">
    ${w.header ? `<img src="${esc(w.header)}" alt="" loading="lazy">` : ''}<div class="shade"></div>
    <div class="row"><div class="stack-6" style="gap:2px;min-width:0"><span class="t">${esc(w.name)}</span>
      <span class="s">${w.comingSoon ? 'Pas encore sorti' : w.discount ? `<s>${esc(w.original)}</s> ${esc(w.price)}` : esc(w.price)}</span></div>
      ${w.discount ? `<span class="discount">−${w.discount} %</span>` : ''}</div>
  </button>`;
}
VIEWS.wishlist = () => {
  const w = load('wishlist', null, () => api.wishlist());
  const promos = w && w.list ? w.list.filter((x) => x.discount > 0).length : 0;
  const head = `<div class="toolbar"><div class="stack-6"><h1>Liste de souhaits</h1><span class="sub">${w && w.list ? `${w.list.length} jeux${promos ? ` · ${promos} en promo` : ''}` : 'Synchronisée depuis Steam'}</span></div><button type="button" class="btn btn-ghost" data-act="store-home">Ouvrir le magasin Steam</button></div>`;
  if (w === 'loading') return head + loading();
  if (w.error) return head + emptyBox('Liste de souhaits indisponible', w.error);
  if (!w.list.length) return head + emptyBox('Ta liste de souhaits est vide', 'Ajoute des jeux depuis le magasin Steam, les promos s’afficheront ici');
  return head + `<div class="tiles">${w.list.map(wishTile).join('')}</div>`;
};

// ---------- Progression ----------
// Page vide : les derniers jeux lancés, qu'on classe d'un clic droit
const statusSuggest = () => {
  const recent = games().filter((g) => g.lastPlayed && !statusOf(g)).sort(byRecent).slice(0, 6);
  return recent.length ? `<section class="stack" style="gap:16px;margin-top:8px"><div class="stack-6"><h2 class="section">Tes derniers jeux</h2><p class="section-sub">Pas encore classés</p></div><div class="grid">${recent.map((g) => coverCard(g)).join('')}</div></section>` : '';
};
VIEWS.status = () => {
  const id = state.route.id;
  const list = games().filter((g) => statusOf(g) === id).sort(byRecent);
  return `<div class="toolbar"><div class="stack-6"><h1>${STATUSES[id] || 'Progression'}</h1><span class="sub">${list.length} jeu${list.length > 1 ? 'x' : ''}</span></div></div>` +
    (list.length ? `<div class="grid">${list.map((g) => coverCard(g)).join('')}</div>` : emptyBox('Rien ici pour l’instant', 'Aucun jeu n’a encore ce statut') + statusSuggest());
};

// ---------- Fiche jeu : onglets ----------
const GAME_TABS = [['overview', 'Aperçu'], ['achievements', 'Succès'], ['news', 'Actualités'], ['shots', 'Captures'], ['sessions', 'Sessions']];
function gameTabs(g) {
  const tab = state.route.tab || 'overview';
  const tabs = GAME_TABS.filter(([id]) => g.store === 'steam' || g.steamAppId || !['achievements', 'news', 'shots'].includes(id) || (id === 'news' && g.steamAppId));
  return `<nav class="tabs" aria-label="Sections du jeu">${tabs.map(([id, l]) => `<button type="button" class="${tab === id ? 'on' : ''}" data-tab="${id}">${l}</button>`).join('')}</nav>`;
}
function gameTabContent(g) {
  const tab = state.route.tab;
  if (tab === 'achievements') {
    const a = load('ach', g.key, () => api.achievements(g.key));
    if (a === 'loading') return loading();
    if (a.error === 'nolocal') return emptyBox('Succès pas encore connus', 'Steam les enregistre sur ton PC dès que tu lances le jeu une fois. Tu peux aussi ajouter ta clé Steam Web API dans les réglages', `<button type="button" class="btn btn-ghost" data-act="settings">Ouvrir les réglages</button>`);
    if (a.error) return emptyBox('Succès indisponibles', a.error === 'nosteam' ? 'Les succès ne sont disponibles que pour les jeux Steam' : a.error);
    if (!a.total) return emptyBox('Pas de succès', 'Ce jeu ne propose pas de succès Steam');
    const left = a.list.filter((x) => !x.achieved).sort((x, y) => (y.global ?? 0) - (x.global ?? 0));
    const got = a.list.filter((x) => x.achieved).sort((x, y) => y.unlocked - x.unlocked);
    const item = (x) => `<div class="ach ${x.achieved ? '' : 'locked'}">${x.icon ? `<img src="${esc(x.icon)}" alt="" loading="lazy">` : '<span class="ach-ph"></span>'}<div class="info"><span class="t">${esc(x.name)}</span><span class="s">${esc(x.hidden && !x.achieved && !x.description ? 'Succès caché' : x.description)}</span></div><span class="m">${x.achieved ? esc(fmtDate(x.unlocked)) : x.global != null ? `${String(Math.round(x.global * 10) / 10).replace('.', ',')} % des joueurs` : ''}</span></div>`;
    return `<section class="panel"><div class="section-head"><h2>Progression</h2><span class="m">${a.done} / ${a.total}</span></div><div class="meter big"><div style="width:${(a.done / a.total) * 100}%"></div></div></section>
      ${left.length ? `<section class="stack"><h2 class="section">Les plus faciles qu’il te reste</h2><div class="ach-list">${left.slice(0, 6).map(item).join('')}</div></section>` : ''}
      ${got.length ? `<section class="stack"><h2 class="section">Débloqués</h2><div class="ach-list">${got.map(item).join('')}</div></section>` : ''}
      ${left.length > 6 ? `<section class="stack"><h2 class="section">Encore à débloquer</h2><div class="ach-list">${left.slice(6).map(item).join('')}</div></section>` : ''}`;
  }
  if (tab === 'news') {
    const n = load('news', g.key, () => api.news(g.key));
    if (n === 'loading') return loading();
    if (n.error || !n.list.length) return emptyBox('Pas d’actualités', n.error && n.error !== 'nosteam' ? n.error : 'Aucune actu publiée récemment pour ce jeu');
    return `<div class="news-list">${n.list.map((x) => newsCard(x)).join('')}</div>`;
  }
  if (tab === 'shots') {
    const s = load('shots', g.key, () => api.screenshots(g.key));
    if (s === 'loading') return loading();
    return s.length ? shotsGrid(s) : emptyBox('Pas de captures', 'Appuie sur F12 pendant une partie Steam pour en prendre');
  }
  if (tab === 'sessions') {
    const all = load('sessions', null, () => api.sessions());
    if (all === 'loading') return loading();
    const list = (Array.isArray(all) ? all : []).filter((x) => x.key === g.key).sort((a, b) => b.start - a.start);
    if (!list.length) return emptyBox('Pas encore de session enregistrée', 'Le launcher note chaque partie à partir de maintenant, avec sa durée');
    const total = list.reduce((s, x) => s + x.end - x.start, 0);
    return `<section class="panel"><div class="section-head"><h2>${list.length} session${list.length > 1 ? 's' : ''} suivie${list.length > 1 ? 's' : ''}</h2><span class="m">${fmtDur(total)} au total</span></div>
      ${list.slice(0, 50).map((x, i) => `${i ? '<div class="sep"></div>' : ''}<div class="kv"><span>${new Date(x.start * 1000).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span><span>${fmtDur(x.end - x.start)}</span></div>`).join('')}</section>`;
  }
  return '';
}
// Icônes des statuts (même trait que le reste de l'interface) et une phrase qui dit ce que veut dire chacun
const SI = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const STATUS_UI = {
  todo: { icon: SI('<path d="M18 21l-6-4-6 4V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/>'), hint: 'Je veux y jouer' },
  playing: { icon: SI('<circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z"/>'), hint: 'Partie en cours' },
  done: { icon: SI('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'), hint: 'Fini, ou presque' },
  dropped: { icon: SI('<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>'), hint: 'Mis de côté' },
};
const NOTE_ICON = SI('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>');
function progressPanel(g) {
  // Les statuts et les collections sont ceux de Steam : un jeu d'un autre store ne peut pas y entrer.
  if (g.store !== 'steam') return '';
  const cur = statusOf(g);
  const cols = myCollections();
  const inColl = new Set(cols.filter((c) => c.keys.includes(g.key)).map((c) => c.id));
  const note = (state.local.notes || {})[g.key] || '';
  return `<section class="panel progress-panel">
    <div class="section-head"><h2>Statut et collections Steam</h2>${cur ? `<button type="button" class="link-btn" data-status="${cur}" data-id="${g.key}" title="Retirer le statut">Retirer</button>` : ''}</div>
    <div class="status-picker" role="radiogroup" aria-label="Statut du jeu">${Object.entries(STATUSES).map(([id, l]) => {
      const ui = STATUS_UI[id] || { icon: '', hint: '' };
      return `<button type="button" role="radio" aria-checked="${cur === id}" class="status-opt status-${id} ${cur === id ? 'on' : ''}" data-status="${id}" data-id="${g.key}" title="${esc(ui.hint)}">
        <span class="ic">${ui.icon}</span><span class="tx"><span class="l">${esc(l)}</span><span class="h">${esc(ui.hint)}</span></span>
      </button>`;
    }).join('')}</div>
    ${(state.lib && state.lib.steamRunning) ? `<p class="small">Steam est ouvert : les changements seront écrits dans tes collections Steam à sa fermeture.</p>${state.lib.steamPending ? '<button type="button" class="btn btn-ghost" data-steam-apply>Fermer Steam et appliquer</button>' : ''}` : ''}
    ${cols.length ? `<div class="coll-picker">
      <p class="nav-title">Collections Steam</p>
      ${cols.map((c) => `<label class="check"><input type="checkbox" data-coll-toggle="${esc(c.id)}" data-key="${esc(g.key)}" ${inColl.has(c.id) ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}
    </div>` : ''}
    <label class="note-field">
      <span class="note-head"><span class="note-title">${NOTE_ICON}Note perso</span><span class="note-state" aria-live="polite">${note ? 'Enregistrée' : ''}</span></span>
      <textarea class="note-input" data-note="${g.key}" rows="3" placeholder="Où tu en es, ce qu’il te reste à faire">${esc(note)}</textarea>
    </label>
  </section>`;
}

// ---------- Actus ----------
function newsCard(n, withGame) {
  return `<button type="button" class="news" data-url="${esc(n.url)}">
    <span class="kicker">${withGame ? `${esc(n.game)} · ` : ''}${esc(fmtRel(n.date))}${n.feed ? ` · ${esc(n.feed)}` : ''}</span>
    <span class="t">${esc(n.title)}</span>
    ${n.text ? `<span class="s">${esc(n.text)}</span>` : ''}
  </button>`;
}

// ---------- Ajouter un jeu ----------
async function openAddGame() {
  const dlg = $('#settings');
  const data = { exe: '', cover: '' };
  dlg.innerHTML = `<form class="m-body" id="add-form">
    <h2>Ajouter un jeu</h2>
    <p>${api.platform === 'darwin' ? 'Une application, un émulateur ou un jeu téléchargé ailleurs' : 'Un exécutable, un émulateur ou un jeu téléchargé ailleurs'}. Le launcher le lance, mesure ton temps de jeu et cherche sa jaquette</p>
    <div class="field">Programme<div class="pick"><span class="path" id="exe-path">Aucun fichier choisi</span><button type="button" class="btn btn-ghost" id="pick-exe">Choisir…</button></div></div>
    <label class="field">Nom<input name="name" required placeholder="Nom du jeu"></label>
    <label class="field">Arguments (optionnel)<input name="args" placeholder="-fullscreen"></label>
    <div class="field">Jaquette (optionnelle)<div class="pick"><span class="path" id="cover-path">Trouvée automatiquement si possible</span><button type="button" class="btn btn-ghost" id="pick-cover">Choisir…</button></div></div>
    <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-light">Ajouter</button></div>
  </form>`;
  dlg.showModal();
  $('[data-close]', dlg).onclick = () => dlg.close();
  $('#pick-exe').onclick = async () => {
    const p = await api.pickExe();
    if (!p) return;
    data.exe = p;
    $('#exe-path').textContent = p;
    const name = $('[name=name]', dlg);
    if (!name.value) name.value = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  };
  $('#pick-cover').onclick = async () => { const p = await api.pickImage(); if (p) { data.cover = p; $('#cover-path').textContent = p; } };
  $('#add-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!data.exe) { toast('Choisis d’abord le programme du jeu'); return; }
    const f = new FormData(e.target);
    try {
      const key = await api.addCustom({ name: f.get('name'), exe: data.exe, args: f.get('args'), cover: data.cover });
      dlg.close();
      await sync(true);
      go({ view: 'game', id: key });
      toast('Jeu ajouté');
    } catch (err) { toast(String(err.message || err).replace(/^Error invoking remote method[^:]+: (Error: )?/, '')); }
  };
}

// ---------- Réglages système ----------
function settingsSystem(prefs) {
  const s = prefs.system || {};
  const p = (state.lib && state.lib.platforms || []).filter((x) => x.count);
  return `<fieldset class="field set"><legend>Système</legend>
    <label class="check"><input type="checkbox" name="closeToTray" ${s.closeToTray ? 'checked' : ''}> Garder le launcher dans la ${api.platform === 'darwin' ? 'barre des menus' : 'barre des tâches'} quand je ferme la fenêtre</label>
    <label class="check"><input type="checkbox" name="shortcut" ${s.shortcut ? 'checked' : ''}> Ouvrir avec ${api.platform === 'darwin' ? '<kbd>⌘</kbd> <kbd>⌥</kbd> <kbd>L</kbd>' : '<kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>L</kbd>'} depuis n’importe où</label>
    <label class="check ${prefs.canAutostart ? '' : 'disabled'}"><input type="checkbox" name="autostart" ${s.autostart ? 'checked' : ''} ${prefs.canAutostart ? '' : 'disabled'}> ${api.platform === 'darwin' ? 'Ouvrir à la connexion' : 'Démarrer avec Windows'}, réduit${prefs.canAutostart ? '' : api.platform === 'darwin' ? ' (version installée uniquement)' : ' (version .exe uniquement)'}</label>
  </fieldset>
  ${p.length ? `<div class="note">Plateformes détectées : ${p.map((x) => `${STORE_NAME[x.id]} ${x.count}`).join(' · ')}</div>` : ''}`;
}

// ---------- Mode canapé (manette) ----------
const FOCUSABLE = 'button:not([disabled]), [role="button"], a[href], input, select, textarea, [tabindex="0"]';
function visibleFocusables() {
  return [...document.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.closest('[hidden]') || el.closest('dialog:not([open])')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}
function moveFocus(dir) {
  const cur = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
  const els = visibleFocusables();
  if (!cur) { (els.find((e) => e.closest('#view')) || els[0])?.focus(); return; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const dx = bx - ax, dy = by - ay;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (along <= 4) continue;
    const score = along + across * 2.5;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { best.focus({ preventScroll: true }); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
}
function setCouch(on) {
  state.couch = on;
  document.body.classList.toggle('couch', on);
  api.fullscreen(on);
  toast(on ? 'Mode canapé · A valider · B retour · Start pour quitter' : 'Mode canapé désactivé');
  setTimeout(() => moveFocus('down'), 100);
}
const pad = { prev: [], repeat: 0, last: 0, armed: [], running: false };
// Un stick ne compte qu'après être passé par le centre : un stick qui dérive, ou un axe qui reste
// bloqué d'un côté (manette non standard), ne fait plus défiler la barre latérale tout seul.
function stickAxis(i, v) {
  if (Math.abs(v) < 0.3) pad.armed[i] = true;
  return pad.armed[i] ? v : 0;
}
function pollPad(t) {
  const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find(Boolean);
  if (!gp) { pad.running = false; return; } // plus de manette : la boucle s'arrête jusqu'à la prochaine
  // Fenêtre en arrière-plan (tu joues avec la manette) : le launcher ignore les touches.
  // On ne revérifie alors que deux fois par seconde, au lieu de 60 (tu es en jeu : chaque image compte).
  if (!document.hasFocus()) { pad.prev = gp.buttons.map((x) => x.pressed); pad.dir = null; setTimeout(() => requestAnimationFrame(pollPad), 500); return; }
  {
    const b = gp.buttons.map((x) => x.pressed);
    const pressed = (i) => b[i] && !pad.prev[i];
    const ax = stickAxis(0, gp.axes[0] || 0), ay = stickAxis(1, gp.axes[1] || 0);
    const dir = b[12] || ay < -0.5 ? 'up' : b[13] || ay > 0.5 ? 'down' : b[14] || ax < -0.5 ? 'left' : b[15] || ax > 0.5 ? 'right' : null;
    if (dir) {
      document.body.classList.add('pad');
      if (!pad.dir || pad.dir !== dir || t - pad.last > (pad.repeat ? 110 : 360)) { pad.repeat = pad.dir === dir; pad.dir = dir; pad.last = t; moveFocus(dir); }
    } else pad.dir = null;
    if (pressed(0) && document.activeElement && document.activeElement !== document.body) { document.body.classList.add('pad'); document.activeElement.click(); }
    if (pressed(1)) { if ($('#settings').open) $('#settings').close(); else back(); }
    if (pressed(9)) setCouch(!state.couch);
    if (pressed(3)) { $('#search').focus(); }
    if (pressed(4) || pressed(5)) { const v = ['home', 'all', 'installed', 'favorites', 'history']; const i = Math.max(0, v.indexOf(state.route.view)); go({ view: v[(i + (pressed(5) ? 1 : v.length - 1)) % v.length] }); }
    pad.prev = b;
  }
  requestAnimationFrame(pollPad);
}
// La boucle ne tourne que lorsqu'une manette est branchée (avant : 60 fois par seconde en permanence).
function startPad() {
  if (pad.running) return;
  pad.running = true;
  pad.armed = [];
  requestAnimationFrame(pollPad);
}
if ([...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean)) startPad();
window.addEventListener('gamepadconnected', () => { startPad(); toast('Manette détectée · Start pour le mode canapé'); });
document.addEventListener('keydown', (e) => {
  if (!state.couch || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
  const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (dir) { e.preventDefault(); moveFocus(dir); }
});
document.addEventListener('mousemove', () => document.body.classList.remove('pad'), { passive: true });

// ---------- Événements propres aux fonctions en plus ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab],[data-status],[data-shot],[data-url],[data-steam]');
  if (!t) return;
  e.stopPropagation();
  if (t.dataset.tab) { state.route = { ...state.route, tab: t.dataset.tab }; render({ quiet: true }); return; }
  if (t.dataset.status) {
    const k = t.dataset.id;
    const g = byId(k);
    if (!g) return;
    if (g.store !== 'steam') { toast('Les statuts sont des collections Steam : réservé aux jeux Steam'); return; }
    const next = g.status === t.dataset.status ? '' : t.dataset.status;
    g.status = next;
    render({ quiet: true });
    api.setSteamStatus(k, next).then((r) => {
      if (r && r.queued) {
        state.lib.steamPending = r.pending;
        state.lib.steamRunning = true;
        render({ quiet: true });
        toast('Statut enregistré — écriture dans Steam à sa fermeture');
      } else if (r && r.error) toast(r.error);
    }).catch((e) => toast(String((e && e.message) || e)));
    return;
  }
  if (t.dataset.shot) { api.openScreenshot(t.dataset.shot); return; }
  const url = t.dataset.url || t.dataset.steam;
  if (url) api.openUrl(url).then((ok) => { if (ok === false) toast('Ce lien ne peut pas être ouvert'); });
}, true);

// Collections Steam : les cases de la fiche écrivent dans Steam (ou en attente).
document.addEventListener('change', (e) => {
  const t = e.target.closest('[data-coll-toggle]');
  if (!t) return;
  toggleInCollection(t.dataset.collToggle, t.dataset.key);
});

// Écriture immédiate : ferme Steam, écrit, le relance (confirmation et refus si un jeu tourne).
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-steam-apply]');
  if (!b || b.disabled) return;
  b.disabled = true;
  const old = b.textContent;
  b.textContent = 'Fermeture de Steam…';
  api.applySteamNow().then((r) => {
    if (r && r.error) toast(r.error);
    else if (r && r.ok) toast(r.relaunched ? 'Collections écrites · Steam relancé' : 'Collections écrites');
  }).catch((err) => toast(String((err && err.message) || err))).finally(() => {
    b.disabled = false;
    b.textContent = old;
    setTimeout(() => sync(true), 1500);
  });
}, true);

let noteTimer;
document.addEventListener('input', (e) => {
  if (!e.target.dataset.note) return;
  clearTimeout(noteTimer);
  const k = e.target.dataset.note, v = e.target.value;
  // L'état suit chaque frappe : un redessin de la fiche (infos qui finissent de charger) garde tout le texte.
  // Seul l'enregistrement sur le disque attend une pause de 400 ms.
  state.local.notes = { ...state.local.notes, [k]: v };
  if (!v) delete state.local.notes[k];
  // Petit retour visible : « … » pendant la frappe, « Enregistrée » une fois écrite sur le disque
  const st = e.target.closest('.note-field') && e.target.closest('.note-field').querySelector('.note-state');
  if (st) st.textContent = '…';
  noteTimer = setTimeout(() => { saveLocal(); if (st) st.textContent = v ? 'Enregistrée' : ''; }, 400);
});


