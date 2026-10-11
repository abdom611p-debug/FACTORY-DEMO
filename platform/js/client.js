/*!
 * EGIC · Data client — POWERED BY DELMON & DEV SMART X
 * One API for the whole UI:
 *   • SERVER mode   → REST (/api/v1/*) + Server-Sent Events (/api/v1/stream)  [node server/server.js or the desktop app]
 *   • EMBEDDED mode → the same engine running inside the page (file:// or static hosting), persisted in IndexedDB
 */
(function (root) {
  'use strict';
  var listeners = {};
  var apiLog = [];
  var state = { mode: 'connecting', engine: null, es: null, connected: false, base: '', lastMsg: 0 };

  function dispatch(msg) {
    state.lastMsg = Date.now();
    (listeners[msg.type] || []).concat(listeners['*'] || []).forEach(function (fn) { try { fn(msg.data, msg); } catch (e) { console.error(e); } });
  }
  function logCall(method, path, status, ms, bytes) {
    var e = { ts: Date.now(), method: method, path: path, status: status, ms: ms, bytes: bytes || 0, mode: state.mode };
    apiLog.unshift(e); if (apiLog.length > 300) apiLog.pop();
    (listeners.__api || []).forEach(function (fn) { try { fn(e); } catch (x) { } });
  }
  function qs(q) {
    if (!q) return '';
    var parts = Object.keys(q).filter(function (k) { return q[k] !== undefined && q[k] !== null && q[k] !== ''; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(q[k]); });
    return parts.length ? '?' + parts.join('&') : '';
  }
  function now() { return (typeof performance !== 'undefined' ? performance.now() : Date.now()); }

  /* ---------------- IndexedDB journal (embedded mode persistence) ---------------- */
  var DB_NAME = 'egic-platform', STORE = 'journal', dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      try {
        var req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'k', autoIncrement: true }); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  function journalAdd(kind, payload) {
    return db().then(function (d) {
      if (!d) return;
      try { d.transaction(STORE, 'readwrite').objectStore(STORE).add({ kind: kind, ts: Date.now(), payload: payload }); } catch (e) { }
    });
  }
  function journalAll() {
    return db().then(function (d) {
      if (!d) return [];
      return new Promise(function (resolve) {
        try {
          var out = [], req = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
          req.onsuccess = function () { var c = req.result; if (c) { out.push(c.value); c.continue(); } else resolve(out); };
          req.onerror = function () { resolve(out); };
        } catch (e) { resolve([]); }
      });
    });
  }
  function journalClear() { return db().then(function (d) { if (!d) return; try { d.transaction(STORE, 'readwrite').objectStore(STORE).clear(); } catch (e) { } }); }

  /* ---------------- init ---------------- */
  function tryServer() {
    if (!/^https?:$/.test(location.protocol)) return Promise.resolve(false);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 1500);
    return fetch(state.base + '/api/v1/health', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { clearTimeout(timer); return r.ok ? r.json() : null; })
      .then(function (j) { return !!(j && j.engine === 'ONLINE'); })
      .catch(function () { clearTimeout(timer); return false; });
  }

  function connectSSE() {
    if (state.es) try { state.es.close(); } catch (e) { }
    var es = new EventSource(state.base + '/api/v1/stream');
    state.es = es;
    ['hello', 'event', 'event_update', 'gate', 'health', 'kpi', 'trace', 'worker', 'vehicle', 'audit', 'camera'].forEach(function (t) {
      es.addEventListener(t, function (ev) { var d; try { d = JSON.parse(ev.data); } catch (e) { return; } dispatch({ type: t, data: d, ts: Date.now() }); });
    });
    es.onopen = function () { state.connected = true; dispatch({ type: 'connection', data: { connected: true, mode: 'server' } }); };
    es.onerror = function () { state.connected = false; dispatch({ type: 'connection', data: { connected: false, mode: 'server' } }); };
  }

  function init(opts) {
    opts = opts || {};
    state.base = (opts.base || (root.EGIC_CONFIG && root.EGIC_CONFIG.apiBase) || '').replace(/\/$/, '');
    return tryServer().then(function (ok) {
      if (ok && !opts.forceEmbedded) {
        state.mode = 'server'; connectSSE(); state.connected = true;
        return state.mode;
      }
      state.mode = 'embedded';
      var E = root.EGICEngine;
      state.engine = new E.Engine({ mode: 'embedded' });
      return journalAll().then(function (rows) {
        var eng = state.engine, quiet = eng.listeners; eng.listeners = [];
        rows.forEach(function (j) {
          try {
            var p = j.payload;
            if (j.kind === 'event') eng.addEvent(Object.assign({}, p, { ts: p.ts || j.ts }));
            else if (j.kind === 'worker') eng.upsertWorker(p);
            else if (j.kind === 'gate') eng.addGateRead(Object.assign({}, p, { ts: p.ts || j.ts }));
            else if (j.kind === 'vehicle') eng.upsertVehicle(p);
            else if (j.kind === 'action') eng.eventAction(p.id, p.action, p.body || {});
          } catch (e) { }
        });
        eng.listeners = quiet;
        eng.on(dispatch);
        if (opts.live !== false) eng.start();
        state.connected = true;
        setTimeout(function () { dispatch({ type: 'connection', data: { connected: true, mode: 'embedded', restored: rows.length } }); }, 0);
        return state.mode;
      });
    });
  }

  /* ---------------- calls ---------------- */
  function get(path, query) {
    var t0 = now(), url = '/api/v1/' + path.replace(/^\//, '');
    if (state.mode === 'server') {
      return fetch(state.base + url + qs(query), { cache: 'no-store' }).then(function (r) {
        return r.text().then(function (txt) {
          logCall('GET', url + qs(query), r.status, Math.round(now() - t0), txt.length);
          if (!r.ok) throw new Error(r.status + ' ' + url);
          return JSON.parse(txt);
        });
      });
    }
    var res = state.engine.handle('GET', url, query || {}, {});
    logCall('GET', url + qs(query), res.status, Math.max(1, Math.round(now() - t0)), 0);
    return res.status === 200 ? Promise.resolve(res.body) : Promise.reject(new Error(res.status + ' ' + url));
  }
  function post(path, body) {
    var t0 = now(), url = '/api/v1/' + path.replace(/^\//, '');
    if (state.mode === 'server') {
      var payload = JSON.stringify(body || {});
      return fetch(state.base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload }).then(function (r) {
        return r.json().then(function (j) { logCall('POST', url, r.status, Math.round(now() - t0), payload.length); if (!r.ok) throw new Error(j && j.error || r.status); return j; });
      });
    }
    var res = state.engine.handle('POST', url, {}, body || {});
    logCall('POST', url, res.status, Math.max(1, Math.round(now() - t0)), 0);
    if (res.status !== 200) return Promise.reject(new Error(res.status + ' ' + url));
    // persist live records so a page reload keeps them (the "backend" for static hosting)
    if (url === '/api/v1/events') journalAdd('event', Object.assign({}, body, { ts: res.body.ts }));
    else if (/^\/api\/v1\/events\/[^/]+\/action$/.test(url)) journalAdd('action', { id: url.split('/')[4], action: body.action, body: body });
    else if (url === '/api/v1/workers') journalAdd('worker', Object.assign({}, body, { id: res.body.id }));
    else if (url === '/api/v1/gate/log') journalAdd('gate', Object.assign({}, body, { ts: res.body.ts, lane: res.body.lane }));
    else if (url === '/api/v1/vehicles') journalAdd('vehicle', body);
    return Promise.resolve(res.body);
  }
  function on(type, fn) {
    (listeners[type] = listeners[type] || []).push(fn);
    return function () { listeners[type] = (listeners[type] || []).filter(function (f) { return f !== fn; }); };
  }
  function evidenceUrl(img) {
    if (!img) return null;
    if (/^(data:|blob:|https?:)/.test(img)) return img;
    return (state.mode === 'server' ? state.base + '/' : '') + img.replace(/^\//, '');
  }

  root.EGICClient = {
    init: init, get: get, post: post, on: on, state: state, apiLog: apiLog, evidenceUrl: evidenceUrl,
    resetLocal: function () { return journalClear(); },
    onApi: function (fn) { return on('__api', fn); }
  };
})(typeof self !== 'undefined' ? self : this);
