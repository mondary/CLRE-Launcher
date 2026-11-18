// Écriture des collections Steam : format du fichier, version, sauvegarde, collections
// dynamiques intouchables, refus quand Steam tourne.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sc = require('../src/steam-collections');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'clre-steamcol-'));
  const dir = path.join(root, 'userdata', '123', 'config', 'cloudstorage');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'cloud-storage-namespaces.json'), JSON.stringify([[1, '5'], [3, '0']]));
  const col = (id, name, added, extra = {}) => [`user-collections.${id}`, {
    key: `user-collections.${id}`,
    timestamp: 1700000000,
    value: JSON.stringify({ id, name, added, removed: [], ...extra }),
    version: '5',
    conflictResolutionMethod: 'custom',
    strMethodId: 'union-collections',
  }];
  const data = [
    col('favorite', 'Favoris', [1, 2]),
    col('from-tag-old', '✅ DONE', [10]),
    col('dyn', '🖲️ VR', [], { filterSpec: { type: 'or', children: [] } }),
    ['autre.namespace', { value: 'x', version: '5' }],
  ];
  const file = path.join(dir, 'cloud-storage-namespace-1.json');
  fs.writeFileSync(file, JSON.stringify(data));
  return { root, dir, file };
}

test('Steam collections : lit les collections statiques et dynamiques', () => {
  const { root } = fixture();
  const { collections, file } = sc.listCollections(root, 123);
  assert.ok(file.endsWith('cloud-storage-namespace-1.json'));
  assert.equal(collections.length, 3);
  const done = collections.find((c) => c.name === '✅ DONE');
  assert.deepEqual(done.apps, [10]);
  assert.equal(done.dynamic, false);
  const dyn = collections.find((c) => c.name === '🖲️ VR');
  assert.equal(dyn.dynamic, true);
});

test('Steam collections : détecte les collections de statut par leur nom', () => {
  const cols = [
    { id: 'a', name: '▶️ PLAYING', added: [], apps: [], dynamic: false },
    { id: 'b', name: '➡️ Play next', added: [], apps: [], dynamic: false },
    { id: 'c', name: '✅ DONE', added: [], apps: [], dynamic: false },
    { id: 'd', name: '❌ Discarded', added: [], apps: [], dynamic: false },
    { id: 'e', name: '🖲️ VR', added: [], apps: [], dynamic: true },
  ];
  assert.deepEqual(sc.detectStatusMap(cols), { todo: 'b', playing: 'a', done: 'c', dropped: 'd' });
});

test('Steam collections : ajoute, retire, crée, et ne touche pas aux dynamiques', () => {
  const { root, file } = fixture();
  const backupDir = path.join(root, 'backups');
  const before = JSON.parse(fs.readFileSync(file, 'utf8'));

  const res = sc.apply(root, 123, [
    { id: 'from-tag-old', add: [11], remove: [10] },
    { id: 'uc-new', name: 'Ma collection', create: true, add: [12] },
    { id: 'dyn', add: [99] }, // dynamique : ignorée
  ], { backupDir, running: () => false });

  assert.equal(res.changed, 2);
  assert.ok(fs.existsSync(res.backup));

  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  // Les entrées étrangères sont intactes
  assert.deepEqual(after.find(([k]) => k === 'autre.namespace'), before.find(([k]) => k === 'autre.namespace'));
  // La collection dynamique n'a pas bougé
  assert.deepEqual(after.find(([k]) => k === 'user-collections.dyn'), before.find(([k]) => k === 'user-collections.dyn'));

  const done = after.find(([k]) => k === 'user-collections.from-tag-old')[1];
  const v = JSON.parse(done.value);
  assert.deepEqual(v.added, [11]);
  assert.deepEqual(v.removed, [10]);
  assert.equal(done.version, '6', 'version incrémentée pour que Steam accepte');

  const created = after.find(([k]) => k === 'user-collections.uc-new')[1];
  assert.equal(created.version, '6');
  assert.deepEqual(JSON.parse(created.value), { id: 'uc-new', name: 'Ma collection', added: [12], removed: [] });
});

test('Steam collections : refuse d’écrire si Steam tourne', () => {
  const { root } = fixture();
  assert.throws(
    () => sc.apply(root, 123, [{ id: 'from-tag-old', add: [1] }], { backupDir: path.join(root, 'b'), running: () => true }),
    (e) => e.code === 'steam-running',
  );
});

test('Steam collections : priorité de statut quand un jeu est dans plusieurs collections', () => {
  const cols = [
    { id: 'p', name: 'PLAYING', appids: [10], apps: ['10'], dynamic: false },
    { id: 'd', name: 'DONE', appids: [10], apps: ['10'], dynamic: false },
  ];
  const map = { playing: 'p', done: 'd', dropped: null, todo: null };
  assert.equal(sc.statusForApp(cols, map, 10), 'playing');
  assert.equal(sc.statusForApp(cols, map, 11), '');
});
