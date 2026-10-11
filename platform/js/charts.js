/*!
 * EGIC · Charts — lightweight SVG charts (no library). POWERED BY DELMON & DEV SMART X
 * Thin marks · hairline grid · crosshair + per-mark tooltips · legend for ≥2 series · table view twin.
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(tag, attrs, text, parent) { var e = s(tag, attrs, parent); e.textContent = text; return e; }
  function cssVar(name, el) { return getComputedStyle(el || document.documentElement).getPropertyValue(name).trim(); }
  var SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5'];
  function seriesColor(i) { return 'var(' + SERIES[i % SERIES.length] + ')'; }

  /* ---------------- tooltip ---------------- */
  var tipEl = null;
  function tip() {
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'viz-tip'; tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl); }
    return tipEl;
  }
  function showTip(x, y, title, rows) {
    var t = tip();
    t.textContent = '';
    if (title) { var h = document.createElement('div'); h.className = 'viz-tip-title'; h.textContent = title; t.appendChild(h); }
    rows.forEach(function (r) {
      var row = document.createElement('div'); row.className = 'viz-tip-row';
      var key = document.createElement('span'); key.className = 'viz-tip-key'; if (r.color) key.style.background = r.color; row.appendChild(key);
      var v = document.createElement('strong'); v.textContent = r.value; row.appendChild(v);
      var l = document.createElement('span'); l.className = 'viz-tip-label'; l.textContent = r.label; row.appendChild(l);
      t.appendChild(row);
    });
    t.style.opacity = '1';
    var r = t.getBoundingClientRect();
    var left = x + 14, top = y + 14;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > innerHeight - 8) top = y - r.height - 14;
    t.style.transform = 'translate(' + Math.max(8, left) + 'px,' + Math.max(8, top) + 'px)';
  }
  function hideTip() { if (tipEl) tipEl.style.opacity = '0'; }

  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))); var n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  function ticks(min, max, n) { var out = [], step = (max - min) / n; for (var i = 0; i <= n; i++) out.push(min + step * i); return out; }
  function fmt(v, f) { if (v == null || isNaN(v)) return '—'; if (f) return f(v); return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString('en-US') : (Math.round(v * 10) / 10).toString(); }

  function observe(el, render) {
    var last = 0;
    function go() { var w = el.clientWidth; if (w && Math.abs(w - last) > 2) { last = w; render(w); } }
    go();
    if (typeof ResizeObserver !== 'undefined') { var ro = new ResizeObserver(go); ro.observe(el); el.__ro = ro; }
    else addEventListener('resize', go);
  }

  /* ---------------- line / area ---------------- */
  function line(el, cfg) {
    el.textContent = '';
    el.classList.add('viz');
    var H = cfg.height || 220, pad = { t: 14, r: 12, b: 26, l: 40 };
    observe(el, function (W) {
      el.textContent = '';
      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': cfg.label || '' }, el);
      var series = cfg.series.filter(function (x) { return !x.hidden; });
      var n = cfg.x.length;
      var ymin = cfg.yMin != null ? cfg.yMin : 0;
      var allV = []; series.forEach(function (sr) { sr.values.forEach(function (v) { if (v != null) allV.push(v); }); });
      var ymax = cfg.yMax != null ? cfg.yMax : niceMax(Math.max.apply(null, allV.concat([1])));
      if (cfg.yMinAuto && allV.length) { var mn = Math.min.apply(null, allV); ymin = Math.max(0, Math.floor((mn - 2) / 5) * 5); }
      var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
      var X = function (i) { return pad.l + (n <= 1 ? iw / 2 : iw * i / (n - 1)); };
      var Y = function (v) { return pad.t + ih - ih * (v - ymin) / (ymax - ymin || 1); };
      var g = s('g', {}, svg);
      ticks(ymin, ymax, 4).forEach(function (t) {
        s('line', { x1: pad.l, x2: W - pad.r, y1: Y(t), y2: Y(t), class: 'viz-grid' }, g);
        txt('text', { x: pad.l - 8, y: Y(t) + 4, class: 'viz-tick', 'text-anchor': 'end' }, fmt(t, cfg.yTick), g);
      });
      var step = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
      for (var i = 0; i < n; i += step) txt('text', { x: X(i), y: H - 6, class: 'viz-tick', 'text-anchor': 'middle' }, cfg.xLabel ? cfg.xLabel(cfg.x[i], i) : cfg.x[i], g);
      if (cfg.target != null && cfg.target >= ymin && cfg.target <= ymax) {
        s('line', { x1: pad.l, x2: W - pad.r, y1: Y(cfg.target), y2: Y(cfg.target), class: 'viz-target' }, g);
        txt('text', { x: W - pad.r - 2, y: Y(cfg.target) - 5, class: 'viz-tick viz-target-label', 'text-anchor': 'end' }, cfg.targetLabel || ('الهدف ' + cfg.target), g);
      }
      series.forEach(function (sr, si) {
        var color = sr.color || seriesColor(cfg.series.indexOf(sr));
        var d = '', started = false, area = '';
        sr.values.forEach(function (v, i) {
          if (v == null) { started = false; return; }
          d += (started ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); started = true;
        });
        if (cfg.area && series.length === 1) {
          var first = sr.values.findIndex(function (v) { return v != null; });
          var lastI = sr.values.length - 1; while (lastI > 0 && sr.values[lastI] == null) lastI--;
          area = d + 'L' + X(lastI) + ',' + Y(ymin) + 'L' + X(first) + ',' + Y(ymin) + 'Z';
          s('path', { d: area, fill: color, 'fill-opacity': 0.1, stroke: 'none' }, g);
        }
        s('path', { d: d, fill: 'none', stroke: color, 'stroke-width': sr.width || 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', opacity: sr.muted ? 0.45 : 1, class: 'viz-line' }, g);
        // end dot
        var li = sr.values.length - 1; while (li >= 0 && sr.values[li] == null) li--;
        if (li >= 0 && !sr.muted) s('circle', { cx: X(li), cy: Y(sr.values[li]), r: 4, fill: color, stroke: 'var(--viz-surface)', 'stroke-width': 2 }, g);
      });
      // crosshair
      var cross = s('line', { y1: pad.t, y2: pad.t + ih, class: 'viz-cross', opacity: 0 }, svg);
      var dots = series.map(function (sr) { return s('circle', { r: 4, fill: sr.color || seriesColor(cfg.series.indexOf(sr)), stroke: 'var(--viz-surface)', 'stroke-width': 2, opacity: 0 }, svg); });
      var hit = s('rect', { x: pad.l, y: pad.t, width: iw, height: ih, fill: 'transparent' }, svg);
      hit.addEventListener('pointermove', function (ev) {
        var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
        var i = Math.max(0, Math.min(n - 1, Math.round((px - pad.l) / (iw / Math.max(1, n - 1)))));
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('opacity', 1);
        var rows = [];
        series.forEach(function (sr, k) { var v = sr.values[i]; if (v == null) { dots[k].setAttribute('opacity', 0); return; } dots[k].setAttribute('cx', X(i)); dots[k].setAttribute('cy', Y(v)); dots[k].setAttribute('opacity', 1); rows.push({ label: sr.name, value: fmt(v, cfg.yFormat), color: sr.color || seriesColor(cfg.series.indexOf(sr)) }); });
        showTip(ev.clientX, ev.clientY, cfg.tipTitle ? cfg.tipTitle(cfg.x[i], i) : String(cfg.x[i]), rows);
      });
      hit.addEventListener('pointerleave', function () { cross.setAttribute('opacity', 0); dots.forEach(function (d) { d.setAttribute('opacity', 0); }); hideTip(); });
    });
    if (cfg.legend !== false && cfg.series.length > 1) legend(el, cfg.series.map(function (sr, i) { return { name: sr.name, color: sr.color || seriesColor(i), kind: 'line', muted: sr.muted }; }), cfg.onToggle);
  }

  function legend(el, items, onToggle) {
    var lg = document.createElement('div'); lg.className = 'viz-legend';
    items.forEach(function (it, i) {
      var b = document.createElement(onToggle ? 'button' : 'span'); b.className = 'viz-legend-item' + (it.muted ? ' is-muted' : '');
      var k = document.createElement('span'); k.className = 'viz-legend-key ' + (it.kind === 'line' ? 'is-line' : 'is-rect'); k.style.background = it.color; b.appendChild(k);
      var t = document.createElement('span'); t.textContent = it.name; b.appendChild(t);
      if (onToggle) b.addEventListener('click', function () { onToggle(i); });
      lg.appendChild(b);
    });
    el.parentNode ? el.parentNode.insertBefore(lg, el.nextSibling) : el.appendChild(lg);
    if (el.__legend) el.__legend.remove();
    el.__legend = lg;
  }

  /* ---------------- bars (vertical or horizontal) ---------------- */
  function bars(el, cfg) {
    el.textContent = ''; el.classList.add('viz');
    var items = cfg.items;
    if (cfg.horizontal) {
      var rowH = cfg.rowHeight || 30, H = items.length * rowH + 8;
      observe(el, function (W) {
        el.textContent = '';
        var labelW = Math.min(cfg.labelWidth || 180, W * 0.42), valW = 56;
        var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': cfg.label || '' }, el);
        var max = cfg.max || niceMax(Math.max.apply(null, items.map(function (x) { return x.value; }).concat([1])));
        var bw = Math.max(12, W - labelW - valW - 8);
        items.forEach(function (it, i) {
          var y = 4 + i * rowH, h = Math.min(14, rowH - 12);
          // RTL: label on the right, bar grows right → left
          txt('text', { x: W - 2, y: y + rowH / 2 + 4, class: 'viz-label', 'text-anchor': 'end' }, it.label, svg);
          var len = Math.max(2, bw * (it.value / max));
          var x0 = W - labelW - 6;
          s('rect', { x: x0 - bw, y: y + (rowH - h) / 2, width: bw, height: h, rx: 3, class: 'viz-track' }, svg);
          var bar = s('rect', { x: x0 - len, y: y + (rowH - h) / 2, width: len, height: h, rx: 3, fill: it.color || cfg.color || 'var(--s1)', class: 'viz-bar' }, svg);
          txt('text', { x: x0 - len - 6, y: y + rowH / 2 + 4, class: 'viz-value', 'text-anchor': 'end' }, fmt(it.value, cfg.format), svg);
          var hit = s('rect', { x: 0, y: y, width: W, height: rowH, fill: 'transparent', class: cfg.onClick ? 'viz-hit is-click' : 'viz-hit' }, svg);
          hit.addEventListener('pointermove', function (ev) { bar.classList.add('is-hover'); showTip(ev.clientX, ev.clientY, it.label, [{ label: cfg.valueLabel || '', value: fmt(it.value, cfg.format), color: it.color || cfg.color || 'var(--s1)' }].concat(it.extra || [])); });
          hit.addEventListener('pointerleave', function () { bar.classList.remove('is-hover'); hideTip(); });
          if (cfg.onClick) hit.addEventListener('click', function () { cfg.onClick(it, i); });
        });
      });
      return;
    }
    var H2 = cfg.height || 200, pad = { t: 16, r: 8, b: cfg.rotate ? 44 : 26, l: 36 };
    observe(el, function (W) {
      el.textContent = '';
      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H2, width: W, height: H2, role: 'img', 'aria-label': cfg.label || '' }, el);
      var groups = cfg.groups || null; // [{name,color}] for grouped bars; item.values = []
      var max = cfg.max || niceMax(Math.max.apply(null, items.map(function (x) { return groups ? Math.max.apply(null, x.values) : x.value; }).concat([1])));
      var iw = W - pad.l - pad.r, ih = H2 - pad.t - pad.b, band = iw / items.length;
      ticks(0, max, 4).forEach(function (t) {
        var y = pad.t + ih - ih * t / max;
        s('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, class: 'viz-grid' }, svg);
        txt('text', { x: pad.l - 6, y: y + 4, class: 'viz-tick', 'text-anchor': 'end' }, fmt(t, cfg.yTick), svg);
      });
      items.forEach(function (it, i) {
        var vals = groups ? it.values : [it.value];
        var gw = Math.min(24 * vals.length + 2 * (vals.length - 1), band * 0.72), w = (gw - 2 * (vals.length - 1)) / vals.length;
        var x0 = pad.l + band * i + (band - gw) / 2;
        var marks = [];
        vals.forEach(function (v, k) {
          var h = Math.max(v > 0 ? 2 : 0, ih * v / max), x = x0 + k * (w + 2), y = pad.t + ih - h;
          var color = groups ? groups[k].color : (it.color || cfg.color || 'var(--s1)');
          var r = Math.min(4, w / 2, h);
          var path = 'M' + x + ',' + (pad.t + ih) + 'L' + x + ',' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'L' + (x + w - r) + ',' + y + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'L' + (x + w) + ',' + (pad.t + ih) + 'Z';
          marks.push(s('path', { d: path, fill: color, class: 'viz-bar' }, svg));
        });
        if (cfg.showValues) txt('text', { x: x0 + gw / 2, y: pad.t + ih - ih * Math.max.apply(null, vals) / max - 5, class: 'viz-value', 'text-anchor': 'middle' }, fmt(vals.length === 1 ? vals[0] : vals.reduce(function (a, b) { return a + b; }, 0), cfg.format), svg);
        var lbl = cfg.xLabel ? cfg.xLabel(it, i) : it.label;
        if (i % (cfg.labelEvery || 1) === 0) {
          if (cfg.rotate) txt('text', { x: x0 + gw / 2, y: H2 - pad.b + 14, class: 'viz-tick', 'text-anchor': 'end', transform: 'rotate(-35 ' + (x0 + gw / 2) + ' ' + (H2 - pad.b + 14) + ')' }, lbl, svg);
          else txt('text', { x: x0 + gw / 2, y: H2 - 8, class: 'viz-tick', 'text-anchor': 'middle' }, lbl, svg);
        }
        var hit = s('rect', { x: pad.l + band * i, y: pad.t, width: band, height: ih, fill: 'transparent', class: cfg.onClick ? 'viz-hit is-click' : 'viz-hit' }, svg);
        hit.addEventListener('pointermove', function (ev) {
          marks.forEach(function (m) { m.classList.add('is-hover'); });
          showTip(ev.clientX, ev.clientY, it.tipTitle || it.label, groups ? groups.map(function (g, k) { return { label: g.name, value: fmt(vals[k], cfg.format), color: g.color }; }) : [{ label: cfg.valueLabel || '', value: fmt(vals[0], cfg.format), color: it.color || cfg.color || 'var(--s1)' }]);
        });
        hit.addEventListener('pointerleave', function () { marks.forEach(function (m) { m.classList.remove('is-hover'); }); hideTip(); });
        if (cfg.onClick) hit.addEventListener('click', function () { cfg.onClick(it, i); });
      });
    });
    if (cfg.groups && cfg.groups.length > 1) legend(el, cfg.groups.map(function (g) { return { name: g.name, color: g.color, kind: 'rect' }; }));
  }

  /* ---------------- heatmap (7 × 24) ---------------- */
  function heatmap(el, cfg) {
    el.textContent = ''; el.classList.add('viz');
    var rows = cfg.rows, R = rows.length, Cn = rows[0].length;
    var max = Math.max.apply(null, rows.map(function (r) { return Math.max.apply(null, r); }).concat([1]));
    observe(el, function (W) {
      el.textContent = '';
      var labW = 58, top = 4, cell = Math.max(8, Math.min(26, (W - labW - 6) / Cn)), gap = 2;
      var H = top + R * cell + 22;
      var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': cfg.label || '' }, el);
      var gridW = Cn * cell, x0 = W - labW - gridW; // RTL: labels on the right
      rows.forEach(function (r, ri) {
        txt('text', { x: W - 2, y: top + ri * cell + cell / 2 + 4, class: 'viz-tick', 'text-anchor': 'end' }, cfg.rowLabels[ri], svg);
        r.forEach(function (v, ci) {
          var a = v === 0 ? 0.05 : 0.14 + 0.86 * (v / max);
          var rect = s('rect', { x: x0 + ci * cell, y: top + ri * cell, width: cell - gap, height: cell - gap, rx: 2, fill: cfg.color || 'var(--heat)', 'fill-opacity': a.toFixed(3), class: 'viz-cell' }, svg);
          rect.addEventListener('pointermove', function (ev) { rect.classList.add('is-hover'); showTip(ev.clientX, ev.clientY, cfg.rowLabels[ri] + ' · ' + cfg.colLabel(ci), [{ label: cfg.valueLabel || '', value: fmt(v), color: cfg.color || 'var(--heat)' }]); });
          rect.addEventListener('pointerleave', function () { rect.classList.remove('is-hover'); hideTip(); });
        });
      });
      for (var c = 0; c < Cn; c += (cell < 14 ? 6 : 3)) txt('text', { x: x0 + c * cell + cell / 2, y: H - 6, class: 'viz-tick', 'text-anchor': 'middle' }, cfg.colLabel(c), svg);
    });
    var sc = document.createElement('div'); sc.className = 'viz-scale';
    var lo = document.createElement('span'); lo.textContent = 'أقل'; var bar = document.createElement('i'); var hi = document.createElement('span'); hi.textContent = 'أعلى';
    sc.appendChild(lo); sc.appendChild(bar); sc.appendChild(hi);
    el.appendChild(sc);
  }

  /* ---------------- sparkline ---------------- */
  function spark(el, values, cfg) {
    cfg = cfg || {};
    el.textContent = '';
    var W = cfg.width || 120, H = cfg.height || 30;
    var svg = s('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true', class: 'viz-spark' }, el);
    var v = values.filter(function (x) { return x != null; }); if (v.length < 2) return;
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v); if (mx === mn) mx = mn + 1;
    var d = values.map(function (x, i) { return (i ? 'L' : 'M') + (2 + (W - 4) * i / (values.length - 1)).toFixed(1) + ',' + (H - 3 - (H - 6) * ((x == null ? mn : x) - mn) / (mx - mn)).toFixed(1); }).join('');
    s('path', { d: d, fill: 'none', stroke: cfg.color || 'var(--ink-3)', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, svg);
    var lx = W - 2, ly = H - 3 - (H - 6) * (values[values.length - 1] - mn) / (mx - mn);
    s('circle', { cx: lx, cy: ly, r: 2.5, fill: cfg.accent || 'var(--s1)' }, svg);
  }

  /* ---------------- segmented meter (compliance index) ---------------- */
  function meter(el, cfg) {
    el.textContent = '';
    var segs = cfg.segments || 40, v = Math.max(0, Math.min(100, cfg.value || 0)), target = cfg.target;
    // the fill carries severity of the current value vs target (one colour), the track is the unfilled ramp
    var sev = target != null ? (v >= target ? 'is-good' : v >= (cfg.warn || target - 10) ? 'is-warn' : 'is-bad') : 'is-good';
    var wrap = document.createElement('div'); wrap.className = 'viz-meter'; wrap.setAttribute('role', 'meter'); wrap.setAttribute('aria-valuenow', v); wrap.setAttribute('aria-valuemin', 0); wrap.setAttribute('aria-valuemax', 100);
    for (var i = 0; i < segs; i++) {
      var p = (i + 1) * 100 / segs, seg = document.createElement('i');
      seg.className = p <= v + 0.0001 ? sev : 'is-off';
      wrap.appendChild(seg);
    }
    if (target != null) { var t = document.createElement('b'); t.className = 'viz-meter-target'; t.style.insetInlineStart = 'calc(' + target + '% - 1px)'; var tl = document.createElement('span'); tl.textContent = String(target); t.appendChild(tl); wrap.appendChild(t); }
    el.appendChild(wrap);
    var sc = document.createElement('div'); sc.className = 'viz-meter-scale';
    [0, 25, 50, 75, 100].forEach(function (n) { var x = document.createElement('span'); x.textContent = n; sc.appendChild(x); });
    el.appendChild(sc);
  }

  /* ---------------- table twin ---------------- */
  function table(el, columns, rows) {
    el.textContent = '';
    var t = document.createElement('table'); t.className = 'viz-table';
    var thead = document.createElement('thead'), tr = document.createElement('tr');
    columns.forEach(function (c) { var th = document.createElement('th'); th.textContent = c; tr.appendChild(th); });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = document.createElement('tbody');
    rows.forEach(function (r) { var row = document.createElement('tr'); r.forEach(function (c) { var td = document.createElement('td'); td.textContent = c; row.appendChild(td); }); tb.appendChild(row); });
    t.appendChild(tb); el.appendChild(t);
  }

  root.EGICCharts = { line: line, bars: bars, heatmap: heatmap, spark: spark, meter: meter, table: table, showTip: showTip, hideTip: hideTip, seriesColor: seriesColor, legend: legend };
})(typeof self !== 'undefined' ? self : this);
