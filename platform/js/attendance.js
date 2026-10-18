/*!
 * EGIC · Attendance — face recognition check-in / check-out
 *   • any camera (this device · phone via QR · IP / NVR through the server) recognises enrolled employees
 *   • first sighting of the shift-day = check-in, last sighting = check-out (late / early / absent from the shift times)
 * POWERED BY DELMON & DEV SMART X
 */
(function () {
  'use strict';
  var U = window.EGICUI, API = window.EGICClient;
  var h = U.h, clear = U.clear, card = U.card, stat = U.stat, table = U.table, num = U.num, S = U.S;
  var DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

  U.register('attendance', function (v) {
    var L = window.EGICLive;
    var today = U.fDate(Date.now()), q = { day: today, term: '', status: 'ALL' };
    var dayIn = h('input', { class: 'input', type: 'date', value: today, max: today, style: { height: '34px' } });
    dayIn.addEventListener('change', function () { q.day = dayIn.value || today; load(); });
    v.appendChild(U.viewHead('الحضور والانصراف', 'بالتعرف على الوجه من أي كاميرا · أول ظهور في الوردية = حضور، وآخر ظهور = انصراف', [
      dayIn,
      h('button', { class: 'btn btn--sm', onclick: function () { U.exportAttendance(q.day, q.day, { site: S.site }, 'EGIC-attendance_' + q.day + '.csv'); } }, U.icon('download'), 'Excel اليوم'),
      h('button', { class: 'btn btn--sm', onclick: monthExport }, U.icon('download'), 'Excel الشهر'),
      h('button', { class: 'btn btn--sm', onclick: settingsDialog }, U.icon('rules'), 'الورديات والمواعيد'),
      h('button', { class: 'btn btn--sm btn--accent', onclick: function () { U.editProfile(null, function (w) { U.navigate('#/workers/' + w.id); }); } }, U.icon('userplus'), 'إضافة موظف')]));
    var ks = h('div', { class: 'grid g-4' }); v.appendChild(ks);
    var g = h('div', { class: 'grid g-main' }); v.appendChild(g);

    /* ---------------- daily table ---------------- */
    var listCard = card('سجل اليوم', { flush: true });
    var qIn = h('input', { class: 'input', type: 'search', placeholder: 'اسم أو كود…', style: { height: '30px', width: '160px' } });
    qIn.addEventListener('input', U.debounce(function () { q.term = qIn.value.trim().toLowerCase(); render(); }, 200));
    var stSel = U.select([['ALL', 'الكل'], ['PRESENT', 'حاضر'], ['IN', 'في العمل الآن'], ['LATE', 'متأخر'], ['EARLY', 'انصراف مبكر'], ['ABSENT', 'غائب']], 'ALL', function (x) { q.status = x; render(); });
    stSel.style.height = '30px';
    listCard.head.querySelector('.card-actions').appendChild(qIn); listCard.head.querySelector('.card-actions').appendChild(stSel);
    g.appendChild(listCard);
    var data = null;
    function camLabel(id) { return id ? (S.cams && S.cams[id] ? S.cams[id].name : id === 'ATT-LOCAL' ? 'كاميرا الحضور (الجهاز)' : id) : '—'; }
    function thumb(src, title) { return src ? h('img', { class: 'thumb', src: API.evidenceUrl(src), alt: '', style: { width: '40px', height: '40px', objectFit: 'cover', borderRadius: '8px', cursor: 'zoom-in' }, onclick: function (e) { e.stopPropagation(); U.imageModal(API.evidenceUrl(src), title); } }) : null; }
    function render() {
      if (!data) return;
      var items = data.items.filter(function (o) {
        if (q.term && (o.workerId + ' ' + o.workerName + ' ' + o.dept).toLowerCase().indexOf(q.term) < 0) return false;
        if (q.status === 'PRESENT') return !!o.firstTs;
        if (q.status === 'IN') return o.status === 'IN';
        if (q.status === 'LATE') return o.late;
        if (q.status === 'EARLY') return o.early;
        if (q.status === 'ABSENT') return o.status === 'ABSENT';
        return true;
      });
      clear(listCard.body);
      listCard.body.appendChild(table([
        { t: 'الموظف', f: function (o) { return h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center' } }, h('span', { style: { width: '34px', height: '34px', borderRadius: '9px', background: 'var(--bg-4)', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '11px', overflow: 'hidden', flex: 'none' } }, o.photo ? h('img', { src: API.evidenceUrl(o.photo), alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }) : U.initials(o.workerName)), h('div', null, h('div', { class: 'strong', text: o.workerName }), h('div', { class: 'mono muted', style: { fontSize: '11px' }, text: o.workerId + ' · ' + o.dept }))); } },
        { t: 'الوردية', f: function (o) { return h('div', null, h('div', { text: U.shiftName(o.shift) }), h('div', { class: 'mono muted', dir: 'ltr', style: { fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'right' }, text: U.fHM(o.start) + '–' + U.fHM(o.end) })); } },
        { t: 'الحضور', f: function (o) { return o.firstTs ? h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, thumb(o.inImg, o.workerName + ' · حضور ' + U.fHM(o.firstTs)), h('span', { class: 'mono strong', text: U.fHM(o.firstTs) })) : h('span', { class: 'muted', text: '—' }); } },
        { t: 'الانصراف', f: function (o) { return o.status === 'OUT' && !o.missingOut ? h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, thumb(o.outImg, o.workerName + ' · انصراف ' + U.fHM(o.lastTs)), h('span', { class: 'mono strong', text: U.fHM(o.lastTs) })) : o.status === 'IN' ? h('span', { class: 'muted', style: { fontSize: '12px' }, text: 'آخر ظهور ' + U.fHM(o.lastTs) }) : h('span', { class: 'muted', text: '—' }); } },
        { t: 'المدة', f: function (o) { return o.firstTs ? h('span', { class: 'mono', text: U.hm(o.workedMin) }) : ''; } },
        { t: 'الحالة', f: U.attBadges },
        { t: 'الكاميرا', f: function (o) { return h('span', { class: 'muted', style: { fontSize: '11.5px' }, text: camLabel(o.firstCam) }); } }
      ], items, { onRow: function (o) { U.navigate('#/workers/' + o.workerId); }, maxH: '640px', empty: data.items.length ? 'لا توجد نتائج' : 'لا يوجد موظفون — أضف الموظفين وسجّل وجوههم أولًا' }));
    }
    function load() {
      API.get('attendance', { day: q.day, site: S.site }).then(function (a) {
        data = a; var t = a.totals;
        clear(ks);
        [['حاضر', num(t.present, 0) + ' / ' + num(t.employees - t.off, 0), t.inNow + ' في العمل الآن', 'check'], ['متأخر', num(t.late, 0), 'بعد مهلة ' + a.settings.graceMin + ' دقيقة', 'clock', t.late > 0], ['غائب', num(t.absent, 0), t.pending ? t.pending + ' لم تبدأ ورديتهم بعد' : 'بدون أي ظهور اليوم', 'alert', t.absent > 0], ['انصراف مبكر', num(t.early, 0), t.off ? t.off + ' في إجازة أسبوعية' : 'قبل نهاية الوردية', 'workers']].forEach(function (k) { var c = card(null); c.body.style.padding = '0'; c.body.appendChild(stat(k[0], k[1], k[2], { icon: k[3], critical: k[4] })); ks.appendChild(c); });
        listCard.head.querySelector('.card-t').lastChild.textContent = q.day === today ? 'سجل اليوم · ' + q.day : 'سجل يوم ' + q.day + ' (' + DAYS[new Date(q.day + 'T12:00:00Z').getUTCDay()] + ')';
        render();
      });
    }
    load();
    var reloadT = null;
    function soon() { clearTimeout(reloadT); reloadT = setTimeout(load, 400); }
    U.sub('attendance', soon); U.sub('worker', soon); U.sub('faces', soon);
    U.every(60000, function () { var t = U.fDate(Date.now()); if (t !== today) { today = t; dayIn.max = t; } load(); });

    function monthExport() {
      var cur = U.monthRange(0), prev = U.monthRange(1);
      var from = h('input', { class: 'input', type: 'date', value: cur.from, max: today }), to = h('input', { class: 'input', type: 'date', value: cur.to, max: today });
      U.openModal('تصدير الحضور إلى Excel', h('div', { style: { display: 'grid', gap: '12px' } },
        h('div', { style: { display: 'flex', gap: '6px' } }, h('button', { class: 'btn btn--xs', text: 'الشهر الحالي', onclick: function () { from.value = cur.from; to.value = cur.to; } }), h('button', { class: 'btn btn--xs', text: 'الشهر الماضي', onclick: function () { from.value = prev.from; to.value = prev.to; } })),
        h('div', { class: 'grid g-2', style: { gap: '10px' } }, h('label', { class: 'field' }, h('span', { text: 'من' }), from), h('label', { class: 'field' }, h('span', { text: 'إلى' }), to)),
        h('div', { class: 'muted', style: { fontSize: '12px' }, text: 'ملف CSV بالعربي يفتح مباشرة في Excel: سطر لكل موظف في كل يوم (حضور · انصراف · مدة · تأخير · غياب). أقصى مدة 92 يوم.' }),
        h('button', { class: 'btn btn--primary', text: 'تصدير', onclick: function () { if (!from.value || !to.value || from.value > to.value) return; U.closeModal(); U.exportAttendance(from.value, to.value, { site: S.site }, 'EGIC-attendance_' + from.value + '_' + to.value + '.csv'); } })));
    }

    /* ---------------- shift settings ---------------- */
    function settingsDialog() {
      API.get('attendance/settings').then(function (A) {
        var rows = Object.keys(A.shifts).map(function (k) {
          var sh = A.shifts[k];
          return { k: k, name: h('input', { class: 'input', value: sh.name }), start: h('input', { class: 'input mono', type: 'time', value: sh.start.length === 4 ? '0' + sh.start : sh.start }), end: h('input', { class: 'input mono', type: 'time', value: sh.end.length === 4 ? '0' + sh.end : sh.end }) };
        });
        var grace = h('input', { class: 'input mono', type: 'number', min: 0, max: 180, value: A.graceMin, style: { width: '90px' } });
        var early = h('input', { class: 'input mono', type: 'number', min: 0, max: 180, value: A.earlyMin, style: { width: '90px' } });
        var wk = DAYS.map(function (d, i) { return h('label', { class: 'switch' }, h('input', { type: 'checkbox', value: i, checked: A.weekend.indexOf(i) >= 0 }), d); });
        U.openModal('الورديات ومواعيد الحضور', h('div', { style: { display: 'grid', gap: '14px' } },
          h('div', { style: { display: 'grid', gap: '8px' } }, rows.map(function (r) { return h('div', { style: { display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: '8px', alignItems: 'end' } }, h('label', { class: 'field' }, h('span', { text: 'اسم الوردية (' + r.k + ')' }), r.name), h('label', { class: 'field' }, h('span', { text: 'البداية' }), r.start), h('label', { class: 'field' }, h('span', { text: 'النهاية' }), r.end)); })),
          h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap' } }, h('label', { class: 'field' }, h('span', { text: 'مهلة التأخير (دقيقة)' }), grace), h('label', { class: 'field' }, h('span', { text: 'مهلة الانصراف المبكر (دقيقة)' }), early)),
          h('div', null, h('div', { class: 'muted', style: { fontSize: '12px', marginBottom: '6px' }, text: 'الإجازة الأسبوعية (مش بتتحسب غياب):' }), h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } }, wk)),
          h('div', { class: 'muted', style: { fontSize: '12px' }, text: 'الوردية اللي نهايتها قبل بدايتها (زي 22:00–06:00) بتتحسب وردية ليلية وانصرافها في اليوم التالي. كل موظف بيتحدد ورديته من ملفه.' }),
          h('div', { style: { display: 'flex', gap: '8px' } }, h('button', { class: 'btn btn--primary', text: 'حفظ', onclick: function () {
            var shifts = {}; rows.forEach(function (r) { shifts[r.k] = { name: r.name.value.trim() || r.k, start: r.start.value, end: r.end.value }; });
            API.post('attendance/settings', { shifts: shifts, graceMin: +grace.value, earlyMin: +early.value, weekend: wk.map(function (l) { return l.firstChild; }).filter(function (x) { return x.checked; }).map(function (x) { return +x.value; }) }).then(function (s2) {
              S.meta.shifts = s2.shifts; U.closeModal(); U.toast('تم حفظ مواعيد الورديات', ''); load();
            });
          } }), h('button', { class: 'btn', text: 'إلغاء', onclick: U.closeModal }))));
      });
    }

    /* ---------------- attendance camera (kiosk) ---------------- */
    var camCard = card('كاميرا الحضور', { icon: 'cameras', sub: 'وجّهها على مدخل الموظفين — التعرف تلقائي' });
    g.appendChild(camCard);
    if (location.protocol === 'file:') { camCard.body.appendChild(h('div', { class: 'muted', text: 'الكاميرا تحتاج تشغيل المنصة من السيرفر أو تطبيق سطح المكتب.' })); return; }
    var st = { running: false, src: null, srcKind: null, stream: null, busy: false, faces: [], lastDet: 0, destroyed: false, ipcam: null };
    var canvas = h('canvas', { width: 1280, height: 720, style: { width: '100%', display: 'block', borderRadius: '12px', background: '#020403', aspectRatio: '16 / 9' } });
    var video = h('video', { playsinline: true, muted: true, autoplay: true, style: { position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' } });
    var phoneImg = h('img', { alt: '', style: { position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' } });
    var phoneVid = h('video', { playsinline: true, muted: true, autoplay: true, style: { position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none' } });
    var status = h('div', { class: 'muted', style: { fontSize: '12px', minHeight: '18px' }, text: 'اختر مصدر الكاميرا.' });
    var stage = h('div', { style: { position: 'relative', background: '#020403', borderRadius: '12px' } }, canvas, video, phoneImg, phoneVid);
    var camSel = h('select', { class: 'select', style: { height: '30px', maxWidth: '160px' } }, h('option', { value: '', text: 'كاميرا الجهاز' }));
    L.listCams().then(function (ds) { ds.forEach(function (d, i) { camSel.appendChild(h('option', { value: d.deviceId, text: d.label || ('كاميرا ' + (i + 1)) })); }); });
    var recent = h('div', { style: { display: 'grid', gap: '6px', maxHeight: '300px', overflow: 'auto' } }, h('div', { class: 'muted', style: { fontSize: '12px' }, text: 'آخر التسجيلات من هذه الكاميرا هتظهر هنا.' }));
    camCard.body.appendChild(h('div', { style: { display: 'grid', gap: '10px' } },
      stage,
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { class: 'btn btn--sm btn--accent', onclick: startCamera }, U.icon('play'), 'تشغيل'), camSel,
        h('button', { class: 'btn btn--sm', onclick: function () { L.pairPhone(startPhone); } }, '📱 موبايل'),
        h('button', { class: 'btn btn--sm', onclick: function () { L.ipCamDialog(startIpCam); } }, '🌐 كاميرا IP'),
        h('button', { class: 'btn btn--sm', onclick: stop }, U.icon('stop'), 'إيقاف'),
        h('button', { class: 'btn btn--sm btn--ghost', title: 'ملء الشاشة', onclick: function () { try { stage.requestFullscreen(); } catch (e) { } } }, U.icon('full'))),
      status,
      h('div', { class: 'card-t', style: { marginTop: '4px' }, text: 'آخر التسجيلات' }), recent));
    function camId() { return st.srcKind === 'ipcam' && st.ipcam ? st.ipcam.id : st.srcKind === 'phone' ? 'ATT-PHONE' : 'ATT-LOCAL'; }
    var names = {};
    function nameOf(id) { if (!names[id]) { names[id] = id; API.get('workers/' + encodeURIComponent(id)).then(function (w) { names[id] = w.name; }).catch(function () { }); } return names[id]; }
    var sighter = new L.Sighter(camId, function (r, f, img) {
      var o = r.record;
      if (recent.firstChild && recent.firstChild.classList && recent.firstChild.classList.contains('muted')) clear(recent);
      recent.insertBefore(h('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '10px', alignItems: 'center', padding: '6px 8px', borderRadius: '10px', background: 'var(--bg-3)', border: '1px solid ' + (r.isNew ? 'rgba(69,212,140,.45)' : 'var(--line-1)') } },
        img ? h('img', { src: img, alt: '', style: { width: '38px', height: '38px', borderRadius: '8px', objectFit: 'cover' } }) : h('span'),
        h('div', null, h('b', { text: o.workerName }), h('div', { class: 'muted', style: { fontSize: '11.5px' }, text: r.isNew ? 'تسجيل حضور' + (o.late ? ' · متأخر ' + o.lateMin + ' د' : ' · في الموعد') : 'تحديث آخر ظهور' })),
        h('span', { class: 'mono muted', style: { fontSize: '11px' }, text: U.fTime(r.ts) })), recent.firstChild);
      while (recent.children.length > 30) recent.removeChild(recent.lastChild);
      if (r.isNew) U.toast('حضور: ' + o.workerName, U.fTime(r.ts) + (o.late ? ' · متأخر ' + o.lateMin + ' د' : ' · في الموعد'), { kind: 'live', img: img });
    });
    U.onCleanup(function () { st.destroyed = true; stopSources(); });

    function prepare() {
      status.textContent = 'تحميل نموذج التعرف على الوجه…';
      return L.ensureFace().then(function () { return L.loadFaces(); }).then(function () {
        status.textContent = L.hasFaces() ? 'جاهز — ' + Object.keys(S.faceIndex || {}).length + ' موظف ببصمة وجه.' : '⚠️ مفيش موظفين ببصمة وجه لسه — سجّل الوجوه من ملف كل موظف.';
      }).catch(function (e) { status.textContent = 'تعذر تحميل نموذج الوجه: ' + e.message; throw e; });
    }
    function stopSources() {
      if (st.srcKind === 'phone' || st.srcKind === 'ipcam') L.detachPhone(st, phoneVid, phoneImg);
      L.stopStream(st.stream); st.stream = null; st.running = false; st.srcKind = null; st.ipcam = null; st.faces = [];
      try { video.pause(); } catch (e) { } video.srcObject = null;
    }
    function stop() { stopSources(); var g2 = canvas.getContext('2d'); g2.fillStyle = '#020403'; g2.fillRect(0, 0, canvas.width, canvas.height); status.textContent = 'متوقفة.'; }
    function startCamera() {
      stopSources();
      prepare().then(function () { return L.openCam(camSel.value || undefined); }).then(function (s) {
        if (st.destroyed) return L.stopStream(s);
        st.stream = s; video.srcObject = s;
        return video.play().then(function () { st.src = video; st.srcKind = 'camera'; st.running = true; loop(); });
      }).catch(function (e) { if (e && e.name) U.toast('تعذر فتح الكاميرا', L.camErrMsg(e), { kind: 'critical', ms: 9000 }); });
    }
    function startPhone(src) {
      stopSources(); st.srcKind = 'phone';
      prepare().then(function () { return L.attachPhone(src, phoneVid, phoneImg, st, function () { U.toast('انقطع اتصال كاميرا الموبايل', '', { kind: 'critical' }); }); })
        .then(function (el) { if (st.srcKind !== 'phone') return; st.src = st.phoneMode === 'mjpeg' ? L.phoneFrame(st, phoneImg) : el; st.running = true; loop(); })
        .catch(function (e) { st.srcKind = null; U.toast('تعذر استقبال صورة الموبايل', e.message, { kind: 'critical' }); });
    }
    function startIpCam(src) {
      stopSources(); st.srcKind = 'ipcam';
      status.textContent = 'جارٍ الاتصال بالكاميرا ' + src.name + '…';
      prepare().then(function () { return L.attachIpCam(src, phoneImg, st, function (err) { U.toast('مشكلة في كاميرا IP: ' + src.name, err || 'انقطع البث', { kind: 'critical', ms: 8000 }); }); })
        .then(function () { if (st.srcKind !== 'ipcam') return; st.src = L.phoneFrame(st, phoneImg); st.running = true; loop(); })
        .catch(function (e) { if (st.srcKind !== 'ipcam') return; stopSources(); U.toast('تعذر تشغيل كاميرا IP', e.message, { kind: 'critical', ms: 9000 }); });
    }
    function loop() {
      if (!st.running || st.destroyed) return;
      if ((st.srcKind === 'phone' && st.phoneMode === 'mjpeg') || st.srcKind === 'ipcam') st.src = L.phoneFrame(st, phoneImg) || st.src;
      var s = st.src, W = s && (s.videoWidth || s.naturalWidth || s.width), H = s && (s.videoHeight || s.naturalHeight || s.height);
      if (W && H) {
        if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
        var g2 = canvas.getContext('2d'), mir = st.srcKind === 'camera';
        g2.save(); if (mir) { g2.translate(W, 0); g2.scale(-1, 1); } g2.drawImage(s, 0, 0, W, H); g2.restore();
        var now = Date.now();
        if (!st.busy && now - st.lastDet > 350) {
          st.busy = true; st.lastDet = now;
          var src = s;
          L.detectFaces(src).then(function (faces) { st.faces = faces; st.facesT = Date.now(); sighter.feed(faces, src); }).catch(function () { }).then(function () { st.busy = false; });
        }
        if (st.facesT && now - st.facesT < 1500) drawFaces(g2, W, mir);
      }
      requestAnimationFrame(loop);
    }
    function drawFaces(g2, W, mir) {
      var fs = Math.max(14, Math.round(W / 50));
      st.faces.forEach(function (f) {
        var b = mir ? { x1: W - f.box.x2, y1: f.box.y1, x2: W - f.box.x1, y2: f.box.y2 } : f.box, known = f.label !== 'unknown';
        g2.strokeStyle = known ? '#45D48C' : '#FAB219'; g2.lineWidth = Math.max(2.5, W / 400); g2.strokeRect(b.x1, b.y1, b.x2 - b.x1, b.y2 - b.y1);
        var text = known ? nameOf(f.label) + ' · ' + Math.round((1 - f.dist) * 100) + '%' : 'غير مسجل';
        g2.font = '600 ' + fs + 'px "EGIC Sans", "Segoe UI", Tahoma, sans-serif'; g2.direction = 'rtl'; g2.textAlign = 'right'; g2.textBaseline = 'middle';
        var tw = g2.measureText(text).width + fs, th = fs * 1.6, y = Math.max(0, b.y1 - th - 2);
        g2.fillStyle = known ? 'rgba(10,90,50,.92)' : 'rgba(120,90,10,.92)'; g2.fillRect(b.x2 - tw, y, tw, th);
        g2.fillStyle = '#fff'; g2.fillText(text, b.x2 - fs / 2, y + th / 2 + 1);
      });
    }
  });
})();
