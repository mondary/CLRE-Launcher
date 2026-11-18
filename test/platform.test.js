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

test('macOS : la liste des plateformes n’annonce pas Ubisoft, Xbox ou Amazon', { skip: !isMac }, () => {
  const darwin = require('../src/platform/darwin');
  for (const absent of ['ubisoft', 'xbox', 'amazon', 'ea']) assert.ok(!darwin.platformIds.includes(absent), absent);
  assert.ok(darwin.platformIds.includes('steam'));
  assert.ok(darwin.platformIds.includes('gog'));
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
