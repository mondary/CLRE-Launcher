// Tests de la couche plateforme macOS : lecteurs Steam, Epic, GOG et règles de lancement.
// Aucun Electron, aucune fenêtre : node --test suffit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const isMac = process.platform === 'darwin';

function tmp(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `clre-${prefix}-`));
}
function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// ---------- Steam ----------
test('Steam : lit appmanifest, temps de jeu et identité du compte', { skip: !isMac }, () => {
  const root = tmp('steam');
  // Le cache du chemin est posé au premier appel : la variable doit être là avant.
  process.env.CLRE_STEAM_PATH = root;

  write(path.join(root, 'steamapps', 'libraryfolders.vdf'), `"libraryfolders"
{
	"0"
	{
		"path"		"${root}"
	}
}`);
  write(path.join(root, 'steamapps', 'appmanifest_440.acf'), `"AppState"
{
	"appid"		"440"
	"name"		"Team Fortress 2"
	"StateFlags"		"4"
	"SizeOnDisk"		"1000"
	"installdir"		"Team Fortress 2"
	"LastPlayed"		"1700000000"
}`);
  const id64 = '76561197960287930';
  const accountId = String(BigInt(id64) - 76561197960265728n);
  write(path.join(root, 'config', 'loginusers.vdf'), `"users"
{
	"${id64}"
	{
		"PersonaName"		"Testeur"
		"MostRecent"		"1"
		"Timestamp"		"1700000000"
	}
}`);
  write(path.join(root, 'userdata', accountId, 'config', 'localconfig.vdf'), `"UserLocalConfigStore"
{
	"Software"
	{
		"Valve"
		{
			"Steam"
			{
				"apps"
				{
					"440"
					{
						"Playtime"		"120"
						"LastPlayed"		"1700000000"
					}
				}
			}
		}
	}
}`);

  const { loadLibrary } = require('../src/steam');
  return loadLibrary({}).then((lib) => {
    assert.equal(lib.steamPath, root);
    assert.equal(lib.user.name, 'Testeur');
    assert.equal(lib.games.length, 1);
    const g = lib.games[0];
    assert.equal(g.name, 'Team Fortress 2');
    assert.equal(g.installed, true);
    assert.equal(g.playtime, 120);
    assert.equal(g.installDir, path.join(root, 'steamapps', 'common', 'Team Fortress 2'));
  });
});

// ---------- Epic ----------
test('Epic : ne garde que les jeux Mac et lit les manifestes installés', { skip: !isMac }, () => {
  const data = tmp('epic');
  const catalog = [
    {
      id: 'cat-mac', namespace: 'ns', title: 'Mac Game', categories: [{ path: 'games' }],
      releaseInfo: [{ platform: ['Mac'], appId: 'app-mac' }], keyImages: [],
      customAttributes: { ProcessNames: { value: 'MacGame' } },
    },
    {
      id: 'cat-win', namespace: 'ns', title: 'Windows Only', categories: [{ path: 'games' }],
      releaseInfo: [{ platform: ['Windows'], appId: 'app-win' }], keyImages: [],
    },
  ];
  write(path.join(data, 'Catalog', 'catcache.bin'), Buffer.from(JSON.stringify(catalog)).toString('base64'));
  write(path.join(data, 'Manifests', 'app-mac.item'), JSON.stringify({
    AppName: 'app-mac', CatalogItemId: 'cat-mac', CatalogNamespace: 'ns',
    AppCategories: ['games'], InstallLocation: '/tmp/Mac Game', InstallSize: 1234,
    LaunchExecutable: '/tmp/Mac Game/Mac Game.app/Contents/MacOS/Mac Game', DisplayName: 'Mac Game',
  }));

  const { loadEpic } = require('../src/epic');
  const res = loadEpic({}, { dataDir: data, platform: 'mac' });
  assert.equal(res.available, true);
  assert.equal(res.games.length, 1, 'un jeu Windows ne doit pas apparaître');
  const g = res.games[0];
  assert.equal(g.name, 'Mac Game');
  assert.equal(g.installed, true);
  assert.equal(g.installDir, '/tmp/Mac Game');
  assert.ok(g.processNames.includes('mac game'));
});

// ---------- GOG ----------
test('GOG : reconnaît un bundle .app par son marqueur goggame-<id>.info', { skip: !isMac }, () => {
  const dir = tmp('gog');
  const app = path.join(dir, 'Celeste.app');
  write(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>Celeste</string>
<key>CFBundleIdentifier</key><string>com.gog.Celeste</string>
</dict></plist>`);
  write(path.join(app, 'Contents', 'Resources', 'goggame-1207658924.info'), JSON.stringify({
    gameId: '1207658924', rootGameId: '1207658924', name: 'Celeste', category: 'game',
  }));
  // Un DLC dans le même bundle ne doit pas produire une entrée
  write(path.join(app, 'Contents', 'Resources', 'goggame-999.info'), JSON.stringify({
    gameId: '999', rootGameId: '1207658924', name: 'Celeste DLC', category: 'dlc',
  }));

  const darwin = require('../src/platform/darwin');
  const g = darwin._internal.gogGameFromApp(app);
  assert.ok(g, 'le bundle doit être reconnu');
  assert.equal(g.id, '1207658924');
  assert.equal(g.name, 'Celeste');
  assert.deepEqual(darwin._internal.appProcessNames(app), ['celeste']);
});

// ---------- EA app ----------
test('EA app : reconnaît un bundle com.ea.* et ignore les autres applications', { skip: !isMac }, () => {
  const root = tmp('ea');
  const ea = path.join(root, 'The Sims 4.app');
  const other = path.join(root, 'Notes.app');
  for (const [app, id, exe] of [[ea, 'com.ea.mas.TheSims4', 'The Sims 4'], [other, 'com.apple.Notes', 'Notes']]) {
    write(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>${id}</string>
<key>CFBundleExecutable</key><string>${exe}</string>
</dict></plist>`);
  }
  const darwin = require('../src/platform/darwin');
  const games = darwin._internal.loadEa([root]);
  assert.equal(games.length, 1);
  assert.equal(games[0].store, 'ea');
  assert.equal(games[0].name, 'The Sims 4');
  assert.equal(games[0].exe, ea);
  assert.deepEqual(games[0].processNames, ['the sims 4']);
});

// ---------- itch.io ----------
test('itch.io : lit le reçu gzippé et trouve le bundle .app', { skip: !isMac }, () => {
  const zlib = require('zlib');
  const root = tmp('itch');
  const dir = path.join(root, 'celeste');
  const app = path.join(dir, 'Celeste.app');
  write(path.join(app, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Celeste</string></dict></plist>`);
  write(path.join(dir, '.itch', 'receipt.json.gz'), zlib.gzipSync(JSON.stringify({
    game: { id: 12345, title: 'Celeste', stillCoverUrl: 'https://example.test/cover.png' },
  })));

  const darwin = require('../src/platform/darwin');
  const games = darwin._internal.loadItch([root]);
  assert.equal(games.length, 1);
  const g = games[0];
  assert.equal(g.store, 'itch');
  assert.equal(g.name, 'Celeste');
  assert.equal(g.key, 'itch:12345');
  assert.equal(g.exe, app);
  assert.equal(g.customCover, 'https://example.test/cover.png');
  assert.deepEqual(g.processNames, ['celeste']);
});

// ---------- Heroic ----------
test('Heroic : récupère les jeux Mac d’Epic et GOG, ignore les builds Windows', { skip: !isMac }, () => {
  const root = tmp('heroic');
  const macGame = path.join(root, 'Mac Game');
  const macApp = path.join(macGame, 'Mac Game.app');
  write(path.join(macApp, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>MacGame</string></dict></plist>`);
  const celeste = path.join(root, 'Celeste');
  const celesteApp = path.join(celeste, 'Celeste.app');
  write(path.join(celesteApp, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleExecutable</key><string>Celeste</string></dict></plist>`);

  write(path.join(root, 'legendaryConfig', 'legendary', 'installed.json'), JSON.stringify({
    AppName: { app_name: 'AppName', title: 'Mac Game', install_path: macGame, executable: 'Mac Game.app/Contents/MacOS/MacGame', platform: 'Mac' },
    WinGame: { app_name: 'WinGame', title: 'Windows Only', install_path: path.join(root, 'WinGame'), executable: 'WinGame.exe', platform: 'Windows' },
  }));
  write(path.join(root, 'gog_store', 'installed.json'), JSON.stringify({
    installed: [{ appName: '1207658924', install_path: celeste, executable: '', platform: 'osx' }],
  }));
  write(path.join(root, 'store_cache', 'gog_library.json'), JSON.stringify({
    games: [{ app_name: '1207658924', title: 'Celeste' }],
  }));

  const darwin = require('../src/platform/darwin');
  const h = darwin._internal.readHeroic([root]);
  assert.equal(h.epic.length, 1, 'un build Windows ne doit pas être listé');
  assert.equal(h.epic[0].name, 'Mac Game');
  assert.equal(h.epic[0].viaHeroic, true);
  assert.equal(h.epic[0].exe, macApp);
  assert.equal(h.gog.length, 1);
  assert.equal(h.gog[0].name, 'Celeste');
  assert.equal(h.gog[0].exe, celesteApp);
  assert.equal(h.amazon.length, 0);
});

// ---------- Règles de lancement ----------
test('macOS : un bundle .app est un programme, un dossier quelconque non', { skip: !isMac }, () => {
  const darwin = require('../src/platform/darwin');
  const dir = tmp('launch');
  const app = path.join(dir, 'Game.app');
  fs.mkdirSync(app, { recursive: true });
  const plain = path.join(dir, 'Dossier');
  fs.mkdirSync(plain, { recursive: true });
  const script = path.join(dir, 'run.sh');
  write(script, '#!/bin/sh\n');
  fs.chmodSync(script, 0o755);

  assert.equal(darwin.isProgram(app), true);
  assert.equal(darwin.isProgram(plain), false);
  assert.equal(darwin.isProgram(script), true);
  assert.equal(darwin.isLocalFile('/Applications/Game.app'), true);
  assert.equal(darwin.isLocalFile('//serveur/partage/jeu.app'), false, 'partage réseau refusé');
  assert.equal(darwin.isLocalFile('relative/chemin'), false);
});

test('macOS : la liste des plateformes n’annonce pas Ubisoft ni Xbox', { skip: !isMac }, () => {
  const darwin = require('../src/platform/darwin');
  for (const absent of ['ubisoft', 'xbox']) assert.ok(!darwin.platformIds.includes(absent), absent);
  for (const present of ['steam', 'epic', 'gog', 'ea', 'battlenet', 'riot', 'amazon', 'itch']) assert.ok(darwin.platformIds.includes(present), present);
});

// ---------- Doublure des téléchargements directs ----------
test('Téléchargements directs : indisponibles sur macOS, sans planter les appelants', async () => {
  const { NoopDownloads } = require('../src/platform/noop-downloads');
  const d = new NoopDownloads('gog');
  assert.equal(d.status().available, false);
  assert.equal(d.auth, null);
  assert.deepEqual(d.list(), []);
  assert.deepEqual(await d.enqueue('1', 'Jeu'), { error: d.status().reason });
});
