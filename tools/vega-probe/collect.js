#!/usr/bin/env node
// Collector for tools/vega-probe/probe.html running inside the Vega WebView.
// Appends one JSON line per probe message to docs/vega/probe-results.jsonl.
//
//   node tools/vega-probe/collect.js                    # HTTP: POST /probe on 127.0.0.1:8765
//   node tools/vega-probe/collect.js --device-log       # also follow the device log over vda
//   node tools/vega-probe/collect.js --device-log --raw docs/vega/logs/device.log
//
// Two transports, because the Vega WebView blocks plain http:// from the page
// (net::ERR_CLEARTEXT_NOT_PERMITTED, observed on VVD with SDK 0.24.12112):
//  1. --device-log: the page calls window.ReactNativeWebView.postMessage(); the RN
//     host (vega-app/src/App.tsx onMessage) logs "[WebViewMessage] <data>"; this
//     script runs `vda shell loggingctl log -f` and extracts those lines. Works.
//  2. HTTP POST (kept for HTTPS/cleartext-allowed builds and desktop testing).
//     From the VVD the host is reachable as 127.0.0.1 after
//     `vda reverse tcp:8765 tcp:8765`, or as 10.0.2.2 (QEMU user networking).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const out = process.env.OUT ?? path.join(root, 'docs', 'vega', 'probe-results.jsonl');
const rawLog = opt('--raw');
const port = Number(process.env.PORT ?? 8765);
const bind = process.env.BIND ?? '127.0.0.1';
const MAX_BODY = 4 * 1024 * 1024;

fs.mkdirSync(path.dirname(out), { recursive: true });
if (rawLog) fs.mkdirSync(path.dirname(path.resolve(rawLog)), { recursive: true });

function summarize(body) {
  if (!body || typeof body !== 'object') return String(body).slice(0, 160);
  const { run, section, data } = body;
  if (!section) return JSON.stringify(body).slice(0, 160);
  const brief = section === 'a-keys' && Array.isArray(data)
    ? data.filter(k => k.type === 'keydown').map(k => `${k.key}/${k.code}/${k.keyCode}`).join(' ')
    : (JSON.stringify(data) ?? '').slice(0, 160);
  return `${run ?? '?'} ${section} ${brief}`;
}
function record(via, body, extra = {}) {
  const line = { receivedAt: new Date().toISOString(), via, ...extra, body };
  fs.appendFileSync(out, JSON.stringify(line) + '\n');
  console.log(`${line.receivedAt} [${via}] ${summarize(body)}`);
}

// ---------- HTTP transport ----------
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (req.method === 'GET') { res.writeHead(200, { ...cors, 'Content-Type': 'text/plain' }); res.end(`Sema probe collector -> ${path.relative(root, out)}\n`); return; }
  if (req.method !== 'POST' || !req.url.startsWith('/probe')) { res.writeHead(404, cors); res.end(); return; }
  const chunks = []; let size = 0;
  req.on('data', chunk => {
    size += chunk.length;
    if (size > MAX_BODY) { res.writeHead(413, cors); res.end(); req.destroy(); return; }
    chunks.push(chunk);
  });
  req.on('end', () => {
    if (res.writableEnded) return;
    const raw = Buffer.concat(chunks).toString('utf8');
    let body; try { body = JSON.parse(raw); } catch { body = raw; }
    record('http', body, { remote: req.socket.remoteAddress, origin: req.headers.origin ?? null, userAgent: req.headers['user-agent'] ?? null });
    res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
  });
});
server.listen(port, bind, () => console.log(`HTTP collector on http://${bind}:${port}/probe -> ${path.relative(root, out)}`));

// ---------- device-log transport ----------
function resolveVda() {
  if (process.env.VDA) return process.env.VDA;
  try { return execFileSync('vega', ['which', 'vda'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').pop(); } catch { /* vega not on PATH */ }
  const fallback = path.join(os.homedir(), 'vega/sdk/vega-sdk/main/0.24.12112/workspace/env/KeplerCLIVegaDeviceAdaptor-2.0/runtime/bin/vda');
  if (fs.existsSync(fallback)) return fallback;
  throw new Error('Cannot find vda. Set VDA=/path/to/vda or put the Vega SDK bin/ on PATH.');
}
const MARK = '[WebViewMessage] ';
const partial = new Map(); // chunk id -> {n, parts[]}
// The RN host's console.info shows up twice in loggingctl output (observed), so drop repeats.
const recent = []; const RECENT_MAX = 400;
function handleMessage(msg, deviceTime) {
  if (recent.includes(msg)) return;
  recent.push(msg); if (recent.length > RECENT_MAX) recent.shift();
  if (msg.startsWith('SEMA_PROBE_CHUNK ')) {
    const m = /^SEMA_PROBE_CHUNK (\S+) (\d+)\/(\d+) ([\s\S]*)$/.exec(msg);
    if (!m) return;
    const [, id, i, n, text] = m;
    const entry = partial.get(id) ?? { n: Number(n), parts: [] };
    entry.parts[Number(i) - 1] = text; partial.set(id, entry);
    if (entry.parts.filter(p => p !== undefined).length === entry.n) {
      partial.delete(id);
      const joined = entry.parts.join('');
      let body; try { body = JSON.parse(joined); } catch { body = { unparsed: joined }; }
      record('device-log', body, { deviceTime, chunks: entry.n });
    }
    return;
  }
  if (msg.startsWith('SEMA_PROBE ')) {
    let body; try { body = JSON.parse(msg.slice('SEMA_PROBE '.length)); } catch { body = { unparsed: msg }; }
    record('device-log', body, { deviceTime });
    return;
  }
  record('device-log', { message: msg }, { deviceTime });
}
function followDeviceLog() {
  const vda = resolveVda();
  const child = spawn(vda, ['shell', 'loggingctl log -f -o short_precise'], { stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`Following device log via ${vda} (pid ${child.pid})`);
  const raw = rawLog ? fs.createWriteStream(path.resolve(rawLog), { flags: 'a' }) : null;
  readline.createInterface({ input: child.stdout }).on('line', line => {
    raw?.write(line + '\n');
    const i = line.indexOf(MARK);
    if (i >= 0) handleMessage(line.slice(i + MARK.length), line.slice(0, 22));
  });
  child.stderr.on('data', d => process.stderr.write(`[vda] ${d}`));
  child.on('exit', code => {
    raw?.end();
    console.log(`device log stream exited (${code}); reconnecting in 3 s`);
    setTimeout(followDeviceLog, 3000);
  });
}
if (argv.includes('--device-log')) followDeviceLog();
