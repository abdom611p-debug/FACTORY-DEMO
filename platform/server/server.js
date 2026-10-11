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
 * Phone camera: the console shows a QR → phone.html opens the camera and connects to the console with
 *   WebRTC (peer-to-peer video, ~30 fps, low latency). This server only relays the SDP offer/answer:
 *   POST|GET /api/v1/cam/:session/offer · POST|GET /api/v1/cam/:session/answer.
 *   Fallback when WebRTC can't connect: JPEG frames → POST /api/v1/cam/:session/frame, read back as
 *   MJPEG (/api/v1/cam/:session/mjpeg).
 *   Phones only open the camera over HTTPS: locally put a cert in .certs/ (key.pem + cert.pem, see
 *   scripts/make-local-cert.sh) and the server also listens on HTTPS_PORT (default 8443).
 *
 * Cloud (Railway): PORT is injected → binds 0.0.0.0. CORS_ORIGIN restricts which web origins may call the API
 * (default '*', so the UI can be hosted on Vercel while this server runs on Railway). DATA_DIR moves evidence +
 * journal to a mounted volume so they survive redeploys.
 */
'use strict';

const http = require('http');
const https = require('https');
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
/* Phone camera relay (JPEG in → MJPEG out)                              */
/* ------------------------------------------------------------------ */
const cams = new Map(); // session → { frame, ts, seq, viewers:Set, fps, n, fpsT, ua }
const CAM_ID = /^[a-z0-9]{8,40}$/i;
function camSession(id) {
  let c = cams.get(id);
  if (!c) { c = { frame: null, ts: 0, seq: 0, viewers: new Set(), fps: 0, n: 0, fpsT: Date.now(), born: Date.now() }; cams.set(id, c); }
  return c;
}
function readRaw(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (b) => { size += b.length; if (size > limit) { reject(new Error('frame_too_large')); req.destroy(); } else chunks.push(b); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
function pushFrame(c, buf) {
  const head = Buffer.from('--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ' + buf.length + '\r\n\r\n');
  for (const res of c.viewers) {
    if (res.writableLength > 2 * 1024 * 1024) continue; // slow viewer: drop this frame
    try { res.write(head); res.write(buf); res.write('\r\n'); } catch (e) { c.viewers.delete(res); }
  }
}
async function camApi(req, res, id, action) {
  if (!CAM_ID.test(id)) return send(res, 400, { error: 'bad_session' });
  // WebRTC signalling (non-trickle: each side posts one SDP with its ICE candidates already gathered)
  if (action === 'offer' || action === 'answer') {
    const c = camSession(id);
    if (req.method === 'POST') {
      let j;
      try { j = JSON.parse((await readRaw(req, 256 * 1024)).toString('utf8')); } catch (e) { return send(res, 400, { error: 'bad_json' }); }
      if (!j || typeof j.sdp !== 'string' || !/^(offer|answer)$/.test(j.type)) return send(res, 400, { error: 'bad_sdp' });
      if (action === 'offer') { c.offer = { type: j.type, sdp: j.sdp, ts: Date.now() }; c.answer = null; log(C.c + '● PHONE CAM' + C.x, 'WebRTC offer', C.dim + id + C.x); }
      else c.answer = { type: j.type, sdp: j.sdp, ts: Date.now() };
      c.ts = c.ts || 0; c.born = Date.now();
      return send(res, 200, { ok: true });
    }
    const v = action === 'offer' ? c.offer : c.answer;
    return v ? send(res, 200, v) : send(res, 204, '');
  }
  if (action === 'frame' && req.method === 'POST') {
    let buf;
    try { buf = await readRaw(req, 4 * 1024 * 1024); } catch (e) { return send(res, 413, { error: e.message }); }
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return send(res, 415, { error: 'jpeg_only' });
    const c = camSession(id), first = !c.frame;
    c.frame = buf; c.ts = Date.now(); c.seq++; c.n++;
    if (c.ts - c.fpsT >= 1000) { c.fps = Math.round(c.n * 1000 / (c.ts - c.fpsT)); c.n = 0; c.fpsT = c.ts; }
    pushFrame(c, buf);
    if (first) { log(C.c + '● PHONE CAM' + C.x, 'connected', C.dim + id + C.x); engine.emit('phonecam', { session: id, state: 'connected', ts: c.ts }); }
    return send(res, 200, { ok: true, seq: c.seq, viewers: c.viewers.size });
  }
  if (action === 'mjpeg') {
    const c = camSession(id);
    res.writeHead(200, Object.assign({ 'Content-Type': 'multipart/x-mixed-replace; boundary=frame', 'Cache-Control': 'no-cache, no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }, CORS));
    c.viewers.add(res);
    if (c.frame) pushFrame({ viewers: new Set([res]) }, c.frame);
    req.on('close', () => c.viewers.delete(res));
    return;
  }
  if (action === 'frame' && req.method === 'GET') {
    const c = cams.get(id);
    if (!c || !c.frame) return send(res, 404, { error: 'no_frame' });
    return send(res, 200, c.frame, { 'Content-Type': 'image/jpeg' });
  }
  const c = cams.get(id);
  return send(res, 200, { session: id, connected: !!(c && c.frame && Date.now() - c.ts < 5000), lastFrameAgoMs: c && c.ts ? Date.now() - c.ts : null, fps: c ? c.fps : 0, viewers: c ? c.viewers.size : 0, offer: !!(c && c.offer), answered: !!(c && c.answer) });
}
setInterval(() => { const now = Date.now(); for (const [id, c] of cams) if (now - Math.max(c.ts, c.born) > 15 * 60 * 1000) { for (const r of c.viewers) try { r.end(); } catch (e) { } cams.delete(id); } }, 60 * 1000);

function lanAddresses() { return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address); }

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
  const cm = /^\/api\/v1\/cam\/([^/]+)(?:\/(frame|mjpeg|offer|answer))?$/.exec(pathname);
  if (cm) return camApi(req, res, cm[1], cm[2] || 'status');
  if (pathname === '/api/v1/netinfo') return send(res, 200, { lan: lanAddresses(), port: PORT, httpsPort: httpsServer ? HTTPS_PORT : null });
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
  if (!file.startsWith(base) || file.includes(path.sep + '.') || file.startsWith(path.join(ROOT, 'server')) || file === JOURNAL || file.startsWith(CERT_DIR)) return send(res, 403, { error: 'forbidden' });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, '<h1>404</h1>', { 'Content-Type': 'text/html; charset=utf-8' });
    const ext = path.extname(file).toLowerCase();
    const cache = /\/(assets)\//.test(rel) && !/model\.json$/.test(rel) ? 'public, max-age=86400' : 'no-cache';
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache, 'X-Powered-By': 'DELMON & DEV SMART X' }, CORS));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// config.js from the environment on cloud hosts (Railway): EGIC_AI_URL, EGIC_ICE_SERVERS (JSON, e.g. a TURN server)
function runtimeConfig() {
  if (!process.env.EGIC_AI_URL && !process.env.EGIC_ICE_SERVERS) return null;
  const cfg = { apiBase: '', aiUrl: String(process.env.EGIC_AI_URL || '').replace(/\/+$/, '') };
  try { if (process.env.EGIC_ICE_SERVERS) cfg.iceServers = JSON.parse(process.env.EGIC_ICE_SERVERS); } catch (e) { console.error('EGIC_ICE_SERVERS is not valid JSON'); }
  return '/*! generated from environment */\nwindow.EGIC_CONFIG = ' + JSON.stringify(cfg) + ';\n';
}
function handler(req, res) {
  const u = url.parse(req.url, true); // eslint-disable-line n/no-deprecated-api
  if (u.pathname === '/config.js') { const js = runtimeConfig(); if (js) return send(res, 200, js, Object.assign({ 'Content-Type': 'text/javascript; charset=utf-8' }, CORS)); }
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (u.pathname.indexOf('/api/') === 0) return api(req, res, u.pathname, u.query).catch((e) => send(res, 500, { error: String(e && e.message || e) }));
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method_not_allowed' });
  serveStatic(req, res, u.pathname);
}
const server = http.createServer(handler);
const HTTPS_PORT = +process.env.HTTPS_PORT || 8443;
const CERT_DIR = path.join(ROOT, '.certs');
let httpsServer = null;
if (!process.env.RAILWAY_ENVIRONMENT && fs.existsSync(path.join(CERT_DIR, 'key.pem')) && fs.existsSync(path.join(CERT_DIR, 'cert.pem'))) {
  httpsServer = https.createServer({ key: fs.readFileSync(path.join(CERT_DIR, 'key.pem')), cert: fs.readFileSync(path.join(CERT_DIR, 'cert.pem')) }, handler);
  httpsServer.on('error', (e) => { console.error(C.r + '  HTTPS ' + HTTPS_PORT + ': ' + e.message + C.x); httpsServer = null; });
  httpsServer.listen(HTTPS_PORT, process.env.HOST || '0.0.0.0');
}

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
  if (httpsServer) lanAddresses().forEach((ip) => console.log('  ● Phone camera (HTTPS) ' + C.c + 'https://' + ip + ':' + HTTPS_PORT + '/phone.html' + C.x));
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
