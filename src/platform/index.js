// Couche plateforme : tout ce qui dépend de l'OS passe par ici.
// Chaque implémentation (win32, darwin, linux) expose la même surface ; le reste du
// launcher ne connaît ni le registre Windows, ni les chemins macOS.
const impl = process.platform === 'darwin' ? require('./darwin')
  : process.platform === 'win32' ? require('./win32')
    : require('./linux');

module.exports = impl;
