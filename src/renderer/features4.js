// CLRE-Launcher : le magasin Steam dans le style de l'app (vitrine, recherche, fiche, achat dans Steam).
/* global state, api, VIEWS, ICONS, esc, render, go, load, loading, emptyBox, byId, games, toast, fmtH, tagName, tagCounts,
   requirementsTable, epicFreeSection, applyTint, S3, doAction */

state.shop = { tab: 'home', q: '', tag: '', sort: 'relevance', count: 40 };
Object.assign(state.cache, { shop: {}, shopItem: {}, shopHl: {} });

const SHOP_TABS = [['home', 'À la une'], ['specials', 'Promos'], ['top', 'Meilleures ventes'], ['fresh', 'Nouveautés'], ['soon', 'À venir'], ['free', 'Gratuits'], ['wish', 'Liste de souhaits']];
// Jeux possédés (Steam, ou reliés à une fiche Steam), recalculés quand la bibliothèque change
let ownedSet = new Set();
let ownedFrom = null;
function owned() {
  if (state.lib && state.lib.games !== ownedFrom) {
    ownedFrom = state.lib.games;
    ownedSet = new Set(state.lib.games.map((g) => Number(g.store === 'steam' ? g.appid : g.steamAppId)).filter(Boolean));
  }
  return ownedSet;
}
const refreshOwned = () => {};
const ownedKey = (appid) => (state.lib ? state.lib.games.find((g) => (g.store === 'steam' ? Number(g.appid) : Number(g.steamAppId)) === Number(appid)) : null);

function priceTag(x) {
  if (x.comingSoon) return '<span class="price-tag soon">Bientôt</span>';
  if (!x.price) return '';
  return `<span class="price-tag">${x.discount ? `<b>−${x.discount} %</b>` : ''}<span>${esc(x.price)}</span></span>`;
}
function shopCard(x) {
  const img = x.cover || x.capsule || x.header;
  const wide = !x.cover;
  const own = owned().has(Number(x.appid));
  const sub = x.comingSoon ? (x.releaseText || 'Prochainement') : x.reviewPct ? `${x.reviewPct} % positifs` : x.release ? new Date(x.release * 1000).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '';
  return `<button type="button" class="card shop-card" data-shop="${x.appid}" title="${esc(x.name)}">
    <div class="cover ${wide ? 'wide' : ''}">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="fallback">${esc(x.name)}</span>`}
      ${own ? '<span class="free-tag owned">Déjà à toi</span>' : ''}${priceTag(x)}</div>
    <span class="t">${esc(x.name)}</span><span class="s">${esc(sub)}</span></button>`;
}
const shopRow = (title, list, more) => (list && list.length ? `<section class="stack"><div class="section-head"><h2 class="section">${title}</h2>${more ? `<button type="button" class="link-btn" data-shop-tab="${more}">Tout voir</button>` : ''}</div>
  <div class="shop-row">${list.slice(0, 12).map(shopCard).join('')}</div></section>` : '');

function shopHead(active = state.shop.tab) {
  const s = state.shop;
  const tags = tagCounts().slice(0, 60);
  return `<div class="toolbar shop-toolbar"><div class="stack-6"><h1>Magasin</h1><span class="sub">Le magasin Steam, à ta façon · l’achat se fait dans Steam</span></div>
</div>
    <div class="shop-tabs"><div class="seg-chips" role="tablist">${SHOP_TABS.map(([id, l]) => `<button type="button" role="tab" class="${active === id ? 'on' : ''}" aria-selected="${active === id}" data-shop-tab="${id}">${l}</button>`).join('')}</div>
    <label class="filter ${s.tag ? 'on' : ''}"><select data-shop-tag>${[['', 'Tag : Tous'], ...tags.map(([id]) => [String(id), tagName(id)])].map(([v, l]) => `<option value="${v}" ${s.tag === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>`;
}

// ---------- Une : grande bannière qui tourne ----------
function shopHero(list) {
  const items = list.filter((x) => x.hero).slice(0, 6);
  if (!items.length) return '';
  return `<section class="spotlight-frame shop-hero" id="shop-hero">${items.map((x, i) => `<div class="spotlight shop-slide ${i === 0 ? 'on' : ''}" data-i="${i}">
      <img class="bg" src="${esc(x.hero)}" alt=""><div class="shade"></div>
      <div class="body">
        <span class="kicker">${x.discount ? `<span class="lamp"></span>En promo · −${x.discount} %` : 'Meilleure vente'}</span>
        <h1>${esc(x.name)}</h1>
        ${x.short ? `<p>${esc(x.short)}</p>` : ''}
        <div class="meta-row">${x.reviewLabel ? `<span>Avis ${esc(x.reviewLabel)}</span>` : ''}${x.developer ? `<span>${esc(x.developer)}</span>` : ''}</div>
        <div class="actions"><button type="button" class="btn btn-primary btn-big" data-shop="${x.appid}">Voir le jeu</button>
          ${x.price ? `<span class="hero-price">${x.discount ? `<s>${esc(x.original)}</s>` : ''}<b>${esc(x.price)}</b></span>` : ''}</div>
      </div></div>`).join('')}
    <div class="shop-dots">${items.map((_, i) => `<button type="button" class="${i === 0 ? 'on' : ''}" data-shop-dot="${i}" aria-label="Bannière ${i + 1}"></button>`).join('')}</div></section>`;
}
let heroTimer = null;
function heroGo(n) {
  const h = document.getElementById('shop-hero');
  if (!h) return;
  const slides = h.querySelectorAll('.shop-slide');
  const i = ((n % slides.length) + slides.length) % slides.length;
  slides.forEach((s, k) => s.classList.toggle('on', k === i));
  h.querySelectorAll('[data-shop-dot]').forEach((d, k) => d.classList.toggle('on', k === i));
  h.dataset.i = i;
}

VIEWS.shop = () => {
  const s = state.shop;
  if (s.tab === 'wish') s.tab = 'home'; // la liste de souhaits est une vue à part (ancien état)
  const head = shopHead();
  // Recherche, tag, promos, gratuits : grille
  if (s.q || s.tag || ['specials', 'free'].includes(s.tab)) {
    const opts = { term: s.q, tags: s.tag ? [Number(s.tag)] : [], specials: s.tab === 'specials', free: s.tab === 'free', sort: s.q ? 'relevance' : 'reviews', count: s.count };
    const key = JSON.stringify(opts);
    const r = load('shop', key, () => api.storeSearch(opts));
    if (r === 'loading') return head + (typeof skelGrid === 'function' ? skelGrid() : loading());
    if (r.error) return head + emptyBox('Magasin indisponible', r.error);
    if (!r.items.length) return head + emptyBox('Aucun résultat', 'Essaie un autre mot ou un autre tag');
    const title = s.q ? `« ${esc(s.q)} »` : s.tag ? esc(tagName(s.tag)) : s.tab === 'free' ? 'Gratuits' : 'Promos';
    return head + `<section class="stack"><div class="section-head"><h2 class="section">${title}</h2><span class="m">${r.total.toLocaleString('fr-FR')} jeux</span></div>
      <div class="grid">${r.items.map(shopCard).join('')}</div>
      ${r.items.length < r.total && s.count < 200 ? '<button type="button" class="btn btn-ghost" data-act="shop-more">Afficher plus</button>' : ''}</section>`;
  }
  const f = load('shop', 'featured', () => api.storeFeatured());
  if (f === 'loading') return head + (typeof skelGrid === 'function' ? skelGrid() : loading());
  if (f.error) return head + emptyBox('Magasin Steam indisponible', f.error);
  if (['top', 'fresh', 'soon'].includes(s.tab)) {
    const list = f[s.tab] || [];
    return head + `<div class="grid">${list.map(shopCard).join('')}</div>`;
  }
  const y = load('shop', 'foryou', () => api.storeForYou());
  const forYou = y && y !== 'loading' && !y.error ? y : null;
  const hero = shopHero([...f.specials, ...f.top]);
  return (hero ? hero + head.replace('<div class="toolbar shop-toolbar">', '<div class="toolbar shop-toolbar after-hero">') : head)
    + (typeof epicFreeSection === 'function' ? epicFreeSection() : '')
    + (forYou && forYou.items.length ? shopRow(`Pour toi${forYou.tags.length ? ` <small class="why">selon tes tags ${forYou.tags.map((t) => esc(tagName(t))).filter(Boolean).join(', ')}</small>` : ''}`, forYou.items) : y === 'loading' ? `<section class="stack"><h2 class="section">Pour toi</h2>${typeof skelGrid === 'function' ? skelGrid(8, true) : ''}</section>` : '')
    + shopRow('Promos du moment', f.specials, 'specials')
    + shopRow('Meilleures ventes', f.top, 'top')
    + shopRow('Nouveautés', f.fresh, 'fresh')
    + shopRow('À venir', f.soon, 'soon');
};

// ---------- Fiche d'un jeu du magasin ----------
VIEWS.shopapp = () => {
  const id = Number(state.route.id);
  const x = load('shopItem', id, () => api.storeItem(id));
  const d = load('store', 'shop:' + id, () => api.storeAppDetails(id));
  if (x === 'loading') return loading();
  if (!x || x.error) return emptyBox('Jeu introuvable', (x && x.error) || 'Ce jeu n’est plus disponible sur le magasin Steam');
  const s = load('specs', 'shop', () => api.pcSpecs(''));
  const hl = load('shopHl', id, () => api.storeHowLong(id, x.name));
  const mine = ownedKey(id);
  const det = d && d !== 'loading' && !d.error ? d : null;
  const movie = det && det.movies && det.movies[0];
  const end = x.discountEnd ? new Date(x.discountEnd * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  const tags = (x.tags || []).filter((t) => tagName(t));
  const cell = (k, v, sub) => `<div><span class="k">${k}</span><span class="v">${v}</span>${sub ? `<span class="sub">${sub}</span>` : ''}</div>`;
  const hlv = hl && hl !== 'loading' && !hl.error ? hl : null;
  const buy = mine
    ? `<button type="button" class="btn btn-primary btn-big" data-open="${esc(mine.key)}">${ICONS.play}Dans ta bibliothèque</button>`
    : x.comingSoon ? `<button type="button" class="btn btn-primary btn-big" data-act="shop-open" data-id="${id}">${ICONS.heart}Suivre sur Steam</button>`
    : `<button type="button" class="btn btn-primary btn-big" data-act="shop-open" data-id="${id}">${x.free ? 'Jouer gratuitement' : `Acheter · ${esc(x.price)}`}</button>`;
  return `<section class="game-hero shop-app-hero" id="shop-app-hero" data-shop-hero="${id}" style="background:var(--card)">
      ${x.hero || x.header ? `<img class="bg" src="${esc(x.hero || x.header)}" alt="">` : ''}<div class="shade"></div>
      <div class="inner">
        <div class="title">
          <button type="button" class="back" data-act="back">${ICONS.back}Magasin</button>
          <span class="kicker">${x.discount ? `<span class="lamp"></span>−${x.discount} %${end ? ` jusqu’au ${end}` : ''}` : x.developer ? esc(x.developer) : 'Steam'}</span>
          ${x.logo ? `<img class="logo" src="${esc(x.logo)}" alt="${esc(x.name)}">` : `<h1>${esc(x.name)}</h1>`}
        </div>
        <div class="actions">
          ${x.discount && !mine ? `<span class="hero-price"><s>${esc(x.original)}</s><b>${esc(x.price)}</b></span>` : ''}
          ${buy}
          ${!mine && !x.free ? `<button type="button" class="btn btn-glass btn-sq btn-big" data-act="shop-open" data-id="${id}" aria-label="Ajouter à ma liste de souhaits dans Steam" title="Liste de souhaits (dans Steam)">${ICONS.heart}</button>` : ''}
          <button type="button" class="btn btn-glass btn-sq btn-big" data-act="shop-web" data-id="${id}" aria-label="Ouvrir la page web" title="Page web du magasin">${ICONS.ext}</button>
        </div>
      </div>
    </section>
    <div class="stats">
      ${cell('Prix', x.comingSoon ? 'Bientôt' : esc(x.price || '—'), x.discount ? `au lieu de ${esc(x.original)}` : '')}
      ${cell('Avis Steam', x.reviewPct ? `${x.reviewPct} %` : '—', x.reviewLabel ? `${esc(x.reviewLabel)} · ${x.reviewCount.toLocaleString('fr-FR')} avis` : '')}
      ${cell('Pour le finir', hl === 'loading' ? '…' : hlv && hlv.main ? fmtH(hlv.main) : '—', hlv && hlv.full ? `${fmtH(hlv.full)} pour tout faire` : '')}
      ${cell('Sortie', x.comingSoon ? esc(x.releaseText || 'Prochainement') : x.release ? new Date(x.release * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—', det && det.metacritic ? `Metacritic ${det.metacritic}` : '')}
      ${cell('Studio', esc(x.developer || '—'), '')}
    </div>
    <div class="cols"><div class="col-main">
      ${d === 'loading' ? loading() : det ? `<section class="about">
        ${movie ? `<div class="trailer"><video controls preload="none" poster="${esc(movie.thumb)}" data-hls="${esc(movie.hls)}" data-mp4="${esc(movie.mp4)}" aria-label="${esc(movie.name)}"></video></div>` : ''}
        <div class="about-text"><p class="lead">${esc(det.short || x.short)}</p>
          ${det.about ? `<details class="more"><summary>Lire la description</summary><div class="about-body">${det.about.split('\n').map((p) => `<p>${esc(p)}</p>`).join('')}</div></details>` : ''}</div>
      </section>
      ${det.screenshots && det.screenshots.length ? `<section class="stack"><h2 class="section">Captures</h2><div class="gallery">${det.screenshots.map((sh, i) => `<button type="button" class="shot" data-gallery="${i}" data-id="shop:${id}"><img src="${esc(sh.thumb)}" alt="Capture ${i + 1}" loading="lazy"></button>`).join('')}</div></section>` : ''}
      ${typeof requirementsTable === 'function' ? requirementsTable(det, s) : ''}` : ''}
    </div><aside class="col-side">
      ${tags.length ? `<section class="panel"><h2>Tags</h2><div class="mood-tags">${tags.map((t) => `<button type="button" class="tag-toggle" data-shop-tagbtn="${t}">${esc(tagName(t))}</button>`).join('')}</div></section>` : ''}
      ${hlv && (hlv.main || hlv.full) ? `<section class="panel howlong"><div class="section-head"><h2>Durée de vie</h2><button type="button" class="link-btn" data-url="${esc(hlv.url)}">HowLongToBeat</button></div>
        ${[['Histoire principale', hlv.main], ['Avec les extras', hlv.plus], ['À 100 %', hlv.full]].filter(([, v]) => v).map(([l, v]) => `<div class="hl-row"><span class="k">${l}</span><span class="m">${fmtH(v)}</span></div>`).join('')}</section>` : ''}
      <section class="panel"><h2>Acheter</h2><p class="small">Le paiement se fait dans l’appli Steam, avec ton compte et tes moyens de paiement habituels. Le jeu apparaît ensuite tout seul dans ta bibliothèque.</p></section>
    </aside></div>`;
};

// Bannière vivante sur la fiche magasin
function shopTrailer() {
  const hero = document.getElementById('shop-app-hero');
  if (!hero || state.settings3NoLive || (state.prefs && state.prefs.settings && state.prefs.settings.liveBanners === false)) return;
  const id = hero.dataset.shopHero;
  const d = state.cache.store['shop:' + id];
  if (!d || d === 'loading' || d.error || !d.movies || !d.movies.length) return;
  const key = 'shop:' + id;
  let v = S3.videos.get(key);
  if (!v) {
    v = document.createElement('video');
    v.className = 'bg-video'; v.muted = true; v.loop = true; v.playsInline = true;
    v.addEventListener('playing', () => v.classList.add('on'));
    S3.videos.set(key, v);
    trimVideos();
  }
  const img = hero.querySelector('img.bg');
  if (img && v.parentNode !== hero) img.after(v);
  if (v._loaded) { if (v.paused) v.play().catch(() => {}); return; }
  if (v._t) return;
  v._t = setTimeout(() => {
    v._t = null; v._loaded = true;
    const m = d.movies[0];
    if (m.hls && window.Hls && Hls.isSupported()) { const h = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 20 }); h.loadSource(m.hls); h.attachMedia(v); v._hls = h; h.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {})); } else if (m.mp4) { v.src = m.mp4; v.play().catch(() => {}); }
    v.playbackRate = 0.9;
  }, 2000);
}

// ---------- Rendu, navigation, actions ----------
const _render4 = render;
// eslint-disable-next-line no-global-assign
render = function (opts) {
  _render4(opts);
  const v = state.route.view;
  clearInterval(heroTimer);
  if (document.getElementById('shop-app-hero')) document.querySelector('.topbar').classList.add('over-hero');
  const sh = document.getElementById('shop-hero');
  if (sh) {
    // Comme l'accueil : la bannière passe sous la barre du haut
    const bar = document.querySelector('.topbar');
    bar.classList.add('over-hero');
    sh.style.marginTop = `-${bar.offsetHeight + 4}px`;
  }
  if (v === 'shop' && sh) {
    heroTimer = setInterval(() => { const h = document.getElementById('shop-hero'); if (!h) return clearInterval(heroTimer); if (!h.matches(':hover')) heroGo(Number(h.dataset.i || 0) + 1); }, 8000);
  }
  if (v === 'shopapp') {
    const x = state.cache.shopItem[Number(state.route.id)];
    if (x && x !== 'loading' && !x.error) applyTint({ key: 'shop:' + x.appid, art: { cover: x.cover || x.header } });
    shopTrailer();
  }
  document.querySelectorAll('.segmented [data-nav]').forEach((b) => b.classList.toggle('active', b.dataset.nav === 'shop' ? ['shop', 'shopapp', 'wishlist'].includes(v) : b.dataset.nav === 'friends' ? v === 'friends' : !['shop', 'shopapp', 'wishlist', 'friends'].includes(v)));
};
const _doAction4 = doAction;
// eslint-disable-next-line no-global-assign
doAction = async function (act, id, el) {
  if (act === 'shop-open') { await api.storeOpen(id, 'steam'); return toast('Ouvert dans Steam'); }
  if (act === 'shop-web') return api.storeOpen(id, 'web');
  if (act === 'shop-more') { state.shop.count += 40; return render({ quiet: true }); }
  return _doAction4(act, id, el);
};
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-shop],[data-shop-tab],[data-shop-dot],[data-shop-tagbtn]');
  if (!t) return;
  e.stopPropagation();
  if (t.dataset.shop) return go({ view: 'shopapp', id: t.dataset.shop });
  if (t.dataset.shopDot) { heroGo(Number(t.dataset.shopDot)); return undefined; }
  if (t.dataset.shopTagbtn) { state.shop = { ...state.shop, tab: 'home', q: '', tag: t.dataset.shopTagbtn, count: 40 }; return go({ view: 'shop' }); }
  if (t.dataset.shopTab === 'wish') return go({ view: 'wishlist' });
  state.shop = { ...state.shop, tab: t.dataset.shopTab, q: '', tag: '', count: 40 };
  if (state.route.view !== 'shop') return go({ view: 'shop' });
  return render({ quiet: true });
}, true);
document.addEventListener('change', (e) => {
  if (!e.target.matches('[data-shop-tag]')) return;
  state.shop = { ...state.shop, tag: e.target.value, q: '', tab: e.target.value ? state.shop.tab : 'home', count: 40 };
  render({ quiet: true });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.id !== 'shop-q') return;
  state.shop = { ...state.shop, q: e.target.value.trim(), tag: '', count: 40 };
  render({ quiet: true });
});
api.onLibraryChanged && api.onLibraryChanged(() => refreshOwned());

// La liste de souhaits garde l'en-tête du magasin
const _wishView = VIEWS.wishlist;
VIEWS.wishlist = () => { return shopHead('wish') + _wishView().replace(/^<div class="toolbar">[\s\S]*?<\/button><\/div>/, ''); };

// ---------- Barre latérale épurée : l'essentiel en haut, le reste en sections repliables ----------
const NAV_DEFAULT_CLOSED = { progress: true, tools: true, browse: true, steamcoll: true }; // fermées par défaut : la barre tient sur un écran
// eslint-disable-next-line no-global-assign
renderSidebar = function () {
  const all = games();
  const r = state.route;
  const closed = { ...NAV_DEFAULT_CLOSED, ...(state.local.navClosed || {}) };
  const item = (view, icon, label, count, id) => `<button type="button" class="nav-item ${r.view === view && (id == null || r.id === id) ? 'active' : ''}" data-nav="${view}"${id != null ? ` data-id="${esc(id)}"` : ''} title="${esc(label)}">${icon}<span class="label">${esc(label)}</span>${count ? `<span class="count">${count}</span>` : ''}</button>`;
  const small = (view, id, label, n, ico) => `<button type="button" class="nav-item small ${r.view === view && r.id === id ? 'active' : ''}" data-nav="${view}" data-id="${esc(id)}" title="${esc(label)}">${ico || '<span class="dot"></span>'}<span class="label">${esc(label)}</span><span class="count">${n || ''}</span></button>`;
  // Une section s'ouvre d'elle-même si la page affichée en fait partie
  const section = (id, title, views, body, extra = '') => {
    if (!body) return '';
    const isOpen = !closed[id] || views.includes(r.view);
    return `<div class="nav-sec ${isOpen ? 'open' : ''}"><div class="nav-sec-head"><button type="button" class="nav-sec-toggle" data-nav-sec="${id}" aria-expanded="${isOpen}">${esc(title)}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></button>${extra}</div><div class="nav-sec-body">${body}</div></div>`;
  };
  $('#nav-main').innerHTML =
    item('home', ICONS.star, 'Pour toi') +
    item('all', ICONS.grid, 'Tous les jeux', all.length) +
    item('installed', ICONS.drive, 'Installés', all.filter((g) => g.installed).length) +
    item('favorites', ICONS.heart, 'Favoris', all.filter(isFav).length) +
    (state.downloads.length ? item('downloads', ICONS.download, 'Téléchargements', dlCount() || '') : '');

  const counts = Object.fromEntries(Object.keys(STATUSES).map((s) => [s, all.filter((g) => statusOf(g) === s).length]));
  const cols = myCollections();
  const hidden = (state.local.hidden || []).length;
  const stores = Object.keys(STORE_NAME).map((id) => [id, all.filter((g) => g.store === id).length]).filter(([, n]) => n);
  const dyn = (state.lib && state.lib.dynamicCollections) || [];
  $('#nav-collections').innerHTML = [
    section('activity', 'Activité', ['history', 'journal', 'recap', 'showcase', 'party'],
      item('history', ICONS.history, 'Historique') + item('journal', ICONS.journal, 'Journal') + item('recap', ICONS.recap, 'Récap') + item('showcase', ICONS.trophy, 'Vitrine') + item('party', ICONS.party || ICONS.history, 'Soirées')),
    section('progress', 'Statut', ['status'],
      Object.entries(STATUSES).map(([id, label]) => `<button type="button" class="nav-item small ${r.view === 'status' && r.id === id ? 'active' : ''}" data-nav="status" data-id="${id}"><span class="dot status-${id}"></span><span class="label">${label}</span><span class="count">${counts[id] || ''}</span></button>`).join('')),
    section('mine', 'Collections Steam', ['mycoll', 'hidden'],
      (cols.length ? cols.map((c) => small('mycoll', c.id, c.name, c.keys.length)).join('') : '<p class="nav-hint">Toutes tes collections servent de statuts</p>') + (hidden ? small('hidden', null, 'Jeux masqués', hidden).replace(' data-id="null"', '') : ''),
      `<button type="button" class="mini-btn" data-act="new-collection" aria-label="Nouvelle collection Steam" title="Nouvelle collection Steam">${ICONS.plus}</button>`),
    section('browse', 'Parcourir', ['tags', 'store'],
      item('tags', ICONS.tag, 'Tags du magasin') + (stores.length > 1 ? stores.map(([id, n]) => small('store', id, STORE_NAME[id], n, platIcon(id, 16))).join('') : '')),
    section('tools', 'Outils', ['screenshots', 'storage', 'saves'],
      item('screenshots', ICONS.image, 'Captures') + item('storage', ICONS.disk, 'Stockage') + item('saves', ICONS.save, 'Sauvegardes')),
    dyn.length ? section('dyn', 'Dynamiques Steam', [], dyn.map((c) => `<div class="nav-item small" title="Collection dynamique gérée par Steam" style="opacity:.6;cursor:default"><span class="label">${esc(c.name)}</span></div>`).join('')) : '',
  ].join('');

  const twoWeeks = all.reduce((s, g) => s + (g.playtime2wks || 0), 0);
  const last = [...all].sort(byRecent)[0];
  const weekGames = all.filter((g) => g.lastPlayed >= now() - 7 * DAY).length;
  $('#week-card').innerHTML = `
    <span class="k">${twoWeeks ? 'Temps de jeu sur 2 semaines' : 'Jeux lancés sur 7 jours'}</span>
    <span class="v">${twoWeeks ? fmtPlaytime(twoWeeks) : weekGames}</span>
    <span class="sub">${last && last.lastPlayed ? `Dernier lancé : ${esc(last.name)}` : 'Aucune session récente'}</span>`;
};
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-nav-sec]');
  if (!t) return;
  e.stopPropagation();
  const id = t.dataset.navSec;
  const sec = t.closest('.nav-sec');
  const open = !sec.classList.contains('open');
  sec.classList.toggle('open', open);
  t.setAttribute('aria-expanded', String(open));
  state.local.navClosed = { ...(state.local.navClosed || {}), [id]: !open };
  saveLocal();
}, true);
