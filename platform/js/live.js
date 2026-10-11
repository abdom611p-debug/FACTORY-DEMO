/*!
 * EGIC · Live AI — real models on a real camera, wired to the dashboard
 *   • PPE Lab     : helmet · safety glasses · hi-vis vest  → screenshot → worker profile → events → KPIs
 *   • Behaviour AI: YOLO26-pose → SOS gesture · fall · unattended station · ergonomic posture
 *   • Egyptian ANPR: plate detector + Arabic character recognisers → gate log → decision → dwell time
 * POWERED BY DELMON & DEV SMART X
 */
(function () {
  'use strict';
  var U = window.EGICUI, API = window.EGICClient, SC = window.EGICScenes, ENG = window.EGICEngine;
  var h = U.h, clear = U.clear, S = U.S;
  var AI = null, faceapi = null;

  /* ------------------------------------------------------------------ */
  /* Loading                                                              */
  /* ------------------------------------------------------------------ */
  var scripts = {};
  function loadScript(src) {
    if (scripts[src]) return scripts[src];
    scripts[src] = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { delete scripts[src]; rej(new Error('تعذر تحميل ' + src)); }; document.head.appendChild(s); });
    return scripts[src];
  }
  var core = null;
  function ensureCore() {
    if (core) return core;
    core = loadScript('assets/vendor/face-api.js').then(function () { return loadScript('js/ai.js'); }).then(function () {
      faceapi = window.faceapi; AI = window.EGICAI; AI.setTF(faceapi.tf);
      var tf = faceapi.tf;
      return tf.setBackend('webgl').catch(function () { return tf.setBackend('cpu'); }).then(function () { return tf.ready(); }).then(function () {
        try { tf.env().set('WEBGL_PACK', true); } catch (e) { }
        return tf.getBackend();
      });
    }).catch(function (e) { core = null; throw e; });
    return core;
  }
  var warmed = {};
  function ensureModel(name, onP) {
    return ensureCore().then(function () { return AI.load(name, onP); }).then(function () { if (warmed[name]) return; warmed[name] = AI.warmup(name); return warmed[name]; });
  }
  var faceP = null;
  function ensureFace() {
    if (faceP) return faceP;
    faceP = ensureCore().then(function () {
      var base = 'assets/models/face';
      return Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(base), faceapi.nets.faceLandmark68TinyNet.loadFromUri(base), faceapi.nets.faceRecognitionNet.loadFromUri(base)]);
    }).catch(function (e) { faceP = null; throw e; });
    return faceP;
  }
  function fileProtocolNotice(box) {
    if (location.protocol !== 'file:') return false;
    box.appendChild(h('div', { class: 'card', style: { padding: '16px 18px', borderColor: 'rgba(247,146,36,.5)' } }, h('b', { text: 'تشغيل النماذج الحية يحتاج تشغيل البرنامج كتطبيق' }), h('p', { class: 'muted', style: { margin: '6px 0 0', fontSize: '13px' } }, 'المتصفح يمنع تحميل ملفات النماذج عند فتح الصفحة كملف مباشر. افتح البرنامج من تطبيق سطح المكتب «EGIC Platform»، أو شغّل الخادم (node server/server.js) ثم افتح http://localhost:8080، أو استخدم الرابط المستضاف.')));
    return true;
  }

  /* TITAN PPE server — live_server.py (port 8765) running TITAN_PPE/models/ppe_hf.onnx, the ppe_H.py model */
  // EGIC AI Engine (Python · app/main.py) — set window.EGIC_CONFIG.aiUrl (config.js); defaults to the local engine on :8765
  var TITAN_URL = ((window.EGIC_CONFIG && window.EGIC_CONFIG.aiUrl) || ('http://' + (location.hostname || 'localhost') + ':8765')).replace(/\/$/, ''), TITAN_CONF = 0.45;
  function titanHealth() {
    var ctl = window.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ctl) ctl.abort(); }, 2500);
    return fetch(TITAN_URL + '/health', { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (r) { clearTimeout(tm); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }, function (e) { clearTimeout(tm); throw e; });
  }
  var grab = null;
  // POST one JPEG frame to the AI engine; boxes come back in the engine's pixel space → map to source pixels
  function serverDetect(path, src, d) {
    var W = Math.min(960, d.w), sc = W / d.w, H = Math.round(d.h * sc);
    grab = grab || document.createElement('canvas');
    if (grab.width !== W || grab.height !== H) { grab.width = W; grab.height = H; }
    grab.getContext('2d').drawImage(src, 0, 0, W, H);
    return new Promise(function (res) { grab.toBlob(res, 'image/jpeg', 0.85); }).then(function (blob) {
      return fetch(TITAN_URL + path, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
    }).then(function (r) { if (!r.ok) throw new Error('AI HTTP ' + r.status); return r.json(); }).then(function (j) {
      var map = function (arr) { return (arr || []).map(function (x) { return { x1: x.box[0] / sc, y1: x.box[1] / sc, x2: x.box[2] / sc, y2: x.box[3] / sc, score: x.score, label: x.label }; }); };
      var dets = map(j.dets); dets.schema = j.schema; dets.raw = j; dets.persons = map(j.persons);
      return dets;
    });
  }
  function titanDetect(src, d) { return serverDetect('/ppe/detect?conf=' + TITAN_CONF, src, d); }

  /* ------------------------------------------------------------------ */
  /* Phone camera pairing: QR → phone.html streams JPEG → MJPEG back here   */
  /* ------------------------------------------------------------------ */
  function newSession() { var a = new Uint8Array(12); (window.crypto || window.msCrypto).getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  // Phones open the camera only on https: use this page's origin when it is https (Vercel / Railway),
  // otherwise the local server's HTTPS port on the LAN address (scripts/make-local-cert.sh)
  function phonePageBase() {
    var here = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    if (location.protocol === 'https:') return Promise.resolve({ base: here, secure: true });
    return fetch(API.state.base + '/api/v1/netinfo', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (n) {
      var ip = (n.lan || [])[0] || location.hostname;
      if (n.httpsPort) return { base: 'https://' + ip + ':' + n.httpsPort + '/', secure: true, local: true };
      return { base: 'http://' + ip + ':' + n.port + '/', secure: false };
    });
  }
  function pairPhone(onReady) {
    if (API.state.mode !== 'server') { U.toast('كاميرا الموبايل تحتاج سيرفر المنصة', 'شغّل: node server/server.js أو افتح النسخة المنشورة.', { kind: 'critical', ms: 8000 }); return; }
    var sid = newSession(), poll = null, done = false;
    var qrBox = h('div', { style: { background: '#fff', borderRadius: '14px', padding: '12px', width: 'min(280px, 70vw)', margin: '0 auto' } });
    var link = h('a', { class: 'mono', target: '_blank', rel: 'noopener', style: { fontSize: '11.5px', wordBreak: 'break-all', textAlign: 'center', display: 'block' } });
    var status = h('div', { class: 'verdict' }, h('span', { text: 'بانتظار اتصال الموبايل…' }), h('span', { class: 'spinner', style: { width: '16px', height: '16px' } }));
    var note = h('div', { class: 'muted', style: { fontSize: '12px', lineHeight: '1.7' } });
    U.openModal('📱 استخدم كاميرا الموبايل', h('div', { style: { display: 'grid', gap: '12px' } },
      h('div', { class: 'muted', style: { fontSize: '13px' }, text: 'امسح الكود بكاميرا الموبايل ← اضغط «تشغيل الكاميرا» ← المنصة هتتحول لكاميرا الموبايل لوحدها.' }),
      qrBox, link, status, note));
    var mb = U.$('#modalBody');
    mb.__onClose = function () { done = true; clearInterval(poll); };
    Promise.all([loadScript('assets/vendor/qrcode.js'), phonePageBase()]).then(function (r) {
      var b = r[1], url = b.base + 'phone.html?s=' + sid;
      var qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
      qrBox.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
      link.href = url; link.textContent = url;
      if (b.local) note.textContent = 'شبكة محلية: الموبايل لازم يكون على نفس الواي فاي. أول مرة هيظهر تحذير أمان (شهادة محلية) ← «خيارات متقدمة» ← «متابعة».';
      if (!b.secure) note.textContent = '⚠️ الموبايل لن يفتح الكاميرا بدون https. شغّل: bash scripts/make-local-cert.sh ثم أعد تشغيل السيرفر، أو استخدم النسخة المنشورة.';
      poll = setInterval(function () {
        fetch(API.state.base + '/api/v1/cam/' + sid, { cache: 'no-store' }).then(function (x) { return x.json(); }).then(function (j) {
          if (done || !j.connected) return;
          done = true; clearInterval(poll); U.closeModal();
          U.toast('تم توصيل كاميرا الموبايل', 'المنصة الآن تحلل صورة الموبايل لحظيًا', { kind: 'live', ms: 5000 });
          onReady(API.state.base + '/api/v1/cam/' + sid + '/mjpeg', sid);
        }).catch(function () { });
      }, 1000);
    }).catch(function (e) { status.firstChild.textContent = 'تعذر إنشاء الكود: ' + e.message; });
  }
  // TF.js / ONNX can't read pixels from a multipart (MJPEG) <img> → copy the current frame to a canvas each tick
  function phoneFrame(st, el) {
    var c = st.phoneCanvas || (st.phoneCanvas = document.createElement('canvas'));
    var w = el.naturalWidth, hh = el.naturalHeight;
    if (!w || !hh) return null;
    if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    c.getContext('2d').drawImage(el, 0, 0, w, hh);
    return c;
  }
  // attach the MJPEG relay to a (visually hidden, still decoding) <img> and resolve once the first frame is in
  function phoneSource(el, mjpegUrl, sid, st, onLost) {
    el.crossOrigin = 'anonymous';
    el.src = mjpegUrl + '?t=' + Date.now();
    var t0 = Date.now();
    var ready = new Promise(function (res, rej) {
      (function wait() { if (el.naturalWidth) return res(); if (Date.now() - t0 > 15000) return rej(new Error('لم يصل أي إطار من الموبايل')); setTimeout(wait, 100); })();
    });
    clearInterval(st.phoneWatch); var lostAt = 0;
    st.phoneWatch = setInterval(function () {
      if (st.srcKind !== 'phone') { clearInterval(st.phoneWatch); return; }
      fetch(API.state.base + '/api/v1/cam/' + sid, { cache: 'no-store' }).then(function (x) { return x.json(); }).then(function (j) {
        if (j.connected) { lostAt = 0; st.phoneFps = j.fps; return; }
        if (!lostAt) { lostAt = Date.now(); onLost(); }
      }).catch(function () { });
    }, 3000);
    return ready;
  }

  /* face database (local only — never leaves the device) */
  function faceDB() { try { return JSON.parse(localStorage.getItem('egic-faces') || '{}'); } catch (e) { return {}; } }
  function saveFaceDB(db) { try { localStorage.setItem('egic-faces', JSON.stringify(db)); } catch (e) { } S.faceIndex = db; }
  var matcherCache = null, matcherKey = '';
  function matcher() {
    var db = faceDB(), key = JSON.stringify(Object.keys(db).map(function (k) { return k + db[k].length; }));
    if (key === matcherKey) return matcherCache;
    matcherKey = key;
    var labeled = Object.keys(db).filter(function (k) { return db[k].length; }).map(function (k) { return new faceapi.LabeledFaceDescriptors(k, db[k].map(function (d) { return new Float32Array(d); })); });
    matcherCache = labeled.length ? new faceapi.FaceMatcher(labeled, 0.52) : null;
    return matcherCache;
  }

  /* ------------------------------------------------------------------ */
  /* Shared canvas helpers                                                */
  /* ------------------------------------------------------------------ */
  var COL = { ok: '#45D48C', bad: '#FF4D4D', warn: '#FAB219', info: '#8FC7FF', orange: '#F79224' };
  function label(g, x, y, text, bg, fs, alignRight) {
    g.save(); g.font = '600 ' + fs + 'px "EGIC Sans", "Segoe UI", Tahoma, sans-serif';
    var rtl = /[؀-ۿ]/.test(text); g.direction = rtl ? 'rtl' : 'ltr';
    var w = g.measureText(text).width + fs * 0.9, hgt = fs * 1.55;
    var bx = alignRight ? x - w : x, by = y - hgt;
    var safeTop = g.canvas.height * 0.085;
    if (by < safeTop) by = Math.min(g.canvas.height - hgt, Math.max(safeTop, y + 2));
    bx = Math.max(2, Math.min(g.canvas.width - w - 2, bx));
    g.fillStyle = bg; SC.roundRect(g, bx, by, w, hgt, fs * 0.3); g.fill();
    g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.textAlign = rtl ? 'right' : 'left';
    g.fillText(text, rtl ? bx + w - fs * 0.45 : bx + fs * 0.45, by + hgt / 2 + 1);
    g.restore();
  }
  function corners(g, b, col, lw) {
    var w = b.x2 - b.x1, hh = b.y2 - b.y1, L = Math.min(22, w * 0.22, hh * 0.22);
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
    [[b.x1, b.y1, 1, 1], [b.x2, b.y1, -1, 1], [b.x1, b.y2, 1, -1], [b.x2, b.y2, -1, -1]].forEach(function (c) { g.beginPath(); g.moveTo(c[0], c[1] + L * c[3]); g.lineTo(c[0], c[1]); g.lineTo(c[0] + L * c[2], c[1]); g.stroke(); });
  }
  function mirrorBox(b, W) { return { x1: W - b.x2, y1: b.y1, x2: W - b.x1, y2: b.y2 }; }
  function watermark(g, W, H, line1) {
    var fs = Math.max(12, Math.round(W / 64)), bh = fs * 2.3;
    g.fillStyle = 'rgba(4,8,6,.82)'; g.fillRect(0, H - bh, W, bh);
    g.fillStyle = '#F79224'; g.fillRect(0, H - bh, W, 3);
    g.font = '600 ' + fs + 'px "EGIC Sans", "Segoe UI", Tahoma, sans-serif'; g.textBaseline = 'middle';
    g.direction = 'rtl'; g.textAlign = 'right'; g.fillStyle = '#fff'; g.fillText(line1, W - fs * 0.8, H - bh / 2 + 1);
    g.direction = 'ltr'; g.textAlign = 'left'; g.font = '700 ' + Math.round(fs * 0.82) + 'px "Plex Mono", monospace'; g.fillStyle = '#F79224';
    g.fillText('POWERED BY DELMON & DEV SMART X', fs * 0.8, H - bh / 2 + 1);
  }
  var audioCtx = null;
  function beep(kind) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var t = audioCtx.currentTime;
      (kind === 'sos' ? [880, 660, 880, 660] : [740, 520]).forEach(function (f, i) {
        var o = audioCtx.createOscillator(), gn = audioCtx.createGain();
        o.frequency.value = f; o.type = 'sine'; gn.gain.setValueAtTime(0.0001, t + i * 0.16); gn.gain.exponentialRampToValueAtTime(0.18, t + i * 0.16 + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.14);
        o.connect(gn); gn.connect(audioCtx.destination); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.16);
      });
    } catch (e) { }
  }
  function nowStr() { return U.fDate(Date.now()) + ' ' + U.fTime(Date.now()); }

  /* camera */
  function listCams() { return navigator.mediaDevices && navigator.mediaDevices.enumerateDevices ? navigator.mediaDevices.enumerateDevices().then(function (d) { return d.filter(function (x) { return x.kind === 'videoinput'; }); }) : Promise.resolve([]); }
  function openCam(deviceId) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('المتصفح لا يدعم الكاميرا في هذا السياق'));
    var c = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    if (deviceId) c.deviceId = { exact: deviceId };
    return navigator.mediaDevices.getUserMedia({ video: c, audio: false });
  }
  function stopStream(st) { if (st) st.getTracks().forEach(function (t) { t.stop(); }); }
  function camErrMsg(e) {
    var denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
    var framed = false; try { framed = window.top !== window.self; } catch (x) { framed = true; }
    if (denied && framed) return 'الكاميرا المباشرة غير متاحة داخل نافذة المعاينة المستضافة — استخدم «صورة / فيديو» أو العينات، أو نسخة سطح المكتب للكاميرا الحية.';
    if (denied) return 'يرجى السماح للمتصفح باستخدام الكاميرا (أيقونة القفل بجوار العنوان) ثم أعد المحاولة.';
    if (e && e.name === 'NotFoundError') return 'لا توجد كاميرا متصلة بهذا الجهاز.';
    if (e && e.name === 'NotReadableError') return 'الكاميرا مستخدمة في برنامج آخر — أغلقه ثم أعد المحاولة.';
    return (e && e.message) || String(e);
  }

  /* ------------------------------------------------------------------ */
  /* PPE / Behaviour lab                                                  */
  /* ------------------------------------------------------------------ */
  var PPE_TYPES = { helmet: 'NO_HELMET', glasses: 'NO_GLASSES', vest: 'NO_VEST' };
  var PPE_AR = { helmet: 'الخوذة', glasses: 'نظارة الوقاية', vest: 'السترة العاكسة' };
  var PPE_EN = { helmet: 'NO HELMET', glasses: 'NO GLASSES', vest: 'NO VEST' };
  var LAB = { mode: 'ppe', mirror: true, sound: true, required: { helmet: true, glasses: true, vest: true }, idMode: 'auto', profileId: null, persistMs: 1500, stationSec: 8, ppeEngine: 'browser' };
  try { Object.assign(LAB, JSON.parse(localStorage.getItem('egic-lab') || '{}')); } catch (e) { }
  function saveLab() { try { localStorage.setItem('egic-lab', JSON.stringify({ mode: LAB.mode, mirror: LAB.mirror, sound: LAB.sound, required: LAB.required, idMode: LAB.idMode, profileId: LAB.profileId, stationSec: LAB.stationSec, ppeEngine: LAB.ppeEngine })); } catch (e) { } }

  U.register('live', function (v) {
    if (!LAB.profileId) LAB.profileId = S.meta.presenterId;
    var st = { running: false, stream: null, src: null, srcKind: null, busy: false, last: null, pose: null, fps: 0, ms: 0, frames: 0, fpsT: performance.now(), tracker: null, lastFace: 0, faces: [], captures: [], behavior: { sosSince: 0, fallSince: 0, ergoSince: 0, absentSince: 0, present: false, cool: {} }, flip: 0, destroyed: false };
    U.onCleanup(function () { st.destroyed = true; st.running = false; stopStream(st.stream); if (st.url) URL.revokeObjectURL(st.url); });
    // PPE engine actually in use: 'titan' (live_server.py) or 'browser' (TF.js) — falls back to browser when TITAN is down
    var ppeEng = null, titanOk = false, titanErrT = 0;
    function ppeEngine() { return ppeEng || LAB.ppeEngine; }
    var titanSchema = null; // 'sh17' from the EGIC AI engine (has glasses) · null for the legacy TITAN ppe_hf.onnx
    function reqKeys() { return Object.keys(LAB.required).filter(function (k) { return LAB.required[k] && !(k === 'glasses' && ppeEngine() === 'titan' && titanSchema !== 'sh17'); }); }
    function hasPPE() { return LAB.mode === 'ppe' || LAB.mode === 'both'; }
    function hasPose() { return LAB.mode === 'behavior' || LAB.mode === 'both'; }
    function hasFire() { return LAB.mode === 'fire' || LAB.mode === 'both'; }
    function hasSmoking() { return LAB.mode === 'smoking' || LAB.mode === 'both'; }

    v.appendChild(U.viewHead('المختبر الحي — ذكاء اصطناعي حقيقي', 'الكاميرا تُحلَّل لحظيًا داخل الجهاز. أي مخالفة تُسجَّل بلقطة في ملف العامل وتظهر فورًا في لوحة القيادة.', [h('span', { class: 'badge badge--live', text: 'REAL MODELS · ON-DEVICE' })]));
    if (fileProtocolNotice(v)) return;

    // mode selector
    var modes = h('div', { class: 'mode-cards' });
    [['ppe', 'معدات الوقاية PPE', 'خوذة · نظارة وقاية · سترة عاكسة — YOLOv8s (SH17)', null],
      ['fire', 'الحريق والدخان', 'رصد اللهب والدخان لحظيًا + صفارة إنذار على كل الشاشات — YOLOv8n (D-Fire)', 'جديد · إنذار فوري'],
      ['smoking', 'كشف التدخين', 'سيجارة · فيب · دخان سيجارة داخل المنشأة — YOLOv8 / Ensemble', 'جديد'],
      ['behavior', 'ذكاء السلوك (Pose AI)', 'استغاثة بالإشارة · سقوط · ماكينة بدون مشغّل · وضعية خطرة — YOLO26', 'YOLO26'],
      ['both', 'الوضع الشامل', 'PPE + الحريق + التدخين + السلوك على نفس الكاميرا', null]].forEach(function (m) {
      var b = h('button', { type: 'button', class: 'mode-card', 'aria-pressed': String(LAB.mode === m[0]) }, m[3] ? h('span', { class: 'new', text: m[3] }) : null, h('b', { text: m[1] }), h('span', { text: m[2] }));
      b.addEventListener('click', function () { LAB.mode = m[0]; saveLab(); Array.prototype.forEach.call(modes.children, function (x) { x.setAttribute('aria-pressed', 'false'); }); b.setAttribute('aria-pressed', 'true'); prepareModels(); renderSide(); });
      modes.appendChild(b);
    });
    v.appendChild(modes);

    var lab = h('div', { class: 'lab' }); v.appendChild(lab);
    var canvas = h('canvas', { width: 1280, height: 720 });
    var video = h('video', { playsinline: true, muted: true, autoplay: true });
    var img = h('img', { alt: '', style: { display: 'none' } });
    var phoneImg = h('img', { alt: '', style: { position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' } });
    var hudL = h('div', { class: 'l' }), hudR = h('div', { class: 'r' });
    var empty = h('div', { class: 'lab-empty' }, h('div', null,
      h('div', { style: { width: '64px', height: '64px', margin: '0 auto', borderRadius: '18px', display: 'grid', placeItems: 'center', background: 'rgba(43,161,96,.16)', color: 'var(--green-hi)' } }, U.icon('live')),
      h('h3', { text: 'ابدأ الكشف المباشر' }),
      h('p', { text: 'قف أمام الكاميرا. سيحدد النظام الخوذة ونظارة الوقاية والسترة العاكسة، وإن نقص أي منها يلتقط صورة ويسجلها في ملف العامل.' }),
      h('div', { class: 'row' }, h('button', { class: 'btn btn--accent', onclick: function () { startCamera(); } }, U.icon('play'), 'تشغيل الكاميرا'), h('button', { class: 'btn', onclick: function () { pairPhone(startPhone); } }, '📱 كاميرا الموبايل'), h('label', { class: 'btn' }, U.icon('upload'), 'صورة / فيديو', h('input', { type: 'file', accept: 'image/*,video/*', style: { display: 'none' }, onchange: function (e) { if (e.target.files[0]) startFile(e.target.files[0]); } })))));
    var loading = h('div', { class: 'lab-loading hidden' }, h('div', { class: 'box' }, h('div', { class: 'spinner' }), h('div', { style: { marginTop: '14px', fontWeight: 600 }, id: 'ldT', text: 'تحميل النماذج…' }), h('div', { class: 'bar' }, h('i', { id: 'ldBar' })), h('div', { class: 'muted mono', style: { fontSize: '11px' }, id: 'ldS', text: '' })));
    var stage = h('div', { class: 'lab-stage' }, canvas, video, img, phoneImg, h('div', { class: 'lab-hud' }, hudL, hudR), h('div', { class: 'lab-brand' }, h('div', { class: 'powered' }, h('span', { class: 'dot' }), 'POWERED BY ', h('b', { text: 'DELMON' }), h('span', { class: 'amp', text: '&' }), h('b', { text: 'DEV SMART X' }))), empty, loading);
    var left = h('div', null, stage);
    var camSel = h('select', { class: 'select', style: { minWidth: '180px' } }, h('option', { value: '', text: 'الكاميرا الافتراضية' }));
    listCams().then(function (ds) { ds.forEach(function (d, i) { camSel.appendChild(h('option', { value: d.deviceId, text: d.label || ('كاميرا ' + (i + 1)) })); }); });
    var stopBtn = h('button', { class: 'btn', onclick: stop }, U.icon('stop'), 'إيقاف');
    var controls = h('div', { class: 'lab-controls' },
      h('button', { class: 'btn btn--accent', onclick: function () { startCamera(); } }, U.icon('play'), 'تشغيل الكاميرا'), h('button', { class: 'btn', onclick: function () { pairPhone(startPhone); } }, '📱 كاميرا الموبايل'), stopBtn, camSel,
      h('label', { class: 'btn' }, U.icon('upload'), 'صورة / فيديو', h('input', { type: 'file', accept: 'image/*,video/*', style: { display: 'none' }, onchange: function (e) { if (e.target.files[0]) startFile(e.target.files[0]); } })),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: LAB.mirror, onchange: function (e) { LAB.mirror = e.target.checked; saveLab(); } }), 'عكس الصورة'),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: LAB.sound, onchange: function (e) { LAB.sound = e.target.checked; saveLab(); } }), 'تنبيه صوتي'));
    var engSel = U.select([['browser', 'محرك الذكاء: داخل الجهاز (المتصفح)'], ['titan', 'محرك الذكاء: خادم EGIC AI (Python)']], LAB.ppeEngine, function (x) { LAB.ppeEngine = x; saveLab(); st.tracker = null; prepareModels(); renderSide(); });
    var reqRow = h('div', { class: 'lab-controls' }, engSel, h('span', { class: 'muted', style: { fontSize: '12px' }, text: 'المعدات المطلوبة في هذه المنطقة:' }), ['helmet', 'glasses', 'vest'].map(function (k) { return h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: LAB.required[k], onchange: function (e) { LAB.required[k] = e.target.checked; saveLab(); st.tracker = null; } }), PPE_AR[k]); }),
      h('span', { class: 'muted', style: { fontSize: '12px', marginInlineStart: 'auto' }, text: 'مهلة المحطة (ث):' }), h('input', { class: 'input', type: 'number', min: 3, max: 120, value: LAB.stationSec, style: { width: '70px', height: '30px' }, onchange: function (e) { LAB.stationSec = Math.max(3, +e.target.value || 8); saveLab(); } }));
    left.appendChild(controls); left.appendChild(reqRow);
    var side = h('div', { class: 'lab-side' });
    lab.appendChild(left); lab.appendChild(side);

    // ---------- side panel ----------
    var idCard, ppeRows = {}, verdict, timerBar, behav, caps, modelChips, idSel, hzList;
    function renderSide() {
      clear(side);
      // identity
      var c1 = U.card('الهوية', { icon: 'workers', actions: [h('button', { class: 'btn btn--xs', onclick: enrollDialog }, U.icon('userplus'), 'تسجيل وجه')] });
      idCard = h('div', { class: 'idcard' }, h('div', { class: 'ph', id: 'idPh', text: '?' }), h('div', null, h('b', { id: 'idName', text: '—' }), h('span', { id: 'idSub', text: 'بانتظار ظهور شخص' })));
      idSel = U.select([['auto', 'تعرّف تلقائي بالوجه'], ['fixed', 'ربط بملف محدد']], LAB.idMode, function (x) { LAB.idMode = x; saveLab(); profSel.style.display = x === 'fixed' || !hasFaces() ? '' : 'none'; });
      var profSel = h('select', { class: 'select' });
      API.get('workers', { limit: 40 }).then(function (r) { r.items.forEach(function (w) { var o = h('option', { value: w.id, text: w.name + ' · ' + w.id }); if (w.id === LAB.profileId) o.selected = true; profSel.appendChild(o); }); });
      profSel.addEventListener('change', function () { LAB.profileId = profSel.value; saveLab(); });
      profSel.style.display = LAB.idMode === 'fixed' || !hasFaces() ? '' : 'none';
      c1.body.appendChild(h('div', { style: { display: 'grid', gap: '10px' } }, idCard, idSel, profSel, h('div', { class: 'muted', style: { fontSize: '11.5px' }, id: 'idHint', text: hasFaces() ? 'بصمات الوجه المسجلة: ' + Object.keys(faceDB()).length + ' — تُحفظ على هذا الجهاز فقط.' : 'لا توجد بصمات وجه مسجلة بعد — سيُنسب الكشف للملف المحدد أعلاه.' })));
      side.appendChild(c1);
      // PPE checklist
      if (hasPPE()) {
        var c2 = U.card('فحص معدات الوقاية', { icon: 'helmet' });
        var list = h('div', { class: 'ppe-list' });
        ['helmet', 'glasses', 'vest'].forEach(function (k) {
          var row = h('div', { class: 'ppe-row' + (LAB.required[k] ? '' : ' hidden') }, h('span', { class: 'ic' }, U.icon(k)), h('div', null, h('b', { text: PPE_AR[k] }), h('small', { text: ({ helmet: 'HARD HAT', glasses: 'SAFETY GLASSES', vest: 'HI-VIS VEST' })[k] })), h('span', { class: 'state-pill', text: '—' }));
          ppeRows[k] = row; list.appendChild(row);
        });
        verdict = h('div', { class: 'verdict' }, h('span', { id: 'vText', text: 'بانتظار الكشف' }), h('span', { class: 'mono muted', style: { fontSize: '11px' }, id: 'vSub', text: '' }));
        timerBar = h('div', { class: 'timer' }, h('i'));
        c2.body.appendChild(h('div', { style: { display: 'grid', gap: '10px' } }, list, verdict, timerBar));
        side.appendChild(c2);
      }
      if (hasFire() || hasSmoking()) {
        var c6 = U.card('الحريق والمخاطر', { icon: 'alert' });
        hzList = h('div', { class: 'ppe-list' });
        [['fire', '🔥', 'لهب / حريق', 'FIRE · إنذار حرج', hasFire()], ['smoke', '💨', 'دخان', 'SMOKE · إنذار مبكر', hasFire()], ['smoking', '🚬', 'تدخين', 'سيجارة · فيب', hasSmoking()]].forEach(function (r) {
          if (!r[4]) return;
          hzList.appendChild(h('div', { class: 'ppe-row', id: 'hz-' + r[0] }, h('span', { class: 'ic', style: { fontSize: '18px' }, text: r[1] }), h('div', null, h('b', { text: r[2] }), h('small', { text: r[3] })), h('span', { class: 'state-pill', text: '—' })));
        });
        c6.body.appendChild(hzList);
        c6.body.appendChild(h('div', { class: 'muted', style: { fontSize: '11.5px', marginTop: '8px' }, text: 'لا يُطلق الإنذار من إطار واحد: يلزم تكرار الرصد في عدة إطارات متتالية لتقليل الإنذارات الكاذبة.' }));
        side.appendChild(c6);
      }
      if (hasPose()) {
        var c3 = U.card('ذكاء السلوك · YOLO26-pose', { icon: 'posture' });
        behav = h('div', { class: 'ppe-list' });
        [['sos', 'sos', 'إشارة استغاثة', 'ارفع اليدين فوق الرأس ثانيتين'], ['fall', 'alert', 'سقوط / شخص على الأرض', 'وضع أفقي للجسم'], ['station', 'station', 'محطة التشغيل', 'غياب المشغّل عن المنطقة المحددة'], ['ergo', 'posture', 'وضعية العمل', 'زاوية انحناء الظهر']].forEach(function (b) {
          behav.appendChild(h('div', { class: 'ppe-row', id: 'bh-' + b[0] }, h('span', { class: 'ic' }, U.icon(b[1])), h('div', null, h('b', { text: b[2] }), h('small', { text: b[3] })), h('span', { class: 'state-pill', text: '—' })));
        });
        c3.body.appendChild(behav);
        side.appendChild(c3);
      }
      var c4 = U.card('آخر اللقطات المسجلة', { icon: 'reports', actions: [h('a', { class: 'btn btn--xs', href: '#/workers/' + (LAB.profileId || S.meta.presenterId), text: 'فتح الملف' })] });
      caps = h('div', { class: 'captures' });
      renderCaptures();
      c4.body.appendChild(caps);
      side.appendChild(c4);
      var c5 = U.card('النماذج', { icon: 'api' });
      modelChips = h('div', { class: 'modelbar' });
      c5.body.appendChild(modelChips);
      side.appendChild(c5);
      renderModelChips();
    }
    function hasFaces() { return Object.keys(faceDB()).some(function (k) { return faceDB()[k].length; }); }
    function renderCaptures() {
      if (!caps) return; clear(caps);
      if (!st.captures.length) { caps.appendChild(h('div', { class: 'muted', style: { gridColumn: '1 / -1', fontSize: '12px' }, text: 'لا توجد لقطات بعد.' })); return; }
      st.captures.slice(0, 6).forEach(function (c) { caps.appendChild(h('button', { type: 'button', title: c.title, onclick: function () { U.imageModal(c.img, c.title); } }, h('img', { src: c.img, alt: c.title }))); });
    }
    function renderModelChips() {
      if (!modelChips) return; clear(modelChips);
      var tf = faceapi ? faceapi.tf : null;
      modelChips.appendChild(h('span', { class: 'chip' }, 'Backend ', h('b', { text: tf ? tf.getBackend().toUpperCase() : '—' })));
      var srv = ppeEngine() === 'titan';
      if (hasPPE()) modelChips.appendChild(h('span', { class: 'chip' }, 'PPE ', h('b', { text: srv ? (titanOk ? 'خادم AI · YOLOv8s SH17' : 'خادم AI · جارٍ الاتصال') : AI && AI.loaded('ppe') ? 'YOLOv8s · SH17' : 'غير محمّل' })));
      if (hasFire()) modelChips.appendChild(h('span', { class: 'chip' }, 'Fire ', h('b', { text: srv && titanOk ? 'خادم AI · YOLOv8n D-Fire' : AI && AI.loaded('fire') ? 'YOLOv8n · D-Fire · ONNX' : 'غير محمّل' })));
      if (hasSmoking()) modelChips.appendChild(h('span', { class: 'chip' }, 'Smoking ', h('b', { text: srv && titanOk ? 'خادم AI · Ensemble YOLOv8+YOLO11m' : AI && AI.loaded('smoking') ? 'YOLOv8 · ONNX' : 'غير محمّل' })));
      if (hasPose()) modelChips.appendChild(h('span', { class: 'chip' }, 'Pose ', h('b', { text: AI && AI.loaded('pose') ? 'YOLO26n' : 'غير محمّل' })));
      modelChips.appendChild(h('span', { class: 'chip' }, 'Face ID ', h('b', { text: faceapi && faceapi.nets.faceRecognitionNet.isLoaded ? 'جاهز' : '—' })));
      modelChips.appendChild(h('span', { class: 'chip' }, 'المعالجة ', h('b', { text: 'على الجهاز · بدون سحابة' })));
    }
    renderSide();

    // ---------- model preparation ----------
    function setLoading(on, t, p, s) {
      loading.classList.toggle('hidden', !on);
      if (t) loading.querySelector('#ldT').textContent = t;
      if (p != null) loading.querySelector('#ldBar').style.width = Math.round(p * 100) + '%';
      if (s != null) loading.querySelector('#ldS').textContent = s;
    }
    var prepP = null, prepMode = null;
    function prepareModels() {
      var key = LAB.mode + ':' + LAB.ppeEngine;
      var retryTitan = LAB.ppeEngine === 'titan' && ppeEng === 'browser';
      if (prepP && prepMode === key && !retryTitan) return prepP;
      prepMode = key; ppeEng = null; titanOk = false;
      var need = { ppe: ['ppe'], behavior: ['pose'], fire: ['fire'], smoking: ['smoking'], both: ['fire', 'ppe', 'smoking', 'pose'] }[LAB.mode] || ['ppe'];
      var i = 0;
      var engP = LAB.ppeEngine === 'titan' && LAB.mode !== 'behavior'
        ? (setLoading(true, 'الاتصال بخادم EGIC AI…', 0.03, TITAN_URL), titanHealth().then(function (hj) { titanOk = true; titanSchema = hj && hj.models ? 'sh17' : null; return 'titan'; }, function () {
          U.toast('خادم EGIC AI غير متاح', TITAN_URL + ' — تم التحويل تلقائيًا لنماذج المتصفح على الجهاز.', { kind: 'critical', ms: 9000 });
          return 'browser';
        }))
        : Promise.resolve('browser');
      prepP = engP.then(function (eng) {
        ppeEng = eng; st.tracker = null;
        if (eng === 'titan') need = need.filter(function (n) { return n === 'pose' || (n === 'ppe' && titanSchema !== 'sh17'); });
        setLoading(true, 'تحميل محرك الذكاء الاصطناعي…', 0.05, 'TensorFlow.js · WebGL');
        return ensureCore();
      }).then(function (backend) {
        return need.reduce(function (p, name) {
          return p.then(function () {
            setLoading(true, 'تحميل نموذج ' + ({ ppe: 'معدات الوقاية (YOLOv8s · SH17)', pose: 'الوضعيات (YOLO26-pose)', fire: 'الحريق والدخان (YOLOv8n · D-Fire)', smoking: 'كشف التدخين (YOLOv8)' })[name] + '…', 0.1 + 0.7 * i / need.length, AI.REGISTRY[name].label + ' · ' + backend.toUpperCase());
            return ensureModel(name, function (f) { setLoading(true, null, 0.1 + 0.7 * (i + f) / need.length); }).then(function () { i++; });
          });
        }, Promise.resolve());
      }).then(function () {
        setLoading(true, 'تحميل التعرّف على الوجه…', 0.9, 'face-api · 128-D descriptors');
        return ensureFace().catch(function () { return null; });
      }).then(function () { setLoading(false); renderModelChips(); if (st.srcKind) st.running = true; }).catch(function (e) { setLoading(true, 'تعذر تحميل النماذج', 1, e.message); prepP = null; });
      return prepP;
    }

    // ---------- sources ----------
    function startCamera() {
      stopSources();
      empty.classList.add('hidden');
      prepareModels();
      openCam(camSel.value || undefined).then(function (stream) {
        if (st.destroyed) { stopStream(stream); return; }
        st.stream = stream; video.srcObject = stream; st.src = video; st.srcKind = 'camera';
        return video.play().then(function () { st.running = true; st.tracker = null; loop(); });
      }).catch(function (e) {
        empty.classList.remove('hidden');
        U.toast('تعذر فتح الكاميرا', camErrMsg(e), { kind: 'critical', ms: 9000 });
      });
    }
    function startPhone(mjpegUrl, sid) {
      stopSources();
      empty.classList.add('hidden');
      prepareModels();
      st.srcKind = 'phone';
      phoneSource(phoneImg, mjpegUrl, sid, st, function () { U.toast('انقطع اتصال كاميرا الموبايل', 'تأكد أن صفحة الكاميرا مفتوحة على الموبايل', { kind: 'critical', ms: 7000 }); })
        .then(function () { if (st.srcKind !== 'phone') return; st.src = phoneFrame(st, phoneImg); st.running = true; st.tracker = null; loop(); })
        .catch(function (e) { st.srcKind = null; empty.classList.remove('hidden'); U.toast('تعذر استقبال صورة الموبايل', e.message, { kind: 'critical' }); });
    }
    function startFile(file) {
      stopSources();
      empty.classList.add('hidden');
      prepareModels();
      st.url = URL.createObjectURL(file);
      if (/^video\//.test(file.type)) {
        video.srcObject = null; video.src = st.url; video.loop = true; st.src = video; st.srcKind = 'video';
        video.play().then(function () { st.running = true; st.tracker = null; loop(); });
      } else {
        img.onload = function () { st.src = img; st.srcKind = 'image'; st.running = true; st.tracker = null; loop(); };
        img.src = st.url;
      }
    }
    function stopSources() { if (st.srcKind === 'phone') { phoneImg.removeAttribute('src'); clearInterval(st.phoneWatch); } st.running = false; stopStream(st.stream); st.stream = null; try { video.pause(); } catch (e) { } video.removeAttribute('src'); video.srcObject = null; if (st.url) { URL.revokeObjectURL(st.url); st.url = null; } st.srcKind = null; st.last = null; st.pose = null; }
    function stop() { stopSources(); empty.classList.remove('hidden'); var g = canvas.getContext('2d'); g.fillStyle = '#020403'; g.fillRect(0, 0, canvas.width, canvas.height); }

    // ---------- main loop ----------
    function srcDims() { var s = st.src; return s ? { w: s.videoWidth || s.naturalWidth || s.width, h: s.videoHeight || s.naturalHeight || s.height } : { w: 0, h: 0 }; }
    function loop() {
      if (!st.running || st.destroyed) return;
      if (st.srcKind === 'phone') st.src = phoneFrame(st, phoneImg) || st.src;
      var d = srcDims();
      if (d.w && d.h) {
        if (canvas.width !== d.w || canvas.height !== d.h) { canvas.width = d.w; canvas.height = d.h; }
        var g = canvas.getContext('2d');
        var mir = LAB.mirror && st.srcKind === 'camera';
        g.save(); if (mir) { g.translate(d.w, 0); g.scale(-1, 1); } g.drawImage(st.src, 0, 0, d.w, d.h); g.restore();
        if (!st.busy && prepP && AI) { st.busy = true; infer(d).then(function () { st.busy = false; }, function (e) { console.error(e); st.busy = false; }); }
        drawOverlay(g, d, mir);
      }
      if (st.srcKind === 'image') { setTimeout(function () { requestAnimationFrame(loop); }, 120); } else requestAnimationFrame(loop);
    }

    function infer(d) {
      var t0 = performance.now(), now = Date.now();
      // one model per frame; in the combined mode fire gets every other slot
      var sched = { ppe: ['ppe'], behavior: ['pose'], fire: ['fire'], smoking: ['smoking'], both: ['fire', 'ppe', 'fire', 'smoking', 'fire', 'pose'] }[LAB.mode] || ['ppe'];
      var task = sched[st.flip++ % sched.length];
      var doPPE = task === 'ppe', doPose = task === 'pose', doFire = task === 'fire', doSmoking = task === 'smoking';
      var jobs = [];
      var titan = ppeEng === 'titan';
      if (doFire && (titan || AI.loaded('fire'))) jobs.push((titan ? serverDetect('/fire/detect', st.src, d) : AI.run('fire', st.src, { conf: 0.3, iou: 0.45 })).then(function (dets) { hazards('fire', dets, d, now); }, serverErr));
      if (doSmoking && (titan || AI.loaded('smoking'))) jobs.push((titan ? serverDetect('/smoking/detect', st.src, d) : AI.run('smoking', st.src, { conf: { cigarette: 0.35, vape: 0.35, smoke: 0.4, person: 0.4 }, iou: 0.5 })).then(function (dets) { hazards('smoking', dets, d, now); }, serverErr));
      if (doPPE && (titan ? titanOk : AI.loaded('ppe'))) jobs.push((titan ? titanDetect(st.src, d) : AI.run('ppe', st.src, { conf: AI.PPE_CONF, iou: 0.5 })).then(function (dets) {
        if (!st.tracker) st.tracker = new AI.Tracker({ required: reqKeys(), persistMs: LAB.persistMs, cooldownMs: st.srcKind === 'image' ? 60000 : 25000 });
        var people = titan && dets.schema !== 'sh17' ? AI.analyzePPEHF(dets, d.w, d.h) : AI.analyzePPE(dets, d.w, d.h);
        var vio = st.tracker.update(people, now);
        st.last = { dets: dets, people: people, tracks: st.tracker.tracks.slice(), t: now };
        vio.forEach(function (x) { reportPPE(x.track, x.items, d); });
      }, function (e) {
        if (!titan) throw e;
        serverErr(e);
      }));
      if (doPose && AI.loaded('pose')) jobs.push(AI.run('pose', st.src, { conf: 0.45, iou: 0.5, maxDet: 6 }).then(function (poses) { st.pose = { poses: poses, t: now }; behaviour(poses, d, now); }));
      if (faceapi && faceapi.nets.faceRecognitionNet.isLoaded && now - st.lastFace > 450 && matcher()) {
        st.lastFace = now;
        jobs.push(faceapi.detectAllFaces(st.src, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks(true).withFaceDescriptors().then(function (res) {
          var m = matcher();
          st.faces = res.map(function (r) { var best = m.findBestMatch(r.descriptor); var b = r.detection.box; return { box: { x1: b.x, y1: b.y, x2: b.x + b.width, y2: b.y + b.height }, label: best.label, dist: best.distance }; });
          if (st.tracker) st.faces.forEach(function (f) { st.tracker.assignIdentity(f.box, f.label === 'unknown' ? '__unknown__' : f.label, 1 - f.dist); });
        }).catch(function () { }));
      }
      return Promise.all(jobs).then(function () {
        var dt = performance.now() - t0; st.ms = Math.round(dt); st.frames++;
        var el = performance.now() - st.fpsT; if (el > 1000) { st.fps = Math.round(st.frames * 1000 / el); st.frames = 0; st.fpsT = performance.now(); }
        updateSide();
      });
    }

    // identity resolution
    var workerCache = {};
    function workerInfo(id) {
      if (!id) return Promise.resolve(null);
      if (workerCache[id]) return Promise.resolve(workerCache[id]);
      return API.get('workers/' + encodeURIComponent(id)).then(function (w) { workerCache[id] = w; return w; }).catch(function () { return null; });
    }
    function resolveWorker(track) {
      if (!track) return null;
      var seen = st.tracker && st.last ? st.tracker.tracks.filter(function (t) { return t.seen === st.last.t; }) : [track];
      var primary = seen.slice().sort(function (a, b) { return (b.box.x2 - b.box.x1) * (b.box.y2 - b.box.y1) - (a.box.x2 - a.box.x1) * (a.box.y2 - a.box.y1); })[0] || track;
      if (LAB.idMode === 'auto' && hasFaces()) {
        if (track.identity) return track.identity;
        // no face match yet: a single person in front of the checkpoint camera belongs to the selected profile
        return seen.length <= 1 && !track.idVotes.__unknown__ ? LAB.profileId : null;
      }
      return track === primary ? LAB.profileId : null;
    }

    // ---------- report PPE violation ----------
    function snapshot(boxesFn, d, title) {
      var W = Math.min(1280, d.w), sc = W / d.w, H = Math.round(d.h * sc);
      var c = document.createElement('canvas'); c.width = W; c.height = H;
      var g = c.getContext('2d'); g.drawImage(st.src, 0, 0, W, H);
      g.save(); g.scale(sc, sc); boxesFn(g, d); g.restore();
      watermark(g, W, H, title);
      return c.toDataURL('image/jpeg', 0.84);
    }
    var workerCool = {};
    function reportPPE(track, items, d) {
      var wid = resolveWorker(track);
      var coolKey = wid || ('track-' + track.id), tnow = Date.now();
      items = items.filter(function (k) { var kk = coolKey + ':' + k; if (workerCool[kk] && tnow - workerCool[kk] < 30000) return false; workerCool[kk] = tnow; return true; });
      if (!items.length) return;
      var cam = S.cams['P01-CAM-LIVE'];
      var title = 'EGIC · ' + (cam ? cam.name : 'كاميرا العرض') + ' · ' + nowStr();
      var imgUrl = snapshot(function (g) {
        var fs = Math.max(14, Math.round(d.w / 55));
        corners(g, track.box, COL.bad, Math.max(3, d.w / 320));
        items.forEach(function (k) { var it = track.items[k]; if (it && it.box) { g.setLineDash([10, 7]); g.strokeStyle = COL.bad; g.lineWidth = Math.max(3, d.w / 360); g.strokeRect(it.box.x1, it.box.y1, it.box.x2 - it.box.x1, it.box.y2 - it.box.y1); g.setLineDash([]); label(g, it.box.x1, it.box.y1, PPE_EN[k] + ' · بدون ' + PPE_AR[k], 'rgba(170,20,20,.92)', fs); } });
        ['helmet', 'glasses', 'vest'].forEach(function (k) { var it = track.items[k]; if (it && it.state === 'OK' && it.box) { g.strokeStyle = COL.ok; g.lineWidth = Math.max(2, d.w / 480); g.strokeRect(it.box.x1, it.box.y1, it.box.x2 - it.box.x1, it.box.y2 - it.box.y1); } });
        label(g, track.box.x1, track.box.y1, (workerCache[wid] ? workerCache[wid].name : 'عامل') + ' · مخالفة معدات وقاية', 'rgba(120,14,14,.95)', fs);
      }, d, title);
      var incident = 'INC-' + Date.now().toString(36).toUpperCase();
      var conf = Math.max.apply(null, [0.8].concat(items.map(function (k) { return track.items[k] && track.items[k].score ? track.items[k].score : 0.85; })));
      st.captures.unshift({ img: imgUrl, title: items.map(function (k) { return 'بدون ' + PPE_AR[k]; }).join(' + ') + ' · ' + U.fTime(Date.now()) }); renderCaptures();
      stage.classList.remove('is-alert'); void stage.offsetWidth; stage.classList.add('is-alert');
      if (LAB.sound) beep();
      workerInfo(wid).then(function (w) {
        var posts = items.map(function (k) { return API.post('events', { type: PPE_TYPES[k], workerId: wid, cameraId: 'P01-CAM-LIVE', conf: Math.round(conf * 100) / 100, source: 'live-ai', incident: incident, missing: items, durationSec: Math.round((Date.now() - (track.since[k] || Date.now())) / 1000) + 1, evidence: { kind: 'live', image: imgUrl, model: ppeEng === 'titan' ? 'TITAN-PPE ppe_hf.onnx' : 'YOLOv8s-SH17' } }); });
        return Promise.all(posts).then(function (evs) {
          U.toast('تم تسجيل مخالفة ← ملف ' + (w ? w.name : 'غير محدد'), items.map(function (k) { return 'بدون ' + PPE_AR[k]; }).join(' · ') + ' · ' + (evs[0] ? evs[0].id : ''), { kind: 'live', img: imgUrl, action: wid ? ['فتح الملف', function () { U.navigate('#/workers/' + wid); }] : null, ms: 7000 });
        });
      });
    }

    function serverErr(e) {
      if (ppeEng !== 'titan') throw e;
      if (Date.now() - titanErrT > 15000) { titanErrT = Date.now(); U.toast('انقطع الاتصال بخادم EGIC AI', TITAN_URL + ' · ' + e.message, { kind: 'critical', ms: 8000 }); }
    }

    // ---------- fire · smoke · smoking ----------
    var HZ_RULE = {
      fire: { need: 3, win: 5, type: 'FIRE_DETECTED', sev: 'CRITICAL', cool: 60000, ar: 'حريق', model: 'YOLOv8n · D-Fire' },
      smoke: { need: 4, win: 6, type: 'SMOKE_DETECTED', sev: 'HIGH', cool: 60000, ar: 'دخان', model: 'YOLOv8n · D-Fire' },
      smoking: { need: 3, win: 5, type: 'SMOKING_DETECTED', sev: 'HIGH', cool: 45000, ar: 'تدخين', model: 'YOLOv8 · cigarette/vape' }
    };
    var SMOKING_LABELS = { cigarette: 'سيجارة', vape: 'فيب', smoke: 'دخان سيجارة' };
    st.hz = { fire: [], smoke: [], smoking: [], cool: {}, view: {} };
    function hazards(kind, dets, d, now) {
      var groups = kind === 'fire'
        ? { fire: dets.filter(function (x) { return x.label === 'fire'; }), smoke: dets.filter(function (x) { return x.label === 'smoke'; }) }
        : { smoking: dets.filter(function (x) { return SMOKING_LABELS[x.label]; }) };
      if (kind === 'smoking' && dets.raw && dets.raw.smoking === false) groups.smoking = groups.smoking.filter(function (x) { return x.score >= 0.5; });
      st.hz.view[kind] = { dets: kind === 'fire' ? groups.fire.concat(groups.smoke) : groups.smoking, t: now };
      Object.keys(groups).forEach(function (k) {
        var R = HZ_RULE[k], w = st.hz[k];
        w.push(groups[k].length > 0); while (w.length > R.win) w.shift();
        var hits = w.filter(Boolean).length;
        if (groups[k].length && hits >= R.need && (!st.hz.cool[k] || now - st.hz.cool[k] > R.cool)) { st.hz.cool[k] = now; raiseHazard(k, groups[k], d); }
      });
    }
    function raiseHazard(k, dets, d) {
      var R = HZ_RULE[k], best = dets.slice().sort(function (a, b) { return b.score - a.score; })[0];
      var col = k === 'fire' ? '#ff3b1f' : k === 'smoke' ? '#c9d1d9' : '#ffb000';
      var imgUrl = snapshot(function (g) {
        var fs = Math.max(14, Math.round(d.w / 55)), lw = Math.max(3, d.w / 300);
        dets.forEach(function (x) { g.strokeStyle = col; g.lineWidth = lw; g.strokeRect(x.x1, x.y1, x.x2 - x.x1, x.y2 - x.y1); label(g, x.x1, x.y1, (k === 'smoking' ? SMOKING_LABELS[x.label] : R.ar) + ' · ' + Math.round(x.score * 100) + '%', k === 'fire' ? 'rgba(180,20,10,.94)' : 'rgba(120,80,10,.92)', fs); });
      }, d, 'EGIC · إنذار ' + R.ar + ' · ' + nowStr());
      st.captures.unshift({ img: imgUrl, title: 'إنذار ' + R.ar + ' · ' + U.fTime(Date.now()) }); renderCaptures();
      stage.classList.remove('is-alert'); void stage.offsetWidth; stage.classList.add('is-alert');
      var wid = k === 'smoking' ? (LAB.idMode === 'fixed' || !hasFaces() ? LAB.profileId : (st.tracker && st.tracker.tracks[0] && st.tracker.tracks[0].identity) || LAB.profileId) : null;
      var body = { type: R.type, workerId: wid, cameraId: 'P01-CAM-LIVE', conf: best ? Math.round(best.score * 100) / 100 : 0.9, source: 'live-' + (k === 'smoking' ? 'smoking' : 'fire'), sev: R.sev, evidence: { kind: 'live', image: imgUrl, model: (ppeEng === 'titan' ? 'EGIC AI · ' : '') + (k === 'smoking' && ppeEng === 'titan' ? 'Ensemble YOLOv8 + YOLO11m' : R.model) }, note: k === 'smoking' ? 'رُصد تدخين (' + dets.map(function (x) { return SMOKING_LABELS[x.label]; }).filter(Boolean).join('، ') + ') في منطقة يُمنع فيها التدخين' : 'رصد ' + R.ar + ' مؤكد عبر ' + R.need + ' إطارات متتالية' };
      var fallback = { type: R.type, ts: Date.now(), conf: body.conf, sev: R.sev, cameraId: body.cameraId, evidence: { model: body.evidence.model }, incident: 'HZ-' + Date.now().toString(36) };
      API.post('events', body).then(function (ev) {
        if (window.EGICAlarm) window.EGICAlarm.show(ev, { img: imgUrl });
      }, function () { if (window.EGICAlarm) window.EGICAlarm.show(fallback, { img: imgUrl }); });
    }

    // ---------- behaviour (pose) ----------
    function stationRoi(d) { return { x1: d.w * 0.22, y1: d.h * 0.18, x2: d.w * 0.78, y2: d.h * 0.98 }; }
    function behaviour(poses, d, now) {
      var B = st.behavior, primary = poses.slice().sort(function (a, b) { return (b.x2 - b.x1) * (b.y2 - b.y1) - (a.x2 - a.x1) * (a.y2 - a.y1); })[0];
      var roi = stationRoi(d);
      var present = poses.some(function (p) { var cx = (p.x1 + p.x2) / 2, cy = (p.y1 + p.y2) / 2; return cx > roi.x1 && cx < roi.x2 && cy > roi.y1 && cy < roi.y2; });
      if (present) { B.absentSince = 0; B.present = true; } else if (!B.absentSince) B.absentSince = now;
      B.analysis = primary ? AI.analyzePose(primary) : null;
      var a = B.analysis;
      if (a && a.sos) { if (!B.sosSince) B.sosSince = now; } else B.sosSince = 0;
      if (a && a.fall) { if (!B.fallSince) B.fallSince = now; } else B.fallSince = 0;
      if (a && a.trunkAngle != null && a.trunkAngle >= 45 && !a.fall) { if (!B.ergoSince) B.ergoSince = now; } else B.ergoSince = 0;
      function fire(key, type, ms, cool, text, sev) {
        if (!B.cool[key] || now - B.cool[key] > cool) {
          B.cool[key] = now;
          var wid = LAB.idMode === 'fixed' || !hasFaces() ? LAB.profileId : (st.tracker && st.tracker.tracks[0] && st.tracker.tracks[0].identity) || LAB.profileId;
          var imgUrl = snapshot(function (g) { drawPoses(g, poses, d, false, true); if (type === 'UNATTENDED_STATION') drawRoi(g, roi, true, d); }, d, 'EGIC · ' + text + ' · ' + nowStr());
          st.captures.unshift({ img: imgUrl, title: text + ' · ' + U.fTime(now) }); renderCaptures();
          stage.classList.remove('is-alert'); void stage.offsetWidth; stage.classList.add('is-alert');
          if (LAB.sound) beep(type === 'SOS_GESTURE' ? 'sos' : null);
          API.post('events', { type: type, workerId: type === 'UNATTENDED_STATION' ? null : wid, cameraId: 'P01-CAM-LIVE', conf: 0.9, source: 'live-pose', sev: sev, evidence: { kind: 'live', image: imgUrl, model: 'YOLO26n-pose' }, note: type === 'UNATTENDED_STATION' ? 'لا يوجد مشغّل في منطقة المحطة لأكثر من ' + LAB.stationSec + ' ث' : '' }).then(function (ev) {
            if (type !== 'SOS_GESTURE') U.toast('Pose AI: ' + text, ev.id + ' · ' + ev.siteName, { kind: type === 'FALL' ? 'critical' : 'live', img: imgUrl, action: ['عرض', function () { U.openEvent(ev); }] });
          });
        }
      }
      if (B.sosSince && now - B.sosSince > 1500) fire('sos', 'SOS_GESTURE', 1500, 20000, 'إشارة استغاثة يدوية', 'CRITICAL');
      if (B.fallSince && now - B.fallSince > 2000) fire('fall', 'FALL', 2000, 30000, 'سقوط / شخص على الأرض', 'CRITICAL');
      if (B.ergoSince && now - B.ergoSince > 3000) fire('ergo', 'ERGONOMIC_RISK', 3000, 30000, 'وضعية عمل خطرة (انحناء الظهر)', 'LOW');
      if (B.present && B.absentSince && now - B.absentSince > LAB.stationSec * 1000) { fire('station', 'UNATTENDED_STATION', 0, 30000, 'ماكينة بدون مشغّل', 'MEDIUM'); B.present = false; }
    }
    function drawRoi(g, roi, alert, d) {
      g.save(); g.setLineDash([12, 8]); g.lineWidth = Math.max(2, d.w / 500); g.strokeStyle = alert ? COL.bad : 'rgba(143,199,255,.9)'; g.strokeRect(roi.x1, roi.y1, roi.x2 - roi.x1, roi.y2 - roi.y1); g.setLineDash([]);
      label(g, roi.x1, roi.y1 + Math.max(16, d.w / 60) * 1.6, 'منطقة المشغّل · OPERATOR ZONE', alert ? 'rgba(160,20,20,.9)' : 'rgba(20,60,110,.85)', Math.max(12, Math.round(d.w / 70)));
      g.restore();
    }
    function drawPoses(g, poses, d, mir, forSnap) {
      var lw = Math.max(2.5, d.w / 380);
      poses.forEach(function (p) {
        var a = AI.analyzePose(p);
        var bad = a.sos || a.fall; var col = bad ? COL.bad : a.ergoLevel === 'HIGH' ? COL.warn : COL.info;
        var P = function (k) { return { x: mir ? d.w - k.x : k.x, y: k.y, v: k.v }; };
        g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
        AI.SKELETON.forEach(function (s) { var a1 = p.kpts[s[0]], b1 = p.kpts[s[1]]; if (a1.v > 0.45 && b1.v > 0.45) { var A = P(a1), Bp = P(b1); g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(Bp.x, Bp.y); g.stroke(); } });
        g.fillStyle = '#fff'; p.kpts.forEach(function (k) { if (k.v > 0.45) { var q = P(k); g.beginPath(); g.arc(q.x, q.y, lw * 1.2, 0, Math.PI * 2); g.fill(); } });
        var bx = mir ? mirrorBox(p, d.w) : p;
        var txt = a.sos ? 'SOS · استغاثة' : a.fall ? 'FALL · سقوط' : a.trunkAngle != null ? 'زاوية الظهر ' + a.trunkAngle + '°' : 'PERSON';
        label(g, bx.x1, bx.y1, txt, bad ? 'rgba(170,20,20,.92)' : 'rgba(10,40,70,.85)', Math.max(13, Math.round(d.w / 60)));
      });
    }

    // ---------- overlay ----------
    function drawOverlay(g, d, mir) {
      var fs = Math.max(13, Math.round(d.w / 62)), lw = Math.max(2.5, d.w / 400);
      var L = st.last;
      var maxAge = Math.max(2500, st.ms * 2.5);
      Object.keys(st.hz.view).forEach(function (kind) {
        var V = st.hz.view[kind]; if (!V || Date.now() - V.t > maxAge) return;
        V.dets.forEach(function (x) {
          var b = mir ? mirrorBox(x, d.w) : x, c = x.label === 'fire' ? '#ff3b1f' : x.label === 'smoke' && kind === 'fire' ? '#c9d1d9' : '#ffb000';
          g.strokeStyle = c; g.lineWidth = lw * 1.1; g.setLineDash(x.label === 'smoke' && kind === 'fire' ? [12, 8] : []); g.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1); g.setLineDash([]);
          var t = kind === 'fire' ? (x.label === 'fire' ? '🔥 حريق FIRE ' : '💨 دخان SMOKE ') : '🚬 ' + (SMOKING_LABELS[x.label] || x.label) + ' ';
          label(g, b.x1, b.y1, t + Math.round(x.score * 100) + '%', x.label === 'fire' ? 'rgba(180,20,10,.94)' : 'rgba(110,75,10,.92)', fs);
        });
      });
      if (L && hasPPE() && Date.now() - L.t < maxAge) {
        L.tracks.forEach(function (t) {
          if (t.seen !== L.t) return;
          var req = reqKeys();
          var missing = req.filter(function (k) { return t.stable && t.stable[k] === 'MISSING'; });
          var ok = req.every(function (k) { return t.stable && t.stable[k] === 'OK'; });
          var col = missing.length ? COL.bad : ok ? COL.ok : COL.warn;
          var b = mir ? mirrorBox(t.box, d.w) : t.box;
          corners(g, b, col, lw);
          req.forEach(function (k) {
            var it = t.items[k]; if (!it || !it.box) return;
            var ib = mir ? mirrorBox(it.box, d.w) : it.box;
            if (it.state === 'OK') { g.strokeStyle = COL.ok; g.lineWidth = lw * 0.8; g.strokeRect(ib.x1, ib.y1, ib.x2 - ib.x1, ib.y2 - ib.y1); label(g, ib.x1, ib.y1, '✓ ' + PPE_AR[k], 'rgba(10,90,50,.88)', fs * 0.85); }
            else if (it.state === 'MISSING') { g.setLineDash([10, 7]); g.strokeStyle = COL.bad; g.lineWidth = lw; g.strokeRect(ib.x1, ib.y1, ib.x2 - ib.x1, ib.y2 - ib.y1); g.setLineDash([]); label(g, ib.x1, ib.y2 + fs * 1.6, '✗ بدون ' + PPE_AR[k], 'rgba(170,20,20,.92)', fs * 0.9); }
          });
          var wid = resolveWorker(t), w = workerCache[wid];
          if (wid && !w) workerInfo(wid);
          var who = t.identity && workerCache[t.identity] ? workerCache[t.identity].name : w ? w.name : 'شخص';
          label(g, b.x1, b.y1, who + (missing.length ? ' · مخالفة' : ok ? ' · ملتزم' : ''), missing.length ? 'rgba(150,16,16,.94)' : ok ? 'rgba(10,90,50,.9)' : 'rgba(120,90,10,.9)', fs);
        });
      }
      if (st.pose && hasPose() && Date.now() - st.pose.t < Math.max(2000, st.ms * 2.5)) {
        drawPoses(g, st.pose.poses, d, mir);
        var roi = stationRoi(d), B = st.behavior;
        var alertRoi = B.absentSince && B.present && Date.now() - B.absentSince > LAB.stationSec * 500;
        drawRoi(g, mir ? mirrorBox(roi, d.w) : roi, alertRoi, d);
      }
      if (st.faces && st.faces.length && LAB.idMode === 'auto') st.faces.forEach(function (f) { var b = mir ? mirrorBox(f.box, d.w) : f.box; g.strokeStyle = 'rgba(247,146,36,.85)'; g.lineWidth = 1.5; g.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1); });
      // HUD chips
      clear(hudL); clear(hudR);
      hudL.appendChild(h('span', { class: 'hud-chip rec', text: st.srcKind === 'camera' ? 'LIVE · P01-CAM-LIVE' : st.srcKind === 'phone' ? 'LIVE · 📱 MOBILE CAM' + (st.phoneFps ? ' · ' + st.phoneFps + ' FPS' : '') : st.srcKind === 'video' ? 'VIDEO FILE' : 'IMAGE' }));
      hudL.appendChild(h('span', { class: 'hud-chip', text: 'نقطة فحص الوقاية · المصنع 01' }));
      hudR.appendChild(h('span', { class: 'hud-chip', text: (st.fps ? st.fps + ' FPS · ' : '') + st.ms + ' ms' }));
      hudR.appendChild(h('span', { class: 'hud-chip', text: (ppeEng === 'titan' ? 'EGIC AI SERVER' : faceapi ? faceapi.tf.getBackend().toUpperCase() : '') + ' · ON-DEVICE' }));
    }

    // ---------- side panel live update ----------
    function updateSide() {
      var L = st.last;
      var primary = L && L.tracks.filter(function (t) { return t.seen === L.t; }).sort(function (a, b) { return (b.box.x2 - b.box.x1) - (a.box.x2 - a.box.x1); })[0];
      var ph = document.getElementById('idPh'), nm = document.getElementById('idName'), sb = document.getElementById('idSub');
      var wid = primary ? resolveWorker(primary) : (!hasPPE() ? LAB.profileId : null);
      if (nm) {
        var w = workerCache[wid];
        if (w) { nm.textContent = w.name; sb.textContent = w.id + ' · ' + w.dept + (primary && primary.identity ? ' · تعرّف بالوجه ✓' : ' · ربط بالملف'); if (ph) { clear(ph); if (w.photo) ph.appendChild(h('img', { src: API.evidenceUrl(w.photo), alt: '' })); else ph.textContent = U.initials(w.name); } }
        else if (primary) { nm.textContent = 'شخص غير معروف'; sb.textContent = 'سجّل الوجه لربطه بملف'; if (ph) ph.textContent = '?'; if (wid) workerInfo(wid); }
        else { nm.textContent = '—'; sb.textContent = 'بانتظار ظهور شخص'; }
      }
      if (hzList) {
        var setH = function (id, cls, text) { var r = document.getElementById('hz-' + id); if (!r) return; r.classList.toggle('is-ok', cls === 'ok'); r.classList.toggle('is-miss', cls === 'bad'); r.querySelector('.state-pill').textContent = text; };
        ['fire', 'smoke', 'smoking'].forEach(function (k) {
          var w = st.hz[k], hits = w.filter(Boolean).length, R = HZ_RULE[k], alarm = st.hz.cool[k] && Date.now() - st.hz.cool[k] < 15000;
          setH(k, alarm || hits >= R.need ? 'bad' : w.length ? 'ok' : '', alarm ? 'إنذار!' : hits ? 'رصد ' + hits + '/' + R.win : w.length ? 'لا يوجد ✓' : '—');
        });
      }
      if (hasPPE() && ppeRows.helmet) {
        var req = reqKeys();
        ['helmet', 'glasses', 'vest'].forEach(function (k) {
          var row = ppeRows[k]; row.classList.toggle('hidden', !LAB.required[k]);
          var s2 = primary && primary.stable ? primary.stable[k] : null;
          row.classList.toggle('is-ok', s2 === 'OK'); row.classList.toggle('is-miss', s2 === 'MISSING');
          row.querySelector('.state-pill').textContent = req.indexOf(k) < 0 ? 'غير مدعوم في هذا المحرك' : s2 === 'OK' ? 'ملتزم ✓' : s2 === 'MISSING' ? 'غير موجود ✗' : primary ? 'غير واضح' : '—';
        });
        var missing = primary ? req.filter(function (k) { return primary.stable && primary.stable[k] === 'MISSING'; }) : [];
        var allOk = primary && req.every(function (k) { return primary.stable && primary.stable[k] === 'OK'; });
        verdict.className = 'verdict' + (missing.length ? ' is-bad' : allOk ? ' is-ok' : '');
        document.getElementById('vText').textContent = !primary ? 'لا يوجد شخص أمام الكاميرا' : missing.length ? 'مخالفة: ' + missing.map(function (k) { return PPE_AR[k]; }).join('، ') : allOk ? 'ملتزم بمعدات الوقاية' : 'جارٍ التحقق…';
        var since = primary && missing.length ? Math.min.apply(null, missing.map(function (k) { return primary.since[k] || Date.now(); })) : 0;
        var prog = since ? Math.min(1, (Date.now() - since) / LAB.persistMs) : 0;
        timerBar.firstChild.style.width = (prog * 100) + '%';
        document.getElementById('vSub').textContent = missing.length ? (prog >= 1 ? 'تم التسجيل' : 'تأكيد خلال ' + Math.max(0, ((LAB.persistMs - (Date.now() - since)) / 1000)).toFixed(1) + ' ث') : '';
      }
      if (hasPose() && behav) {
        var B = st.behavior, a = B.analysis;
        function setB(id, cls, text) { var r = document.getElementById('bh-' + id); if (!r) return; r.classList.toggle('is-ok', cls === 'ok'); r.classList.toggle('is-miss', cls === 'bad'); r.querySelector('.state-pill').textContent = text; }
        setB('sos', a && a.sos ? 'bad' : a ? 'ok' : '', a ? (a.sos ? 'استغاثة!' : 'اليدان: ' + a.handsUp + '/2') : '—');
        setB('fall', a && a.fall ? 'bad' : a ? 'ok' : '', a ? (a.fall ? 'سقوط!' : 'طبيعي') : '—');
        var abs = B.absentSince ? Math.round((Date.now() - B.absentSince) / 1000) : 0;
        setB('station', abs && B.present ? 'bad' : 'ok', B.absentSince ? 'غائب ' + abs + ' ث' : 'المشغّل موجود');
        setB('ergo', a && a.ergoLevel === 'HIGH' ? 'bad' : a ? 'ok' : '', a && a.trunkAngle != null ? a.trunkAngle + '° · ' + ({ LOW: 'منخفض', MEDIUM: 'متوسط', HIGH: 'مرتفع' })[a.ergoLevel] : '—');
      }
    }

    // ---------- face enrolment ----------
    function enrollDialog() {
      var target = LAB.profileId || S.meta.presenterId;
      var consent = h('input', { type: 'checkbox' });
      var info = h('div', { class: 'muted', style: { fontSize: '12.5px' }, text: 'يلتقط النظام 3 صور للوجه ويحوّلها إلى بصمة رقمية (128 رقمًا) تُحفظ على هذا الجهاز فقط ولا تُرسل لأي خادم.' });
      var prog = h('div', { class: 'mono', style: { fontSize: '12px' }, text: '' });
      var profSel = h('select', { class: 'select' });
      API.get('workers', { limit: 40 }).then(function (r) { r.items.forEach(function (w) { var o = h('option', { value: w.id, text: w.name + ' · ' + w.id }); if (w.id === target) o.selected = true; profSel.appendChild(o); }); });
      var go = h('button', { class: 'btn btn--primary', text: 'التقاط وتسجيل' });
      go.addEventListener('click', function () {
        if (!consent.checked) { prog.textContent = 'يلزم تأكيد الموافقة أولًا.'; return; }
        if (st.srcKind !== 'camera') { prog.textContent = 'شغّل الكاميرا أولًا ثم أعد المحاولة.'; return; }
        go.disabled = true;
        ensureFace().then(function () {
          var samples = [], n = 0;
          function one() {
            prog.textContent = 'التقاط ' + (n + 1) + ' / 3 — انظر للكاميرا' + (n === 1 ? ' وأمِل رأسك قليلًا' : '');
            return faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.5 })).withFaceLandmarks(true).withFaceDescriptor().then(function (r) {
              if (r) { samples.push(Array.from(r.descriptor)); n++; }
              if (n < 3) return new Promise(function (res) { setTimeout(res, 700); }).then(one);
            });
          }
          var tries = 0;
          function guarded() { tries++; return one().then(function () { if (n < 3 && tries < 10) return guarded(); }); }
          return guarded().then(function () {
            if (samples.length < 2) throw new Error('لم يتم العثور على وجه واضح');
            var db = faceDB(); db[profSel.value] = (db[profSel.value] || []).concat(samples).slice(-8); saveFaceDB(db); matcherKey = '';
            // profile photo = face crop
            var fb = null;
            return faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 })).then(function (det) {
              if (det) { var b = det.box, c = document.createElement('canvas'), pad = b.width * 0.35; c.width = c.height = 256; c.getContext('2d').drawImage(video, Math.max(0, b.x - pad), Math.max(0, b.y - pad * 1.2), b.width + pad * 2, b.height + pad * 2.2, 0, 0, 256, 256); fb = c.toDataURL('image/jpeg', 0.85); }
              return API.post('workers', { id: profSel.value, enrolled: true, photo: fb || undefined });
            }).then(function (w) {
              delete workerCache[profSel.value];
              LAB.profileId = profSel.value; LAB.idMode = 'auto'; saveLab();
              U.closeModal(); U.toast('تم تسجيل بصمة الوجه', w.name + ' — سيتعرف النظام عليه تلقائيًا الآن'); renderSide();
            });
          });
        }).catch(function (e) { prog.textContent = 'تعذر التسجيل: ' + e.message; go.disabled = false; });
      });
      U.openModal('تسجيل بصمة وجه لعامل', h('div', { style: { display: 'grid', gap: '12px' } }, h('label', { class: 'field' }, h('span', { text: 'ملف العامل' }), profSel), info, h('label', { class: 'switch' }, consent, 'أوافق على تسجيل بصمة الوجه لأغراض السلامة (موافقة صريحة)'), h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, go, h('button', { class: 'btn btn--ghost', text: 'حذف كل البصمات', onclick: function () { saveFaceDB({}); matcherKey = ''; prog.textContent = 'تم حذف كل البصمات من هذا الجهاز.'; renderSide(); } })), prog));
    }

    // preload models in the background so the first start is instant
    setTimeout(function () { if (!st.destroyed) prepareModels(); }, 300);
  });

  /* ------------------------------------------------------------------ */
  /* Egyptian ANPR                                                        */
  /* ------------------------------------------------------------------ */
  var ANPR = { lane: 'AUTO', precise: false, engine: 'browser' };
  try { Object.assign(ANPR, JSON.parse(localStorage.getItem('egic-anpr2') || '{}')); } catch (e) { }
  function saveAnpr() { try { localStorage.setItem('egic-anpr2', JSON.stringify(ANPR)); } catch (e) { } }

  U.register('anpr', function (v) {
    var st = { running: false, stream: null, src: null, srcKind: null, busy: false, voter: null, last: null, lastPlateBox: null, logged: {}, destroyed: false, fps: 0, ms: 0 };
    U.onCleanup(function () { st.destroyed = true; st.running = false; stopStream(st.stream); if (st.url) URL.revokeObjectURL(st.url); });
    v.appendChild(U.viewHead('قارئ اللوحات المصرية — مباشر', 'نموذج كشف اللوحة + نموذجا قراءة الحروف العربية والأرقام · كل قراءة تُسجل في سجل البوابة وتحدد القرار ومدة البقاء', [h('span', { class: 'badge badge--live', text: 'REAL ANPR · EGYPTIAN PLATES' })]));
    if (fileProtocolNotice(v)) return;
    var g = h('div', { class: 'lab' }); v.appendChild(g);
    var canvas = h('canvas', { width: 1280, height: 720 }), video = h('video', { playsinline: true, muted: true, autoplay: true, style: { position: 'absolute', width: '1px', height: '1px', opacity: 0 } }), img = h('img', { alt: '', style: { display: 'none' } });
    var phoneImg = h('img', { alt: '', style: { position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' } });
    var hudL = h('div', { class: 'l' }), hudR = h('div', { class: 'r' });
    var loading = h('div', { class: 'lab-loading hidden' }, h('div', { class: 'box' }, h('div', { class: 'spinner' }), h('div', { style: { marginTop: '14px', fontWeight: 600 }, class: 'ldT', text: 'تحميل النماذج…' }), h('div', { class: 'bar' }, h('i', { class: 'ldBar' })), h('div', { class: 'muted mono ldS', style: { fontSize: '11px' } })));
    var empty = h('div', { class: 'lab-empty' }, h('div', null, h('div', { style: { width: '64px', height: '64px', margin: '0 auto', borderRadius: '18px', display: 'grid', placeItems: 'center', background: 'rgba(247,146,36,.14)', color: 'var(--orange-hi)' } }, U.icon('anpr')), h('h3', { text: 'اختر مصدرًا للقراءة' }), h('p', { text: 'صور نموذجية لسيارات مصرية، أو ارفع صورة/فيديو من بوابة المصنع، أو وجّه الكاميرا نحو لوحة سيارة.' })));
    var stage = h('div', { class: 'anpr-stage' }, canvas, video, img, phoneImg, h('div', { class: 'lab-hud' }, hudL, hudR), h('div', { class: 'lab-brand' }, h('div', { class: 'powered' }, h('span', { class: 'dot' }), 'POWERED BY ', h('b', { text: 'DELMON' }), h('span', { class: 'amp', text: '&' }), h('b', { text: 'DEV SMART X' }))), empty, loading);
    var left = h('div', null, stage);
    var samples = h('div', { class: 'samples' });
    for (var i = 1; i <= 7; i++) (function (n) { samples.appendChild(h('button', { type: 'button', title: 'صورة نموذجية ' + n, onclick: function () { startUrl('assets/samples/anpr/eg-car-0' + n + '.jpg', 'image'); } }, h('img', { src: 'assets/samples/anpr/eg-car-0' + n + '.jpg', alt: 'سيارة مصرية ' + n, loading: 'lazy' }))); })(i);
    samples.appendChild(h('button', { type: 'button', title: 'مقطع فيديو', onclick: function () { startUrl('assets/samples/anpr/eg-gate-clip.mp4', 'video'); }, style: { display: 'grid', placeItems: 'center', color: '#fff', fontSize: '11px', background: 'linear-gradient(135deg,#123,#0a1a12)' } }, '▶ فيديو'));
    left.appendChild(h('div', { style: { marginTop: '12px' } }, h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '6px' }, text: 'صور نموذجية لسيارات مصرية (للتجربة):' }), samples));
    var preciseLbl = h('label', { class: 'switch', title: 'نموذج قراءة ثانٍ أكبر — أدق لكنه أبطأ ويحتاج كارت شاشة أقوى' }, h('input', { type: 'checkbox', checked: ANPR.precise, onchange: function (e) { ANPR.precise = e.target.checked; saveAnpr(); prepare(); } }), 'قراءة دقيقة (نموذجان)');
    // the precise OCR model ships as an optional pack — hide the switch when it is not installed
    fetch('assets/models/ocr_eg_s/model.onnx', { method: 'HEAD', cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; }).catch(function () { preciseLbl.style.display = 'none'; if (ANPR.precise) { ANPR.precise = false; saveAnpr(); } });
    left.appendChild(h('div', { class: 'lab-controls' },
      h('button', { class: 'btn btn--accent', onclick: startCamera }, U.icon('play'), 'تشغيل الكاميرا'),
      h('button', { class: 'btn', onclick: function () { pairPhone(startPhone); } }, '📱 كاميرا الموبايل'),
      h('button', { class: 'btn', onclick: stop }, U.icon('stop'), 'إيقاف'),
      h('label', { class: 'btn' }, U.icon('upload'), 'صورة / فيديو', h('input', { type: 'file', accept: 'image/*,video/*', style: { display: 'none' }, onchange: function (e) { var f = e.target.files[0]; if (f) startUrl(URL.createObjectURL(f), /^video/.test(f.type) ? 'video' : 'image', true); } })),
      h('span', { class: 'muted', style: { fontSize: '12px' }, text: 'الاتجاه:' }), U.seg([['AUTO', 'تلقائي'], ['IN', 'دخول'], ['OUT', 'خروج']], ANPR.lane, function (x) { ANPR.lane = x; saveAnpr(); }),
      U.select([['browser', 'القراءة: داخل الجهاز'], ['server', 'القراءة: خادم EGIC AI (أدق)']], ANPR.engine, function (x) { ANPR.engine = x; saveAnpr(); prepKey = ''; prepare(); chips(); }),
      preciseLbl));
    var side = h('div', { class: 'lab-side' }); g.appendChild(left); g.appendChild(side);
    var readCard = U.card('القراءة الحالية', { icon: 'anpr' });
    var readBox = h('div', { class: 'anpr-read' }, h('div', { class: 'muted', text: 'لا توجد قراءة بعد' }));
    readCard.body.appendChild(readBox); side.appendChild(readCard);
    var logCard = U.card('سجل هذه الجلسة', { icon: 'gates', actions: [h('a', { class: 'btn btn--xs', href: '#/gates', text: 'سجل البوابات' })] });
    var logBox = h('div', { style: { display: 'grid', gap: '8px', maxHeight: '380px', overflow: 'auto' } }, h('div', { class: 'muted', style: { fontSize: '12px' }, text: 'كل قراءة مؤكدة تُرسل للخلفية وتظهر في لوحة البوابات.' }));
    logCard.body.appendChild(logBox); side.appendChild(logCard);
    var mCard = U.card('النماذج', { icon: 'api' }); var mChips = h('div', { class: 'modelbar' }); mCard.body.appendChild(mChips); side.appendChild(mCard);
    function chips() { clear(mChips); if (ANPR.engine === 'server') { mChips.appendChild(h('span', { class: 'chip' }, 'المحرك ', h('b', { text: srvOk ? 'خادم EGIC AI · YOLO11n + OCR ensemble' : 'خادم EGIC AI · غير متصل' }))); return; } [['كشف اللوحة', 'YOLO11n', 'plate'], ['قراءة الحروف', 'YOLO11s · مُدرَّب EGIC', 'ocr'], ['قراءة دقيقة', '+ YOLOv8s · 38 فئة', 'ocrPro']].forEach(function (m) { if (m[2] === 'ocrPro' && !ANPR.precise) return; mChips.appendChild(h('span', { class: 'chip' }, m[0] + ' ', h('b', { text: AI && AI.loaded(m[2]) ? m[1] : 'غير محمّل' }))); }); mChips.appendChild(h('span', { class: 'chip' }, 'الحروف ', h('b', { text: 'أ ب ج د ر س ص ط ع ف ق ل م ن هـ و ى' }))); }
    chips();

    function setLoading(on, t, p, s) { loading.classList.toggle('hidden', !on); if (t) loading.querySelector('.ldT').textContent = t; if (p != null) loading.querySelector('.ldBar').style.width = Math.round(p * 100) + '%'; if (s != null) loading.querySelector('.ldS').textContent = s; }
    var prepP = null, prepKey = '', srvOk = false;
    function prepare() {
      var key = ANPR.engine === 'server' ? 's' : ANPR.precise ? 'p' : 'f';
      if (prepP && prepKey === key) return prepP;
      prepKey = key;
      if (ANPR.engine === 'server') {
        setLoading(true, 'الاتصال بخادم EGIC AI…', 0.3, TITAN_URL);
        prepP = titanHealth().then(function () { return ensureCore(); }).then(function () { srvOk = true; setLoading(false); chips(); }, function () {
          srvOk = false; ANPR.engine = 'browser'; saveAnpr(); prepKey = '';
          U.toast('خادم EGIC AI غير متاح', TITAN_URL + ' — تم التحويل للقراءة داخل الجهاز.', { kind: 'critical', ms: 8000 });
          prepP = null; return prepare();
        });
        return prepP;
      }
      var need = ['plate', 'ocr'].concat(ANPR.precise ? ['ocrPro'] : []);
      var k = 0;
      setLoading(true, 'تحميل نماذج قراءة اللوحات…', 0.05, '');
      prepP = need.reduce(function (p, name) { return p.then(function () { setLoading(true, 'تحميل ' + AI_LABEL(name) + '…', 0.1 + 0.85 * k / need.length); return ensureModel(name, function (f) { setLoading(true, null, 0.1 + 0.85 * (k + f) / need.length); }).then(function () { k++; }); }); }, ensureCore()).then(function () { setLoading(false); chips(); if (st.srcKind) st.running = true; }).catch(function (e) { setLoading(true, 'تعذر تحميل النماذج', 1, e.message); prepP = null; });
      return prepP;
    }
    function AI_LABEL(n) { return n === 'plate' ? 'كاشف اللوحات' : n === 'ocr' ? 'قارئ الحروف (سريع)' : 'قارئ الحروف (دقيق)'; }

    function startUrl(url, kind, own) {
      stopSources(); empty.classList.add('hidden'); prepare();
      st.gen = (st.gen || 0) + 1; // results of a read still running on the previous image are discarded
      if (own) st.url = url;
      st.voter = null; st.lastRead = null; st.lastPlateBox = null;
      clear(readBox).appendChild(h('div', { class: 'muted', text: 'جارٍ القراءة…' }));
      if (kind === 'video') { video.srcObject = null; video.src = url; video.loop = true; video.play().then(function () { st.src = video; st.srcKind = 'video'; st.running = true; loop(); }); }
      else { img.onload = function () { st.src = img; st.srcKind = 'image'; st.running = true; st.imageDone = false; loop(); }; img.src = url; }
    }
    function startPhone(mjpegUrl, sid) {
      stopSources(); empty.classList.add('hidden'); prepare();
      st.gen = (st.gen || 0) + 1; st.voter = null; st.lastRead = null; st.srcKind = 'phone';
      clear(readBox).appendChild(h('div', { class: 'muted', text: 'وجّه كاميرا الموبايل على اللوحة وثبّتها ثانية…' }));
      phoneSource(phoneImg, mjpegUrl, sid, st, function () { U.toast('انقطع اتصال كاميرا الموبايل', 'تأكد أن صفحة الكاميرا مفتوحة على الموبايل', { kind: 'critical', ms: 7000 }); })
        .then(function () { if (st.srcKind !== 'phone') return; st.src = phoneFrame(st, phoneImg); st.running = true; loop(); })
        .catch(function (e) { st.srcKind = null; empty.classList.remove('hidden'); U.toast('تعذر استقبال صورة الموبايل', e.message, { kind: 'critical' }); });
    }
    function startCamera() {
      stopSources(); empty.classList.add('hidden'); prepare();
      st.gen = (st.gen || 0) + 1;
      openCam().then(function (s) { if (st.destroyed) { stopStream(s); return; } st.stream = s; video.srcObject = s; return video.play().then(function () { st.src = video; st.srcKind = 'camera'; st.running = true; loop(); }); }).catch(function (e) { empty.classList.remove('hidden'); U.toast('تعذر فتح الكاميرا', camErrMsg(e), { kind: 'critical', ms: 9000 }); });
    }
    function stopSources() { if (st.srcKind === 'phone') { phoneImg.removeAttribute('src'); clearInterval(st.phoneWatch); } st.running = false; stopStream(st.stream); st.stream = null; try { video.pause(); } catch (e) { } video.removeAttribute('src'); video.srcObject = null; if (st.url) { URL.revokeObjectURL(st.url); st.url = null; } st.srcKind = null; st.lastPlateBox = null; }
    function stop() { stopSources(); empty.classList.remove('hidden'); }

    function loop() {
      if (!st.running || st.destroyed) return;
      if (st.srcKind === 'phone') st.src = phoneFrame(st, phoneImg) || st.src;
      var s = st.src, W = s.videoWidth || s.naturalWidth || s.width, H = s.videoHeight || s.naturalHeight || s.height;
      if (W && H) {
        if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
        var g2 = canvas.getContext('2d'); g2.drawImage(s, 0, 0, W, H);
        if (!st.busy && prepP && ((ANPR.engine === 'server' && srvOk) || (AI && AI.loaded('plate') && AI.loaded('ocr'))) && !(st.srcKind === 'image' && st.imageDone)) { st.busy = true; read(W, H).then(function () { st.busy = false; }, function (e) { console.error(e); st.busy = false; }); }
        overlay(g2, W, H);
      }
      requestAnimationFrame(loop);
    }
    // server engine: one JPEG → /anpr/read → same reading format as the in-browser assembler
    var grabA = null;
    function readServer(W, H) {
      var t0 = performance.now(), gen = st.gen;
      var sw = Math.min(1600, W), sc = sw / W, sh = Math.round(H * sc);
      grabA = grabA || document.createElement('canvas');
      if (grabA.width !== sw || grabA.height !== sh) { grabA.width = sw; grabA.height = sh; }
      grabA.getContext('2d').drawImage(st.src, 0, 0, sw, sh);
      return new Promise(function (res) { grabA.toBlob(res, 'image/jpeg', 0.9); }).then(function (blob) {
        return fetch(TITAN_URL + '/anpr/read', { method: 'POST', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
      }).then(function (r) { if (!r.ok) throw new Error('AI HTTP ' + r.status); return r.json(); }).then(function (j) {
        if (gen !== st.gen) return;
        var best = (j.plates || []).filter(function (x) { return x.reading; })[0] || (j.plates || [])[0];
        if (!best) { st.lastPlateBox = null; if (st.srcKind === 'image') { st.imageDone = true; showNoPlate(); } return; }
        var b = best.box, p = { x1: b[0] / sc, y1: b[1] / sc, x2: b[2] / sc, y2: b[3] / sc, score: best.score }, pw = p.x2 - p.x1, ph = p.y2 - p.y1;
        var crop = { x1: Math.max(0, p.x1 - pw * 0.04), y1: Math.max(0, p.y1 - ph * 0.08), x2: Math.min(W, p.x2 + pw * 0.04), y2: Math.min(H, p.y2 + ph * 0.08) };
        st.lastPlateBox = p;
        var r = best.reading;
        st.ms = Math.round(performance.now() - t0); st.lastRead = r;
        if (!r) { if (st.srcKind === 'image') { st.imageDone = true; showNoPlate(); } return; }
        if (st.srcKind === 'image') { st.imageDone = true; if (r.valid) commit(r, p, crop, W, H); else showReading(r, null, crop); return; }
        st.voter = st.voter || new AI.PlateVoter(3000);
        var vote = st.voter.add(r, Date.now());
        showReading(vote ? vote.reading : r, null, crop, vote);
        if (vote && vote.stable) commit(vote.reading, p, crop, W, H);
      });
    }
    function read(W, H) {
      if (ANPR.engine === 'server') return readServer(W, H);
      var t0 = performance.now(), gen = st.gen;
      return AI.run('plate', st.src, { conf: 0.25, maxDet: 3 }).then(function (plates) {
        if (gen !== st.gen) return null;
        if (!plates.length && st.srcKind === 'image') return AI.run('plate', st.src, { conf: 0.25, maxDet: 3, shrink: 0.72 });
        return plates;
      }).then(function (plates) {
        if (!plates || gen !== st.gen) return;
        if (!plates.length) { st.lastPlateBox = null; if (st.srcKind === 'image') { st.imageDone = true; showNoPlate(); } return; }
        var p = plates[0], pw = p.x2 - p.x1, ph = p.y2 - p.y1;
        var crop = { x1: Math.max(0, p.x1 - pw * 0.04), y1: Math.max(0, p.y1 - ph * 0.08), x2: Math.min(W, p.x2 + pw * 0.04), y2: Math.min(H, p.y2 + ph * 0.08) };
        st.lastPlateBox = p;
        var jobs = [AI.run('ocr', st.src, { conf: 0.2, crop: crop, iou: 0.5, classAware: false })];
        if (ANPR.precise && AI.loaded('ocrPro')) jobs.push(AI.run('ocrPro', st.src, { conf: 0.2, crop: crop, iou: 0.5, classAware: false }));
        return Promise.all(jobs).then(function (lists) {
          if (gen !== st.gen) return;
          var r = AI.assemblePlate(lists, lists.length > 1 ? [2, 1] : null);
          st.ms = Math.round(performance.now() - t0);
          st.lastRead = r;
          if (!r) { if (st.srcKind === 'image') { st.imageDone = true; showNoPlate(); } return; }
          if (st.srcKind === 'image') { st.imageDone = true; if (r.valid) commit(r, p, crop, W, H); else showReading(r, null, crop); return; }
          st.voter = st.voter || new AI.PlateVoter(3000);
          var vote = st.voter.add(r, Date.now());
          showReading(vote ? vote.reading : r, null, crop, vote);
          if (vote && vote.stable) commit(vote.reading, p, crop, W, H);
        });
      });
    }
    function showNoPlate() { clear(readBox).appendChild(h('div', { class: 'muted', text: 'لم يتم العثور على لوحة واضحة في هذه الصورة.' })); }
    function plateCrop(crop) { var c = document.createElement('canvas'); var w = crop.x2 - crop.x1, hh = crop.y2 - crop.y1, sc = Math.min(1, 480 / w); c.width = Math.round(w * sc); c.height = Math.round(hh * sc); c.getContext('2d').drawImage(st.src, crop.x1, crop.y1, w, hh, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.9); }
    function showReading(r, rec, crop, vote) {
      clear(readBox);
      readBox.appendChild(h('img', { src: plateCrop(crop), alt: 'اللوحة', style: { maxWidth: '100%', borderRadius: '8px', border: '1px solid var(--line-2)' } }));
      readBox.appendChild(SC.plateEl(r.text, { size: 'lg' }));
      readBox.appendChild(h('div', { class: 'mono muted', style: { fontSize: '11.5px' }, text: 'ثقة ' + Math.round(r.conf * 100) + '% · ' + st.ms + ' ms' + (vote ? ' · تصويت ' + vote.votes + '/' + vote.total : '') + (r.valid ? '' : ' · قراءة غير مكتملة') }));
      if (rec) {
        readBox.appendChild(h('div', { class: 'decision ' + rec.decision, text: U.AR_DEC[rec.decision] + ' · ' + (rec.lane === 'IN' ? 'دخول' : 'خروج') }));
        readBox.appendChild(h('dl', { class: 'kv', style: { width: '100%', textAlign: 'start' } }, h('dt', { text: 'المركبة' }), h('dd', { text: rec.vehicleType }), h('dt', { text: 'الجهة' }), h('dd', { text: rec.owner }), h('dt', { text: 'الإجراء' }), h('dd', { text: rec.action }), rec.dwellMin != null ? h('dt', { text: 'مدة البقاء' }) : null, rec.dwellMin != null ? h('dd', { class: 'mono', text: rec.dwellMin + ' دقيقة' }) : null, h('dt', { text: 'البوابة' }), h('dd', { text: U.siteName(rec.siteId) + ' · ' + rec.gateName })));
        readBox.appendChild(h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' } },
          rec.decision !== 'AUTHORIZED' ? h('button', { class: 'btn btn--sm btn--primary', text: 'إضافة للمصرّح بها', onclick: function () { API.post('vehicles', { plate: r.text, status: 'authorized', owner: 'مصرّح من شاشة البوابة', category: 'fleet', type: 'ملاكي' }).then(function () { U.toast('تمت إضافة المركبة', r.text); st.logged = {}; }); } }) : null,
          rec.decision !== 'BLACKLISTED' ? h('button', { class: 'btn btn--sm btn--danger', text: 'حظر (قائمة سوداء)', onclick: function () { API.post('vehicles', { plate: r.text, status: 'blacklisted', owner: 'محظور من شاشة البوابة', category: 'blacklist', type: 'ملاكي' }).then(function () { U.toast('تم حظر المركبة', r.text, { kind: 'critical' }); st.logged = {}; }); } }) : null,
          h('button', { class: 'btn btn--sm', text: 'إعادة القراءة', onclick: function () { st.logged = {}; st.imageDone = false; st.voter = null; } })));
      }
    }
    function commit(r, p, crop, W, H) {
      var key = r.text;
      if (st.logged[key] && Date.now() - st.logged[key] < (st.srcKind === 'image' ? 3000 : 60000)) return;
      st.logged[key] = Date.now();
      var snapC = document.createElement('canvas'), sw = Math.min(1280, W), sc = sw / W; snapC.width = sw; snapC.height = Math.round(H * sc);
      var g3 = snapC.getContext('2d'); g3.drawImage(st.src, 0, 0, snapC.width, snapC.height);
      g3.strokeStyle = COL.orange; g3.lineWidth = 4; g3.strokeRect(p.x1 * sc, p.y1 * sc, (p.x2 - p.x1) * sc, (p.y2 - p.y1) * sc);
      watermark(g3, snapC.width, snapC.height, 'EGIC · البوابة الرئيسية — المصنع 01 · ' + r.text + ' · ' + nowStr());
      var snap = snapC.toDataURL('image/jpeg', 0.82);
      API.post('gate/log', { plate: r.text, conf: r.conf, cameraId: 'P01-ANPR-LIVE', lane: ANPR.lane, source: 'live-anpr', image: snap, plateImage: plateCrop(crop) }).then(function (rec) {
        showReading(r, rec, crop);
        if (logBox.firstChild && logBox.firstChild.classList && logBox.firstChild.classList.contains('muted')) clear(logBox);
        logBox.insertBefore(h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '10px', alignItems: 'center', padding: '8px', borderRadius: '10px', background: 'var(--bg-3)', border: '1px solid var(--line-1)' } }, SC.plateEl(rec.plate, { size: 'sm' }), h('div', null, U.decBadge(rec.decision), h('div', { class: 'muted', style: { fontSize: '11px', marginTop: '4px' }, text: (rec.lane === 'IN' ? 'دخول' : 'خروج') + (rec.dwellMin != null ? ' · بقاء ' + rec.dwellMin + ' د' : '') })), h('span', { class: 'mono muted', style: { fontSize: '11px' }, text: U.fTime(rec.ts) })), logBox.firstChild);
        U.toast('قراءة لوحة: ' + rec.plate, U.AR_DEC[rec.decision] + ' · ' + (rec.lane === 'IN' ? 'دخول' : 'خروج') + ' · ' + rec.gateName, { kind: rec.decision === 'BLACKLISTED' || rec.decision === 'UNAUTHORIZED' ? 'critical' : 'live', img: snap });
      });
    }
    function overlay(g4, W, H) {
      var p = st.lastPlateBox;
      if (p) {
        var lw = Math.max(3, W / 300);
        g4.strokeStyle = COL.orange; g4.lineWidth = lw; g4.strokeRect(p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1);
        var t = st.lastRead && st.lastRead.valid ? st.lastRead.text : 'PLATE ' + p.score.toFixed(2);
        label(g4, p.x1, p.y1 - 4, t, 'rgba(150,70,0,.95)', Math.max(16, Math.round(W / 40)));
      }
      clear(hudL); clear(hudR);
      hudL.appendChild(h('span', { class: 'hud-chip rec', text: st.srcKind === 'camera' ? 'LIVE · P01-ANPR-LIVE' : st.srcKind === 'phone' ? 'LIVE · 📱 MOBILE CAM' + (st.phoneFps ? ' · ' + st.phoneFps + ' FPS' : '') : st.srcKind === 'video' ? 'VIDEO · GATE' : 'IMAGE' }));
      hudL.appendChild(h('span', { class: 'hud-chip', text: 'البوابة الرئيسية · المصنع 01' }));
      hudR.appendChild(h('span', { class: 'hud-chip', text: st.ms + ' ms / قراءة' }));
    }
    setTimeout(function () { if (!st.destroyed) prepare(); }, 300);
  });
})();
