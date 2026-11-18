// Réglages façon « Réglages Système » de macOS : catégories à gauche avec icônes, listes groupées à droite,
// interrupteurs, recherche. On réorganise la page existante (mêmes champs, même enregistrement).
/* global state, api, esc, openSettings, toast, doAction, applyTheme */

const PI = (d) => `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PREF_CATS = [
  { id: 'account', title: 'Compte Steam', color: '#0a84ff', icon: PI('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'), legends: [], intro: 'Ta bibliothèque est lue directement dans les fichiers de Steam. Rien à connecter.' },
  { id: 'general', title: 'Général', color: '#8e8e93', icon: PI('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>'), legends: ['Système'], intro: 'Comment le launcher se comporte avec le système.' },
  { id: 'look', title: 'Apparence', color: '#5e5ce6', icon: PI('<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18Z" fill="currentColor"/>'), legends: ['Apparence', 'Effets'], intro: 'Thème, taille des jaquettes et effets visuels.' },
  { id: 'notif', title: 'Notifications', color: '#ff453a', icon: PI('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'), legends: ['Notifications'], intro: 'Choisis ce qui mérite de t’interrompre.' },
  { id: 'ingame', title: 'En jeu', color: '#30d158', icon: PI('<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.5a2.6 2.6 0 0 0 4.7 1.8L8.5 15h7l1.8 1.9a2.6 2.6 0 0 0 4.7-1.8l-.7-6.5a4 4 0 0 0-4-3.6Z"/>'), legends: ['Infos en jeu', 'Réticule', 'Performances'], intro: 'Infos par-dessus le jeu, réticule, rappel de pause et mesure des performances.' },
  { id: 'saves', title: 'Sauvegardes', color: '#40c8e0', icon: PI('<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>'), legends: ['Sauvegardes de jeux'], intro: 'Des copies de sécurité de tes sauvegardes, faites toutes seules.' },
  { id: 'discord', title: 'Discord', color: '#5865f2', icon: PI('<path d="M8 12h.01M16 12h.01"/><path d="M7.5 17.5 6 20c-2-.6-3.6-1.6-4.5-2.5C1.3 12 2.5 7 5 4.5 6.6 3.8 8 3.4 9 3.2l.8 1.6a14 14 0 0 1 4.4 0l.8-1.6c1 .2 2.4.6 4 1.3 2.5 2.5 3.7 7.5 3.5 13-1 .9-2.5 1.9-4.5 2.5l-1.5-2.5"/><path d="M6.5 16c3.5 1.5 7.5 1.5 11 0"/>'), legends: ['Statut Discord'], intro: 'Ce que tes amis voient sur ton profil quand tu joues.' },
  { id: 'data', title: 'Mises à jour et données', color: '#ff9f0a', icon: PI('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'), legends: ['Mises à jour du launcher', 'Mes données'], intro: 'Versions du launcher, export et import de tes données.' },
  { id: 'about', title: 'À propos', color: '#636366', icon: PI('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'), legends: [], intro: '' },
];
// Titres des lignes sans libellé
const ROW_TITLES = [
  [(el) => el.querySelector('[name="coverSize"]'), 'Taille des jaquettes'],
  [(el) => el.classList.contains('ch-preview'), 'Aperçu'],
  [(el) => el.querySelector('[name="ch_shape"]'), 'Forme'],
  [(el) => el.id === 'ch-games', 'S’affiche tout seul dans'],
  [(el) => el.querySelector('#backup-dir'), 'Dossier des copies'],
  [(el) => el.querySelector('[name="updateRepo"]'), 'Dépôt GitHub'],
  [(el) => el.querySelector('#pm-path'), 'PresentMon (FPS)'],
  [(el) => el.querySelector('#export-data'), 'Tes données'],
  [(el) => el.matches('input[name="discordId"]'), 'Application Discord'],
];
let prefCat = 'account';

function buildPrefs(dlg) {
  const form = dlg.querySelector('#settings-form');
  if (!form || form.classList.contains('prefs-form')) return;
  form.classList.add('prefs-form');
  dlg.classList.add('prefs');
  dlg.addEventListener('close', () => dlg.classList.remove('prefs'), { once: true });
  const lib = state.lib;
  const user = lib && lib.user ? lib.user : { name: 'Joueur' };
  const initials = String(user.name || '?').slice(0, 1).toUpperCase();
  const nGames = lib ? lib.games.length : 0;

  // Pages
  const panes = {};
  const main = document.createElement('div');
  main.className = 'prefs-main';
  for (const c of PREF_CATS) {
    const p = document.createElement('section');
    p.className = 'prefs-pane';
    p.dataset.cat = c.id;
    p.innerHTML = `<header class="prefs-head"><span class="pref-tile" style="--t:${c.color}">${c.icon}</span><div><h2>${esc(c.title)}</h2>${c.intro ? `<p>${esc(c.intro)}</p>` : ''}</div></header>`;
    panes[c.id] = p;
    main.appendChild(p);
  }

  // Compte : tout ce qui est avant le premier fieldset
  const acc = document.createElement('div');
  acc.className = 'group';
  acc.insertAdjacentHTML('beforeend', `<div class="acc-card"><span class="acc-av">${esc(initials)}</span><div><b>${esc(user.name || 'Joueur')}</b><span>${nGames} jeux · toutes plateformes</span></div></div>`);
  const fieldsets = [...form.querySelectorAll(':scope > fieldset')];
  for (const n of [...form.children]) {
    if (n.tagName === 'FIELDSET' || n.classList.contains('m-actions')) continue;
    if (n.tagName === 'H2' || (n.tagName === 'P' && !n.className)) { n.remove(); continue; }
    if (n.classList.contains('note')) { (/Plateformes/.test(n.textContent) ? panes.about : panes.about).appendChild(n); continue; }
    acc.appendChild(n);
  }
  panes.account.appendChild(acc);

  // Chaque fieldset devient une liste groupée dans sa catégorie
  for (const fs of fieldsets) {
    const legend = fs.querySelector('legend');
    const name = legend ? legend.textContent.trim() : '';
    const cat = PREF_CATS.find((c) => c.legends.includes(name)) || PREF_CATS.find((c) => c.id === 'general');
    const group = document.createElement('div');
    group.className = 'group';
    if (cat.legends.length > 1) group.insertAdjacentHTML('beforeend', `<div class="group-title">${esc(name)}</div>`);
    if (legend) legend.remove();
    fs.classList.add('prefs-fs');
    group.appendChild(fs);
    panes[cat.id].appendChild(group);
  }
  // Mise en lignes : libellé à gauche, contrôle à droite, aide en dessous
  main.querySelectorAll('.prefs-fs, .prefs-pane[data-cat="account"] .group').forEach((box) => {
    for (const el of [...box.children]) {
      if (el.classList.contains('group-title') || el.classList.contains('acc-card') || el.classList.contains('row')) continue;
      if (el.tagName === 'SMALL') { const prev = el.previousElementSibling; if (prev && prev.classList.contains('row')) { el.classList.add('row-help'); prev.appendChild(el); } else el.classList.add('row-help', 'solo'); continue; }
      if (el.tagName === 'INPUT' && el.type === 'hidden') continue;
      if (el.matches('label.check') || (el.tagName === 'LABEL' && !el.matches('.field, .field-row') && el.querySelector('input[type="checkbox"]'))) { el.removeAttribute('style'); el.classList.add('row', 'row-switch'); const input = el.querySelector('input'); if (input) { const span = document.createElement('span'); span.className = 'row-label'; while (input.nextSibling) span.appendChild(input.nextSibling); el.prepend(span); el.appendChild(input); } continue; }
      if (el.matches('label.field, label.field-row')) { el.classList.add('row'); const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim()); if (t) { const s = document.createElement('span'); s.className = 'row-label'; s.textContent = t.textContent.trim(); t.replaceWith(s); } const sm = el.querySelector('small'); if (sm) { sm.classList.add('row-help'); el.appendChild(sm); } continue; }
      if (el.classList.contains('note')) { el.classList.add('row-note'); continue; }
      const title = (ROW_TITLES.find(([test]) => test(el)) || [])[1];
      const row = document.createElement('div');
      row.className = 'row';
      el.replaceWith(row);
      if (title) row.insertAdjacentHTML('beforeend', `<span class="row-label">${esc(title)}</span>`);
      row.appendChild(el);
      el.classList.add('row-ctl');
    }
  });
  buildThemePicker(panes.look);

  // À propos
  panes.about.insertAdjacentHTML('afterbegin', '');
  const about = document.createElement('div');
  about.className = 'group about-card';
  about.innerHTML = `<div class="about-logo"><svg width="72" height="72" viewBox="0 0 256 256" aria-hidden="true"><rect x="8" y="8" width="240" height="240" rx="56" fill="#e9a23b"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" opacity="0.4" transform="rotate(-14 128 130)"/><rect x="74" y="58" width="108" height="144" rx="16" fill="#111113" transform="rotate(3 128 130)"/><path d="M114 108 L150 130 L114 152 Z" fill="#f5f5f7" stroke="#f5f5f7" stroke-width="12" stroke-linejoin="round" transform="rotate(3 128 130)"/></svg></div>
    <h3>CLRE-Launcher</h3><span class="ver">Version <span class="app-ver"></span></span>
    <div class="about-stats"><div><b>${nGames}</b><span>jeux</span></div><div><b>${lib ? (lib.platforms || []).filter((p) => p.count).length : 0}</b><span>plateformes</span></div><div><b>${lib ? lib.games.filter((g) => g.installed).length : 0}</b><span>installés</span></div></div>
    <button type="button" class="btn btn-ghost" data-pref-act="onboarding">Revoir le guide de bienvenue</button>`;
  panes.about.insertBefore(about, panes.about.children[1] || null);
  api.appVersion && api.appVersion().then((v) => { dlg.querySelectorAll('.app-ver').forEach((s) => { s.textContent = v; }); }).catch(() => {});

  // Barre latérale
  const side = document.createElement('nav');
  side.className = 'prefs-side';
  side.innerHTML = `<label class="prefs-search"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><input type="search" placeholder="Rechercher" id="prefs-q" autocomplete="off"></label>
    <button type="button" class="prefs-me" data-pref-cat="account"><span class="acc-av">${esc(initials)}</span><span><b>${esc(user.name || 'Joueur')}</b><small>Compte Steam</small></span></button>
    <div class="prefs-cats">${PREF_CATS.filter((c) => c.id !== 'account').map((c, i) => `${[1, 4, 7].includes(i) ? '<div class="prefs-gap"></div>' : ''}<button type="button" data-pref-cat="${c.id}"><span class="pref-tile" style="--t:${c.color}">${c.icon}</span><span>${esc(c.title)}</span></button>`).join('')}</div>`;

  // Pied de page
  const actions = form.querySelector('.m-actions');
  const footer = document.createElement('div');
  footer.className = 'prefs-foot';
  footer.innerHTML = '<span class="prefs-dirty">Modifications non enregistrées</span>';
  if (actions) {
    footer.appendChild(actions);
    const save = actions.querySelector('[type="submit"]');
    if (save) { save.textContent = 'Enregistrer'; save.removeAttribute('style'); save.className = 'btn btn-primary'; }
  }
  main.appendChild(footer);
  form.prepend(side);
  form.appendChild(main);

  const show = (id) => {
    prefCat = id;
    form.querySelectorAll('.prefs-pane').forEach((p) => p.classList.toggle('on', p.dataset.cat === id));
    side.querySelectorAll('[data-pref-cat]').forEach((b) => b.classList.toggle('on', b.dataset.prefCat === id));
    main.scrollTop = 0;
  };
  side.addEventListener('click', (e) => { const b = e.target.closest('[data-pref-cat]'); if (b) { e.preventDefault(); form.classList.remove('searching'); side.querySelector('#prefs-q').value = ''; show(b.dataset.prefCat); } });
  form.addEventListener('click', (e) => { const b = e.target.closest('[data-pref-act]'); if (!b) return; e.preventDefault(); dlg.close(); doAction(b.dataset.prefAct); });
  // Recherche : affiche toutes les lignes qui correspondent, toutes catégories confondues
  side.querySelector('#prefs-q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    form.classList.toggle('searching', !!q);
    side.querySelectorAll('[data-pref-cat]').forEach((b) => b.classList.toggle('on', !q && b.dataset.prefCat === prefCat));
    form.querySelectorAll('.prefs-pane').forEach((p) => {
      let any = false;
      p.querySelectorAll('.row, .group-title').forEach((r) => {
        const hit = !q || r.textContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q);
        r.classList.toggle('miss', !hit);
        if (hit && q && r.classList.contains('row')) any = true;
      });
      p.classList.toggle('hit', any);
    });
    side.querySelectorAll('[data-pref-cat]').forEach((b) => b.classList.toggle('dim', !!q && !form.querySelector(`.prefs-pane[data-cat="${b.dataset.prefCat}"].hit`)));
    if (!q) show(prefCat);
  });
  // Indique qu'il reste quelque chose à enregistrer
  // (le thème s'applique tout de suite : il n'attend pas « Enregistrer »)
  const counts = (e) => e.target.id !== 'prefs-q' && !e.target.closest('.theme-group');
  form.addEventListener('input', (e) => { if (counts(e)) form.classList.add('dirty'); });
  form.addEventListener('change', (e) => { if (counts(e)) form.classList.add('dirty'); });
  show(prefCat);
}

// ---------- Thème : choix immédiat, sans passer par « Enregistrer » ----------
const errText = (e) => String((e && e.message) || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
function buildThemePicker(pane) {
  if (!api.themesList) return;
  const group = document.createElement('div');
  group.className = 'group theme-group';
  group.innerHTML = `<div class="group-title">Thème</div><div class="theme-list" role="radiogroup" aria-label="Thème"></div><div class="theme-extra"></div>
    <div class="group-title theme-cat-title">Catalogue de la communauté</div><div class="theme-catalog"></div>
    <div class="theme-drop" aria-hidden="true">Dépose l’archive .zip du thème</div>`;
  pane.insertBefore(group, pane.querySelector('.prefs-head').nextSibling);
  const list = group.querySelector('.theme-list');
  const extra = group.querySelector('.theme-extra');
  const catalogBox = group.querySelector('.theme-catalog');
  let data = null;
  let catalog = null; // null = pas encore chargé
  let busy = '';

  const swatchStyle = (t) => {
    const v = t.schemes.default || t.schemes[Object.keys(t.schemes)[0]] || {};
    const bg = v['--bg'] || (v['--bg-rgb'] ? `rgb(${v['--bg-rgb']})` : 'var(--bg)');
    const ac = v['--accent'] || 'var(--accent)';
    return `background: linear-gradient(135deg, ${bg} 0 62%, ${ac} 62% 100%)`.replace(/"/g, '');
  };

  const draw = () => {
    const { themes, active } = data;
    list.innerHTML = themes.map((t) => `<button type="button" class="theme-card${t.id === active.id ? ' on' : ''}" role="radio" aria-checked="${t.id === active.id}" data-theme-id="${esc(t.id)}" ${t.compatible ? '' : 'disabled title="Écrit pour une version plus récente du launcher"'}>
        <span class="theme-prev">${t.preview ? `<img src="clre-theme://${esc(t.id)}/${esc(t.preview)}" alt="" loading="lazy">` : `<span class="theme-swatch" style="${swatchStyle(t)}"></span>`}</span>
        <span class="theme-name">${esc(t.name)}</span>
        <span class="theme-by">${t.author ? `par ${esc(t.author)}` : t.builtin ? 'Intégré' : ''}${t.compatible ? '' : ' · incompatible'}</span>
      </button>`).join('');
    const cur = themes.find((t) => t.id === active.id);
    const schemes = cur ? Object.keys(cur.schemes) : [];
    extra.innerHTML = `${schemes.length > 1 ? `<label class="row"><span class="row-label">Couleurs</span><select class="select row-ctl" data-theme-scheme>${schemes.map((n) => `<option value="${esc(n)}"${n === active.scheme ? ' selected' : ''}>${esc(n === 'default' ? 'Par défaut' : n)}</option>`).join('')}</select></label>` : ''}
      ${cur ? cur.options.map((o) => `<label class="row row-switch"><span class="row-label">${esc(o.label)}</span><input type="checkbox" data-theme-opt="${esc(o.id)}"${active.options.includes(o.id) ? ' checked' : ''}></label>`).join('') : ''}
      ${cur && !cur.builtin ? `<div class="row"><span class="row-label">${esc(cur.name)}${cur.version ? ` <span class="theme-ver">v${esc(cur.version)}</span>` : ''}</span><button type="button" class="btn btn-ghost row-ctl" data-theme-act="remove" data-id="${esc(cur.id)}">Supprimer</button>${cur.description ? `<small class="row-help">${esc(cur.description)}</small>` : ''}</div>` : ''}
      <div class="row"><span class="row-label">Ajouter un thème</span><span class="row-ctl theme-btns"><button type="button" class="btn btn-ghost" data-theme-act="import">Importer un .zip</button><button type="button" class="btn btn-ghost" data-theme-act="folder">Ouvrir le dossier</button><button type="button" class="btn btn-ghost" data-theme-act="reload">Actualiser</button></span>
        <small class="row-help">Tu peux aussi déposer l’archive ici. Le thème actif se recharge tout seul quand tu modifies ses fichiers. ${active.safeMode ? 'Mode sans échec : le thème choisi est ignoré jusqu’au prochain choix.' : 'En cas de souci : clic droit sur l’icône de la barre des tâches, « Revenir au thème par défaut ».'}</small></div>`;
  };

  const drawCatalog = () => {
    if (!catalog) {
      catalogBox.innerHTML = `<div class="row"><span class="row-label">Des thèmes créés par d’autres joueurs</span><button type="button" class="btn btn-ghost row-ctl" data-theme-act="catalog"${busy === 'catalog' ? ' disabled' : ''}>${busy === 'catalog' ? 'Chargement…' : 'Parcourir'}</button></div>`;
      return;
    }
    if (catalog.error) { catalogBox.innerHTML = `<div class="row"><span class="row-label">${esc(catalog.error)}</span><button type="button" class="btn btn-ghost row-ctl" data-theme-act="catalog-force">Réessayer</button></div>`; return; }
    if (!catalog.themes.length) { catalogBox.innerHTML = '<div class="row"><span class="row-label">Le catalogue est vide pour l’instant.</span></div>'; return; }
    const using = data && data.active.id;
    catalogBox.innerHTML = `<div class="theme-list">${catalog.themes.map((t) => {
      const state = busy === t.id ? '<button type="button" class="btn btn-ghost" disabled>Installation…</button>'
        : !t.compatible ? '<span class="theme-by">Launcher trop ancien</span>'
          : t.builtin ? '<span class="theme-by">Thème intégré</span>'
            : t.update ? `<button type="button" class="btn btn-primary" data-theme-install="${esc(t.id)}">Mettre à jour</button>`
              : t.installed ? (t.id === using ? '<span class="theme-by">Utilisé</span>' : `<button type="button" class="btn btn-ghost" data-theme-use="${esc(t.id)}">Utiliser</button>`)
                : `<button type="button" class="btn btn-ghost" data-theme-install="${esc(t.id)}">Installer</button>`;
      return `<div class="theme-card theme-cat" title="${esc(t.description)}">
        <span class="theme-prev">${t.preview ? `<img src="${esc(t.preview)}" alt="">` : ''}</span>
        <span class="theme-name">${esc(t.name)}${t.version ? ` <span class="theme-ver">v${esc(t.version)}</span>` : ''}</span>
        <span class="theme-by">${t.author ? `par ${esc(t.author)}` : ''}</span>
        <span class="theme-act">${state}</span>
      </div>`;
    }).join('')}</div>`;
  };

  const load = () => api.themesList().then((d) => { data = d; draw(); drawCatalog(); }).catch((e) => toast('Thèmes : ' + errText(e)));
  const loadCatalog = async (force) => {
    busy = 'catalog'; drawCatalog();
    try { catalog = await api.themesCatalog(force); } catch (e) { catalog = { themes: [], error: 'Catalogue injoignable : ' + errText(e) }; }
    busy = ''; drawCatalog();
  };
  const choose = async (choice) => {
    try {
      const active = await api.themeSet(choice);
      applyTheme(active);
      data.active = active;
      draw(); drawCatalog();
    } catch (e) { toast('Thème : ' + errText(e)); }
  };
  // Après un import : le thème est ajouté et appliqué tout de suite
  const installed = async (m) => {
    if (!m) return;
    await load();
    if (catalog && !catalog.error) catalog = await api.themesCatalog().catch(() => catalog);
    await choose({ id: m.id });
    toast(`Thème « ${m.name} » installé`);
  };
  const importZip = async (file) => {
    try { await installed(await api.themeImport(file)); } catch (e) { toast('Import impossible : ' + errText(e)); }
  };

  group.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-theme-id]');
    if (card) { e.preventDefault(); if (card.dataset.themeId !== data.active.id) choose({ id: card.dataset.themeId }); return; }
    const use = e.target.closest('[data-theme-use]');
    if (use) { e.preventDefault(); choose({ id: use.dataset.themeUse }); return; }
    const inst = e.target.closest('[data-theme-install]');
    if (inst) {
      e.preventDefault();
      busy = inst.dataset.themeInstall; drawCatalog();
      try { const m = await api.themeInstall(busy); busy = ''; await installed(m); } catch (err) { busy = ''; drawCatalog(); toast('Installation impossible : ' + errText(err)); }
      return;
    }
    const act = e.target.closest('[data-theme-act]');
    if (!act) return;
    e.preventDefault();
    const a = act.dataset.themeAct;
    if (a === 'folder') api.themesOpenFolder();
    else if (a === 'import') importZip();
    else if (a === 'catalog' || a === 'catalog-force') loadCatalog(a === 'catalog-force');
    else if (a === 'remove') {
      try { const active = await api.themeRemove(act.dataset.id); applyTheme(active); toast('Thème envoyé à la corbeille'); load(); } catch (err) { toast('Suppression impossible : ' + errText(err)); }
    } else load();
  });
  group.addEventListener('change', (e) => {
    if (!data) return;
    if (e.target.matches('[data-theme-scheme]')) choose({ id: data.active.id, scheme: e.target.value });
    else if (e.target.matches('[data-theme-opt]')) {
      const options = {};
      group.querySelectorAll('[data-theme-opt]').forEach((i) => { options[i.dataset.themeOpt] = i.checked; });
      choose({ id: data.active.id, scheme: data.active.scheme, options });
    }
  });
  // Glisser-déposer d'une archive .zip sur le bloc Thème
  const hasFile = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  group.addEventListener('dragover', (e) => { if (!hasFile(e)) return; e.preventDefault(); group.classList.add('dropping'); });
  group.addEventListener('dragleave', (e) => { if (!group.contains(e.relatedTarget)) group.classList.remove('dropping'); });
  group.addEventListener('drop', (e) => {
    if (!hasFile(e)) return;
    e.preventDefault();
    group.classList.remove('dropping');
    const f = [...e.dataTransfer.files].find((x) => /\.zip$/i.test(x.name));
    if (!f) { toast('Il faut une archive .zip'); return; }
    const p = api.pathForFile && api.pathForFile(f);
    if (p) importZip(p); else toast('Impossible de lire ce fichier');
  });
  load();
}

// eslint-disable-next-line no-global-assign
const _openSettingsP = openSettings;
// eslint-disable-next-line no-global-assign
openSettings = async function () {
  await _openSettingsP();
  try { buildPrefs(document.getElementById('settings')); } catch (e) { console.error('prefs', e && e.stack); }
};
// Le bouton du profil appelle la fonction d'origine : on le rebranche
document.getElementById('profile-btn').addEventListener('click', (e) => { e.stopImmediatePropagation(); openSettings(); }, true);
