// Installer les jeux Epic sans le Epic Games Launcher (via Legendary) : connexion, confirmation,
// désinstallation, et page « Epic Games » dans les réglages.
/* global state, api, esc, toast, modal, byId, PREF_CATS, ROW_TITLES, cleanErr, sync, $ */

const EPIC_TOOL_NOTE = 'La première fois, le launcher télécharge Legendary (outil open-source qui sert aussi à Heroic, 17 Mo) depuis GitHub et vérifie son empreinte.';

async function epicConnect() {
  toast('Ouverture de la connexion Epic…');
  try {
    const s = await api.epicLogin();
    toast(`Compte Epic connecté${s.username ? ` · ${s.username}` : ''} · tes jeux arrivent`);
    sync(true);
    return true;
  } catch (e) { toast(cleanErr(e)); return false; }
}

// Connexion dans le navigateur : la page Epic finit sur un texte JSON qu'on colle dans le launcher
function epicConnectBrowser() {
  api.epicLoginBrowser();
  return new Promise((resolve) => {
    let busy = false;
    modal(`<h2>Connexion Epic dans ton navigateur</h2>
      <p class="sub">Connecte-toi sur la page Epic qui vient de s’ouvrir. Tu arrives ensuite sur une page avec un court texte qui contient « authorizationCode » : copie tout le texte (Ctrl A puis Ctrl C) et colle-le ici.</p>
      <label class="field">Texte de la page<input name="code" required placeholder='{"redirectUrl":"…","authorizationCode":"…"}' autocomplete="off" autofocus></label>
      <small class="sub" id="epic-code-err"></small>
      <div class="m-actions"><button type="button" class="btn btn-ghost" id="epic-reopen">Rouvrir la page</button><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-light">Valider</button></div>`,
    (dlg, form) => {
      dlg.addEventListener('close', () => { if (!busy) resolve(false); }, { once: true });
      $('#epic-reopen', dlg).onclick = () => api.epicLoginBrowser();
      form.onsubmit = async (e) => {
        e.preventDefault();
        const err = $('#epic-code-err', dlg);
        err.textContent = 'Connexion…';
        try {
          const s = await api.epicLoginCode(new FormData(form).get('code'));
          busy = true;
          dlg.close();
          toast(`Compte Epic connecté${s.username ? ` · ${s.username}` : ''} · tes jeux arrivent`);
          sync(true);
          resolve(true);
        } catch (x) { err.textContent = cleanErr(x); }
      };
    });
  });
}

async function epicInstall(g) {
  if (g.thirdParty) { toast(`${g.name} s’installe par un autre launcher (Ubisoft Connect ou EA app)`); return; }
  let st = await api.epicStatus();
  // Jeu géré par Heroic : c'est lui qui installe (aucun téléchargeur direct sur macOS).
  if (g.viaHeroic) return api.install(g.key);
  // Plateforme sans Legendary (macOS) : on ouvre le Epic Games Launcher sur le jeu.
  if (st.available === false) { toast(st.reason || 'Installation directe indisponible'); return api.install(g.key); }
  if (!st.connected) {
    const ok = await new Promise((resolve) => {
      let picked = false;
      modal(`<h2>Connecte ton compte Epic</h2>
        <p class="sub">Pour installer ${esc(g.name)} sans le Epic Games Launcher, le launcher a besoin de ton compte Epic. Ton mot de passe n’est jamais vu par le launcher.</p>
        <small>${esc(EPIC_TOOL_NOTE)} Avec Google, Apple ou un autre compte, choisis « Dans le navigateur ».</small>
        <div class="m-actions"><button type="button" class="btn btn-ghost" id="epic-egl">Via Epic Games Launcher</button><button type="button" class="btn btn-ghost" id="epic-browser">Dans le navigateur</button><button type="submit" class="btn btn-light">Se connecter</button></div>`,
      (dlg, form) => {
        dlg.addEventListener('close', () => { if (!picked) resolve(false); }, { once: true });
        $('#epic-egl', dlg).onclick = () => { dlg.close(); api.epicInstallEgl(g.key); toast(`Installation de ${g.name} demandée au Epic Games Launcher`); };
        $('#epic-browser', dlg).onclick = () => { picked = true; dlg.close(); epicConnectBrowser().then(resolve); };
        form.onsubmit = (e) => { e.preventDefault(); picked = true; dlg.close(); epicConnect().then(resolve); };
      });
    });
    if (!ok) return;
    st = await api.epicStatus();
  }
  modal(`<h2>Installer ${esc(g.name)}</h2>
    <p class="sub">Le launcher télécharge le jeu depuis les serveurs d’Epic, sans le Epic Games Launcher. Le jeu se lancera aussi sans lui.</p>
    <div class="pick"><span class="path" id="epic-target">${esc(st.dir)}</span><button type="button" class="btn btn-ghost" id="epic-dir">Changer…</button></div>
    <small>Le jeu s’installe dans son propre sous-dossier. Certains jeux installent ensuite des composants Windows (Visual C++, DirectX) : Windows te demandera une autorisation.</small>
    <div class="m-actions"><button type="button" class="btn btn-ghost" data-close>Annuler</button><button type="submit" class="btn btn-light">Installer</button></div>`,
  (dlg, form) => {
    $('#epic-dir', dlg).onclick = async () => { const d = await api.epicPickDir(); if (d) $('#epic-target', dlg).textContent = d; };
    form.onsubmit = async (e) => {
      e.preventDefault();
      dlg.close();
      const r = await api.install(g.key);
      if (r && r.error) { toast(r.error); return; }
      if (r && r.needLogin) { toast('Connecte ton compte Epic'); return; }
      toast(`${g.name} ajouté aux téléchargements`);
    };
  });
}

function epicUninstall(g) {
  modal(`<h2>Désinstaller ${esc(g.name)} ?</h2>
    <p class="sub">Les fichiers du jeu seront supprimés de ${esc(g.installDir || 'ton disque')}. Tes sauvegardes dans le cloud Epic ne sont pas touchées.</p>
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

const _doActionEpic = doAction;
// eslint-disable-next-line no-global-assign
doAction = async function (act, id, el) {
  const g = id ? byId(id) : null;
  if (g && g.store === 'epic') {
    if (act === 'install') return epicInstall(g);
    if (act === 'uninstall' && g.viaLegendary) return epicUninstall(g);
    if (act === 'play' && g.viaLegendary && g.needsUpdate) return storeUpdate(g);
  }
  if (act === 'epic-pause') return api.epicPause(id);
  if (act === 'epic-resume') return api.epicResume(id);
  if (act === 'epic-cancel') return api.epicCancel(id);
  return _doActionEpic(act, id, el);
};

// ---------- Réglages : page Epic Games ----------
PREF_CATS.splice(PREF_CATS.findIndex((c) => c.id === 'data'), 0, {
  id: 'epic', title: 'Epic Games', color: '#2a2a2d',
  icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h14v14l-7 4-7-4Z"/><path d="M10 8H8v6h2M8 11h2M13 8v6M16 8h-1v6"/></svg>',
  legends: ['Compte Epic', 'Installations Epic'],
  intro: 'Installe et lance tes jeux Epic directement depuis le launcher, sans le Epic Games Launcher.',
});

const _settingsSystemEpic = settingsSystem;
// eslint-disable-next-line no-global-assign
settingsSystem = function (prefs) {
  const s = prefs.settings || {};
  return _settingsSystemEpic(prefs) + `
  <fieldset class="field set"><legend>Compte Epic</legend>
    <div class="pick"><span class="path" id="epic-account">…</span><button type="button" class="btn btn-ghost" id="epic-login">Se connecter</button></div>
    <div class="pick"><button type="button" class="btn btn-ghost" id="epic-login-browser">Ouvrir dans le navigateur</button></div>
    <small>${esc(EPIC_TOOL_NOTE)} La connexion reste sur ce PC, jamais ton mot de passe</small>
  </fieldset>
  <fieldset class="field set"><legend>Installations Epic</legend>
    <div class="pick"><span class="path" id="epic-dir-path">${esc(s.epicDir || '')}</span><button type="button" class="btn btn-ghost" id="epic-pick-dir">Changer…</button></div>
    <small>Les jeux déjà installés avec le Epic Games Launcher continuent de passer par lui</small>
  </fieldset>`;
};

new MutationObserver(() => {
  const dlg = $('#settings');
  if (!dlg.open || !$('#epic-login', dlg) || dlg.dataset.epicWired === '1') return;
  dlg.dataset.epicWired = '1';
  dlg.addEventListener('close', () => { delete dlg.dataset.epicWired; }, { once: true });
  const paint = (st) => {
    const acc = $('#epic-account', dlg), btn = $('#epic-login', dlg);
    if (!acc || !btn) return;
    acc.textContent = st.connected ? `Connecté${st.username ? ` · ${st.username}` : ''}` : 'Pas connecté';
    btn.textContent = st.connected ? 'Se déconnecter' : 'Se connecter';
    btn.dataset.connected = st.connected ? '1' : '';
    const nav = $('#epic-login-browser', dlg);
    if (nav) (nav.closest('.row') || nav).hidden = st.connected;
  };
  $('#epic-login-browser', dlg).onclick = () => { dlg.close(); epicConnectBrowser(); };
  api.epicStatus().then(paint);
  $('#epic-login', dlg).onclick = async (e) => {
    const b = e.currentTarget;
    if (b.dataset.connected) { paint(await api.epicLogout()); toast('Compte Epic déconnecté'); sync(true); return; }
    b.disabled = true;
    if (await epicConnect()) paint(await api.epicStatus());
    b.disabled = false;
  };
  $('#epic-pick-dir', dlg).onclick = async () => { const d = await api.epicPickDir(); if (d) $('#epic-dir-path', dlg).textContent = d; };
}).observe($('#settings'), { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
ROW_TITLES.push([(el) => el.querySelector('#epic-account'), 'Compte'], [(el) => el.querySelector('#epic-login-browser'), 'Avec Google, Apple…'], [(el) => el.querySelector('#epic-dir-path'), 'Dossier d’installation']);
