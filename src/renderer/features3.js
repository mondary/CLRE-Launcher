// CLRE-Launcher, 3e vague : bannières vivantes, teinte du jeu, écran de lancement, journal, vitrine,
// story récap (semaine / mois / année, export vidéo), performances.
/* global state, api, VIEWS, ICONS, esc, render, go, load, loading, emptyBox, byId, games, toast, fmtRel, fmtSize, fmtDur, fmtH,
   steamish, sidebarExtras, gameTabs, gameTabContent, doAction, settingsSystem, readExtraSettings, recapRange, platIcon, storeOf, modal */

const S3 = { tintKey: null, videos: new Map(), splash: null };
// Vidéos de fond (fiches de jeu et du magasin) : on en garde 4 au plus. Les plus anciennes sont
// arrêtées et leur lecteur HLS détruit, sinon chaque fiche visitée gardait sa vidéo et son tampon en mémoire.
function releaseVideo(k, v) {
  clearTimeout(v._t);
  v.pause();
  if (v._hls) v._hls.destroy();
  v.removeAttribute('src'); v.load();
  v.remove();
  S3.videos.delete(k);
}
function trimVideos(max = 4) {
  while (S3.videos.size > max) { const [k, old] = S3.videos.entries().next().value; releaseVideo(k, old); }
}
Object.assign(ICONS, {
  journal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-1.5Z"/><path d="M4 19.5A2 2 0 0 1 6 18h12M9 7h5M9 11h5"/></svg>',
  trophy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4M17 6h2.5a2.5 2.5 0 0 1-2.5 4M12 14v3.5M8.5 20h7"/></svg>',
});
const settings3 = () => (state.prefs && state.prefs.settings) || {};
api.getPrefs().then((p) => { state.prefs = p; }).catch(() => {});

// ---------- Teinte du jeu : l'accent et un halo prennent la couleur de la jaquette ----------
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s, l];
}
async function applyTint(g) {
  const root = document.documentElement;
  if (!g || settings3().gameTint === false) {
    if (S3.tintKey) { root.style.removeProperty('--tint'); root.classList.remove('tinted'); S3.tintKey = null; if (typeof applyLook === 'function') applyLook(); }
    return;
  }
  if (S3.tintKey === g.key) return;
  S3.tintKey = g.key;
  const rgb = await api.artColor(g.art.cover || g.art.header || g.art.hero);
  if (S3.tintKey !== g.key) return;
  if (!rgb) { root.style.removeProperty('--tint'); root.classList.remove('tinted'); if (typeof applyLook === 'function') applyLook(); return; }
  const [h, s] = rgbToHsl(...rgb);
  const sat = Math.round(Math.min(0.85, Math.max(0.5, s)) * 100);
  root.style.setProperty('--tint', `${Math.round(h)} ${sat}% 50%`);
  root.classList.add('tinted');
}

// ---------- Bannières vivantes : le trailer prend le relais de l'image après 2 s ----------
function liveBanner(hero, g) {
  if (!hero || !g || settings3().liveBanners === false || !steamish(g) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (state.running && state.running.length) return; // pas de vidéo pendant qu'un jeu tourne
  const d = state.cache.store && state.cache.store[g.key];
  if (d === undefined) { load('store', g.key, () => api.storeDetails(g.key)); return; }
  if (!d || d === 'loading' || d.error || !d.movies || !d.movies.length) return;
  const movie = d.movies[0];
  let v = S3.videos.get(g.key);
  if (!v) {
    v = document.createElement('video');
    v.className = 'bg-video'; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'none';
    v.setAttribute('aria-hidden', 'true');
    v.addEventListener('playing', () => v.classList.add('on'));
    v.dataset.at = String(Date.now());
    S3.videos.set(g.key, v);
    trimVideos();
  }
  const img = hero.querySelector('img.bg');
  if (img && v.parentNode !== hero) img.after(v);
  const start = () => {
    if (!document.body.contains(v) || document.hidden) return;
    if (!v._loaded) {
      v._loaded = true;
      if (movie.hls && window.Hls && Hls.isSupported()) {
        const h = new Hls({ capLevelToPlayerSize: true, startLevel: -1, maxBufferLength: 20 });
        h.loadSource(movie.hls); h.attachMedia(v); v._hls = h;
        h.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
      } else if (movie.mp4) { v.src = movie.mp4; v.play().catch(() => {}); }
    } else v.play().catch(() => {});
    v.playbackRate = 0.9;
  };
  if (v._loaded) { if (v.paused) start(); return; }
  if (!v._t) v._t = setTimeout(() => { v._t = null; start(); }, 2000);
}
// Fenêtre cachée (barre des tâches, jeu par-dessus) : pause tout de suite, puis au bout d'une minute
// les vidéos sont libérées (lecteur HLS, tampons, décodeur) ; elles se recréent quand la fenêtre revient.
let videoFreeTimer = null;
document.addEventListener('visibilitychange', () => {
  clearTimeout(videoFreeTimer);
  if (document.hidden) {
    for (const v of S3.videos.values()) v.pause();
    videoFreeTimer = setTimeout(() => {
      if (!document.hidden || !S3.videos.size) return;
      for (const [k, v] of [...S3.videos]) releaseVideo(k, v);
      S3.videosFreed = true;
    }, 60e3);
    return;
  }
  if (!S3.videosFreed) return;
  S3.videosFreed = false;
  const hero = document.querySelector('[data-hero-key]');
  const g = hero && byId(hero.dataset.heroKey);
  if (hero && g) liveBanner(hero.querySelector('.spotlight') || hero, g);
  if (typeof shopTrailer === 'function') shopTrailer();
});

// ---------- Après chaque rendu ----------
const _render3 = render;
// eslint-disable-next-line no-global-assign
render = function (opts) {
  _render3(opts);
  const r = state.route;
  const hero = document.querySelector('[data-hero-key]');
  const g = hero ? byId(hero.dataset.heroKey) : r.view === 'game' ? byId(r.id) : null;
  applyTint(r.view === 'game' || r.view === 'home' ? g : null);
  if (hero && g) liveBanner(hero.querySelector('.spotlight') || hero, g);
  for (const [k, v] of S3.videos) if (!document.body.contains(v) || !hero || hero.dataset.heroKey !== k) v.pause();
};

// ---------- Écran de lancement ----------
function showSplash(g) {
  if (!g) return;
  closeSplash(true);
  const el = document.createElement('div');
  el.className = 'splash';
  el.innerHTML = `<div class="splash-bg" style="background-image:url('${esc(g.art.hero || g.art.header || g.art.cover)}')"></div><div class="splash-shade"></div>
    <div class="splash-body">
      ${g.art.logo ? `<img class="splash-logo" src="${esc(g.art.logo)}" alt="${esc(g.name)}">` : ''}<h1 class="splash-title" ${g.art.logo ? 'hidden' : ''}>${esc(g.name)}</h1>
      <div class="splash-bar"><span></span></div>
      <p class="splash-text" id="splash-text">Lancement via ${esc(storeOf(g))}…</p>
    </div>
    <button type="button" class="splash-close" aria-label="Masquer">Masquer</button>`;
  el.querySelector('.splash-close').onclick = () => closeSplash();
  const lg = el.querySelector('.splash-logo');
  if (lg) lg.onerror = () => { lg.remove(); el.querySelector('.splash-title').hidden = false; };
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const t0 = Date.now();
  S3.splash = { el, key: g.key, timer: setInterval(() => {
    const running = (state.running || []).includes(g.key);
    if (running && !el.classList.contains('ready')) {
      el.classList.add('ready');
      const t = el.querySelector('#splash-text'); if (t) t.textContent = 'Bonne partie';
      setTimeout(() => closeSplash(), 1600);
    } else if (Date.now() - t0 > 25000) closeSplash();
  }, 300) };
}
function closeSplash(now) {
  const s = S3.splash;
  if (!s) return;
  clearInterval(s.timer);
  S3.splash = null;
  if (now) { s.el.remove(); return; }
  s.el.classList.remove('on');
  setTimeout(() => s.el.remove(), 500);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S3.splash) closeSplash(); });

// ---------- Journal ----------
state.journalLimit = 40;
const dayKey = (t) => { const d = new Date(t * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function journalHtml(events, onlyKey) {
  const days = new Map();
  for (const e of events) {
    const k = dayKey(e.t);
    if (!days.has(k)) days.set(k, new Map());
    const games_ = days.get(k);
    if (!games_.has(e.key)) games_.set(e.key, { secs: 0, ach: [], shots: [] });
    const x = games_.get(e.key);
    if (e.type === 'session') x.secs += Math.max(0, e.end - e.t);
    else if (e.type === 'ach') x.ach.push(e);
    else if (e.type === 'shot') x.shots.push(e);
  }
  const keys = [...days.keys()].sort().reverse();
  const shown = keys.slice(0, state.journalLimit);
  let month = '';
  const out = [];
  for (const k of shown) {
    const d = new Date(k + 'T12:00:00');
    const m = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    if (m !== month) { month = m; out.push(`<h2 class="section journal-month">${esc(m[0].toUpperCase() + m.slice(1))}</h2>`); }
    const label = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric' });
    const entries = [...days.get(k)].map(([key, x]) => {
      const g = byId(key);
      const name = g ? g.name : key;
      const bits = [x.secs >= 60 ? fmtDur(x.secs) + ' de jeu' : '', x.ach.length ? `${x.ach.length} succès` : '', x.shots.length ? `${x.shots.length} capture${x.shots.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
      return `<div class="j-entry">
        ${onlyKey ? '' : `<button type="button" class="j-cover" data-open="${esc(key)}" aria-label="${esc(name)}">${g && g.art.cover ? `<img src="${esc(g.art.cover)}" alt="" loading="lazy">` : ''}</button>`}
        <div class="j-body">
          ${onlyKey ? '' : `<button type="button" class="j-name" data-open="${esc(key)}">${esc(name)}</button>`}
          <span class="j-meta">${bits}</span>
          ${x.ach.length ? `<div class="j-ach">${x.ach.slice(0, 10).map((a) => `<img src="${esc(a.icon)}" alt="" title="${esc(a.name)}" loading="lazy">`).join('')}${x.ach.length > 10 ? `<span class="more">+${x.ach.length - 10}</span>` : ''}</div>` : ''}
          ${x.shots.length ? `<div class="j-shots">${x.shots.slice(0, 4).map((s) => `<img src="${esc(s.thumb)}" alt="" loading="lazy">`).join('')}</div>` : ''}
        </div></div>`;
    }).join('');
    out.push(`<section class="j-day"><span class="j-date">${esc(label[0].toUpperCase() + label.slice(1))}</span><div class="j-list">${entries}</div></section>`);
  }
  if (keys.length > shown.length) out.push(`<button type="button" class="btn btn-ghost" data-act="journal-more">Afficher plus</button>`);
  return out.join('');
}
VIEWS.journal = () => {
  const ev = load('journalAll', null, () => api.journal());
  const head = `<div class="toolbar"><div class="stack-6"><h1>Journal</h1><span class="sub">Tes sessions, succès et captures, jour par jour</span></div></div>`;
  if (ev === 'loading') return head + loading();
  if (!Array.isArray(ev) || !ev.length) return head + emptyBox('Ton journal est vide', 'Il se remplit avec tes parties, tes succès Steam et tes captures');
  return head + `<div class="journal">${journalHtml(ev)}</div>`;
};

// ---------- Vitrine des succès rares ----------
VIEWS.showcase = () => {
  const s = load('showcase', null, () => api.showcase());
  const head = `<div class="toolbar"><div class="stack-6"><h1>Vitrine</h1><span class="sub">Tes succès les plus rares, comparés à tous les joueurs Steam</span></div></div>`;
  if (s === 'loading') return head + `<p class="section-sub">Récupération des statistiques mondiales de tes jeux, une seule fois par semaine…</p>` + loading();
  if (!s || s.error) return head + emptyBox('Vitrine indisponible', (s && s.error) || 'Réessaie dans un instant');
  if (!s.total) return head + emptyBox('Pas encore de succès', 'Les succès de tes jeux Steam apparaissent ici dès qu’ils sont débloqués');
  const pct = (v) => (v < 0.1 ? '< 0,1' : String(Math.round(v * 10) / 10).replace('.', ','));
  const top = s.rarest.slice(0, 10);
  return head + `<div class="stats">
      <div><span class="k">Succès débloqués</span><span class="v">${s.total}</span><span class="sub">sur ${s.games} jeux</span></div>
      <div><span class="k">Succès rares</span><span class="v">${s.under5}</span><span class="sub">obtenus par moins de 5 % des joueurs</span></div>
      <div><span class="k">Jeux à 100 %</span><span class="v">${s.perfect.length}</span><span class="sub">${s.perfect.slice(0, 2).map((k) => esc((byId(k) || {}).name || '')).join(', ')}</span></div>
      ${top[0] ? `<div><span class="k">Le plus rare</span><span class="v">${pct(top[0].global)} %</span><span class="sub">${esc(top[0].name)}</span></div>` : ''}
    </div>
    <section class="stack"><h2 class="section">Top 10</h2><div class="showcase">${top.map((a, i) => `<button type="button" class="sc-card ${i < 3 ? 'podium' : ''}" data-open="${esc(a.key)}">
      <span class="sc-rank">${i + 1}</span><img src="${esc(a.icon)}" alt="" loading="lazy">
      <span class="sc-body"><span class="t">${esc(a.name)}</span><span class="s">${esc(a.game)}${a.t ? ` · ${new Date(a.t * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span></span>
      <span class="sc-pct"><b>${pct(a.global)} %</b><small>des joueurs</small></span></button>`).join('')}</div></section>
    ${s.rarest.length > 10 ? `<section class="stack"><h2 class="section">Aussi très rares</h2><div class="ach-list">${s.rarest.slice(10).map((a) => `<div class="ach"><img src="${esc(a.icon)}" alt="" loading="lazy"><div class="info"><span class="t">${esc(a.name)}</span><span class="s">${esc(a.game)}</span></div><span class="m">${pct(a.global)} %</span></div>`).join('')}</div></section>` : ''}`;
};

// ---------- Sidebar ----------
const _sidebarExtras3 = sidebarExtras;
// eslint-disable-next-line no-global-assign
sidebarExtras = function (all) {
  const r = state.route;
  const item = (view, icon, label) => `<button type="button" class="nav-item ${r.view === view ? 'active' : ''}" data-nav="${view}" title="${label}">${icon}<span class="label">${label}</span></button>`;
  return _sidebarExtras3(all) + item('journal', ICONS.journal, 'Journal') + item('showcase', ICONS.trophy, 'Vitrine');
};

// ---------- Fiche : onglets Journal et Performances ----------
const _gameTabs3 = gameTabs;
// eslint-disable-next-line no-global-assign
gameTabs = function (g) {
  const tab = state.route.tab || 'overview';
  const extra = [['journal', 'Journal'], ['perf', 'Performances']];
  return _gameTabs3(g).replace('</nav>', extra.map(([id, l]) => `<button type="button" class="${tab === id ? 'on' : ''}" data-tab="${id}">${l}</button>`).join('') + '</nav>');
};
state.cache.journal = {}; state.cache.perf = {};
const _gameTabContent3 = gameTabContent;
// eslint-disable-next-line no-global-assign
gameTabContent = function (g) {
  const tab = state.route.tab;
  if (tab === 'journal') {
    const ev = load('journal', g.key, () => api.journal(g.key));
    if (ev === 'loading') return loading();
    if (!Array.isArray(ev) || !ev.length) return emptyBox('Rien dans le journal', 'Tes sessions, succès et captures de ce jeu apparaîtront ici');
    return `<div class="journal">${journalHtml(ev, g.key)}</div>`;
  }
  if (tab === 'perf') return perfHtml(g);
  return _gameTabContent3(g);
};

// ---------- Performances ----------
function sparkline(vals, max, cls) {
  const w = 600, h = 120;
  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${h - (Math.min(v, max) / max) * (h - 8) - 4}`).join(' ');
  return `<svg class="spark ${cls}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
function perfHtml(g) {
  const list = load('perf', g.key, () => api.perf(g.key));
  if (list === 'loading') return loading();
  const hint = api.platform === 'darwin'
    ? '<p class="small">La mesure des performances pendant une partie n’est pas encore disponible sur macOS.</p>'
    : `<p class="small">Mesuré pendant chaque partie lancée avec le launcher ouvert : processeur, carte graphique, mémoire vidéo et RAM. ${settings3().presentMon ? 'Les FPS viennent de PresentMon.' : 'Pour les FPS, indique PresentMon dans les réglages.'} Les températures s’affichent si LibreHardwareMonitor tourne.</p>`;
  if (!Array.isArray(list) || !list.length) return emptyBox('Pas encore de mesure', 'Lance une partie : le launcher relève les performances toutes les 5 secondes et les affiche ici à la fin') + hint;
  const sel = Math.min(list.length - 1, state.perfSel || 0);
  const p = list[sel];
  const col = (k) => p.samples.map((x) => Number(x[k]) || 0);
  const avg = (k) => { const v = p.samples.map((x) => x[k]).filter((x) => x != null && !Number.isNaN(Number(x))).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const peak = (k) => { const v = col(k); return v.length ? Math.max(...v) : null; };
  const hasFps = p.samples.some((x) => x.fps);
  const hasT = p.samples.some((x) => x.cpuT || x.gpuT);
  const cell = (k, v, sub) => `<div><span class="k">${k}</span><span class="v">${v}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  const chart = (title, key, max, unit, cls) => `<section class="panel perf-chart"><div class="section-head"><h2>${title}</h2><span class="m">moy. ${Math.round(avg(key) || 0)} ${unit} · max ${Math.round(peak(key) || 0)} ${unit}</span></div>${sparkline(col(key), max, cls)}</section>`;
  return `<div class="perf-head"><div class="seg-chips">${list.slice(0, 6).map((x, i) => `<button type="button" class="${i === sel ? 'on' : ''}" data-perf-sel="${i}">${esc(new Date(x.start * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }))} · ${fmtDur(x.end - x.start)}</button>`).join('')}</div></div>
    <div class="stats">
      ${hasFps ? cell('FPS moyens', Math.round(avg('fps')), `1 % bas : ${Math.round(avg('low') || 0)} FPS`) : ''}
      ${cell('Processeur', `${Math.round(avg('cpu') || 0)} %`, `pic ${Math.round(peak('cpu') || 0)} %`)}
      ${cell('Carte graphique', `${Math.round(avg('gpu') || 0)} %`, `pic ${Math.round(peak('gpu') || 0)} %`)}
      ${cell('Mémoire vidéo', `${String(Math.round((avg('vram') || 0) / 102.4) / 10).replace('.', ',')} Go`, `pic ${String(Math.round((peak('vram') || 0) / 102.4) / 10).replace('.', ',')} Go`)}
      ${cell('RAM utilisée', `${String(Math.round((avg('ram') || 0) / 102.4) / 10).replace('.', ',')} Go`, '')}
      ${hasT ? cell('Températures', `${Math.round(avg('cpuT') || 0)}° / ${Math.round(avg('gpuT') || 0)}°`, 'processeur / carte graphique') : ''}
    </div>
    <div class="perf-grid">
      ${hasFps ? chart('Images par seconde', 'fps', Math.max(60, peak('fps') || 60), 'FPS', 'fps') : ''}
      ${chart('Carte graphique', 'gpu', 100, '%', 'gpu')}
      ${chart('Processeur', 'cpu', 100, '%', 'cpu')}
      ${hasT ? chart('Température GPU', 'gpuT', 100, '°C', 'temp') : ''}
    </div>${hint}`;
}
api.onPerfSaved((key) => { delete state.cache.perf[key]; if (state.route.view === 'game' && state.route.id === key) render({ quiet: true }); });

// La story récap est dans story.js

// Mode semaine + bouton story dans la page Récap
const _recapRange3 = recapRange;
// eslint-disable-next-line no-global-assign
recapRange = function () {
  const r = state.recap;
  if (r.mode !== 'week') return _recapRange3();
  const d = new Date();
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + r.offset * 7);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const f = (x, o) => x.toLocaleDateString('fr-FR', o);
  const label = monday.getMonth() === sunday.getMonth() ? `Du ${monday.getDate()} au ${f(sunday, { day: 'numeric', month: 'long' })}` : `Du ${f(monday, { day: 'numeric', month: 'short' })} au ${f(sunday, { day: 'numeric', month: 'short' })}`;
  return { from: monday, to: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7), label, file: `recap-semaine-${monday.toISOString().slice(0, 10)}` };
};
const _recapView = VIEWS.recap;
VIEWS.recap = () => {
  let html = _recapView();
  html = html.replace('<button type="button" class="' + (state.recap.mode === 'month' ? 'on' : '') + '" data-recap-mode="month">', `<button type="button" class="${state.recap.mode === 'week' ? 'on' : ''}" data-recap-mode="week">Semaine</button><button type="button" class="${state.recap.mode === 'month' ? 'on' : ''}" data-recap-mode="month">`);
  return html.replace('<div class="actions"><div class="seg-chips">', `<div class="actions"><button type="button" class="btn btn-primary" data-act="story">${ICONS.play || ''}Voir ma story</button><div class="seg-chips">`);
};

// ---------- Actions ----------
const _doAction3 = doAction;
// eslint-disable-next-line no-global-assign
doAction = async function (act, id, el) {
  if (act === 'play') { const g = byId(id); const r = await _doAction3(act, id, el); if (g && g.installed !== false) showSplash(g); return r; }
  if (act === 'story') return openStory();
  if (act === 'journal-more') { state.journalLimit += 40; return render({ quiet: true }); }
  if (act === 'pick-presentmon') { const f = await api.pickPresentMon(); if (f) { const inp = document.querySelector('input[name="presentMon"]'); if (inp) inp.value = f; const sp = document.getElementById('pm-path'); if (sp) sp.textContent = f; } return undefined; }
  return _doAction3(act, id, el);
};
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-perf-sel]');
  if (!t) return;
  e.stopPropagation();
  state.perfSel = Number(t.dataset.perfSel);
  render({ quiet: true });
}, true);
api.onNavigate((route) => {
  if (route && route.story) { state.recap = { mode: route.story, offset: route.offset ?? -1 }; setTimeout(() => { render({ quiet: true }); openStory(); }, 300); }
});

// ---------- Réglages ----------
const _settingsSystem3 = settingsSystem;
// eslint-disable-next-line no-global-assign
settingsSystem = function (prefs) {
  state.prefs = prefs;
  const s = prefs.settings || {};
  const mac = api.platform === 'darwin';
  const cb = (name, on, label) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
  let html = _settingsSystem3(prefs).replace('<fieldset class="field set"><legend>Notifications</legend>', `<fieldset class="field set"><legend>Effets</legend>
      ${cb('liveBanners', s.liveBanners !== false, 'Bannières vivantes : le trailer prend le relais de l’image')}
      ${cb('gameTint', s.gameTint !== false, 'La couleur de l’interface suit le jeu affiché')}
    </fieldset>
    <fieldset class="field set"><legend>Notifications</legend>
      ${cb('n_recaps', (s.notify || {}).recaps !== false, 'Mon récap de la semaine, du mois ou de l’année est prêt')}`);
  // PresentMon (FPS) est un outil Windows : pas de section Performances sur macOS.
  if (!mac) {
    html = html.replace('<fieldset class="field set"><legend>Sauvegardes de jeux</legend>', `<fieldset class="field set"><legend>Performances</legend>
      <div class="pick"><span class="path" id="pm-path">${esc(s.presentMon || 'PresentMon non indiqué (FPS désactivés)')}</span><button type="button" class="btn btn-ghost" data-act="pick-presentmon">Choisir…</button></div>
      <input type="hidden" name="presentMon" value="${esc(s.presentMon || '')}">
      <small>PresentMon est l’outil gratuit d’Intel qui mesure les FPS (github.com/GameTechDev/PresentMon). Il peut demander de lancer le launcher en administrateur. Processeur, carte graphique et RAM sont mesurés sans rien installer</small>
    </fieldset>
    <fieldset class="field set"><legend>Sauvegardes de jeux</legend>`);
  }
  return html;
};
const _readExtra3 = readExtraSettings;
// eslint-disable-next-line no-global-assign
readExtraSettings = function (f) {
  const o = _readExtra3(f);
  o.liveBanners = !!f.get('liveBanners');
  o.gameTint = !!f.get('gameTint');
  o.presentMon = String(f.get('presentMon') || '');
  o.notify = { ...(o.notify || {}), recaps: !!f.get('n_recaps') };
  setTimeout(() => api.getPrefs().then((p) => { state.prefs = p; S3.tintKey = null; render({ quiet: true }); }), 300);
  return o;
};

// ---------- Tags Steam : page « Tags », tags cliquables sur la fiche ----------
Object.assign(ICONS, { tag: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>' });
VIEWS.tags = () => {
  const list = tagCounts();
  const head = `<div class="toolbar"><div class="stack-6"><h1>Tags</h1><span class="sub">${list.length} tags Steam dans ta bibliothèque · clique pour voir les jeux</span></div>
    ${list.length > TAGS_TOP ? '<label class="search tag-search"><span class="sr-only">Chercher un tag</span><input type="search" id="tag-q" placeholder="Chercher un tag" autocomplete="off"></label>' : ''}</div>`;
  if (!list.length) return head + emptyBox('Pas encore de tags', 'Ils arrivent du magasin Steam juste après la synchronisation');
  const max = list[0][1];
  const chip = ([id, n]) => `<button type="button" class="tag-chip" data-act="tag" data-id="${id}" data-name="${esc(tagName(id).toLowerCase())}" style="--w:${Math.max(6, (n / max) * 100)}%"><span class="nm">${esc(tagName(id))}</span><span class="n num">${n}</span></button>`;
  const top = list.slice(0, TAGS_TOP), rest = list.slice(TAGS_TOP);
  return head + `<div class="tag-cloud" id="tag-cloud">${top.map(chip).join('')}<div class="tag-rest" ${state.tagsAll ? '' : 'hidden'}>${rest.map(chip).join('')}</div></div>
    ${rest.length ? `<button type="button" class="link-btn tag-more" data-act="tags-all">${state.tagsAll ? 'Afficher moins' : `Afficher les ${rest.length} autres`}</button>` : ''}
    <p class="tag-none" hidden>Aucun tag ne correspond</p>`;
};
// Les 30 tags les plus courants d'abord ; la recherche fouille aussi dans les autres
const TAGS_TOP = 30;
document.addEventListener('input', (e) => {
  if (e.target.id !== 'tag-q') return;
  const q = e.target.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cloud = document.getElementById('tag-cloud');
  if (!cloud) return;
  const rest = cloud.querySelector('.tag-rest');
  const more = document.querySelector('.tag-more');
  if (rest) rest.hidden = !q && !state.tagsAll;
  if (more) more.hidden = !!q;
  let any = false;
  cloud.querySelectorAll('.tag-chip').forEach((b) => { const hit = !q || b.dataset.name.normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q); b.hidden = !hit; any = any || hit; });
  document.querySelector('.tag-none').hidden = any;
});
const _sidebarExtrasTags = sidebarExtras;
// eslint-disable-next-line no-global-assign
sidebarExtras = function (all) {
  const r = state.route;
  return _sidebarExtrasTags(all) + `<button type="button" class="nav-item ${r.view === 'tags' ? 'active' : ''}" data-nav="tags" title="Tags">${ICONS.tag}<span class="label">Tags</span></button>`;
};
const _gamePanelsTags = gamePanels;
// eslint-disable-next-line no-global-assign
gamePanels = function (g) {
  const t = (g.tags || []).filter((id) => tagName(id));
  const panel = t.length ? `<section class="panel"><h2>Tags</h2><div class="mood-tags">${t.map((id) => `<button type="button" class="tag-toggle" data-act="tag" data-id="${id}" title="Voir tous les jeux « ${esc(tagName(id))} »">${esc(tagName(id))}</button>`).join('')}</div></section>` : '';
  return panel + _gamePanelsTags(g);
};
const _doActionTags = doAction;
// eslint-disable-next-line no-global-assign
doAction = async function (act, id, el) {
  if (act === 'tag') { state.local.filters = { tag: String(id) }; saveLocal(); return go({ view: 'all' }); }
  if (act === 'tags-all') { state.tagsAll = !state.tagsAll; return render({ quiet: true }); }
  return _doActionTags(act, id, el);
};
