#!/usr/bin/env node
// Vérification de démarrage du processus principal, sans fenêtre et sans écran.
// Electron est remplacé par une doublure : on exécute le vrai main.js (protocoles, thèmes,
// IPC, création de fenêtre) et on échoue si une exception sort.
//
//   node scripts/smoke-main.js
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clre-smoke-'));
const noop = () => {};
const handlers = new Map();
let windows = 0;

const app = {
  setName: noop,
  setPath: noop,
  getPath: (k) => (k === 'appData' ? root : path.join(root, k)),
  getAppPath: () => process.cwd(),
  getVersion: () => 'test',
  requestSingleInstanceLock: () => true,
  whenReady: () => Promise.resolve(),
  on: noop,
  quit: noop,
  setLoginItemSettings: noop,
  isPackaged: false,
  commandLine: { appendSwitch: noop },
  dock: { hide: noop },
};

class BrowserWindow {
  constructor(opts = {}) {
    windows++;
    this.opts = opts;
    this.webContents = {
      on: noop, send: noop, setWindowOpenHandler: noop, openDevTools: noop,
      isLoading: () => false, once: noop, mainFrame: {},
    };
  }
  loadFile() { return Promise.resolve(); }
  loadURL() { return Promise.resolve(); }
  on() {}
  once() {}
  show() {}
  hide() {}
  focus() {}
  isDestroyed() { return false; }
  isVisible() { return true; }
  isMinimized() { return false; }
  isFocused() { return false; }
  restore() {}
  setBackgroundColor() {}
  setTitleBarOverlay() {}
  setFullScreen() {}
  isFullScreen() { return false; }
  setAlwaysOnTop() {}
  setIgnoreMouseEvents() {}
  setVisibleOnAllWorkspaces() {}
  showInactive() {}
  getBounds() { return { x: 0, y: 0, width: 100, height: 100 }; }
  setBounds() {}
}

class Tray {
  setToolTip() {}
  setContextMenu() {}
  on() {}
}

const electron = {
  app,
  BrowserWindow,
  Tray,
  Menu: { buildFromTemplate: () => ({}), setApplicationMenu: noop },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true, addRepresentation: noop, toPNG: () => Buffer.alloc(0), resize: () => ({ toBitmap: () => Buffer.alloc(0) }) }) },
  nativeTheme: { themeSource: 'dark', shouldUseDarkColors: true },
  globalShortcut: { register: () => true, unregisterAll: noop },
  ipcMain: {
    handle: (ch, fn) => handlers.set(ch, fn),
    on: (ch, fn) => handlers.set(ch, fn),
  },
  Notification: class { static isSupported() { return false; } on() {} show() {} },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showSaveDialog: async () => ({ canceled: true }) },
  shell: { openExternal: async () => {}, openPath: async () => '', trashItem: async () => {} },
  session: { defaultSession: { setPermissionRequestHandler: noop, setPermissionCheckHandler: noop, setDisplayMediaRequestHandler: noop } },
  protocol: { registerSchemesAsPrivileged: noop, handle: noop },
  net: { fetch: async () => ({ ok: false, status: 0, text: async () => '', json: async () => ({}) }) },
  screen: { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }), getCursorScreenPoint: () => ({ x: 0, y: 0 }), getDisplayNearestPoint: () => ({ bounds: { x: 0, y: 0, width: 1440, height: 900 }, scaleFactor: 2 }) },
};

const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return electron;
  return load.call(this, request, parent, isMain);
};

const fail = (e) => {
  console.error('\nÉCHEC :', e && e.stack ? e.stack : e);
  process.exit(1);
};
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);

require('../src/main');

setTimeout(async () => {
  const expected = ['library', 'play', 'themes:list', 'gog:status', 'epic:status', 'prefs:get', 'update:check'];
  const missing = expected.filter((ch) => !handlers.has(ch));
  if (missing.length) return fail(new Error(`handlers IPC manquants : ${missing.join(', ')}`));
  console.log(`OK — ${handlers.size} handlers IPC, ${windows} fenêtre(s) créée(s), plateforme ${process.platform}`);
  if (process.argv.includes('--library')) {
    try {
      const lib = await handlers.get('library')({}, false);
      const counts = (lib.platforms || []).filter((p) => p.count).map((p) => `${p.id}:${p.count}`).join(' ');
      console.log(`Bibliothèque — ${lib.games.length} jeux · ${counts || 'aucun'} · ${lib.games.filter((g) => g.installed).length} installés`);
      const sample = lib.games.slice(0, 5).map((g) => `${g.store}/${g.name}`);
      if (sample.length) console.log(`Exemples — ${sample.join(' · ')}`);
      const st = lib.games.reduce((m, g) => { if (g.status) m[g.status] = (m[g.status] || 0) + 1; return m; }, {});
      if (Object.keys(st).length) console.log(`Statuts Steam — ${JSON.stringify(st)} · ${JSON.stringify(lib.statusLabels || {})}`);
      if (process.argv.includes('--status')) {
        const g = lib.games.find((x) => x.store === 'steam');
        const r = await handlers.get('steam:set-status')({}, g.key, 'done');
        const state = await handlers.get('steam:state')({});
        console.log(`Statut test — ${g.name} → done · ${JSON.stringify(r)}`);
        console.log(`État Steam — ${JSON.stringify(state)}`);
      }
    } catch (e) { return fail(e); }
  }
  process.exit(0);
}, 2500);
