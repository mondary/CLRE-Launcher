// Applique le thème choisi avant le premier affichage (chargé dans <head>, après les CSS du launcher).
// Le thème : une feuille clre-theme://<id>/theme.css chargée en dernier, les variables de son jeu de
// couleurs dans <style id="theme-vars">, et des classes theme-opt-<option> sur <html>.
/* exported applyTheme */
function applyTheme(t) {
  const root = document.documentElement;
  const head = document.head;
  const oldCss = document.getElementById('theme-css');
  const oldVars = document.getElementById('theme-vars');
  const sameTheme = !!(t && oldCss && root.dataset.theme === t.id);
  if (oldVars) oldVars.remove();
  root.classList.forEach((c) => { if (c.startsWith('theme-opt-')) root.classList.remove(c); });
  root.dataset.theme = (t && t.id) || 'graphite';
  root.dataset.themeScheme = (t && t.scheme) || 'default';
  root.style.colorScheme = (t && t.colorScheme) || 'dark';
  root.dataset.colorScheme = (t && t.colorScheme) || 'dark'; // les CSS savent si le thème est clair
  // Matière Windows (Mica…) réellement active : le CSS du thème peut rendre la page transparente
  root.dataset.windowMaterial = (t && t.windowMaterial) || 'none';
  if (oldCss && !(sameTheme && t.css)) oldCss.remove();
  if (!t) return;
  if (t.css && !(sameTheme && oldCss.getAttribute('href') === t.css)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = t.css;
    if (sameTheme) {
      // Rechargement à chaud : l'ancienne feuille reste jusqu'à ce que la nouvelle soit prête (pas de clignement)
      link.onload = link.onerror = () => { oldCss.remove(); link.id = 'theme-css'; };
      oldCss.after(link);
    } else {
      link.id = 'theme-css';
      head.appendChild(link);
    }
  }
  const vars = Object.entries(t.vars || {});
  if (vars.length) {
    const style = document.createElement('style');
    style.id = 'theme-vars';
    // Les valeurs sont filtrées côté launcher (pas de ; { } < >) : elles ne peuvent pas sortir de la règle.
    style.textContent = `:root {\n${vars.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;
    head.appendChild(style);
  }
  for (const o of t.options || []) root.classList.add(`theme-opt-${o}`);
}

try { applyTheme(window.launcher && window.launcher.themeBoot ? window.launcher.themeBoot() : null); } catch (e) { console.error('thème', e); }
// Rechargement à chaud : le launcher prévient quand le dossier du thème actif change
if (window.launcher && window.launcher.onThemeChanged) window.launcher.onThemeChanged((t) => applyTheme(t));

// Plateforme : quelques règles CSS en dépendent (barre de titre macOS, raccourcis affichés).
document.documentElement.dataset.platform = /Mac/i.test(navigator.userAgent) ? 'darwin'
  : /Win/i.test(navigator.userAgent) ? 'win32' : 'linux';
