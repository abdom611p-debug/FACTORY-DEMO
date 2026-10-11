#!/usr/bin/env node
/*!
 * EGIC · AI Safety & Smart Access Platform — Local Backend
 * Powered by DELMON & DEV SMART X
 *
 * Zero-dependency Node.js server:
 *   • serves the web application (index.html, console, assets, models)
 *   • REST API  →  /api/v1/*        (same contract as the embedded engine)
 *   • Live SSE  →  /api/v1/stream   (events · gate reads · health · KPIs)
 *   • persists live AI evidence (PPE screenshots, plate snapshots) under ./data
 *
 * Run:   node server/server.js            → http://localhost:8080
 *        PORT=9000 node server/server.js
 *        HOST=0.0.0.0 node server/server.js   (to open it from another device on the same network)
 *
 * Cloud (Railway): PORT is injected → binds 0.0.0.0. CORS_ORIGIN restricts which web origins may call the API
 * (default '*', so the UI can be hosted on Vercel while this server runs on Railway). DATA_DIR moves evidence +
 * journal to a mounted volume so they survive redeploys.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const url = require('url');
const { Engine } = require('../js/engine.js');

const ROOT = path.resolve(__dirname, '..');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const EVID = path.join(DATA, 'evidence');
const JOURNAL = path.join(DATA, 'journal.ndjson');
const PORT = +process.env.PORT || 8080;
const HOST = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const CORS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

fs.mkdirSync(EVID, { recursive: true });

const C = { dim: '\x1b[2m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', b: '\x1b[1m', o: '\x1b[38;5;208m', x: '\x1b[0m' };
const log = (...a) => console.log(C.dim + new Date().toLocaleTimeString('en-GB') + C.x, ...a);

/* ------------------------------------------------------------------ */
/* Engine + journal (live records survive restarts)                    */
/* ------------------------------------------------------------------ */
const engine = new Engine({ mode: 'server' });

function saveDataUrl(dataUrl, name) {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  if (!m) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const file = name.replace(/[^A-Za-z0-9_-]/g, '_') + '.' + ext;
  fs.writeFileSync(path.join(EVID, file), Buffer.from(m[2], 'base64'));
  return 'data/evidence/' + file;
}

function journal(kind, payload) {
  try { fs.appendFileSync(JOURNAL, JSON.stringify({ kind, ts: Date.now(), payload }) + '\n'); } catch (e) { /* non-fatal */ }
}

function replayJournal() {
  if (!fs.existsSync(JOURNAL)) return 0;
  const lines = fs.readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean);
  let n = 0;
  const quiet = engine.listeners; engine.listeners = [];
  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      const p = j.payload;
      if (j.kind === 'event') engine.addEvent(Object.assign({}, p, { ts: p.ts || j.ts }));
      else if (j.kind === 'worker') engine.upsertWorker(p);
      else if (j.kind === 'gate') engine.addGateRead(Object.assign({}, p, { ts: p.ts || j.ts }));
      else if (j.kind === 'vehicle') engine.upsertVehicle(p);
      else if (j.kind === 'action') engine.eventAction(p.id, p.action, p.body || {});
      n++;
    } catch (e) { /* skip corrupt line */ }
  }
  engine.listeners = quiet;
  return n;
}

/* ------------------------------------------------------------------ */
/* SSE                                                                  */
/* ------------------------------------------------------------------ */
const clients = new Set();
engine.on((msg) => {
  const data = 'event: ' + msg.type + '\ndata: ' + JSON.stringify(msg.data) + '\n\n';
  for (const res of clients) { try { res.write(data); } catch (e) { clients.delete(res); } }
  if (msg.type === 'event' && String(msg.data.source || '').indexOf('live') === 0) log(C.o + '● LIVE AI' + C.x, msg.data.typeAr, '→', msg.data.workerName || 'غير معروف', C.dim + msg.data.id + C.x);
  if (msg.type === 'gate' && String(msg.data.source || '').indexOf('live') === 0) log(C.c + '● LIVE ANPR' + C.x, msg.data.plate, msg.data.lane, msg.data.decision);
});
setInterval(() => { for (const res of clients) { try { res.write(': ping\n\n'); } catch (e) { clients.delete(res); } } }, 15000);

/* ------------------------------------------------------------------ */
/* HTTP                                                                 */
/* ------------------------------------------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.bin': 'application/octet-stream', '.onnx': 'application/octet-stream', '.wasm': 'application/wasm', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.mp4': 'video/mp4', '.webm': 'video/webm'
};

function send(res, status, body, headers) {
  const h = Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Powered-By': 'DELMON & DEV SMART X' }, CORS, headers || {});
  res.writeHead(status, h);
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('payload_too_large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(new Error('bad_json')); } });
    req.on('error', reject);
  });
}

async function api(req, res, pathname, query) {
  const t0 = Date.now();
  if (pathname === '/api/v1/stream') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }, CORS));
    res.write('retry: 2000\n');
    res.write('event: hello\ndata: ' + JSON.stringify({ mode: 'server', version: engine.meta().version, ts: Date.now() }) + '\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    log(C.g + 'SSE' + C.x, 'client connected', C.dim + '(' + clients.size + ' live)' + C.x);
    return;
  }
  let body = {};
  if (req.method === 'POST') {
    try { body = await readBody(req, 16 * 1024 * 1024); } catch (e) { return send(res, 400, { error: e.message }); }
    // persist images to disk and journal the mutation
    if (pathname === '/api/v1/events' && body.evidence && body.evidence.image) {
      const f = saveDataUrl(body.evidence.image, 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7));
      if (f) body.evidence = Object.assign({}, body.evidence, { image: f });
    }
    if (pathname === '/api/v1/gate/log') {
      if (body.image) body.image = saveDataUrl(body.image, 'veh_' + Date.now()) || null;
      if (body.plateImage) body.plateImage = saveDataUrl(body.plateImage, 'plate_' + Date.now()) || null;
    }
    if (pathname === '/api/v1/workers' && body.photo && String(body.photo).indexOf('data:') === 0) body.photo = saveDataUrl(body.photo, 'worker_' + (body.id || 'new')) || null;
  }
  const out = engine.handle(req.method, pathname, query, body);
  if (req.method === 'POST' && out.status === 200) {
    if (pathname === '/api/v1/events') journal('event', Object.assign({}, body, { ts: out.body.ts }));
    else if (/^\/api\/v1\/events\/[^/]+\/action$/.test(pathname)) journal('action', { id: pathname.split('/')[4], action: body.action, body });
    else if (pathname === '/api/v1/workers') journal('worker', Object.assign({}, body, { id: out.body.id }));
    else if (pathname === '/api/v1/gate/log') journal('gate', Object.assign({}, body, { ts: out.body.ts, lane: out.body.lane }));
    else if (pathname === '/api/v1/vehicles') journal('vehicle', body);
  }
  send(res, out.status, out.body, { 'Server-Timing': 'engine;dur=' + (Date.now() - t0) });
  if (!/\/(system|summary|health)$/.test(pathname)) log(req.method === 'POST' ? C.y + 'POST' + C.x : C.dim + 'GET ' + C.x, pathname, (out.status === 200 ? C.g : C.r) + out.status + C.x, C.dim + (Date.now() - t0) + 'ms' + C.x);
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/console' || rel === '/console/') rel = '/console.html';
  const base = rel.indexOf('/data/') === 0 ? DATA : ROOT;
  const file = path.normalize(path.join(base, base === DATA ? rel.slice('/data'.length) : rel));
  if (!file.startsWith(base) || file.includes(path.sep + '.') || file.startsWith(path.join(ROOT, 'server')) || file === JOURNAL) return send(res, 403, { error: 'forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, '<h1>404</h1>', { 'Content-Type': 'text/html; charset=utf-8' });
    const ext = path.extname(file).toLowerCase();
    const cache = /\/(assets)\//.test(rel) && !/model\.json$/.test(rel) ? 'public, max-age=86400' : 'no-cache';
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, 'X-Powered-By': 'DELMON & DEV SMART X' }, CORS));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const u = url.parse(req.url, true); // eslint-disable-line n/no-deprecated-api
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (u.pathname.indexOf('/api/') === 0) return api(req, res, u.pathname, u.query).catch((e) => send(res, 500, { error: String(e && e.message || e) }));
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' });
  serveStatic(req, res, u.pathname);
});

const replayed = replayJournal();
engine.start();

server.listen(PORT, HOST, () => {
  const ifaces = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log('');
  console.log(C.b + '  EGIC · AI Safety & Smart Access Platform' + C.x);
  console.log('  ' + C.o + 'POWERED BY DELMON & DEV SMART X' + C.x);
  console.log('');
  console.log('  ● Executive briefing   ' + C.c + 'http://localhost:' + PORT + '/' + C.x);
  console.log('  ● Live console         ' + C.c + 'http://localhost:' + PORT + '/console.html' + C.x);
  if (HOST === '0.0.0.0') ifaces.forEach((ip) => console.log('  ● On your network      ' + C.c + 'http://' + ip + ':' + PORT + '/' + C.x));
  console.log('  ● API                  ' + C.dim + '/api/v1/*   ·   live stream /api/v1/stream' + C.x);
  console.log('  ● Engine               ' + C.g + 'ONLINE' + C.x + C.dim + '  (' + engine.events.length + ' events · ' + engine.gateLog.length + ' gate reads · ' + engine.cameras.length + ' cameras' + (replayed ? ' · ' + replayed + ' live records restored' : '') + ')' + C.x);
  console.log('');
  console.log(C.dim + '  Demo environment — simulated data is clearly labelled. Press Ctrl+C to stop.' + C.x);
  console.log('');
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(C.r + '  Port ' + PORT + ' is already in use. Try: PORT=8090 node server/server.js' + C.x);
  else console.error(e);
  process.exit(1);
});
