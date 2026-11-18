'use strict';
/* Deuxième vague : fiche jeu enrichie, collections et filtres perso, récap, sauvegardes de jeux,
   mods Workshop, options de lancement, raccourcis, personnalisation, notifications, Discord,
   mises à jour et export des données. Chargé après features.js. */

Object.assign(ICONS, {
  save: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>',
  recap: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
  folderPlus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/><path d="M12 10v6M9 13h6"/></svg>',
  eyeOff: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.9 4.2A10 10 0 0 1 12 4c7 0 10 8 10 8a17 17 0 0 1-2.2 3.4M6.6 6.6A17 17 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.4-1.6"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2M2 2l20 20"/></svg>',
  link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  sliders: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/></svg>',
  ok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
});
Object.assign(state.cache, { store: {}, specs: {}, mods: {}, saves: {} });
state.recap = { mode: 'month', offset: 0 };
// L'accent vient du thème (variable --accent) ; les anciens choix enregistrés sont ignorés.
const steamish = (g) => g.store === 'steam' || !!g.steamAppId;

// ---------- Personnalisation ----------
function applyLook() {
  const l = state.local;
  document.documentElement.style.removeProperty('--accent');
  document.body.classList.remove('cover-s', 'cover-m', 'cover-l');
  document.body.classList.add(`cover-${l.coverSize || 'm'}`);
}
const _render = render;
// eslint-disable-next-line no-global-assign
render = function (opts) { applyLook(); _render(opts); };

// ---------- Fenêtre modale générique ----------
function modal(html, onReady) {
  const dlg = $('#settings');
  dlg.innerHTML = `<form class="m-body" method="dialog">${html}</form>`;
  dlg.showModal();
  dlg.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => dlg.close(); });
  if (onReady) onReady(dlg, $('form', dlg));
  return dlg;
}
function askName(title, placeholder, done) {
  modal(`<h2>${esc(title)}</h2><label class="field">Nom<input name="name" required maxlength="40" placeholder="${esc(placeholder)}" autofocus></label>
    <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-light">Créer</button></div>`,
  (dlg, form) => { form.onsubmit = (e) => { e.preventDefault(); const v = new FormData(form).get('name').trim(); if (v) { dlg.close(); done(v); } }; });
}

// ---------- Collections perso ----------
// Les collections sont celles de Steam : pas de liste locale parallèle.
const myCollections = () => {
  const lib = state.lib || {};
  const statusIds = new Set(Object.values(lib.statusMap || {}).filter(Boolean));
  return (lib.collections || [])
    .filter((c) => !statusIds.has(c.id))
    .map((c) => ({ id: c.id, name: c.name, keys: (c.apps || []).map(String), steam: true }));
};
function createCollection(withKey) {
  askName('Nouvelle collection Steam', 'Soirée coop, Jeux courts…', (name) => {
    (async () => {
      try {
        const r = await api.createSteamCollection(name);
        if (withKey && r.id) await api.toggleSteamCollection(r.id, withKey, true);
        await sync(true);
        toast(r.queued ? `Collection « ${name} » créée — sera écrite dans Steam à sa fermeture` : `Collection « ${name} » créée dans Steam`);
      } catch (e) { toast(String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')); }
    })();
  });
}
function toggleInCollection(id, key) {
  const c = myCollections().find((x) => x.id === id);
  const g = byId(key);
  if (!c) return;
  if (!g || g.store !== 'steam') { toast('Seuls les jeux Steam peuvent entrer dans une collection Steam'); return; }
  const on = !c.keys.includes(key);
  const col = (state.lib.collections || []).find((x) => x.id === id);
  if (col) {
    const apps = new Set((col.apps || []).map(String));
    if (on) apps.add(String(g.appid)); else apps.delete(String(g.appid));
    col.apps = [...apps];
  }
  render({ quiet: true });
  api.toggleSteamCollection(id, key, on).then((r) => {
    if (r && r.queued) {
      state.lib.steamPending = r.pending;
      state.lib.steamRunning = true;
      render({ quiet: true });
      toast('Sera écrit dans Steam à sa fermeture');
    } else if (r && r.error) toast(r.error);
  }).catch((e) => toast(String((e && e.message) || e)));
}

function specialList(r, list, title, sub) {
  if (r.view === 'mycoll') {
    const c = myCollections().find((x) => x.id === r.id);
    return { list: c ? list.filter((g) => c.keys.includes(g.key)) : [], title: c ? c.name : 'Collection', sub: 'Ma collection' };
  }
  const hidden = state.local.hidden || [];
  return { list: state.lib.games.filter((g) => hidden.includes(g.key)), title: 'Jeux masqués', sub: 'Ils n’apparaissent nulle part ailleurs' };
}

// ---------- Filtres ----------
const FILTERS = {
  store: ['Plateforme', () => [['', 'Toutes'], ...Object.entries(STORE_NAME).filter(([id]) => games().some((g) => g.store === id))]],
  installed: ['État', () => [['', 'Tous'], ['yes', 'Installés'], ['no', 'Pas installés']]],
  status: ['Statut', () => [['', 'Tous'], ...Object.entries(STATUSES), ['none', 'Sans statut']]],
  mood: ['Ambiance', () => [['', 'Toutes'], ...Object.entries(MOODS)]],
  controller: ['Manette', () => [['', 'Peu importe'], ['full', 'Prise en charge complète'], ['any', 'Au moins partielle']]],
  tag: ['Tag', () => [['', 'Tous'], ...tagCounts().map(([id, n]) => [String(id), `${tagName(id)} (${n})`])]],
};
// Tags Steam présents dans la bibliothèque, du plus courant au plus rare
const tagName = (id) => ((state.lib && state.lib.tagNames) || {})[id] || '';
function tagCounts() {
  const c = new Map();
  for (const g of games()) for (const t of g.tags || []) if (tagName(t)) c.set(t, (c.get(t) || 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1] || tagName(a[0]).localeCompare(tagName(b[0]), 'fr'));
}
const filters = () => state.local.filters || {};
function applyFilters(list) {
  const f = filters();
  return list.filter((g) =>
    (!f.store || g.store === f.store) &&
    (!f.installed || (f.installed === 'yes' ? g.installed : !g.installed)) &&
    (!f.status || (f.status === 'none' ? !statusOf(g) : statusOf(g) === f.status)) &&
    (!f.mood || g.moods.includes(f.mood)) &&
    (!f.controller || (f.controller === 'full' ? g.controller === 'full' : !!g.controller)) &&
    (!f.tag || (g.tags || []).includes(Number(f.tag))));
}
// Barre de filtres : Plateforme et État restent visibles ; les autres sont dans le panneau « Filtres »,
// (les filtres actifs apparaissent en puces, ajoutées par features5.js).
const FILTERS_MAIN = ['store', 'installed'];
function filterBar() {
  const f = filters();
  const sel = (k) => {
    const [label, opts] = FILTERS[k];
    const options = opts().map(([v, l]) => `<option value="${v}" ${String(f[k] || '') === v ? 'selected' : ''}>${v ? l : `${label} : ${l}`}</option>`).join('');
    return `<label class="filter ${f[k] ? 'on' : ''}"><span class="sr-only">${label}</span><select data-filter="${k}">${options}</select></label>`;
  };
  const more = Object.keys(FILTERS).filter((k) => !FILTERS_MAIN.includes(k));
  const moreOn = more.filter((k) => f[k]);
  const active = Object.values(f).some(Boolean);
  return `<div class="filter-bar" role="group" aria-label="Filtres">
    ${FILTERS_MAIN.map(sel).join('')}
    <details class="filter-more"${state.filtersOpen ? ' open' : ''}><summary class="filter-more-btn ${moreOn.length ? 'on' : ''}">Filtres${moreOn.length ? ` <b>${moreOn.length}</b>` : ''}</summary><div class="filter-panel">${more.map(sel).join('')}</div></details>
    ${active ? '<button type="button" class="link-btn" data-act="reset-filters">Effacer</button>' : ''}
  </div>`;
}
// Le panneau reste ouvert pendant qu'on choisit, et se ferme en cliquant ailleurs
document.addEventListener('toggle', (e) => { if (e.target.classList && e.target.classList.contains('filter-more')) state.filtersOpen = e.target.open; }, true);
document.addEventListener('click', (e) => { const d = document.querySelector('.filter-more[open]'); if (d && !d.contains(e.target)) { d.open = false; state.filtersOpen = false; } });

// ---------- Barre latérale ----------
const _sidebarExtras = sidebarExtras;
// eslint-disable-next-line no-global-assign
sidebarExtras = function (all) {
  const r = state.route;
  const item = (view, icon, label) => `<button type="button" class="nav-item ${r.view === view ? 'active' : ''}" data-nav="${view}" title="${label}">${icon}<span class="label">${label}</span></button>`;
  return _sidebarExtras(all) + item('recap', ICONS.recap, 'Récap') + item('saves', ICONS.save, 'Sauvegardes');
};
const _sidebarProgress = sidebarProgress;
// eslint-disable-next-line no-global-assign
sidebarProgress = function (all) {
  const r = state.route;
  const cols = myCollections();
  const hidden = (state.local.hidden || []).length;
  return _sidebarProgress(all) + `<div class="nav-gap"></div><p class="nav-title nav-title-row">Mes collections<button type="button" class="mini-btn" data-act="new-collection" aria-label="Nouvelle collection" title="Nouvelle collection">${ICONS.plus}</button></p>` +
    (cols.length ? cols.map((c) => `<button type="button" class="nav-item small ${r.view === 'mycoll' && r.id === c.id ? 'active' : ''}" data-nav="mycoll" data-id="${esc(c.id)}"><span class="dot"></span><span class="label">${esc(c.name)}</span><span class="count">${c.keys.length || ''}</span></button>`).join('') : '<p class="nav-hint">Range tes jeux à ta façon</p>') +
    (hidden ? `<button type="button" class="nav-item small ${r.view === 'hidden' ? 'active' : ''}" data-nav="hidden"><span class="dot"></span><span class="label">Jeux masqués</span><span class="count">${hidden}</span></button>` : '');
};

// ---------- Fiche jeu enrichie ----------
const CHECKS = [
  [/m[ée]moire vive|^m[ée]moire$|ram/i, (s, v) => { const need = sizeGbTxt(v); return need == null ? null : [s.ramGb >= need, `${s.ramGb} Go`]; }],
  [/espace disque|stockage/i, (s, v) => { const need = sizeGbTxt(v); return need == null || s.freeGb == null ? null : [s.freeGb >= need, `${Math.round(s.freeGb)} Go libres`]; }],
  [/processeur/i, (s) => [null, s.cpu]],
  [/graphiques|carte graphique/i, (s) => [null, s.gpus.join(', ')]],
  [/syst[eè]me/i, (s) => [null, s.os]],
];
function sizeGbTxt(v) {
  const m = String(v || '').replace(',', '.').match(/(\d+(?:\.\d+)?)\s*(TB|To|GB|Go|MB|Mo)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return /T/i.test(m[2]) ? n * 1024 : /M/i.test(m[2]) ? n / 1024 : n;
}
function requirementsTable(d, s) {
  const labels = [...new Set([...d.min, ...d.rec].map((r) => r.label).filter(Boolean))];
  if (!labels.length) return '';
  const val = (rows, l) => (rows.find((r) => r.label === l) || {}).value || '—';
  return `<section class="panel req">
    <div class="section-head"><h2>Configuration requise</h2>${s && s !== 'loading' ? `<span class="m">Ton PC : ${esc(s.cpu.replace(/\(R\)|\(TM\)|CPU|Processor/g, '').replace(/\s+/g, ' ').trim())} · ${s.ramGb} Go · ${esc(s.gpus[0] || '')}</span>` : ''}</div>
    <div class="req-grid ${d.rec.length ? '' : 'no-rec'}">
      <span class="h"></span><span class="h">Minimum</span>${d.rec.length ? '<span class="h">Recommandé</span>' : ''}<span class="h">Ton PC</span>
      ${labels.map((l) => {
        const check = s && s !== 'loading' ? (CHECKS.find(([re]) => re.test(l)) || [, () => null])[1](s, val(d.rec.length ? d.rec : d.min, l) === '—' ? val(d.min, l) : val(d.min, l)) : null;
        const mine = check ? `${check[0] === true ? `<span class="okk">${ICONS.ok}</span>` : check[0] === false ? '<span class="ko">Insuffisant</span> ' : ''}${esc(check[1] || '')}` : '<span class="m">—</span>';
        return `<span class="k">${esc(l)}</span><span>${esc(val(d.min, l))}</span>${d.rec.length ? `<span>${esc(val(d.rec, l))}</span>` : ''}<span class="mine">${mine}</span>`;
      }).join('')}
    </div></section>`;
}
function richOverview(g) {
  if (!steamish(g)) return '';
  const d = load('store', g.key, () => api.storeDetails(g.key));
  if (d === 'loading') return loading();
  if (!d || d.error) return '';
  const s = load('specs', g.key, () => api.pcSpecs(g.key));
  const movie = d.movies[0];
  const tags = [...new Set([...d.genres, ...d.categories.filter((c) => /coop|multi|contrôleur|joueur/i.test(c))])].slice(0, 8);
  return `<section class="about">
      ${movie ? `<div class="trailer"><video controls preload="none" poster="${esc(movie.thumb)}" data-hls="${esc(movie.hls)}" data-mp4="${esc(movie.mp4)}" aria-label="${esc(movie.name)}"></video></div>` : ''}
      <div class="about-text">
        <p class="lead">${esc(d.short)}</p>
        ${tags.length ? `<div class="mood-tags">${tags.map((t) => `<span class="mood-tag">${esc(t)}</span>`).join('')}</div>` : ''}
        ${d.about ? `<details class="more"><summary>Lire la description</summary><div class="about-body">${d.about.split('\n').map((p) => `<p>${esc(p)}</p>`).join('')}</div></details>` : ''}
        <div class="meta-row">${d.release ? `<span>Sortie : ${esc(d.release)}</span>` : ''}${d.metacritic ? `<span>Metacritic ${d.metacritic}</span>` : ''}${d.website ? `<span><button type="button" class="link-btn" data-url="${esc(d.website)}">Site officiel</button></span>` : ''}</div>
      </div>
    </section>
    ${d.screenshots.length ? `<section class="stack"><h2 class="section">Captures officielles</h2><div class="gallery">${d.screenshots.map((x, i) => `<button type="button" class="shot" data-gallery="${i}" data-id="${g.key}"><img src="${esc(x.thumb)}" alt="Capture ${i + 1}" loading="lazy"></button>`).join('')}</div></section>` : ''}
    ${requirementsTable(d, s)}`;
}

function gamePanels(g) {
  const cols = myCollections();
  const o = load('launch', g.key, () => api.getLaunchOpts(g.key));
  const custom = !!g.coverCustom;
  const hasOpts = o && o !== 'loading' && (o.args || (o.open || []).length || (o.close || []).length);
  return `<section class="panel">
      <h2>Mes collections</h2>
      ${cols.length ? `<div class="mood-tags">${cols.map((c) => `<button type="button" class="tag-toggle ${c.keys.includes(g.key) ? 'on' : ''}" data-coll-toggle="${esc(c.id)}" data-id="${g.key}">${c.keys.includes(g.key) ? ICONS.ok : ''}${esc(c.name)}</button>`).join('')}</div>` : ''}
      <button type="button" class="btn btn-ghost" data-act="new-collection-with" data-id="${g.key}">${ICONS.plus}Nouvelle collection</button>
    </section>
    <section class="panel">
      <h2>Lancement</h2>
      ${hasOpts ? `<p class="small">${[o.args ? `Arguments : <code>${esc(o.args)}</code>` : '', (o.open || []).length ? `Ouvre ${o.open.map((x) => esc(x.split(/[\\/]/).pop())).join(', ')}` : '', (o.close || []).length ? `Ferme ${o.close.map(esc).join(', ')}` : ''].filter(Boolean).join('<br>')}</p>` : ''}
      <div class="btn-col">
        <button type="button" class="btn btn-ghost" data-act="launch-opts" data-id="${g.key}">${ICONS.sliders}Options de lancement</button>
        ${api.platform === 'darwin' ? '' : `<button type="button" class="btn btn-ghost" data-act="shortcut" data-id="${g.key}">${ICONS.link}Raccourci sur le Bureau</button>`}
        <button type="button" class="btn btn-ghost" data-act="cover" data-id="${g.key}">${ICONS.image}${custom ? 'Changer la jaquette' : 'Jaquette perso'}</button>
        ${custom ? `<button type="button" class="btn btn-ghost" data-act="cover-reset" data-id="${g.key}">Jaquette d’origine</button>` : ''}
        <button type="button" class="btn btn-ghost" data-act="hide" data-id="${g.key}">${ICONS.eyeOff}${(state.local.hidden || []).includes(g.key) ? 'Ne plus masquer' : 'Masquer ce jeu'}</button>
      </div>
    </section>`;
}

function openLaunchOpts(key) {
  const g = byId(key);
  api.getLaunchOpts(key).then((o) => {
    const open = [...(o.open || [])];
    const argsOk = ['steam', 'gog', 'custom'].includes(g.store);
    modal(`<h2>Options de lancement</h2><p>${esc(g.name)}</p>
      <label class="field">Arguments${argsOk ? '' : ' (non pris en charge par cette plateforme)'}<input name="args" value="${esc(o.args || '')}" placeholder="-windowed -novid" ${argsOk ? '' : 'disabled'}></label>
      <div class="field">Ouvrir avant de jouer<div id="open-list" class="pick-list"></div><button type="button" class="btn btn-ghost" id="add-open">${ICONS.plus}Ajouter une appli (Discord, OBS…)</button></div>
      <label class="field">Fermer avant de jouer<input name="close" value="${esc((o.close || []).join(', '))}" placeholder="${api.platform === 'darwin' ? 'Google Chrome, Discord' : 'chrome.exe, OneDrive.exe'}"><small>Noms de processus séparés par des virgules. Ces applis sont fermées proprement au lancement</small></label>
      <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-light">Enregistrer</button></div>`,
    (dlg, form) => {
      const draw = () => { $('#open-list', dlg).innerHTML = open.map((p, i) => `<div class="pick"><span class="path">${esc(p)}</span><button type="button" class="btn btn-ghost" data-rm="${i}">Retirer</button></div>`).join(''); };
      draw();
      $('#open-list', dlg).onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { open.splice(+b.dataset.rm, 1); draw(); } };
      $('#add-open', dlg).onclick = async () => { const p = await api.pickExe(); if (p) { open.push(p); draw(); } };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const f = new FormData(form);
        await api.setLaunchOpts(key, { args: f.get('args') || '', open, close: String(f.get('close') || '').split(',').map((s) => s.trim()).filter(Boolean) });
        delete state.cache.launch[key];
        dlg.close();
        toast('Options de lancement enregistrées');
        render({ quiet: true });
      };
    });
  });
}
state.cache.launch = {};

// ---------- Visionneuse de captures ----------
function openGallery(key, index) {
  const d = state.cache.store[key];
  if (!d || !d.screenshots) return;
  let i = index;
  const box = document.createElement('div');
  box.className = 'lightbox';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Captures');
  const draw = () => { box.innerHTML = `<img src="${esc(d.screenshots[i].full)}" alt="Capture ${i + 1}"><button type="button" class="lb-prev" aria-label="Précédente">‹</button><button type="button" class="lb-next" aria-label="Suivante">›</button><span class="lb-count">${i + 1} / ${d.screenshots.length}</span>`; };
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey, true); };
  const step = (n) => { i = (i + n + d.screenshots.length) % d.screenshots.length; draw(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
  box.onclick = (e) => { if (e.target.closest('.lb-prev')) step(-1); else if (e.target.closest('.lb-next')) step(1); else close(); };
  document.addEventListener('keydown', onKey, true);
  draw();
  document.body.appendChild(box);
}

// ---------- Trailers (HLS) ----------
// Lecteurs HLS des bandes-annonces lancées : détruits dès que la vidéo quitte la page
// (changement de fiche, redessin), sinon le téléchargement et le tampon continuaient en fond.
const trailerPlayers = new Map(); // <video> -> Hls
new MutationObserver(() => {
  for (const [v, h] of trailerPlayers) if (!v.isConnected) { h.destroy(); trailerPlayers.delete(v); }
  document.querySelectorAll('video[data-hls]:not([data-ready])').forEach((v) => {
    v.dataset.ready = '1';
    v.addEventListener('play', () => {
      if (v.dataset.loaded) return;
      v.dataset.loaded = '1';
      if (v.dataset.hls && window.Hls && Hls.isSupported()) {
        const h = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 30 });
        h.loadSource(v.dataset.hls);
        h.attachMedia(v);
        h.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
        trailerPlayers.set(v, h);
      } else if (v.dataset.mp4) { v.src = v.dataset.mp4; v.play().catch(() => {}); }
    }, { once: false });
  });
}).observe(document.getElementById('view'), { childList: true, subtree: true });

// ---------- Onglets en plus : sauvegardes et mods ----------
const _gameTabs = gameTabs;
// eslint-disable-next-line no-global-assign
gameTabs = function (g) {
  let html = _gameTabs(g);
  const tab = state.route.tab || 'overview';
  const extra = [['saves', 'Sauvegardes'], ...(g.store === 'steam' ? [['mods', 'Mods']] : [])];
  return html.replace('</nav>', extra.map(([id, l]) => `<button type="button" class="${tab === id ? 'on' : ''}" data-tab="${id}">${l}</button>`).join('') + '</nav>');
};
const _gameTabContent = gameTabContent;
// eslint-disable-next-line no-global-assign
gameTabContent = function (g) {
  const tab = state.route.tab;
  if (tab === 'mods') {
    const m = load('mods', g.key, () => api.workshop(g.key));
    if (m === 'loading') return loading();
    if (!m.length) return emptyBox('Aucun mod installé', 'Les mods du Steam Workshop auxquels tu es abonné apparaissent ici', `<button type="button" class="btn btn-ghost" data-steam="steam://url/SteamWorkshopPage/${g.appid}">Ouvrir le Workshop</button>`);
    const total = m.reduce((s, x) => s + x.size, 0);
    return `<section class="stack"><div class="section-head"><h2 class="section">${m.length} mod${m.length > 1 ? 's' : ''} · ${fmtSize(total)}</h2><button type="button" class="link-btn" data-steam="steam://url/SteamWorkshopPage/${g.appid}">Ouvrir le Workshop</button></div>
      <div class="list">${m.map((x) => `<div class="mod-row">${x.preview ? `<img src="${esc(x.preview)}" alt="" loading="lazy">` : '<span class="mod-ph"></span>'}<div class="info"><span class="t">${esc(x.title)}</span><span class="s">Mis à jour ${esc(fmtRel(x.updated).toLowerCase())}</span></div><span class="m">${fmtSize(x.size)}</span><button type="button" class="btn btn-ghost" data-mod="${x.id}">Page</button></div>`).join('')}</div></section>`;
  }
  if (tab === 'saves') {
    if (api.platform === 'darwin') return emptyBox('Sauvegardes pas encore disponibles sur macOS', 'La base communautaire Ludusavi ne fournit pas les emplacements macOS. La copie automatique est désactivée sur cette plateforme');
    const s = load('saves', g.key, () => api.savesFind(g.key));
    if (s === 'loading') return `<section class="panel"><h2>Recherche des sauvegardes…</h2><p class="small">La première fois, le launcher télécharge la base communautaire Ludusavi (environ 20 Mo)</p></section>`;
    if (s.error) return emptyBox('Sauvegardes indisponibles', s.error);
    if (!s.known) return emptyBox('Jeu inconnu de la base des sauvegardes', 'La base Ludusavi ne sait pas où ce jeu range ses sauvegardes');
    return `<section class="panel">
        <div class="section-head"><h2>Sur ce PC</h2><span class="m">${s.paths.length ? fmtSize(s.total) : ''}</span></div>
        ${s.cloud ? '<p class="small">Ce jeu synchronise déjà ses sauvegardes dans le cloud de sa plateforme. Une copie locale reste utile en cas de conflit</p>' : ''}
        ${s.paths.length ? s.paths.map((p, i) => `${i ? '<div class="sep"></div>' : ''}<div class="kv"><span title="${esc(p.path)}">${esc(p.path)}</span><span>${fmtSize(p.size)}</span></div>`).join('') : '<p class="small">Aucune sauvegarde trouvée : lance le jeu au moins une fois</p>'}
        ${s.registry && api.platform !== 'darwin' ? '<p class="small">Une partie des réglages est dans le registre Windows, non copiée</p>' : ''}
        <div class="actions"><button type="button" class="btn btn-light" data-act="backup" data-id="${g.key}" ${s.paths.length ? '' : 'disabled'}>${ICONS.save}Sauvegarder maintenant</button><button type="button" class="btn btn-ghost" data-act="open-backups" data-id="${g.key}">Ouvrir le dossier</button></div>
      </section>
      <section class="panel"><h2>Copies (${s.backups.length})</h2>
        ${s.backups.length ? s.backups.map((b, i) => `${i ? '<div class="sep"></div>' : ''}<div class="kv backup-row"><span>${new Date(b.time * 1000).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${esc(b.reason || 'manuel')}</span><span>${fmtSize(b.size)} <button type="button" class="btn btn-ghost" data-act="restore" data-id="${g.key}" data-snap="${esc(b.id)}">Restaurer</button></span></div>`).join('') : '<p class="small">Pas encore de copie. Les copies se font aussi automatiquement à la fin de chaque partie (10 gardées par jeu)</p>'}
      </section>`;
  }
  return _gameTabContent(g);
};

// ---------- Vue Sauvegardes ----------
VIEWS.saves = () => {
  const head = `<div class="toolbar"><div class="stack-6"><h1>Sauvegardes</h1><span class="sub">Copie de tes sauvegardes de jeux, avec la base communautaire Ludusavi</span></div><button type="button" class="btn btn-ghost" data-act="open-backups">Ouvrir le dossier</button></div>`;
  if (api.platform === 'darwin') return head + emptyBox('Sauvegardes pas encore disponibles sur macOS', 'La base communautaire Ludusavi ne fournit pas les emplacements macOS. La copie automatique est désactivée sur cette plateforme');
  const o = load('savesAll', null, () => api.savesOverview());
  if (o === 'loading') return head + `<section class="panel"><h2>Préparation…</h2><p class="small">La première fois, le launcher télécharge la base des emplacements de sauvegarde (environ 20 Mo)</p></section>`;
  if (o.error) return head + emptyBox('Sauvegardes indisponibles', o.error);
  if (!o.length) return head + emptyBox('Aucun jeu reconnu', 'Aucun de tes jeux installés n’est dans la base des sauvegardes');
  const done = o.filter((x) => x.count).length;
  return head + `<p class="section-sub">${o.length} jeux reconnus · ${done} déjà copiés · copie automatique à la fin de chaque partie</p>
    <div class="list">${o.map((x) => { const g = byId(x.key); return `<div class="row-item save-row" data-open="${esc(x.key)}" tabindex="0">
      <img src="${esc(g ? g.art.header : '')}" alt="" loading="lazy"><span class="t"><span>${esc(x.name)}</span></span>
      <span class="m">${x.cloud ? 'Cloud de la plateforme' : 'Local seulement'}</span>
      <span class="m">${x.count ? `${x.count} copie${x.count > 1 ? 's' : ''} · ${esc(fmtRel(x.last).toLowerCase())}` : 'Jamais copié'}</span>
      <span><button type="button" class="btn btn-ghost" data-act="backup" data-id="${esc(x.key)}">Sauvegarder</button></span></div>`; }).join('')}</div>`;
};

// ---------- Récap ----------
function recapRange() {
  const r = state.recap;
  const d = new Date();
  if (r.mode === 'year') {
    const y = d.getFullYear() + r.offset;
    return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1), label: String(y), file: `recap-${y}` };
  }
  const m = new Date(d.getFullYear(), d.getMonth() + r.offset, 1);
  const label = m.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return { from: m, to: new Date(m.getFullYear(), m.getMonth() + 1, 1), label: label[0].toUpperCase() + label.slice(1), file: `recap-${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}` };
}
VIEWS.recap = () => {
  const sessions = load('sessions', null, () => api.sessions());
  const r = state.recap;
  const range = recapRange();
  const from = range.from.getTime() / 1000, to = range.to.getTime() / 1000;
  const head = `<div class="toolbar"><div class="stack-6"><h1>Récap</h1><span class="sub">Ton temps de jeu suivi par le launcher</span></div>
    <div class="actions"><div class="seg-chips"><button type="button" class="${r.mode === 'month' ? 'on' : ''}" data-recap-mode="month">Mois</button><button type="button" class="${r.mode === 'year' ? 'on' : ''}" data-recap-mode="year">Année</button></div>
    <div class="seg-chips"><button type="button" data-recap-step="-1" aria-label="Période précédente">‹</button><button type="button" data-recap-step="1" aria-label="Période suivante" ${r.offset >= 0 ? 'disabled' : ''}>›</button></div></div></div>`;
  if (sessions === 'loading') return head + loading();
  const list = (Array.isArray(sessions) ? sessions : []).filter((s) => s.end > from && s.start < to);
  if (!list.length) return head + emptyBox(`Rien en ${range.label.toLowerCase()}`, 'Les sessions sont enregistrées depuis l’ajout du suivi. Lance une partie et reviens ici');
  const dur = (s) => Math.min(s.end, to) - Math.max(s.start, from);
  const total = list.reduce((a, s) => a + dur(s), 0);
  const byGame = {};
  for (const s of list) byGame[s.key] = (byGame[s.key] || 0) + dur(s);
  const top = Object.entries(byGame).sort((a, b) => b[1] - a[1]);
  const topGame = byId(top[0][0]) || { name: top[0][0], art: {} };
  const days = new Set(list.map((s) => new Date(s.start * 1000).toDateString()));
  // Plus longue série de jours consécutifs
  const sorted = [...days].map((d) => new Date(d).getTime()).sort((a, b) => a - b);
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) { cur = Math.round((sorted[i] - sorted[i - 1]) / 864e5) === 1 ? cur + 1 : 1; best = Math.max(best, cur); }
  const wd = [0, 0, 0, 0, 0, 0, 0];
  const hours = [0, 0, 0, 0];
  for (const s of list) { const t = new Date(s.start * 1000); wd[t.getDay()] += dur(s); hours[Math.floor(t.getHours() / 6)] += dur(s); }
  const wdName = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][wd.indexOf(Math.max(...wd))];
  const slot = ['la nuit', 'le matin', 'l’après-midi', 'le soir'][hours.indexOf(Math.max(...hours))];
  // Barres : par jour (mois) ou par mois (année)
  const buckets = r.mode === 'year' ? 12 : Math.round((to - from) / 86400);
  const vals = Array(buckets).fill(0);
  for (const s of list) {
    const t = new Date(Math.max(s.start, from) * 1000);
    const i = r.mode === 'year' ? t.getMonth() : t.getDate() - 1;
    if (i >= 0 && i < buckets) vals[i] += dur(s);
  }
  const max = Math.max(...vals, 1);
  const peak = vals.indexOf(Math.max(...vals));
  return head + `<div class="recap-wrap"><article class="recap-card" id="recap-card">
      <header><span class="recap-brand"><svg width="20" height="20" viewBox="0 0 256 256" aria-hidden="true"><rect x="8" y="8" width="240" height="240" rx="56" fill="#e9a23b"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" opacity="0.4" transform="rotate(-14 128 130)"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" transform="rotate(3 128 130)"/><path d="M114 108 L150 130 L114 152 Z" fill="#f5f5f7" stroke="#f5f5f7" stroke-width="12" stroke-linejoin="round" transform="rotate(3 128 130)"/></svg>CLRE-Launcher</span><span>${esc(range.label)}</span></header>
      <div class="recap-hero">
        <div class="recap-total"><span class="k">Temps de jeu</span><span class="v">${fmtDur(total)}</span><span class="s">${list.length} session${list.length > 1 ? 's' : ''} · ${top.length} jeu${top.length > 1 ? 'x' : ''} · ${days.size} jour${days.size > 1 ? 's' : ''} joué${days.size > 1 ? 's' : ''}</span></div>
        <div class="recap-top">${topGame.art.cover ? `<img src="${esc(topGame.art.cover)}" alt="">` : ''}<div><span class="k">Jeu le plus joué</span><span class="t">${esc(topGame.name)}</span><span class="s">${fmtDur(top[0][1])} · ${Math.round((top[0][1] / total) * 100)} % de ton temps</span></div></div>
      </div>
      <div class="recap-bars" aria-hidden="true">${vals.map((v, i) => `<span class="${i === peak ? 'peak' : ''}" style="height:${v ? Math.max(4, (v / max) * 100) : 0}%"></span>`).join('')}</div>
      <div class="recap-facts">
        <div><span class="k">Plus longue série</span><span class="v">${best} jour${best > 1 ? 's' : ''}</span></div>
        <div><span class="k">Jour préféré</span><span class="v">Le ${wdName}</span></div>
        <div><span class="k">Moment préféré</span><span class="v">${slot[0].toUpperCase() + slot.slice(1)}</span></div>
      </div>
      <ol class="recap-list">${top.slice(1, 5).map(([k, s]) => { const g = byId(k); return `<li><span>${esc(g ? g.name : k)}</span><span>${fmtDur(s)}</span></li>`; }).join('')}</ol>
    </article>
    <div class="actions"><button type="button" class="btn btn-light" data-act="export-recap" data-file="${range.file}">Enregistrer en image</button></div></div>`;
};

// ---------- Réglages en plus ----------
const _settingsSystem = settingsSystem;
// eslint-disable-next-line no-global-assign
settingsSystem = function (prefs) {
  const s = prefs.settings || { notify: {} };
  const n = s.notify || {};
  const cb = (name, on, label) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}> ${label}</label>`;
  const l = state.local;
  const ch = s.crosshair || {};
  const cs = CrosshairDraw.normalize(ch.style);
  const chRange = (name, label, v, min, max, unit = ' px') => `<label class="field-row">${label} <span class="ch-range"><input type="range" name="${name}" min="${min}" max="${max}" step="1" value="${v}"><output>${v}${unit}</output></span></label>`;
  const mac = api.platform === 'darwin';
  let html = _settingsSystem(prefs) + `
  <fieldset class="field set"><legend>Apparence</legend>
    <div class="seg-chips" role="radiogroup" aria-label="Taille des jaquettes">${[['s', 'Petites'], ['m', 'Moyennes'], ['l', 'Grandes']].map(([id, lab]) => `<label class="seg-radio"><input type="radio" name="coverSize" value="${id}" ${(l.coverSize || 'm') === id ? 'checked' : ''}><span>${lab}</span></label>`).join('')}</div>
  </fieldset>
  <fieldset class="field set"><legend>Notifications</legend>
    ${cb('n_downloads', n.downloads, 'Téléchargement terminé')}
    ${cb('n_promos', n.promos, 'Promo sur ma liste de souhaits, jeu gratuit sur Epic')}
    ${cb('n_storage', n.storage, 'Disque presque plein')}
    ${cb('n_party', n.party !== false, 'Rappel de mes soirées jeu')}
    ${cb('n_friends', n.friends, 'Un ami lance un jeu que j’ai (clé API requise)')}
    ${cb('n_updates', n.updates, 'Mise à jour pour un jeu « En cours »')}
  </fieldset>
  <fieldset class="field set"><legend>Infos en jeu</legend>
    ${cb('ov_enabled', (s.overlay || {}).enabled !== false, `Afficher l’heure et le temps de session avec ${mac ? '⌘ + ⌥ + O' : 'Ctrl + Alt + O'}`)}
    <label class="field-row">Rappel de pause
      <select name="ov_pause" class="select">${[[0, 'Jamais'], [60, 'Toutes les heures'], [90, 'Toutes les 1 h 30'], [120, 'Toutes les 2 h'], [180, 'Toutes les 3 h']].map(([v, lab]) => `<option value="${v}" ${Number((s.overlay || {}).pauseMin ?? 120) === v ? 'selected' : ''}>${lab}</option>`).join('')}</select>
    </label>
    <small>S’affiche par-dessus les jeux en mode fenêtré sans bordure. En plein écran exclusif, le système le cache</small>
  </fieldset>
  <fieldset class="field set"><legend>Réticule</legend>
    ${cb('ch_enabled', ch.enabled !== false, `Activer le réticule avec ${mac ? 'Cmd + Alt + X' : 'Ctrl + Alt + X'}`)}
    <div class="ch-preview"><canvas id="ch-canvas" width="240" height="120" aria-label="Aperçu du réticule"></canvas></div>
    <div class="seg-chips" role="radiogroup" aria-label="Forme du réticule">${[['cross', 'Croix'], ['t', 'T'], ['dot', 'Point'], ['circle', 'Cercle']].map(([id, lab]) => `<label class="seg-radio"><input type="radio" name="ch_shape" value="${id}" ${cs.shape === id ? 'checked' : ''}><span>${lab}</span></label>`).join('')}</div>
    <label class="field-row">Couleur <input type="color" name="ch_color" value="${esc(cs.color)}" class="ch-color"></label>
    ${chRange('ch_size', 'Longueur', cs.size, 1, 40)}
    ${chRange('ch_thickness', 'Épaisseur', cs.thickness, 1, 10)}
    ${chRange('ch_gap', 'Écart au centre', cs.gap, 0, 30)}
    ${chRange('ch_outline', 'Contour noir', cs.outline, 0, 3)}
    ${chRange('ch_opacity', 'Opacité', Math.round(cs.opacity * 100), 10, 100, ' %')}
    ${cb('ch_dot', cs.dot, 'Point au centre')}
    <div class="ch-games" id="ch-games"></div>
    <input type="hidden" name="ch_games" value="${esc(JSON.stringify(ch.games || {}))}">
    <small>Appuie sur Ctrl + Alt + X dans un jeu : le réticule s’y affichera tout seul les fois suivantes. Rien n’est injecté dans le jeu, mais vérifie les règles des jeux compétitifs. Ne s’affiche pas en plein écran exclusif</small>
  </fieldset>
  <fieldset class="field set"><legend>Sauvegardes de jeux</legend>
    <div class="pick"><span class="path" id="backup-dir">${esc(s.backupDir || '')}</span><button type="button" class="btn btn-ghost" id="pick-backup">Changer…</button></div>
    <input type="hidden" name="backupDir" value="${esc(s.backupDir || '')}">
    ${cb('autoBackup', s.autoBackup, 'Copier automatiquement à la fin de chaque partie')}
    <small>Choisis un dossier OneDrive ou Google Drive pour les retrouver sur un autre PC</small>
  </fieldset>
  <fieldset class="field set"><legend>Statut Discord</legend>
    <label class="check"><input type="checkbox" name="discordEnabled" ${s.discordEnabled !== false ? 'checked' : ''}> Afficher « Joue à … » sur mon profil Discord</label>
    <input name="discordId" value="${esc(s.discordId && s.discordId !== s.discordAppIdDefault ? s.discordId : '')}" placeholder="Application CLRE-Launcher intégrée" inputmode="numeric">
    <small>Rien à régler : l’application Discord de CLRE-Launcher est intégrée, avec son logo. Tu peux mettre l’ID d’une autre application Discord si tu veux la tienne</small>
  </fieldset>
  <fieldset class="field set"><legend>Mises à jour du launcher</legend>
    <div class="pick"><input name="updateRepo" value="${esc(s.updateRepo || '')}" placeholder="propriétaire/depot sur GitHub"><button type="button" class="btn btn-ghost" id="check-update">Vérifier</button></div>
    <small id="update-status">Version installée : <span id="app-version"></span>. Le launcher cherche les nouvelles versions publiées sur ce dépôt</small>
  </fieldset>
  <fieldset class="field set"><legend>Collections Steam</legend>
    <p class="small">${(state.lib && state.lib.steamRunning) ? 'Steam est ouvert : les changements sont mis en attente et écrits à sa fermeture.' : 'Steam est fermé : les changements sont écrits immédiatement.'}</p>
    <p class="small">${(state.lib && state.lib.steamPending) ? `${state.lib.steamPending} changement(s) en attente.` : 'Aucun changement en attente.'}</p>
    ${(state.lib && state.lib.steamPending) ? '<button type="button" class="btn btn-light" data-steam-apply>Fermer Steam et appliquer</button>' : ''}
    <p class="small">Statuts associés : ${Object.values((state.lib && state.lib.statusLabels) || {}).filter(Boolean).map(esc).join(' · ') || 'aucun'}</p>
    <p class="small">Les collections dynamiques (filtres) sont gérées par Steam et ne sont jamais modifiées.</p>
  </fieldset>
  <fieldset class="field set"><legend>Mes données</legend>
    <div class="actions"><button type="button" class="btn btn-ghost" id="export-data">Exporter</button><button type="button" class="btn btn-ghost" id="import-data">Importer</button></div>
    <small>Statuts, notes, collections, sessions, jeux ajoutés et options de lancement, dans un seul fichier</small>
  </fieldset>`;
  if (mac) {
    // Pas encore d'implémentation macOS : on masque plutôt que d'afficher des réglages sans effet.
    for (const legend of ['Réticule', 'Sauvegardes de jeux', 'Mises à jour du launcher']) {
      html = html.replace(new RegExp(`<fieldset class="field set"><legend>${legend}</legend>[\\s\\S]*?</fieldset>`), '');
    }
  }
  return html;
};
// Réglages du réticule lus dans le formulaire
function crosshairStyle(f) {
  return CrosshairDraw.normalize({ shape: f.get('ch_shape'), color: f.get('ch_color'), size: f.get('ch_size'), thickness: f.get('ch_thickness'), gap: f.get('ch_gap'), outline: f.get('ch_outline'), opacity: Number(f.get('ch_opacity')) / 100, dot: !!f.get('ch_dot') });
}
// Aperçu agrandi (pixels nets) et liste des jeux où le réticule s'affiche tout seul
function wireCrosshair(dlg) {
  const form = $('#settings-form', dlg);
  const cv = $('#ch-canvas', dlg);
  const hidden = $('[name=ch_games]', dlg);
  if (!form || !cv || !hidden) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(240 * dpr); cv.height = Math.round(120 * dpr);
  const paint = () => {
    const st = crosshairStyle(new FormData(form));
    const k = Math.max(1, Math.min(4, Math.floor((50 * dpr) / CrosshairDraw.extent(st))));
    CrosshairDraw.draw(cv, st, k);
    dlg.querySelectorAll('.ch-range').forEach((r) => { const i = r.querySelector('input'); r.querySelector('output').textContent = i.value + (i.name === 'ch_opacity' ? ' %' : ' px'); });
  };
  const list = () => {
    let g = {}; try { g = JSON.parse(hidden.value || '{}'); } catch { /* vide */ }
    const keys = Object.keys(g);
    $('#ch-games', dlg).innerHTML = keys.length
      ? keys.map((k) => { const x = byId(k); return `<span class="ch-game">${esc(x ? x.name : k)}<button type="button" data-ch-del="${esc(k)}" aria-label="Retirer ${esc(x ? x.name : k)}">×</button></span>`; }).join('')
      : '<span class="ch-none">Aucun pour l’instant</span>';
  };
  $('#ch-games', dlg).onclick = (e) => {
    const b = e.target.closest('[data-ch-del]'); if (!b) return;
    let g = {}; try { g = JSON.parse(hidden.value || '{}'); } catch { /* vide */ }
    delete g[b.dataset.chDel];
    hidden.value = JSON.stringify(g);
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
    list();
  };
  form.addEventListener('input', (e) => { if (e.target.name && e.target.name.startsWith('ch_')) paint(); });
  form.addEventListener('change', (e) => { if (e.target.name && e.target.name.startsWith('ch_')) paint(); });
  // Ctrl + Alt + X pendant que les réglages sont ouverts : la liste suit (un seul écouteur par fenêtre)
  dlg._chList = list;
  if (api.onCrosshairGames && !dlg._chOn) { dlg._chOn = true; api.onCrosshairGames((g) => { const h = $('[name=ch_games]', dlg); if (h && dlg.open) { h.value = JSON.stringify(g || {}); dlg._chList(); } }); }
  paint(); list();
}
function readExtraSettings(f) {
  state.local.coverSize = f.get('coverSize') || 'm';
  saveLocal();
  return {
    notify: { downloads: !!f.get('n_downloads'), promos: !!f.get('n_promos'), friends: !!f.get('n_friends'), updates: !!f.get('n_updates'), storage: !!f.get('n_storage'), party: !!f.get('n_party') },
    overlay: { enabled: !!f.get('ov_enabled'), pauseMin: Number(f.get('ov_pause') || 0) },
    crosshair: { enabled: !!f.get('ch_enabled'), style: crosshairStyle(f), games: (() => { try { return JSON.parse(f.get('ch_games') || '{}'); } catch { return {}; } })() },
    discordId: String(f.get('discordId') || '').replace(/\D/g, ''),
    discordEnabled: !!f.get('discordEnabled'),
    updateRepo: String(f.get('updateRepo') || '').trim(),
    backupDir: f.get('backupDir') || undefined,
    autoBackup: !!f.get('autoBackup'),
  };
}
// Branche les boutons de la fenêtre de réglages quand elle s'ouvre
new MutationObserver(() => {
  const dlg = $('#settings');
  if (!dlg.open || !$('#pick-backup', dlg) || dlg.dataset.wired === dlg.innerHTML.length + '') return;
  dlg.dataset.wired = dlg.innerHTML.length + '';
  api.appVersion().then((v) => { const el = $('#app-version', dlg); if (el) el.textContent = v; });
  wireCrosshair(dlg);
  $('#pick-backup', dlg).onclick = async () => { const p = await api.pickFolder(); if (p) { $('#backup-dir', dlg).textContent = p; $('[name=backupDir]', dlg).value = p; } };
  $('#export-data', dlg).onclick = async () => { const p = await api.exportData(); if (p) toast('Données exportées'); };
  $('#import-data', dlg).onclick = async () => {
    try { const r = await api.importData(); if (r) { toast(`Import terminé · ${r.sessions} sessions`); state.local = { ...state.local, ...(await api.getLocal()) }; delete state.cache.sessions; dlg.close(); sync(true); } } catch (e) { toast(cleanErr(e)); }
  };
  $('#check-update', dlg).onclick = async () => {
    const st = $('#update-status', dlg);
    const repo = $('[name=updateRepo]', dlg).value.trim();
    await api.setPrefs({ settings: { updateRepo: repo } });
    st.textContent = 'Recherche…';
    const u = await api.checkUpdate();
    if (u.error) { st.textContent = u.error; return; }
    if (!u.available) { st.textContent = `Tu as la dernière version (${u.current})`; return; }
    st.innerHTML = `Nouvelle version ${esc(u.latest)} disponible. <button type="button" class="link-btn" id="dl-update">Télécharger et installer</button>`;
    $('#dl-update', dlg).onclick = async () => {
      st.textContent = 'Téléchargement…';
      try { await api.downloadUpdate(); st.textContent = 'Prêt. Le launcher va redémarrer'; setTimeout(() => api.installUpdate(), 800); } catch (e) { st.textContent = cleanErr(e); }
    };
  };
}).observe($('#settings'), { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
const cleanErr = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');

// ---------- Actions et événements ----------
const _doAction = doAction;
// eslint-disable-next-line no-global-assign
doAction = async function (act, id, el) {
  const g = id ? byId(id) || (state.lib.games.find((x) => x.key === id)) : null;
  try {
    switch (act) {
      case 'new-collection': return createCollection();
      case 'new-collection-with': return createCollection(id);
      case 'reset-filters': state.local.filters = {}; saveLocal(); return render({ quiet: true });
      case 'launch-opts': return openLaunchOpts(id);
      case 'shortcut': { await api.createShortcut(id); return toast(`Raccourci « ${g.name} » créé sur le Bureau`); }
      case 'cover': { if (await api.setCover(id)) { toast('Jaquette mise à jour'); await sync(true); } return; }
      case 'cover-reset': { await api.resetCover(id); toast('Jaquette d’origine rétablie'); return sync(true); }
      case 'hide': {
        const h = new Set(state.local.hidden || []);
        if (h.has(id)) { h.delete(id); toast(`${g.name} est de nouveau visible`); } else { h.add(id); toast(`${g.name} est masqué · retrouve-le dans « Jeux masqués »`); }
        state.local.hidden = [...h]; saveLocal();
        return render({ quiet: true });
      }
      case 'backup': {
        toast('Copie des sauvegardes…');
        const r = await api.savesBackup(id);
        toast(`Sauvegarde copiée · ${fmtSize(r.size)}`);
        delete state.cache.saves[id]; delete state.cache.savesAll;
        return render({ quiet: true });
      }
      case 'restore': {
        const snap = el.dataset.snap;
        modal(`<h2>Restaurer cette sauvegarde ?</h2><p>Les fichiers actuels de ${esc(g.name)} seront remplacés. Une copie de sécurité est faite juste avant, dans le dossier des sauvegardes</p>
          <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-light">Restaurer</button></div>`,
        (dlg, form) => { form.onsubmit = async (e) => { e.preventDefault(); dlg.close(); try { const r = await api.savesRestore(id, snap); toast(`${r.restored} élément${r.restored > 1 ? 's' : ''} restauré${r.restored > 1 ? 's' : ''}`); } catch (err) { toast(cleanErr(err)); } }; });
        return;
      }
      case 'open-backups': return api.savesOpen(id);
      case 'export-recap': {
        const card = $('#recap-card').getBoundingClientRect();
        const p = await api.capture({ x: card.left, y: card.top, width: card.width, height: card.height }, el.dataset.file);
        if (p) toast('Récap enregistré');
        return;
      }
      default: return _doAction(act, id, el);
    }
  } catch (e) { toast(cleanErr(e)); }
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-coll-toggle],[data-gallery],[data-mod],[data-recap-mode],[data-recap-step]');
  if (!t) return;
  e.stopPropagation();
  if (t.dataset.collToggle) return toggleInCollection(t.dataset.collToggle, t.dataset.id);
  if (t.dataset.gallery) return openGallery(t.dataset.id, +t.dataset.gallery);
  if (t.dataset.mod) return api.openMod(t.dataset.mod);
  if (t.dataset.recapMode) { state.recap = { mode: t.dataset.recapMode, offset: 0 }; return render({ quiet: true }); }
  if (t.dataset.recapStep) { state.recap.offset = Math.min(0, state.recap.offset + Number(t.dataset.recapStep)); render({ quiet: true }); }
}, true);
document.addEventListener('change', (e) => {
  if (!e.target.dataset.filter) return;
  state.local.filters = { ...filters(), [e.target.dataset.filter]: e.target.value };
  saveLocal();
  render({ quiet: true });
});
api.onNavigate((route) => go(route));
api.onSavesChanged((key) => { delete state.cache.saves[key]; delete state.cache.savesAll; if (state.route.tab === 'saves' || state.route.view === 'saves') render({ quiet: true }); });

// ---------- Succès, durée pour finir et note ----------
state.cache.hltb = {};
const fmtH = (sec) => { const m = Math.round(Math.max(1, sec / 60)); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return h >= 100 || !r ? `${Math.round(m / 60)}h` : `${h}h${String(r).padStart(2, '0')}`; };
const howLongOf = (g) => { const h = load('hltb', g.key, () => api.howlong(g.key)); return h === 'loading' ? 'loading' : h && !h.error ? h : null; };
function gameStats(g) {
  const hl = howLongOf(g);
  const d = steamish(g) ? state.cache.store[g.key] : null;
  const mc = d && d !== 'loading' && !d.error ? d.metacritic : null;
  const cell = (k, v, sub) => `<div><span class="k">${k}</span><span class="v">${v}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  const note = g.reviewPct ? [`${g.reviewPct} %`, `d’avis Steam positifs${mc ? ` · Metacritic ${mc}` : ''}`]
    : mc ? [`${mc}`, 'Metacritic']
    : hl && hl !== 'loading' && hl.score ? [`${hl.score} / 100`, 'Joueurs HowLongToBeat']
    : [hl === 'loading' ? '…' : '—', ''];
  return `<div class="stats">
    ${cell('Temps de jeu', playtimeLabel(g))}
    ${cell('Dernière session', fmtRel(g.lastPlayed))}
    ${g.ach ? cell('Succès', `${g.ach.done} / ${g.ach.total}`, `${Math.round((g.ach.done / g.ach.total) * 100)} % débloqués`) : ''}
    ${cell('Pour le finir', hl === 'loading' ? '…' : hl && hl.main ? fmtH(hl.main) : '—', hl && hl !== 'loading' && hl.full ? `${fmtH(hl.full)} pour tout faire` : '')}
    ${cell('Note', note[0], note[1])}
    ${cell('Taille sur le disque', g.installed ? fmtSize(g.sizeOnDisk) : 'Non installé')}
  </div>`;
}
function howLongPanel(g) {
  const hl = howLongOf(g);
  if (!hl || hl === 'loading' || !(hl.main || hl.plus || hl.full)) return '';
  const mine = (g.playtime || 0) * 60;
  const rows = [['Histoire principale', hl.main], ['Avec les extras', hl.plus], ['À 100 %', hl.full]].filter(([, v]) => v);
  const next = rows.find(([, v]) => v > mine);
  return `<section class="panel howlong">
    <div class="section-head"><h2>Durée de vie</h2><button type="button" class="link-btn" data-url="${esc(hl.url)}">HowLongToBeat</button></div>
    ${rows.map(([l, v]) => `<div class="hl-row"><span class="k">${l}</span><span class="m">${fmtH(v)}</span><span class="bar"><span style="width:${Math.min(100, (mine / v) * 100)}%"></span></span></div>`).join('')}
    <p class="small">${!mine ? 'Pas encore commencé.' : next ? `Tu en es à ${fmtH(mine)}. Encore environ ${fmtH(next[1] - mine)} pour « ${next[0].toLowerCase()} ».` : `Tu en es à ${fmtH(mine)} : tu as dépassé le 100 % moyen.`}</p>
  </section>`;
}

// ---------- Jeux gratuits Epic, en tête du Magasin ----------
state.cache.epicFree = undefined;
function epicFreeSection() {
  const f = load('epicFree', null, () => api.epicFree());
  if (!f || f === 'loading' || f.error || !f.length) return '';
  const days = (t) => { const d = Math.max(0, Math.ceil((t - Date.now() / 1000) / 86400)); return d <= 1 ? 'dernier jour' : `encore ${d} jours`; };
  const when = (x) => x.now ? `Gratuit · ${days(x.end)}` : `Gratuit dès le ${new Date(x.start * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
  return `<section class="stack"><div class="section-head"><h2 class="section">Gratuit sur Epic</h2><button type="button" class="link-btn" data-url="https://store.epicgames.com/fr/free-games">Tout voir</button></div>
    <div class="free-row">${f.map((x) => `<button type="button" class="free-card ${x.now ? '' : 'soon'}" data-url="${esc(x.url)}">
      <div class="cover"><img src="${esc(x.cover)}" alt="" loading="lazy">${x.owned ? '<span class="free-tag owned">Déjà à toi</span>' : x.now ? '<span class="free-tag">Gratuit</span>' : ''}</div>
      <span class="t">${esc(x.name)}</span><span class="s">${esc(when(x))}${x.price && x.now ? ` · <s>${esc(x.price)}</s>` : ''}</span>
    </button>`).join('')}</div></section>`;
}
{
  const baseWishlist = VIEWS.wishlist;
  VIEWS.wishlist = () => {
    const html = baseWishlist();
    const free = epicFreeSection();
    if (!free) return html;
    // Juste après l'en-tête de la page
    const end = html.indexOf('</button></div>');
    const i = end < 0 ? 0 : end + '</button></div>'.length;
    return html.slice(0, i) + free + html.slice(i);
  };
}
