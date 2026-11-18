// CLRE-Launcher : confort d'utilisation. Menu clic droit, recherche tolérante, filtres en pastilles,
// annuler, états vides utiles, erreurs claires, chargements doux, premier lancement guidé.
/* global state, api, VIEWS, ICONS, esc, render, go, back, toast, byId, games, saveLocal, doAction, emptyBox, filterBar, filters,
   FILTERS, STATUSES, statusOf, isFav, myCollections, toggleInCollection, storeOf */

// ---------- Recherche tolérante : sigles, fautes de frappe, lettres dans l'ordre ----------
const normS = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[™®©:'’.,!?()\-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function scoreGame(g, q) {
  const name = normS(g.name);
  if (!q) return 0;
  if (name === q) return 100;
  if (name.startsWith(q)) return 90;
  const words = name.split(' ');
  if (words.some((w) => w.startsWith(q))) return 80;
  if (name.includes(q)) return 70;
  // Sigle : « hk » → Hollow Knight, « cs2 » → Counter-Strike 2, « botw »…
  const initials = words.map((w) => (/^\d+$/.test(w) ? w : w[0])).join('');
  if (initials.startsWith(q) || initials.replace(/\d+/g, '') === q.replace(/\d+/g, '') && q.length >= 2 && /\d/.test(q) === /\d/.test(initials)) return 65;
  const extra = normS(`${g.developer} ${g.publisher}`);
  if (extra.includes(q)) return 50;
  if ((g.tags || []).some((t) => normS(typeof tagName === 'function' ? tagName(t) : '').startsWith(q))) return 35;
  // Fautes de frappe : chaque mot cherché ressemble à un mot du nom
  const qw = q.split(' ');
  const tol = (w) => (w.length <= 3 ? 0 : w.length <= 6 ? 1 : 2);
  if (qw.every((w) => words.some((n) => lev(w, n.slice(0, Math.max(w.length, n.length)), tol(w)) <= tol(w) || (n.length > w.length && lev(w, n.slice(0, w.length), tol(w)) <= tol(w))))) return 45;
  // Lettres dans l'ordre (« dstr » → Death Stranding)
  let i = 0;
  for (const c of name.replace(/ /g, '')) if (c === q.replace(/ /g, '')[i]) i++;
  if (q.length >= 3 && i === q.replace(/ /g, '').length) return 20;
  return 0;
}
// eslint-disable-next-line no-unused-vars
function searchGames(list, raw) {
  const q = normS(raw);
  return list.map((g) => [g, scoreGame(g, q)]).filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1] || (b[0].lastPlayed || 0) - (a[0].lastPlayed || 0)).map(([g]) => g);
}

// ---------- Annuler ----------
let undoTimer = null;
function toastUndo(msg, undo) {
  let t = document.getElementById('toast-undo');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast-undo';
    t.className = 'toast-undo';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  const plain = document.getElementById('toast');
  if (plain) plain.classList.remove('show');
  t.innerHTML = `<span>${esc(msg)}</span><button type="button">Annuler</button><i></i>`;
  t.querySelector('button').onclick = () => { clearTimeout(undoTimer); t.classList.remove('show'); undo(); };
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => t.classList.remove('show'), 5000);
}
const STATUS_LABEL = () => ({ ...STATUSES });
function setStatusFor(key, status) {
  const g = byId(key);
  if (g) g.status = status || '';
  render({ quiet: true });
  api.setSteamStatus(key, status || '').then((r) => {
    if (r && r.queued) toast('Statut enregistré — écriture dans Steam à sa fermeture');
    else if (r && r.error) toast(r.error);
  }).catch((e) => toast(String((e && e.message) || e)));
}
// Statut depuis la fiche (gestionnaire existant) : on retient l'ancien pour pouvoir annuler
window.addEventListener('click', (e) => {
  const t = e.target.closest('[data-status]');
  if (!t) return;
  const key = t.dataset.id;
  const before = statusOf(byId(key) || {});
  setTimeout(() => {
    const after = statusOf(byId(key) || {});
    if (after === before) return;
    const g = byId(key);
    toastUndo(after ? `${g ? g.name : 'Jeu'} · ${STATUS_LABEL()[after]}` : 'Statut retiré', () => setStatusFor(key, before));
  }, 0);
}, true);
const _toggleColl = toggleInCollection;
// eslint-disable-next-line no-global-assign
toggleInCollection = function (id, key, silent) {
  const c = myCollections().find((x) => x.id === id);
  const had = c && c.keys.includes(key);
  _toggleColl(id, key);
  if (silent || !c) return;
  const g = byId(key);
  toastUndo(had ? `Retiré de « ${c.name} »` : `${g ? g.name : 'Jeu'} ajouté à « ${c.name} »`, () => toggleInCollection(id, key, true));
};

// ---------- Menu clic droit sur une jaquette ----------
function closeMenu() { const m = document.getElementById('ctx-menu'); if (m) m.remove(); }
function openMenu(key, x, y) {
  const g = byId(key);
  if (!g) return;
  closeMenu();
  const st = statusOf(g);
  const cols = myCollections();
  const it = (act, label, icon = '', extra = '') => `<button type="button" role="menuitem" data-ctx="${act}" ${extra}>${icon ? `<span class="ic">${icon}</span>` : '<span class="ic"></span>'}<span>${label}</span></button>`;
  const m = document.createElement('div');
  m.id = 'ctx-menu';
  m.className = 'ctx-menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = `<div class="ctx-head">${esc(g.name)}</div>
    ${g.installed || g.managed ? it('play', 'Jouer', ICONS.play) : it('install', 'Installer', ICONS.download)}
    ${it('open', 'Voir la fiche', ICONS.ext)}
    <div class="ctx-sep"></div>
    ${it('fav', isFav(g) ? 'Retirer des favoris' : 'Ajouter aux favoris', isFav(g) ? ICONS.heartFill : ICONS.heart)}
    ${g.store === 'steam' ? `<div class="ctx-sub"><button type="button" role="menuitem" class="has-sub"><span class="ic"></span><span>Statut Steam</span><span class="hint">${esc(st ? STATUSES[st] : 'Aucun')}</span></button>
      <div class="ctx-menu sub">${Object.entries(STATUSES).map(([id, l]) => it('status', l, st === id ? ICONS.ok : '', `data-v="${id}"`)).join('')}${st ? '<div class="ctx-sep"></div>' + it('status', 'Retirer le statut', '', 'data-v=""') : ''}</div></div>
    <div class="ctx-sub"><button type="button" role="menuitem" class="has-sub"><span class="ic"></span><span>Collections Steam</span></button>
      <div class="ctx-menu sub">${cols.map((c) => it('coll', esc(c.name), c.keys.includes(g.key) ? ICONS.ok : '', `data-v="${esc(c.id)}"`)).join('')}${cols.length ? '<div class="ctx-sep"></div>' : ''}${it('newcoll', 'Nouvelle collection…', ICONS.plus)}</div></div>` : ''}
    <div class="ctx-sep"></div>
    ${g.installDir && g.installed ? it('folder', 'Ouvrir le dossier', ICONS.folder) : ''}
    ${it('party-plan', 'Planifier une soirée…')}
    ${api.platform === 'darwin' ? '' : it('shortcut', 'Créer un raccourci sur le Bureau')}
    <div class="ctx-sep"></div>
    ${it('hide', (state.local.hidden || []).includes(g.key) ? 'Ne plus masquer' : 'Masquer ce jeu')}`;
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.min(x, window.innerWidth - r.width - 8)}px`;
  m.style.top = `${Math.min(y, window.innerHeight - r.height - 8)}px`;
  if (x + r.width * 2 + 16 > window.innerWidth) m.classList.add('flip');
  requestAnimationFrame(() => m.classList.add('on'));
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ctx]');
    if (!b) return;
    e.stopPropagation();
    const a = b.dataset.ctx;
    closeMenu();
    if (a === 'open') return go({ view: 'game', id: g.key });
    if (a === 'status') { const before = statusOf(g); setStatusFor(g.key, b.dataset.v); return toastUndo(b.dataset.v ? `${g.name} · ${STATUSES[b.dataset.v]}` : 'Statut retiré', () => setStatusFor(g.key, before)); }
    if (a === 'coll') return toggleInCollection(b.dataset.v, g.key);
    if (a === 'newcoll') return doAction('new-collection-with', g.key);
    return doAction(a, g.key, b);
  });
  const first = m.querySelector('[data-ctx]');
  if (first) first.focus({ preventScroll: true });
}
document.addEventListener('contextmenu', (e) => {
  const card = e.target.closest('[data-open]');
  if (!card || !byId(card.dataset.open)) return;
  e.preventDefault();
  openMenu(card.dataset.open, e.clientX, e.clientY);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('ctx-menu')) { e.stopPropagation(); closeMenu(); return; }
  if ((e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
    const card = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-open]');
    if (card) { e.preventDefault(); const r = card.getBoundingClientRect(); openMenu(card.dataset.open, r.left + 24, r.top + 24); }
  }
  const m = document.getElementById('ctx-menu');
  if (m && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    const items = [...m.querySelectorAll(':scope > [data-ctx], :scope > .ctx-sub > .has-sub')];
    const i = items.indexOf(document.activeElement);
    const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    if (n) n.focus();
  }
}, true);
document.addEventListener('mousedown', (e) => { if (!e.target.closest('#ctx-menu')) closeMenu(); }, true);
document.getElementById('content').addEventListener('scroll', closeMenu, { passive: true });
window.addEventListener('blur', closeMenu);

// Annuler pour « Masquer » et les favoris
const _doAction5 = doAction;
// eslint-disable-next-line no-global-assign
doAction = async function (act, id, el) {
  if (act === 'hide') {
    const before = [...(state.local.hidden || [])];
    const r = await _doAction5(act, id, el);
    const g = byId(id) || (state.lib.games.find((x) => x.key === id));
    const now = (state.local.hidden || []).includes(id);
    toastUndo(now ? `${g ? g.name : 'Jeu'} masqué` : `${g ? g.name : 'Jeu'} visible à nouveau`, () => { state.local.hidden = before; saveLocal(); render({ quiet: true }); });
    return r;
  }
  if (act === 'fav') {
    const r = await _doAction5(act, id, el);
    const g = byId(id);
    toastUndo(g && isFav(g) ? `${g.name} ajouté aux favoris` : `${g ? g.name : 'Jeu'} retiré des favoris`, () => _doAction5('fav', id, el));
    return r;
  }
  if (act === 'clear-filter') { const f = { ...filters() }; delete f[id]; state.local.filters = f; saveLocal(); return render({ quiet: true }); }
  if (act === 'retry') { clearErrors(state.cache); return render({ quiet: true }); }
  if (act === 'nav') return go({ view: id });
  if (act === 'shop-search') { state.shop = { ...state.shop, tab: 'home', q: id, tag: '', count: 40 }; return go({ view: 'shop' }); }
  if (act === 'onboarding') return openOnboarding(true);
  return _doAction5(act, id, el);
};

// ---------- Filtres actifs en pastilles ----------
const _filterBar = filterBar;
// eslint-disable-next-line no-global-assign
filterBar = function () {
  const f = filters();
  const pills = Object.entries(f).filter(([k, v]) => v && FILTERS[k]).map(([k, v]) => {
    const [label, opts] = FILTERS[k];
    const o = opts().find(([val]) => String(val) === String(v));
    const text = o ? String(o[1]).replace(/\s*\(\d+\)$/, '') : v;
    return `<button type="button" class="pill" data-act="clear-filter" data-id="${k}" title="Retirer ce filtre"><span class="pk">${esc(label)}</span>${esc(text)}<span class="px" aria-hidden="true">×</span></button>`;
  });
  const bar = _filterBar();
  if (!pills.length) return bar;
  const i = bar.lastIndexOf('</div>');
  return bar.slice(0, i) + `<div class="pills" aria-label="Filtres actifs">${pills.join('')}</div>` + bar.slice(i);
};

// ---------- Erreurs claires ----------
function friendlyError(msg) {
  const m = String(msg || '');
  if (!navigator.onLine || /fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|getaddrinfo|network|Failed to fetch|ERR_INTERNET/i.test(m)) return ['Pas de connexion internet', 'Ta bibliothèque marche hors ligne. Le magasin, les actus et les infos en ligne reviendront avec la connexion'];
  if (/HTTP 429/.test(m)) return ['Trop de requêtes d’un coup', 'Le service demande de patienter un peu. Réessaie dans une minute'];
  if (/HTTP 5\d\d/.test(m)) return ['Le service ne répond pas', 'Le serveur a un souci de son côté. Réessaie dans quelques minutes'];
  if (/HTTP 40[13]/.test(m)) return ['Accès refusé par le service', 'Ta clé API est peut-être expirée : vérifie-la dans les réglages'];
  if (/HTTP 404/.test(m)) return ['Introuvable', 'Cette page n’existe plus sur le service'];
  return null;
}
function clearErrors(obj) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object' && v.error) delete obj[k];
    else if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'store') clearErrors(v);
    else if (k === 'store' && v && typeof v === 'object') for (const kk of Object.keys(v)) if (v[kk] && v[kk].error) delete v[kk];
  }
}
// Bannière hors ligne
function offlineBanner() {
  let b = document.getElementById('offline-banner');
  if (navigator.onLine) { if (b) b.remove(); return; }
  if (b) return;
  b = document.createElement('div');
  b.id = 'offline-banner';
  b.className = 'offline-banner';
  b.innerHTML = '<span class="dot-off"></span>Hors ligne · tes jeux se lancent normalement, le reste revient avec la connexion';
  document.body.appendChild(b);
}
window.addEventListener('offline', offlineBanner);
window.addEventListener('online', () => { offlineBanner(); clearErrors(state.cache); render({ quiet: true }); toast('De nouveau en ligne'); });
offlineBanner();

// ---------- États vides utiles ----------
const lastPlayed = () => [...games()].filter((g) => g.installed && g.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed)[0];
const _emptyBox = emptyBox;
// eslint-disable-next-line no-global-assign
emptyBox = function (title, text, btn) {
  const fe = friendlyError(text) || (/indisponible/i.test(title) ? friendlyError(text) : null);
  if (fe) return _emptyBox(fe[0], fe[1], `<button type="button" class="btn btn-ghost" data-act="retry">Réessayer</button>`);
  if (btn) return _emptyBox(title, text, btn);
  const r = state.route;
  const lp = lastPlayed();
  const playBtn = (g, label) => (g ? `<button type="button" class="btn btn-light" data-act="play" data-id="${esc(g.key)}">${ICONS.play}${esc(label || `Lancer ${g.name}`)}</button>` : '');
  const nav = (view, label) => `<button type="button" class="btn btn-ghost" data-act="nav" data-id="${view}">${esc(label)}</button>`;
  let extra = '';
  if (r.view === 'search' && state.search) extra = `<button type="button" class="btn btn-ghost" data-act="shop-search" data-id="${esc(state.search)}">Chercher « ${esc(state.search)} » sur le magasin Steam</button>`;
  else if (Object.values(filters()).some(Boolean) && ['all', 'installed', 'favorites', 'store', 'collection', 'mycoll', 'status'].includes(r.view)) extra = `<button type="button" class="btn btn-ghost" data-act="reset-filters">Effacer les filtres</button>`;
  else if (r.view === 'favorites') extra = nav('all', 'Parcourir tous les jeux') + '<small class="empty-hint">Astuce : clic droit sur une jaquette → Ajouter aux favoris</small>';
  else if (r.view === 'mycoll') extra = nav('all', 'Choisir des jeux') + '<small class="empty-hint">Clic droit sur une jaquette → Ajouter à une collection</small>';
  else if (r.view === 'status') extra = nav('all', 'Voir tous les jeux') + '<small class="empty-hint">Clic droit sur une jaquette → Statut</small>';
  else if (['recap', 'journal', 'history'].includes(r.view)) extra = playBtn(lp, lp ? `Reprendre ${lp.name}` : '');
  else if (r.view === 'showcase') extra = playBtn(lp) + nav('all', 'Voir mes jeux');
  else if (r.view === 'downloads') extra = nav('shop', 'Ouvrir le magasin');
  else if (r.view === 'game' && ['perf', 'journal', 'sessions'].includes(r.tab)) { const g = byId(r.id); extra = g && g.installed ? playBtn(g, 'Jouer maintenant') : ''; }
  return _emptyBox(title, text, extra || '');
};

// ---------- Chargements doux ----------
// Les jaquettes apparaissent en fondu une fois chargées (plus de pop ni d'image à moitié dessinée)
document.addEventListener('load', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG') t.classList.add('ok');
}, true);
// Grille de jaquettes fantômes, utilisée par le magasin
// eslint-disable-next-line no-unused-vars
function skelGrid(n = 12, row) {
  return `<div class="${row ? 'shop-row' : 'grid'} skel-grid" aria-hidden="true">${Array.from({ length: n }, () => '<div class="skel-card"><div class="skel-cover"></div><div class="skel-line"></div><div class="skel-line short"></div></div>').join('')}</div>`;
}

// ---------- Premier lancement guidé ----------
function openOnboarding(force) {
  if (document.getElementById('onboard')) return;
  if (!force && state.local.onboarded) return;
  const plats = ((state.lib && state.lib.platforms) || []).filter((p) => p.count);
  const total = plats.reduce((a, p) => a + p.count, 0);
  const el = document.createElement('div');
  el.id = 'onboard';
  el.className = 'onboard';
  const steps = [
    `<div class="ob-step"><div class="ob-logo"><svg width="64" height="64" viewBox="0 0 256 256" aria-hidden="true"><rect x="8" y="8" width="240" height="240" rx="56" fill="#e9a23b"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" opacity="0.4" transform="rotate(-14 128 130)"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" transform="rotate(3 128 130)"/><path d="M114 108 L150 130 L114 152 Z" fill="#f5f5f7" stroke="#f5f5f7" stroke-width="12" stroke-linejoin="round" transform="rotate(3 128 130)"/></svg></div>
      <h2>Bienvenue dans CLRE-Launcher</h2><p>J’ai trouvé <b>${total} jeux</b> sur ton PC, toutes plateformes réunies. Rien à connecter : tout est lu directement sur ta machine.</p>
      <div class="ob-plats">${plats.map((p) => `<span class="ob-plat">${typeof platIcon === 'function' ? platIcon(p.id, 16) : ''}<b>${esc(STORE_NAME[p.id] || p.id)}</b><span>${p.count}</span></span>`).join('')}</div></div>`,
    `<div class="ob-step"><h2>En option</h2><p>Tout marche déjà. Ces options ajoutent des choses en plus :</p>
      <ul class="ob-list">
        <li><b>Clé Steam Web API</b><span>Tes amis en ligne et les succès des jeux jamais lancés. Gratuite sur steamcommunity.com/dev/apikey</span><input id="ob-key" type="password" placeholder="Colle ta clé (facultatif)" autocomplete="off"></li>
        <li><b>Raccourcis utiles</b><span><kbd>Ctrl</kbd> <kbd>K</kbd> pour chercher · clic droit sur une jaquette pour les actions rapides · <kbd>Ctrl</kbd> <kbd>Alt</kbd> <kbd>L</kbd> pour ouvrir le launcher de partout</span></li>
      </ul></div>`,
  ];
  let i = 0;
  el.innerHTML = `<div class="ob-card" role="dialog" aria-modal="true" aria-label="Bienvenue"><div class="ob-body"></div>
    <div class="ob-foot"><div class="ob-dots">${steps.map(() => '<span></span>').join('')}</div>
      <div class="actions"><button type="button" class="btn btn-ghost" data-ob="skip">Passer</button><button type="button" class="btn btn-primary" data-ob="next">Suivant</button></div></div></div>`;
  document.body.appendChild(el);
  const draw = () => {
    el.querySelector('.ob-body').innerHTML = steps[i];
    el.querySelectorAll('.ob-dots span').forEach((d, k) => d.classList.toggle('on', k === i));
    el.querySelector('[data-ob="next"]').textContent = i === steps.length - 1 ? 'C’est parti' : 'Suivant';
  };
  const finish = async () => {
    state.local.onboarded = true;
    saveLocal();
    const key = el.querySelector('#ob-key');
    const patch = {};
    if (key && key.value.trim()) patch.apiKey = key.value.trim();
    if (Object.keys(patch).length) await api.setPrefs(patch);
    el.classList.remove('on');
    setTimeout(() => el.remove(), 300);
    if (patch.apiKey) { toast('Clé enregistrée · resynchronisation…'); if (typeof sync === 'function') sync(true); }
    render({ quiet: true });
  };
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-ob]');
    if (!t) return;
    e.stopPropagation();
    if (t.dataset.ob === 'skip') return finish();
    if (i < steps.length - 1) { i++; draw(); } else finish();
  });
  draw();
  requestAnimationFrame(() => el.classList.add('on'));
}
// Une fois la bibliothèque chargée, au tout premier lancement
// (s'arrête au bout de 2 minutes : avant, il tournait sans fin si la bibliothèque restait vide)
const obStart = Date.now();
const obTimer = setInterval(() => {
  if (state.lib && state.lib.games && state.lib.games.length) { clearInterval(obTimer); setTimeout(() => openOnboarding(false), 600); }
  else if (Date.now() - obStart > 120e3) clearInterval(obTimer);
}, 500);
// Les images déjà en cache au moment du rendu sont marquées tout de suite
const _render5 = render;
// eslint-disable-next-line no-global-assign
render = function (opts) {
  _render5(opts);
  document.querySelectorAll('.cover img:not(.ok)').forEach((i) => { if (i.complete && i.naturalWidth) i.classList.add('ok'); });
};

// ---------- Statut Discord : ce que tu fais dans le launcher ----------
let presTimer = null;
function presenceCtx() {
  const r = state.route;
  const c = { view: r.view, id: r.id || null, tab: r.tab || null, couch: document.body.classList.contains('couch') };
  try {
    if (r.view === 'search') c.extra = state.search;
    if (r.view === 'recap' && typeof recapRange === 'function') c.extra = `${{ week: 'Semaine', month: 'Mois', year: 'Année' }[state.recap.mode] || ''} · ${recapRange().label}`;
    if (r.view === 'showcase') { const sc = state.cache.showcase; if (sc && sc.total) c.extra = `${sc.total} succès débloqués`; }
    if (r.view === 'tags' && typeof tagCounts === 'function') c.extra = `${tagCounts().length} genres dans sa bibliothèque`;
    if (r.view === 'downloads') c.extra = `${dlCount()} en cours`;
    if (r.view === 'wishlist') { const w = state.cache.wishlist; if (w && w.list) c.extra = `${w.list.length} jeux en attente`; }
    if (r.view === 'status') c.extra = STATUSES[r.id];
    if (r.view === 'mycoll') { const m = myCollections().find((x) => x.id === r.id); c.extra = m && m.name; }
    if (r.view === 'collection') { const m = (state.lib.collections || []).find((x) => x.id === r.id); c.extra = m && m.name; }
    if (r.view === 'store') c.extra = STORE_NAME[r.id];
    if (r.view === 'shopapp') {
      const x = state.cache.shopItem && state.cache.shopItem[Number(r.id)];
      if (x && x.name) { c.extra = x.name; c.price = x.price; c.discount = x.discount; c.image = x.header || ''; }
    }
  } catch { /* contexte partiel */ }
  return c;
}
const _render6 = render;
// eslint-disable-next-line no-global-assign
render = function (opts) {
  _render6(opts);
  clearTimeout(presTimer);
  presTimer = setTimeout(() => api.presence(presenceCtx()), 800);
};
// Réglage : montrer ou non la navigation dans le launcher
const _settingsSystem6 = settingsSystem;
// eslint-disable-next-line no-global-assign
settingsSystem = function (prefs) {
  const s = prefs.settings || {};
  return _settingsSystem6(prefs).replace(/(<legend>Statut Discord<\/legend>[\s\S]*?)(<\/fieldset>)/, `$1<label class="check"><input type="checkbox" name="discordBrowse" ${s.discordBrowse !== false ? 'checked' : ''}> Montrer aussi ce que je fais dans le launcher (fiche regardée, magasin, récap…)</label>$2`);
};
const _readExtra6 = readExtraSettings;
// eslint-disable-next-line no-global-assign
readExtraSettings = function (f) { const o = _readExtra6(f); o.discordBrowse = !!f.get('discordBrowse'); return o; };
