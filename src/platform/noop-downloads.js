// Doublure des téléchargeurs directs (GOG sans Galaxy, Epic sans EGL) sur les plateformes
// où ils n'existent pas : mêmes méthodes, aucun effet. Évite de parsemer main.js de tests.
class NoopDownloads {
  constructor(kind) {
    this.kind = kind;
    this.auth = null;
  }

  status() {
    return {
      available: false,
      connected: false,
      dir: '',
      reason: this.kind === 'gog'
        ? 'Installation directe indisponible sur macOS : utilise GOG Galaxy'
        : 'Installation directe indisponible sur macOS : utilise le Epic Games Launcher',
    };
  }

  user() { return null; }
  ownedGames() { return []; }
  installedMap() { return {}; }
  updateFlag() { return false; }
  needsUpdate() { return false; }
  list() { return []; }
  async checkUpdates() { return false; }
  async enqueue() { return { error: this.status().reason }; }
  async launch() { return { error: this.status().reason }; }
  async uninstall() { return { error: this.status().reason }; }
  authUrl() { return ''; }
  async login() { return this.status(); }
  async loginWithPasted() { return this.status(); }
  async logout() { return this.status(); }
  async ensureBin() { return false; }
  async pause() { return false; }
  async resume() { return false; }
  async cancel() { return false; }
}

module.exports = { NoopDownloads };
