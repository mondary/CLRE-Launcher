// Installer les jeux GOG sans GOG Galaxy : confirmation, connexion au compte, suivi dans Téléchargements,
// et page « GOG » dans les réglages.
/* global state, api, esc, toast, modal, fmtSize, byId, fallbackBg, emptyBox, VIEWS, PREF_CATS, ROW_TITLES, cleanErr, sync, downloadsShelf, $ */

// ---------- Installer ----------
async function gogConnect() {
  try {
    const s = await api.gogLogin();
    toast(`Compte GOG connecté${s.username ? ` · ${s.username}` : ''}`);
    sync(true);
    return true;
  } catch (e) { toast(cleanErr(e)); return false; }
}

// Connexion dans le navigateur (Google, Facebook… y marchent) : on colle ensuite l'adresse de la page finale
function gogConnectBrowser() {
  api.gogLoginBrowser();
  return new Promise((resolve) => {
    let busy = false;
    modal(`<h2>Connexion dans ton navigateur</h2>
      <p class="sub">Connecte-toi sur la page GOG qui vient de s’ouvrir. Tu arrives ensuite sur une page presque vide : copie son adresse complète (Ctrl L puis Ctrl C) et colle-la ici.</p>
      <label class="field">Adresse de la page<input name="url" required placeholder="https://embed.gog.com/on_login_success?origin=client&code=…" autocomplete="off" autofocus></label>
      <small class="sub" id="gog-code-err"></small>
      <div class="m-actions"><button type="button" class="btn btn-ghost" id="gog-reopen">Rouvrir la page</button><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-light">Valider</button></div>`,
    (dlg, form) => {
      dlg.addEventListener('close', () => { if (!busy) resolve(false); }, { once: true });
      $('#gog-reopen', dlg).onclick = () => api.gogLoginBrowser();
      form.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('#gog-code-err', dlg);
        err.textContent = 'Connexion…';
        try {
          const s = await api.gogLoginCode(new FormData(form).get('url'));
          busy = true;
          dlg.close();
          toast(`Compte GOG connecté${s.username ? ` · ${s.username}` : ''}`);
          sync(true);
          resolve(true);
        } catch (x) { err.textContent = cleanErr(x); }
      };
    });
  });
}

async function gogInstall(g) {
  let st = await api.gogStatus();
  // Plateforme sans téléchargeur direct (macOS) : on ouvre GOG Galaxy sur la fiche du jeu.
  if (st.available === false) { toast(st.reason || 'Installation directe indisponible'); return api.install(g.key); }
  if (!st.connected) {
    const ok = await new Promise((resolve) => {
      let picked = false;
      modal(`<h2>Connecte ton compte GOG</h2>
        <p class="sub">Pour installer ${esc(g.name)} sans GOG Galaxy, le launcher a besoin de ton compte GOG. Ton mot de passe n’est jamais vu par le launcher.</p>
        <small>Tu te connectes avec Google, Facebook ou un autre compte ? Choisis « Dans le navigateur »</small>
        <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="button" class="btn btn-ghost" id="gog-browser">Dans le navigateur</button><button type="submit" class="btn btn-light">Se connecter</button></div>`,
      (dlg, form) => {
        dlg.addEventListener('close', () => { if (!picked) resolve(false); }, { once: true });
        $('#gog-browser', dlg).onclick = () => { picked = true; dlg.close(); gogConnectBrowser().then(resolve); };
        form.onsubmit = (e) => { e.preventDefault(); picked = true; dlg.close(); gogConnect().then(resolve); };
      });
    });
    if (!ok) return;
    st = await api.gogStatus();
  }
  const sep = st.dir.endsWith('\\') ? '' : '\\';
  const target = () => `${st.dir}${sep}${g.name.replace(/[<>:"/\\|?*]/g, '').trim()}`;
  modal(`<h2>Installer ${esc(g.name)}</h2>
    <p class="sub">Le launcher télécharge l’installateur officiel de GOG puis l’installe tout seul, sans GOG Galaxy.</p>
    <div class="pick"><span class="path" id="gog-target">${esc(target())}</span><button type="button" class="btn btn-ghost" id="gog-dir">Changer…</button></div>
    <small>À la fin du téléchargement, Windows te demandera une autorisation : c’est l’installateur de GOG qui en a besoin.</small>
    <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-light">Installer</button></div>`,
  (dlg, form) => {
    $('#gog-dir', dlg).onclick = async () => { const d = await api.gogPickDir(); if (d) { st.dir = d; $('#gog-target', dlg).textContent = target(); } };
    form.onsubmit = async (e) => {
      e.preventDefault();
      dlg.close();
      toast(`Préparation de ${g.name}…`);
      const r = await api.install(g.key);
      if (r && r.needLogin) { toast(r.error || 'Connecte ton compte GOG'); return; }
      if (r && r.error) { toast(r.error); return; }
      toast(`${g.name} ajouté aux téléchargements`);
    };
  });
}

function gogUninstall(g) {
  modal(`<h2>Désinstaller ${esc(g.name)} ?</h2>
    <p class="sub">Les fichiers du jeu et de ses DLC seront supprimés de ${esc(g.installDir || 'ton disque')}, sans passer par GOG Galaxy. Windows te demandera une autorisation.</p>
    <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-light">Désinstaller</button></div>`,
  (dlg, form) => {
    form.onsubmit = async (e) => {
      e.preventDefault();
      dlg.close();
      toast(`Désinstallation de ${g.name}…`);
      const r = await api.uninstall(g.key);
      if (r && r.error) { toast(r.error); return; }
      toast(`${g.name} désinstallé`);
      sync(true);
    };
  });
}

// « Mettre à jour » sur un jeu GOG ou Epic géré par le launcher : la mise à jour part dans Téléchargements
async function storeUpdate(g) {
  toast(`Préparation de la mise à jour de ${g.name}…`);
  const r = await api.play(g.key);
  if (r && r.error) { toast(r.error); return; }
  if (!r) { toast(`Lancement de ${g.name}…`); return; } // compte déconnecté : on lance la version installée
  toast(`Mise à jour de ${g.name} ajoutée aux téléchargements`);
}

const _doActionGog = doAction;
// eslint-disable-next-line no-global-assign
doAction = async function (act, id, el) {
  const g = id ? byId(id) : null;
  if (g && g.store === 'gog') {
    if (act === 'install') return gogInstall(g);
    if (act === 'uninstall') return gogUninstall(g);
    if (act === 'play' && g.needsUpdate) return storeUpdate(g);
  }
  if (act === 'gog-pause') return api.gogPause(id);
  if (act === 'gog-resume') return api.gogResume(id);
  if (act === 'gog-cancel') return api.gogCancel(id);
  return _doActionGog(act, id, el);
};

// ---------- Réglages : page GOG ----------
PREF_CATS.splice(PREF_CATS.findIndex((c) => c.id === 'data'), 0, {
  id: 'gog', title: 'GOG', color: '#a35dd8',
  icon: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="10.8" r="2.8"/><path d="M14.8 10.8v3.4a2.8 2.8 0 0 1-5 1.7"/></svg>`,
  legends: ['Compte GOG', 'Installations GOG'],
  intro: 'Installe tes jeux GOG directement depuis le launcher, sans GOG Galaxy.',
});

const _settingsSystemGog = settingsSystem;
// eslint-disable-next-line no-global-assign
settingsSystem = function (prefs) {
  const s = prefs.settings || {};
  return _settingsSystemGog(prefs) + `
  <fieldset class="field set"><legend>Compte GOG</legend>
    <div class="pick"><span class="path" id="gog-account">…</span><button type="button" class="btn btn-ghost" id="gog-login">Se connecter</button></div>
    <div class="pick gog-nav"><button type="button" class="btn btn-ghost" id="gog-login-browser">Ouvrir dans le navigateur</button></div>
    <small>Sert à lister tous tes jeux GOG et à les installer. Le launcher garde un jeton de connexion chiffré sur ce PC, jamais ton mot de passe</small>
  </fieldset>
  <fieldset class="field set"><legend>Installations GOG</legend>
    <div class="pick"><span class="path" id="gog-dir-path">${esc(s.gogDir || '')}</span><button type="button" class="btn btn-ghost" id="gog-pick-dir">Changer…</button></div>
    <small>Chaque jeu s’installe dans son propre sous-dossier</small>
  </fieldset>`;
};

new MutationObserver(() => {
  const dlg = $('#settings');
  if (!dlg.open || !$('#gog-login', dlg) || dlg.dataset.gogWired === '1') return;
  dlg.dataset.gogWired = '1';
  dlg.addEventListener('close', () => { delete dlg.dataset.gogWired; }, { once: true });
  const paint = (st) => {
    const acc = $('#gog-account', dlg), btn = $('#gog-login', dlg);
    if (!acc || !btn) return;
    acc.textContent = st.connected ? `Connecté${st.username ? ` · ${st.username}` : ''}` : 'Pas connecté';
    btn.textContent = st.connected ? 'Se déconnecter' : 'Se connecter';
    btn.dataset.connected = st.connected ? '1' : '';
    const nav = $('#gog-login-browser', dlg);
    if (nav) (nav.closest('.row') || nav).hidden = st.connected;
  };
  // La connexion par navigateur remplace la fenêtre de réglages par la fenêtre « colle l'adresse »
  $('#gog-login-browser', dlg).onclick = () => { dlg.close(); gogConnectBrowser(); };
  api.gogStatus().then(paint);
  $('#gog-login', dlg).onclick = async (e) => {
    if (e.currentTarget.dataset.connected) { paint(await api.gogLogout()); toast('Compte GOG déconnecté'); sync(true); return; }
    if (await gogConnect()) paint(await api.gogStatus());
  };
  $('#gog-pick-dir', dlg).onclick = async () => { const d = await api.gogPickDir(); if (d) $('#gog-dir-path', dlg).textContent = d; };
}).observe($('#settings'), { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
ROW_TITLES.push([(el) => el.querySelector('#gog-account'), 'Compte'], [(el) => el.querySelector('#gog-login-browser'), 'Avec Google, Facebook…'], [(el) => el.querySelector('#gog-dir-path'), 'Dossier d’installation']);
