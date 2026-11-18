// Intégrations système : statut Discord, raccourcis Bureau, mise à jour du launcher.
const fs = require('fs');
const path = require('path');
const net = require('net');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

// ---------- Statut Discord (Rich Presence via le canal local de l'app Discord) ----------
// Le canal est un tube nommé sous Windows, un socket Unix ailleurs (chemin différent sur macOS).
function ipcCandidates(i) {
  if (process.platform === 'win32') return [`\\\\?\\pipe\\discord-ipc-${i}`];
  if (process.platform === 'darwin') {
    const base = path.join(os.homedir(), 'Library', 'Application Support');
    return ['discord', 'discordcanary', 'discordptb', 'discorddevelopment'].map((d) => path.join(base, d, `discord-ipc-${i}`));
  }
  return [
    path.join(process.env.XDG_RUNTIME_DIR || '', `discord-ipc-${i}`),
    path.join('/tmp', `discord-ipc-${i}`),
  ];
}

class Discord {
  constructor() { this.sock = null; this.ready = false; this.clientId = ''; this.pending = null; this.nonce = 0; }

  frame(op, data) {
    const json = Buffer.from(JSON.stringify(data));
    const h = Buffer.alloc(8);
    h.writeInt32LE(op, 0); h.writeInt32LE(json.length, 4);
    return Buffer.concat([h, json]);
  }

  connect(clientId) {
    if (!clientId) { this.close(); return; }
    if (this.sock && this.clientId === clientId) return;
    this.close();
    this.clientId = clientId;
    const tryPipe = (i) => {
      if (i > 9) return;
      const paths = ipcCandidates(i);
      const attempt = (k) => {
        if (k >= paths.length) return tryPipe(i + 1);
        const sock = net.createConnection(paths[k]);
        sock.once('error', () => attempt(k + 1));
        sock.once('connect', () => {
          this.sock = sock;
          sock.on('error', () => this.close());
          sock.on('close', () => { this.sock = null; this.ready = false; });
          sock.on('data', (buf) => {
            // Réponse du handshake : Discord est prêt à recevoir l'activité
            if (!this.ready && buf.length >= 8 && buf.readInt32LE(0) === 1) {
              this.ready = true;
              if (this.pending !== null) this.set(this.pending);
            }
          });
          sock.write(this.frame(0, { v: 1, client_id: clientId }));
        });
      };
      attempt(0);
    };
    tryPipe(0);
  }

  set(activity) {
    this.pending = activity;
    if (!this.sock || !this.ready) return;
    this.sock.write(this.frame(1, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: activity || undefined }, nonce: String(++this.nonce) }));
  }

  close() {
    if (this.sock) { try { this.sock.destroy(); } catch { /* rien */ } }
    this.sock = null; this.ready = false;
  }
}

// ---------- Raccourcis Bureau ----------
function launcherTarget(app) {
  if (app.isPackaged) return { target: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath, prefix: '' };
  return { target: process.execPath, prefix: `"${app.getAppPath()}" ` };
}

function createShortcut(app, shell, g) {
  const { target, prefix } = launcherTarget(app);
  const name = g.name.replace(/[<>:"/\\|?*]/g, '').trim();
  const file = path.join(app.getPath('desktop'), `${name}.lnk`);
  const icon = g.clientIcon || (g.exe && fs.existsSync(g.exe) ? g.exe : target);
  const ok = shell.writeShortcutLink(file, 'create', {
    target, args: `${prefix}--play=${g.key}`, icon, iconIndex: 0,
    description: `Lancer ${g.name} avec CLRE-Launcher`, cwd: path.dirname(target),
  });
  if (!ok) throw new Error('Windows a refusé la création du raccourci');
  return file;
}

// ---------- Mise à jour du launcher (GitHub Releases) ----------
const newer = (a, b) => {
  const pa = String(a).replace(/^v/, '').split('.').map(Number), pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false; }
  return false;
};

async function checkUpdate(repo, current) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) return { error: 'Indique le dépôt GitHub au format propriétaire/nom' };
  const r = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CLRE-Launcher' } });
  if (r.status === 404) return { error: 'Aucune version publiée sur ce dépôt' };
  if (!r.ok) return { error: `GitHub indisponible (HTTP ${r.status})` };
  const rel = await r.json();
  const assets = rel.assets || [];
  const exe = assets.find((a) => /\.exe$/i.test(a.name));
  const out = { latest: rel.tag_name, current, available: newer(rel.tag_name, current) && !!exe, notes: (rel.body || '').slice(0, 600), name: rel.name || rel.tag_name };
  if (!out.available) return out;
  // Empreinte SHA-256 : celle que GitHub calcule pour chaque fichier publié,
  // ou à défaut un fichier « <nom>.sha256 » / « SHA256SUMS » joint à la release.
  let sha256 = /^sha256:([a-f0-9]{64})$/i.exec(exe.digest || '')?.[1];
  if (!sha256) {
    const sums = assets.find((a) => a.name.toLowerCase() === `${exe.name.toLowerCase()}.sha256`) || assets.find((a) => /^sha256sums/i.test(a.name));
    if (sums && sums.size < 64 * 1024) {
      const t = await (await fetch(sums.browser_download_url, { headers: { 'User-Agent': 'CLRE-Launcher' } })).text();
      const line = t.split(/\r?\n/).find((l) => l.toLowerCase().includes(exe.name.toLowerCase())) || t;
      sha256 = /\b([a-f0-9]{64})\b/i.exec(line)?.[1];
    }
  }
  if (!sha256) return { ...out, available: false, error: `La version ${rel.tag_name} n'a pas d'empreinte SHA-256 : mise à jour refusée par sécurité` };
  out.asset = { repo, url: exe.browser_download_url, size: exe.size, sha256: sha256.toLowerCase() };
  return out;
}

// `asset` vient de checkUpdate (côté main), jamais du renderer.
async function downloadUpdate(asset, exePath) {
  const prefix = `https://github.com/${asset.repo}/releases/download/`;
  if (!String(asset.url).toLowerCase().startsWith(prefix.toLowerCase())) throw new Error('Adresse de téléchargement inattendue');
  const r = await fetch(asset.url, { headers: { 'User-Agent': 'CLRE-Launcher' } });
  if (!r.ok) throw new Error(`Téléchargement impossible (HTTP ${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (asset.size && buf.length !== asset.size) throw new Error('Téléchargement incomplet, réessaie');
  const got = crypto.createHash('sha256').update(buf).digest('hex');
  if (got !== asset.sha256) throw new Error('Le fichier téléchargé ne correspond pas à l\'empreinte publiée : mise à jour annulée');
  const tmp = exePath.replace(/\.exe$/i, '.update.exe');
  fs.writeFileSync(tmp, buf);
  return tmp;
}

const psQuote = (s) => `'${String(s).replace(/'/g, "''")}'`;

// Remplace l'exe portable une fois le launcher fermé, puis le relance.
// PowerShell (commande encodée en UTF-16) gère les chemins accentués, contrairement à un .cmd.
function installUpdate(tmp, exePath) {
  const script = [
    `try { Wait-Process -Id ${process.pid} -Timeout 60 -ErrorAction Stop } catch {}`,
    // L'exe portable reste verrouillé quelques secondes, le temps que son lanceur se ferme.
    `for ($i = 0; $i -lt 60; $i++) { try { Move-Item -LiteralPath ${psQuote(tmp)} -Destination ${psQuote(exePath)} -Force -ErrorAction Stop; break } catch { Start-Sleep -Milliseconds 500 } }`,
    `Start-Process -FilePath ${psQuote(exePath)}`,
  ].join('\n');
  spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

module.exports = { Discord, createShortcut, checkUpdate, downloadUpdate, installUpdate };
