/*!
 * EGIC · Operations Console — access, management & system views
 * POWERED BY DELMON & DEV SMART X
 */
(function () {
  'use strict';
  var U = window.EGICUI, API = window.EGICClient, C = window.EGICCharts, SC = window.EGICScenes, ENG = window.EGICEngine;
  var h = U.h, clear = U.clear, card = U.card, stat = U.stat, table = U.table, seg = U.seg, select = U.select, num = U.num, S = U.S;

  function plateCell(p, size, country) { return SC.plateEl(p, { size: size || 'sm', latin: null, country: country }); }

  /* ------------------------------------------------------------------ */
  /* VIEW: Gates & ANPR                                                   */
  /* ------------------------------------------------------------------ */
  U.register('gates', function (v) {
    v.appendChild(U.viewHead('البوابات وقراءة اللوحات (ANPR)', 'كل دخول وخروج: اللوحة، النوع، القرار، ومدة البقاء داخل الموقع', [h('a', { class: 'btn btn--sm btn--accent', href: '#/anpr' }, U.icon('anpr'), 'قارئ اللوحات المباشر')]));
    var ks = h('div', { class: 'grid g-4' }); v.appendChild(ks);
    var g1 = h('div', { class: 'grid g-main' }); v.appendChild(g1);
    var traffic = card('حركة البوابات · آخر 24 ساعة', { sub: 'دخول / خروج لكل ساعة (توقيت القاهرة)' });
    var onsite = card('مركبات داخل المواقع الآن', { sub: 'مع مدة البقاء وتنبيه تجاوز المدة', flush: true });
    g1.appendChild(traffic); g1.appendChild(onsite);
    var gatesCard = card('حالة البوابات', { sub: 'آخر لوحة مقروءة وحالة الحاجز' }); v.appendChild(gatesCard);
    var logCard = card('السجل المباشر', { flush: true, actions: [U.select([['ALL', 'كل القرارات'], ['AUTHORIZED', 'مصرّح'], ['VISITOR', 'زائر'], ['UNAUTHORIZED', 'غير مصرّح'], ['BLACKLISTED', 'قائمة سوداء'], ['UNKNOWN', 'غير مقروءة']], 'ALL', function (x) { dec = x; loadLog(); })] });
    v.appendChild(logCard);
    var dec = 'ALL', fresh = {};
    function loadStats() {
      API.get('gate/stats', { site: S.site }).then(function (gs) {
        clear(ks);
        var d = gs.decisions, ins = Object.keys(d).reduce(function (a, k) { return a + d[k]; }, 0);
        [['مركبات بالداخل', num(gs.onSite.length, 0), 'الآن', 'vehicles'], ['قراءات دخول · 24 س', num(ins, 0), num(d.AUTHORIZED, 0) + ' مصرّح · ' + num(d.VISITOR, 0) + ' زائر', 'anpr'], ['مرفوض / تنبيهات', num(d.UNAUTHORIZED + d.BLACKLISTED, 0), num(d.BLACKLISTED, 0) + ' قائمة سوداء', 'alert'], ['متوسط مدة البقاء', gs.medianDwell != null ? num(gs.medianDwell, 0) : '—', 'دقيقة (الوسيط)', 'gates']].forEach(function (k, i) { var c = card(null); c.body.style.padding = '0'; c.body.appendChild(stat(k[0], k[1], k[2], { icon: k[3], critical: i === 2 && (d.UNAUTHORIZED + d.BLACKLISTED) > 0 })); ks.appendChild(c); });
        clear(traffic.body);
        C.bars(traffic.body, { items: gs.hours.map(function (x) { return { label: (x.h < 10 ? '0' : '') + x.h, values: [x.in, x.out], tipTitle: 'الساعة ' + x.h + ':00' }; }), groups: [{ name: 'دخول', color: 'var(--s1)' }, { name: 'خروج', color: 'var(--s2)' }], height: 220, labelEvery: 3 });
        clear(onsite.body);
        onsite.body.appendChild(table([
          { t: 'اللوحة', f: function (o) { return plateCell(o.plate, 'sm', o.siteId === 'KSA-01' ? 'SA' : 'EG'); } },
          { t: 'الموقع', f: function (o) { return o.siteName; } },
          { t: 'النوع / الجهة', f: function (o) { return h('div', null, h('div', { text: o.type }), h('div', { class: 'muted', style: { fontSize: '11px' }, text: o.owner })); } },
          { t: 'المدة', f: function (o) { return h('span', { class: 'mono', style: { color: o.overstay ? 'var(--warning)' : '' }, text: o.dwellMin >= 60 ? Math.floor(o.dwellMin / 60) + ' س ' + (o.dwellMin % 60) + ' د' : o.dwellMin + ' د' }); } },
          { t: '', f: function (o) { return o.overstay ? h('span', { class: 'badge badge--medium', text: 'تجاوز المدة' }) : null; } }
        ], gs.onSite.slice(0, 40), { maxH: '330px', empty: 'لا توجد مركبات بالداخل' }));
      });
      API.get('gates').then(function (r) {
        clear(gatesCard.body);
        var gc = h('div', { class: 'gate-cards' });
        r.items.filter(function (g) { return S.site === 'ALL' || g.siteId === S.site; }).forEach(function (g) {
          gc.appendChild(h('div', { class: 'gate-card' }, h('div', { class: 'gh' }, h('div', null, h('b', { text: g.name }), h('div', { class: 'muted mono', style: { fontSize: '11px' }, text: U.siteName(g.siteId) + ' · ' + g.id })), h('span', { class: 'barrier' + (g.barrier === 'open' ? ' is-open' : '') }, h('i'), g.barrier === 'open' ? 'OPEN' : 'CLOSED')), g.lastPlate ? plateCell(g.lastPlate, 'sm', g.siteId === 'KSA-01' ? 'SA' : 'EG') : h('span', { class: 'muted', text: '—' }), h('div', { class: 'muted', style: { fontSize: '11.5px' }, text: 'التحكم: ' + g.controller })));
        });
        gatesCard.body.appendChild(gc);
      });
    }
    function loadLog() {
      API.get('gate/log', { site: S.site, decision: dec, limit: 60 }).then(function (r) {
        clear(logCard.body);
        logCard.body.appendChild(table([
          { t: 'اللقطة', f: function (g) { return g.image ? h('img', { class: 'thumb', src: API.evidenceUrl(g.image), alt: '' }) : h('span', { class: 'tag-demo', text: g.source === 'sim' ? 'SIM' : '' }); } },
          { t: 'اللوحة', f: function (g) { return plateCell(g.plate, 'sm', g.country); } },
          { t: 'الاتجاه', f: function (g) { return h('span', { class: 'chip', text: g.lane === 'IN' ? '⟵ دخول' : 'خروج ⟶' }); } },
          { t: 'القرار', f: function (g) { return U.decBadge(g.decision); } },
          { t: 'المركبة / الجهة', f: function (g) { return h('div', null, h('div', { text: g.vehicleType }), h('div', { class: 'muted', style: { fontSize: '11px' }, text: g.owner })); } },
          { t: 'الموقع / البوابة', f: function (g) { return h('div', null, h('div', { text: U.siteName(g.siteId) }), h('div', { class: 'muted', style: { fontSize: '11px' }, text: g.gateName })); } },
          { t: 'المدة', f: function (g) { return g.dwellMin != null ? h('span', { class: 'mono', text: g.dwellMin + ' د' }) : h('span', { class: 'muted', text: '—' }); } },
          { t: 'التوقيت', f: function (g) { return h('span', { class: 'mono', style: { fontSize: '12px' }, text: U.fTime(g.ts) }); } },
          { t: 'الإجراء', f: function (g) { return h('span', { class: 'muted', style: { fontSize: '12px' }, text: g.action }); } },
          { t: '', f: function (g) { return U.srcTag(g.source); } }
        ], r.items.map(function (x) { if (fresh[x.id]) x.__new = true; return x; }), { maxH: '560px' }));
        fresh = {};
      });
    }
    loadStats(); loadLog();
    U.sub('gate', function (g) { if (S.site !== 'ALL' && g.siteId !== S.site) return; fresh[g.id] = 1; loadLog(); });
    U.every(12000, loadStats);
  });

  /* ------------------------------------------------------------------ */
  /* VIEW: Vehicles                                                       */
  /* ------------------------------------------------------------------ */
  U.register('vehicles', function (v) {
    var q = { q: '', status: 'ALL' };
    v.appendChild(U.viewHead('سجل المركبات', 'القائمة المصرّح بها، الزوار، والقائمة السوداء — القرار عند البوابة يُتخذ آليًا من هذا السجل', [h('button', { class: 'btn btn--sm btn--primary', onclick: addVehicle }, '+ إضافة مركبة')]));
    var fl = h('div', { class: 'filters card', style: { padding: '14px 16px' } });
    var qIn = h('input', { class: 'input', placeholder: 'رقم اللوحة أو الجهة…', type: 'search' });
    qIn.addEventListener('input', U.debounce(function () { q.q = qIn.value; load(); }, 250));
    fl.appendChild(h('label', { class: 'field', style: { flex: 1, minWidth: '220px' } }, h('span', { text: 'بحث' }), qIn));
    fl.appendChild(h('label', { class: 'field' }, h('span', { text: 'الحالة' }), select([['ALL', 'الكل'], ['authorized', 'مصرّح'], ['visitor', 'زائر'], ['blacklisted', 'قائمة سوداء']], 'ALL', function (x) { q.status = x; load(); })));
    v.appendChild(fl);
    var tc = card(null, { flush: true }); v.appendChild(tc);
    function load() {
      API.get('vehicles', q).then(function (r) {
        clear(tc.body);
        tc.body.appendChild(table([
          { t: 'اللوحة', f: function (x) { return SC.plateEl(x.plate, { size: 'sm', latin: x.plateLatin, country: x.country }); } },
          { t: 'الحالة', f: function (x) { return U.decBadge(x.status === 'authorized' ? 'AUTHORIZED' : x.status === 'visitor' ? 'VISITOR' : 'BLACKLISTED'); } },
          { t: 'الجهة', f: function (x) { return x.owner; } },
          { t: 'النوع', f: function (x) { return x.type; } },
          { t: 'المواقع المسموحة', f: function (x) { return h('span', { class: 'muted', style: { fontSize: '12px' }, text: x.sites.length >= 8 ? 'كل المواقع المصرية' : x.sites.map(U.siteName).join('، ') }); } },
          { t: 'صالح حتى', f: function (x) { return x.validUntil ? h('span', { class: 'mono', text: U.fDate(x.validUntil) }) : h('span', { class: 'muted', text: '—' }); } },
          { t: '', f: function (x) { return h('div', { style: { display: 'flex', gap: '6px' } }, x.status !== 'authorized' ? h('button', { class: 'btn btn--xs', text: 'تصريح', onclick: function (e) { e.stopPropagation(); setStatus(x, 'authorized'); } }) : null, x.status !== 'blacklisted' ? h('button', { class: 'btn btn--xs btn--danger', text: 'حظر', onclick: function (e) { e.stopPropagation(); setStatus(x, 'blacklisted'); } }) : null); } }
        ], r.items, { maxH: '640px' }));
      });
    }
    function setStatus(x, st) { API.post('vehicles', { plate: x.plate, status: st }).then(function () { U.toast('تم تحديث المركبة', x.plate + ' → ' + (st === 'authorized' ? 'مصرّح' : 'قائمة سوداء')); load(); }); }
    function addVehicle() {
      var letters = h('input', { class: 'input', placeholder: 'مثال: ر ع ص' }), digits = h('input', { class: 'input', placeholder: 'مثال: 4273', inputmode: 'numeric' });
      var owner = h('input', { class: 'input', placeholder: 'الجهة / المالك' }), st = 'authorized';
      openModalForm('إضافة مركبة', [h('div', { class: 'grid g-2', style: { gap: '10px' } }, h('label', { class: 'field' }, h('span', { text: 'حروف اللوحة' }), letters), h('label', { class: 'field' }, h('span', { text: 'أرقام اللوحة' }), digits)), h('label', { class: 'field' }, h('span', { text: 'الجهة' }), owner), h('label', { class: 'field' }, h('span', { text: 'الحالة' }), seg([['authorized', 'مصرّح'], ['visitor', 'زائر'], ['blacklisted', 'قائمة سوداء']], 'authorized', function (x) { st = x; }))], function () {
        var L = letters.value.replace(/\s+/g, '').split('').filter(Boolean);
        var plate = L.join(' ') + '  ' + ENG.toArabicDigits(digits.value.replace(/\D/g, ''));
        return API.post('vehicles', { plate: plate, owner: owner.value || 'مركبة مضافة يدويًا', status: st, category: st === 'visitor' ? 'visitor' : 'fleet', type: 'ملاكي' }).then(load);
      });
    }
    load();
  });
  function openModalForm(title, fields, onSave) {
    var body = h('div', { style: { display: 'grid', gap: '12px' } }, fields, h('div', { style: { display: 'flex', gap: '8px' } }, h('button', { class: 'btn btn--primary', text: 'حفظ', onclick: function () { Promise.resolve(onSave()).then(U.closeModal); } }), h('button', { class: 'btn', text: 'إلغاء', onclick: U.closeModal })));
    U.openModal(title, body);
  }

  /* ------------------------------------------------------------------ */
  /* VIEW: Sites                                                          */
  /* ------------------------------------------------------------------ */
  U.register('sites', function (v) {
    v.appendChild(U.viewHead('المواقع والمناطق', '9 مواقع · 5 مصانع · 4 مخازن (منها موقع السعودية) — منصة واحدة وصورة تشغيلية واحدة', [h('span', { class: 'tag-demo', text: 'DEMO CONFIGURATION · TBC' })]));
    API.get('sites/stats').then(function (ss) {
      var grid = h('div', { class: 'int-grid' });
      ss.forEach(function (s) {
        var meta = S.meta.sites.filter(function (x) { return x.id === s.id; })[0];
        var c = h('div', { class: 'int-card', style: { cursor: 'pointer' } },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } }, h('b', { text: s.name }), h('span', { class: 'chip', text: s.country === 'SA' ? 'KSA 🇸🇦' : s.type === 'plant' ? 'مصنع' : 'مخزن' })),
          h('p', { text: s.sub }),
          h('dl', { class: 'kv', style: { fontSize: '12px' } }, h('dt', { text: 'الكاميرات' }), h('dd', { class: 'mono', text: s.camsOnline + '/' + s.cams }), h('dt', { text: 'البوابات' }), h('dd', { class: 'mono', text: String(s.gates) }), h('dt', { text: 'الامتثال (24س)' }), h('dd', { class: 'mono', text: num(s.compliance, 1) + '%' }), h('dt', { text: 'مخالفات نشطة' }), h('dd', { class: 'mono', text: String(s.active) }), h('dt', { text: 'مؤشر BBS' }), h('dd', { class: 'mono', text: num(s.bbs, 1) })),
          h('div', { class: 'svc' }, meta.zones.map(function (z) { return h('span', { class: 'chip', text: z.name.split(' — ')[0] + (z.restricted ? ' ⛔' : '') }); })));
        c.addEventListener('click', function () { S.site = s.id; U.$('#siteSel').value = s.id; U.navigate('#/overview'); });
        grid.appendChild(c);
      });
      v.appendChild(grid);
      v.appendChild(h('p', { class: 'muted', style: { fontSize: '12px' } }, 'أعداد الكاميرات والبوابات وأنواع المواقع في هذه البيئة إعدادات توضيحية، وتُحدَّد فعليًا أثناء التقييم الميداني (المرحلة 01).'));
    });
  });

  /* ------------------------------------------------------------------ */
  /* VIEW: Cameras                                                        */
  /* ------------------------------------------------------------------ */
  U.register('cameras', function (v) {
    var q = { site: S.site, kind: 'ALL', assess: 'ALL', term: '' };
    v.appendChild(U.viewHead('الكاميرات', 'سجل الكاميرات مع حالة البث وقرار «إعادة الاستخدام أولًا»: استخدام · ترقية · استبدال', [h('span', { class: 'tag-demo', text: 'ILLUSTRATIVE ASSESSMENT' })]));
    var ks = h('div', { class: 'grid g-4' }); v.appendChild(ks);
    var fl = h('div', { class: 'filters card', style: { padding: '14px 16px' } });
    var qIn = h('input', { class: 'input', type: 'search', placeholder: 'رقم الكاميرا أو المنطقة…' });
    qIn.addEventListener('input', U.debounce(function () { q.term = qIn.value.trim(); load(); }, 200));
    fl.appendChild(h('label', { class: 'field', style: { flex: 1, minWidth: '200px' } }, h('span', { text: 'بحث' }), qIn));
    fl.appendChild(h('label', { class: 'field' }, h('span', { text: 'قرار التقييم' }), select([['ALL', 'الكل'], ['USE', 'استخدام كما هي'], ['UPGRADE', 'ترقية'], ['REPLACE', 'استبدال']], 'ALL', function (x) { q.assess = x; load(); })));
    fl.appendChild(h('label', { class: 'field' }, h('span', { text: 'النوع' }), select([['ALL', 'كل الكاميرات'], ['anpr', 'ANPR فقط'], ['cctv', 'مراقبة فقط']], 'ALL', function (x) { q.kind = x; load(); })));
    v.appendChild(fl);
    var tc = card(null, { flush: true }); v.appendChild(tc);
    function load() {
      API.get('cameras', { site: S.site, kind: q.kind === 'cctv' ? 'cctv' : q.kind === 'anpr' ? 'anpr' : 'ALL' }).then(function (r) {
        var items = r.items.filter(function (c) { return (q.assess === 'ALL' || c.assessment === q.assess) && (!q.term || (c.id + c.name).toLowerCase().indexOf(q.term.toLowerCase()) >= 0); });
        var all = r.items.filter(function (c) { return !c.live; });
        var cnt = { USE: 0, UPGRADE: 0, REPLACE: 0 }; all.forEach(function (c) { cnt[c.assessment]++; });
        clear(ks);
        [['إجمالي الكاميرات', num(all.length, 0), all.filter(function (c) { return c.status === 'online'; }).length + ' متصلة الآن', 'cameras'], ['استخدام كما هي', num(cnt.USE, 0), Math.round(cnt.USE / all.length * 100) + '% · بدون تكلفة أجهزة', 'check'], ['ترقية', num(cnt.UPGRADE, 0), 'إعدادات / عدسة / إضاءة / Encoder', 'refresh'], ['استبدال', num(cnt.REPLACE, 0), 'خاضع للتقييم وخارج القيمة الثابتة', 'alert']].forEach(function (k) { var c = card(null); c.body.style.padding = '0'; c.body.appendChild(stat(k[0], k[1], k[2], { icon: k[3] })); ks.appendChild(c); });
        clear(tc.body);
        tc.body.appendChild(table([
          { t: 'الكاميرا', f: function (c) { return h('div', null, h('div', { class: 'mono strong', text: c.id }), h('div', { class: 'muted', style: { fontSize: '11.5px' }, text: c.name })); } },
          { t: 'الموقع', f: function (c) { return U.siteName(c.siteId); } },
          { t: 'الحالة', f: function (c) { return h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '6px' } }, h('span', { class: 'dot ' + (c.status === 'online' ? 'dot--on' : c.status === 'degraded' ? 'dot--warn' : c.status === 'standby' ? 'dot--idle' : 'dot--off') }), ({ online: 'متصلة', degraded: 'متدهورة', offline: 'غير متصلة', standby: 'جاهزة' })[c.status]); } },
          { t: 'الدقة / FPS', f: function (c) { return h('span', { class: 'mono', text: c.res + ' · ' + c.fps }); } },
          { t: 'البروتوكول', f: function (c) { return h('span', { class: 'mono', style: { fontSize: '11.5px' }, text: c.protocol }); } },
          { t: 'وحدات AI', f: function (c) { return h('span', { class: 'muted', style: { fontSize: '11.5px' }, text: c.modules.map(function (m) { return S.meta.types[m] ? S.meta.types[m].en : m; }).slice(0, 3).join(' · ') + (c.modules.length > 3 ? ' +' + (c.modules.length - 3) : '') }); } },
          { t: 'القرار', f: function (c) { return h('span', { class: 'badge badge--' + (c.assessment === 'USE' ? 'good' : c.assessment === 'UPGRADE' ? 'medium' : 'high'), text: c.assessment === 'USE' ? 'استخدام' : c.assessment === 'UPGRADE' ? 'ترقية' : 'استبدال' }); } },
          { t: 'IP', f: function (c) { return h('span', { class: 'mono muted', style: { fontSize: '11px' }, text: c.ip }); } }
        ], items.slice(0, 400), { maxH: '640px' }));
      });
    }
    load();
  });

  /* ------------------------------------------------------------------ */
  /* VIEW: Access (RBAC)                                                  */
  /* ------------------------------------------------------------------ */
  U.register('access', function (v) {
    v.appendChild(U.viewHead('المستخدمون والصلاحيات (RBAC)', 'أقل صلاحية لازمة لكل دور · كل إجراء مسجل في سجل التدقيق'));
    var roles = ['مدير السلامة (HSE Admin)', 'مشرف السلامة (موقع)', 'مشرف أمن البوابات', 'مدير المصنع', 'مسؤول IT', 'الإدارة العليا (قراءة)', 'مراجع داخلي'];
    var perms = [['عرض لوحة القيادة', [1, 1, 1, 1, 1, 1, 1]], ['عرض البث المباشر', [1, 1, 1, 1, 0, 0, 0]], ['عرض الأدلة (صور/فيديو)', [1, 1, 1, 1, 0, 0, 1]], ['إغلاق وإسناد الأحداث', [1, 1, 0, 1, 0, 0, 0]], ['تعديل القواعد والمناطق', [1, 0, 0, 0, 0, 0, 0]], ['إدارة سجل المركبات', [1, 0, 1, 0, 0, 0, 0]], ['تصدير التقارير', [1, 1, 0, 1, 0, 1, 1]], ['إدارة المستخدمين', [1, 0, 0, 0, 1, 0, 0]], ['إعدادات النظام والتكامل', [0, 0, 0, 0, 1, 0, 0]], ['تسجيل بصمات الوجه', [1, 0, 0, 0, 0, 0, 0]]];
    var c = card('مصفوفة الصلاحيات', { sub: 'قابلة للتعديل حسب سياسة EGIC', flush: true });
    var t = h('table', { class: 'tbl matrix' }, h('thead', null, h('tr', null, h('th', { text: 'الصلاحية' }), roles.map(function (r) { return h('th', { text: r, style: { whiteSpace: 'normal', minWidth: '96px' } }); }))), h('tbody', null, perms.map(function (p) { return h('tr', null, h('td', { text: p[0] }), p[1].map(function (x) { return h('td', null, h('span', { class: x ? 'tick' : 'cross', text: x ? '✓' : '—' })); })); })));
    c.body.appendChild(h('div', { class: 'table-wrap' }, t)); v.appendChild(c);
    var u = card('حسابات الدخول', { sub: 'تسجيل الدخول عبر SSO / Active Directory (يُحدد مع IT)', flush: true });
    var users = [['hse.admin', 'مدير السلامة (HSE Admin)', 'كل المواقع', 'MFA'], ['safety.p01', 'مشرف السلامة (موقع)', 'المصنع 01', 'MFA'], ['safety.p03', 'مشرف السلامة (موقع)', 'المصنع 03', 'MFA'], ['gate.security', 'مشرف أمن البوابات', 'كل المواقع', 'MFA'], ['it.ops', 'مسؤول IT', 'كل المواقع', 'MFA + IP'], ['board.view', 'الإدارة العليا (قراءة)', 'كل المواقع', 'SSO'], ['ksa.safety', 'مشرف السلامة (موقع)', 'موقع السعودية', 'MFA']];
    u.body.appendChild(table([{ t: 'المستخدم', f: function (x) { return h('span', { class: 'mono', text: x[0] }); } }, { t: 'الدور', f: function (x) { return x[1]; } }, { t: 'النطاق', f: function (x) { return x[2]; } }, { t: 'المصادقة', f: function (x) { return h('span', { class: 'chip', text: x[3] }); } }, { t: 'الحالة', f: function () { return h('span', { class: 'badge badge--good', text: 'نشط' }); } }], users));
    v.appendChild(u);
  });

  /* ------------------------------------------------------------------ */
  /* VIEW: Rules                                                          */
  /* ------------------------------------------------------------------ */
  U.register('rules', function (v) {
    v.appendChild(U.viewHead('قواعد التنبيه والتصعيد', 'نوع الحدث × المنطقة × الوردية ← الخطورة ← القناة ← التصعيد'));
    var rules = [['CRITICAL', 'كل الأحداث الحرجة', 'لوحة القيادة + رسالة + صفارة موقع', 'مدير المصنع بعد 2 د ثم مدير السلامة بعد 5 د'], ['HIGH', 'معدات وقاية في منطقة محظورة', 'لوحة القيادة + رسالة للمشرف', 'مدير السلامة بعد 10 د'], ['MEDIUM', 'معدات وقاية في مناطق الإنتاج', 'لوحة القيادة + إشعار المشرف', 'تجميع في تقرير الوردية'], ['LOW', 'سلوك (جري، ازدحام، وضعية)', 'لوحة القيادة', 'ملخص يومي فقط'], ['CRITICAL', 'إشارة استغاثة يدوية (Pose AI)', 'تنبيه فوري ملء الشاشة + رسالة', 'فرق الطوارئ مباشرة'], ['MEDIUM', 'ماكينة بدون مشغّل > 60 ث (Pose AI)', 'إشعار مشرف الخط', 'مدير الإنتاج بعد 5 د — تقليل الهالك'], ['HIGH', 'مركبة في القائمة السوداء', 'الحاجز مغلق + تنبيه الأمن', 'مدير الأمن فورًا']];
    var c = card(null, { flush: true });
    c.body.appendChild(table([{ t: 'الخطورة', f: function (r) { return U.sevBadge(r[0]); } }, { t: 'الشرط', f: function (r) { return h('b', { text: r[1] }); } }, { t: 'القنوات', f: function (r) { return r[2]; } }, { t: 'التصعيد', f: function (r) { return h('span', { class: 'muted', text: r[3] }); } }, { t: 'مفعّل', f: function () { return h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: true })); } }], rules));
    v.appendChild(c);
    var q = card('قواعد مكافحة التكرار', { sub: 'لتقليل الإنذارات المزعجة' });
    q.body.appendChild(h('dl', { class: 'kv' }, h('dt', { text: 'تأكيد زمني' }), h('dd', { text: 'الحدث يُؤكد بعد استمراره 1.5 ثانية (N من M إطارات)' }), h('dt', { text: 'نافذة عدم التكرار' }), h('dd', { text: '25 ثانية لنفس الشخص ونفس المخالفة' }), h('dt', { text: 'تجميع' }), h('dd', { text: 'المخالفات المتزامنة لنفس الشخص تُجمّع في حادثة واحدة بلقطة واحدة' }), h('dt', { text: 'عتبات الثقة' }), h('dd', { text: 'قابلة للضبط لكل كاميرا ومنطقة بعد التجربة الميدانية' })));
    v.appendChild(q);
  });

  /* ------------------------------------------------------------------ */
  /* VIEW: Integrations                                                   */
  /* ------------------------------------------------------------------ */
  U.register('integrations', function (v) {
    v.appendChild(U.viewHead('التكامل المؤسسي', 'المنصة جزء من منظومة EGIC — ليست جزيرة جديدة', [h('span', { class: 'tag-demo', text: 'TO BE ASSESSED' })]));
    var ints = [['SAP ERP', 'مستخدم لدى EGIC منذ 2013 (حسب موقعها الرسمي). ربط الأقسام ومراكز التكلفة وأوامر الصيانة بالأحداث.', 'يُحدد أثناء التقييم', 'REST / RFC'], ['الموارد البشرية', 'بيانات العاملين والورديات والأقسام لتغذية مؤشرات BBS.', 'مخطط', 'API / تصدير دوري'], ['سجل الأسطول', 'مركبات EGIC والموردين — مصدر القائمة المصرح بها للبوابات.', 'مخطط', 'API / CSV'], ['التحكم في الدخول', 'البطاقات والبوابات الدوارة — ربط الهوية بالحدث.', 'يُحدد أثناء التقييم', 'API / Wiegand'], ['وحدات تحكم البوابات', 'فتح الحاجز آليًا للمركبات المصرّح بها.', 'محاكاة في العرض', 'Relay / Dry-contact / API'], ['إدارة الزوار', 'تسجيل مسبق ← حالة «زائر» عند البوابة بتصريح مؤقت.', 'مخطط', 'API'], ['SIEM / Syslog', 'تصدير سجلات الأمن والتدقيق لمنظومة IT.', 'مخطط', 'Syslog / CEF'], ['SSO / Active Directory', 'تسجيل دخول موحد وصلاحيات مركزية.', 'مخطط', 'LDAP / SAML / OIDC'], ['البريد والرسائل', 'قنوات الإشعار والتصعيد.', 'مخطط', 'SMTP / SMS Gateway']];
    var g = h('div', { class: 'int-grid' });
    ints.forEach(function (x) { g.appendChild(h('div', { class: 'int-card' }, h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '8px' } }, h('b', { text: x[0] }), h('span', { class: 'badge badge--' + (x[2] === 'محاكاة في العرض' ? 'low' : 'neutral'), text: x[2] })), h('p', { text: x[1] }), h('span', { class: 'chip mono', text: x[3] }))); });
    v.appendChild(g);
  });

  /* ------------------------------------------------------------------ */
  /* VIEW: System health                                                  */
  /* ------------------------------------------------------------------ */
  U.register('health', function (v) {
    v.appendChild(U.viewHead('صحة النظام', 'المنصة المركزية + عقدة معالجة طرفية لكل موقع · تحديث كل 3 ثوانٍ', [h('span', { class: 'tag-demo', text: 'SIMULATED TELEMETRY' })]));
    var ks = h('div', { class: 'grid g-4' }); v.appendChild(ks);
    var grid = h('div', { class: 'int-grid' }); v.appendChild(grid);
    function bar(label, val, unit) { var cls = val > 85 ? 'c' : val > 70 ? 'w' : ''; return h('div', { class: 'bar-row' }, h('span', { text: label }), h('div', { class: 'b' }, h('i', { class: cls, style: { width: Math.min(100, val) + '%' } })), h('span', { style: { textAlign: 'end' }, text: val + (unit || '%') })); }
    function render(hs) {
      clear(ks);
      [['الكاميرات المتصلة', hs.cameras.online + '/' + hs.cameras.total, hs.cameras.degraded + ' متدهورة · ' + hs.cameras.offline + ' غير متصلة', 'cameras'], ['محرك الذكاء الاصطناعي', 'ONLINE', 'v' + hs.version + ' · ' + (hs.mode === 'server' ? 'خادم حي' : 'محرك مدمج'), 'health'], ['إطارات AI / ثانية', num(hs.nodes.reduce(function (a, n) { return a + (n.fps || 0); }, 0), 0), 'عبر العقد الطرفية التسع', 'live'], ['زمن معالجة الحدث', Math.round(hs.nodes.slice(1).reduce(function (a, n) { return a + n.latency; }, 0) / 9) + ' ms', 'متوسط العقد الطرفية', 'bbs']].forEach(function (k) { var c = card(null); c.body.style.padding = '0'; c.body.appendChild(stat(k[0], k[1], k[2], { icon: k[3] })); ks.appendChild(c); });
      clear(grid);
      hs.nodes.forEach(function (n) {
        grid.appendChild(h('div', { class: 'node-card' }, h('div', { class: 'nh' }, h('div', null, h('b', { text: n.name }), h('div', { class: 'mono muted', style: { fontSize: '11px' }, text: n.id + (n.role === 'edge' ? ' · ' + n.streams + ' بث' : ' · CORE') })), h('span', { class: 'badge badge--good', text: 'HEALTHY' })), bar('CPU', n.cpu), n.role === 'edge' ? bar('GPU', n.gpu) : null, bar('RAM', n.ram), bar('DISK', n.disk), n.role === 'edge' ? h('div', { class: 'mono muted', style: { fontSize: '11px' }, text: n.fps + ' fps · ' + n.latency + ' ms · ' + n.temp + '°C' }) : h('div', { class: 'mono muted', style: { fontSize: '11px' }, text: 'API ' + n.latency + ' ms · uptime ' + n.uptimeH + ' h' }), h('div', { class: 'svc' }, n.services.map(function (s) { return h('span', { class: 'chip', text: s }); }))));
      });
    }
    API.get('system').then(render);
    U.sub('health', render);
  });

  /* ------------------------------------------------------------------ */
  /* VIEW: Audit                                                          */
  /* ------------------------------------------------------------------ */
  U.register('audit', function (v) {
    v.appendChild(U.viewHead('سجل التدقيق', 'من فعل ماذا ومتى ومن أين — سجل غير قابل للتعديل من الواجهة'));
    var c = card(null, { flush: true }); v.appendChild(c);
    function load() { API.get('audit', { limit: 150 }).then(function (r) { clear(c.body); c.body.appendChild(table([{ t: 'التوقيت', f: function (a) { return h('span', { class: 'mono', style: { fontSize: '12px' }, text: U.fDT(a.ts) }); } }, { t: 'المستخدم', f: function (a) { return a.actor; } }, { t: 'الإجراء', f: function (a) { return h('b', { text: a.action }); } }, { t: 'الهدف', f: function (a) { return h('span', { class: 'mono muted', style: { fontSize: '12px' }, text: a.target }); } }, { t: 'IP', f: function (a) { return h('span', { class: 'mono muted', style: { fontSize: '11.5px' }, text: a.ip }); } }, { t: 'النتيجة', f: function (a) { return h('span', { class: 'badge badge--' + (a.result === 'SUCCESS' ? 'good' : 'critical'), text: a.result }); } }], r.items, { maxH: '680px' })); }); }
    load(); U.sub('audit', load);
  });

  /* ------------------------------------------------------------------ */
  /* VIEW: API / backend                                                  */
  /* ------------------------------------------------------------------ */
  U.register('api', function (v) {
    var mode = API.state.mode;
    v.appendChild(U.viewHead('الخلفية والواجهة البرمجية', 'API-first: كل ما تراه في الواجهة متاح لأنظمة EGIC عبر REST وبث لحظي', [h('span', { class: 'badge ' + (mode === 'server' ? 'badge--good' : 'badge--medium'), text: mode === 'server' ? 'LIVE BACKEND · Node.js' : 'EMBEDDED ENGINE' })]));
    var g = h('div', { class: 'grid g-2' }); v.appendChild(g);
    var arch = card('المعمارية الخلفية', { sub: 'خدمات مستقلة خلف بوابة API واحدة' });
    arch.body.appendChild(h('div', { class: 'code', text: [
      '┌──────── Edge node (per site) ────────┐        ┌──────────── Central platform ────────────┐',
      '│ RTSP/ONVIF ingest → Camera health    │  mTLS  │ API Gateway ─ Auth/RBAC ─ Audit log       │',
      '│ AI inference (PPE · Pose · ANPR)     │ ─────▶ │ Event service ─ Rule engine ─ Notifier   │',
      '│ Tracker → Zone rules → Evidence buf  │ events │ BBS analytics ─ Reporting ─ Evidence DB  │',
      '└──────────────────────────────────────┘ + meta └────────────▲──────────────────────────────┘',
      '        video stays on-site (EGIC servers)                    │ REST · SSE · Webhooks',
      '                                                   SAP · HR · Fleet · Gates · SIEM · SSO'
    ].join('\n') }));
    g.appendChild(arch);
    var eps = card('نقاط الواجهة البرمجية', { sub: '/api/v1 · JSON' });
    var list = [['GET', '/api/v1/summary', 'مؤشرات لوحة القيادة'], ['GET', '/api/v1/events', 'سجل الأحداث مع التصفية'], ['POST', '/api/v1/events', 'حدث جديد من نموذج AI'], ['POST', '/api/v1/events/{id}/action', 'استلام / إسناد / إغلاق'], ['GET', '/api/v1/workers/{id}', 'ملف العامل وأدلته'], ['GET', '/api/v1/gate/log', 'سجل البوابات'], ['POST', '/api/v1/gate/log', 'قراءة لوحة جديدة'], ['GET', '/api/v1/bbs', 'تحليل BBS حسب البعد'], ['GET', '/api/v1/system', 'صحة العقد والكاميرات'], ['SSE', '/api/v1/stream', 'بث لحظي للأحداث والقراءات']];
    list.forEach(function (e) {
      var row = h('div', { class: 'endpoint' }, h('span', { class: 'm ' + e[0].toLowerCase(), text: e[0] }), h('code', { text: e[1] }), h('span', { text: e[2] }));
      if (e[0] === 'GET' && e[1].indexOf('{') < 0) { row.style.cursor = 'pointer'; row.addEventListener('click', function () { API.get(e[1].replace('/api/v1/', ''), { limit: 3, site: S.site }).then(function (r) { out.textContent = JSON.stringify(r, null, 2).slice(0, 6000); }); }); }
      eps.body.appendChild(row);
    });
    var out = h('div', { class: 'code', style: { marginTop: '12px', maxHeight: '260px' }, text: '// اضغط على أي GET لتجربته مباشرة' });
    eps.body.appendChild(out);
    g.appendChild(eps);
    var logc = card('نشاط الواجهة البرمجية — مباشر', { sub: mode === 'server' ? 'طلبات HTTP حقيقية إلى الخادم' : 'طلبات إلى المحرك المدمج داخل المتصفح' });
    var logEl = h('div', { style: { maxHeight: '360px', overflow: 'auto' } });
    function row(e) { return h('div', { class: 'log-row' }, h('span', { class: 'muted', text: U.fTime(e.ts) }), h('span', { class: 'm-' + e.method, text: e.method }), h('span', { text: e.path.slice(0, 90) }), h('span', { class: 's' + String(e.status).charAt(0), text: String(e.status) }), h('span', { class: 'muted', text: e.ms + 'ms' })); }
    API.apiLog.slice(0, 80).forEach(function (e) { logEl.appendChild(row(e)); });
    U.onCleanup(API.onApi(function (e) { logEl.insertBefore(row(e), logEl.firstChild); while (logEl.children.length > 120) logEl.removeChild(logEl.lastChild); }));
    logc.body.appendChild(logEl); v.appendChild(logc);
    var sse = card('البث اللحظي (Server-Sent Events)', { sub: 'آخر الرسائل' });
    var sseEl = h('div', { class: 'code', style: { maxHeight: '240px' } });
    U.onCleanup(API.on('*', function (d, msg) { if (msg.type === 'health') return; var line = msg.type + ' ' + JSON.stringify(d).slice(0, 150) + '\n'; sseEl.textContent = (line + sseEl.textContent).slice(0, 5000); }));
    sse.body.appendChild(sseEl); v.appendChild(sse);
  });
})();
