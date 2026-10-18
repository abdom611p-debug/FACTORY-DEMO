/*!
 * EGIC · Graphics helpers — placeholder card for simulated events (no camera image) and
 * Egyptian / Saudi licence-plate graphics.  POWERED BY DELMON & DEV SMART X
 */
(function (root) {
  'use strict';

  function roundRect(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ---------------- simulated events have no camera image: a neutral card instead ---------------- */
  var thumbCache = {};
  function evidenceThumb(ev, cam, w, h) {
    w = w || 320; h = h || 180;
    var key = (ev.type || '') + ':' + (ev.cameraId || '') + ':' + w;
    if (thumbCache[key]) return thumbCache[key];
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var g = c.getContext('2d'), fs = Math.max(10, Math.round(w / 22));
    g.fillStyle = '#0d1512'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(143,163,154,.35)'; g.lineWidth = Math.max(1, w / 200); g.setLineDash([w / 40, w / 60]);
    roundRect(g, w * 0.04, h * 0.06, w * 0.92, h * 0.88, w / 40); g.stroke(); g.setLineDash([]);
    // camera glyph
    var cx = w / 2, cy = h * 0.36, s = Math.min(w, h) * 0.16;
    g.strokeStyle = 'rgba(143,163,154,.7)'; g.lineWidth = Math.max(1.5, w / 160);
    roundRect(g, cx - s, cy - s * 0.6, s * 1.4, s * 1.2, s * 0.2); g.stroke();
    g.beginPath(); g.moveTo(cx + s * 0.4, cy - s * 0.2); g.lineTo(cx + s, cy - s * 0.55); g.lineTo(cx + s, cy + s * 0.55); g.lineTo(cx + s * 0.4, cy + s * 0.2); g.closePath(); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.fillStyle = '#c9d4cf'; g.font = '600 ' + fs + 'px "EGIC Sans", "Segoe UI", Tahoma, sans-serif';
    g.fillText(ev.typeAr || ev.type || 'حدث', cx, h * 0.66);
    g.fillStyle = 'rgba(201,212,207,.6)'; g.font = '500 ' + Math.round(fs * 0.8) + 'px "EGIC Sans", "Segoe UI", Tahoma, sans-serif';
    g.fillText('حدث محاكاة · لا توجد صورة', cx, h * 0.8);
    var url = c.toDataURL('image/png');
    thumbCache[key] = url;
    return url;
  }

  /* ---------------- plate graphics ---------------- */
  // Digits are joined with LRM + space: a plain space between two Arabic-Indic digits resolves RTL in the bidi algorithm and visually reverses them.
  function plateEl(plateText, opts) {
    opts = opts || {};
    var ksa = /[A-Z]/.test(opts.latin || '') || opts.country === 'SA';
    var el = document.createElement('div'); el.className = 'plate ' + (ksa ? 'plate--ksa' : 'plate--eg') + (opts.size ? ' plate--' + opts.size : '') + (opts.tone ? ' plate--' + opts.tone : '');
    el.setAttribute('dir', 'ltr'); el.setAttribute('aria-label', 'لوحة ' + plateText);
    var parts = String(plateText || '').trim().split(/\s{2,}/);
    var letters = (parts[0] || '').split(' ').filter(Boolean), digits = (parts[1] || '').replace(/\s/g, '');
    if (!ksa) {
      var band = document.createElement('div'); band.className = 'plate-band';
      var en = document.createElement('span'); en.textContent = 'EGYPT'; var ar = document.createElement('span'); ar.textContent = 'مصر';
      band.appendChild(en); band.appendChild(ar); el.appendChild(band);
      var body = document.createElement('div'); body.className = 'plate-body';
      var dg = document.createElement('span'); dg.className = 'plate-digits'; dg.textContent = digits.split('').join('\u200E ');
      var sep = document.createElement('i');
      var lt = document.createElement('span'); lt.className = 'plate-letters'; lt.setAttribute('dir', 'rtl'); lt.textContent = letters.join(' ');
      body.appendChild(dg); body.appendChild(sep); body.appendChild(lt); el.appendChild(body);
    } else {
      var body2 = document.createElement('div'); body2.className = 'plate-body';
      var d2 = document.createElement('span'); d2.className = 'plate-digits'; d2.textContent = digits.split('').join('\u200E ');
      var l2 = document.createElement('span'); l2.className = 'plate-letters'; l2.setAttribute('dir', 'rtl'); l2.textContent = letters.join(' ');
      var side = document.createElement('b'); side.className = 'plate-ksa'; side.textContent = 'KSA';
      body2.appendChild(d2); body2.appendChild(document.createElement('i')); body2.appendChild(l2); body2.appendChild(side); el.appendChild(body2);
      if (opts.latin) { var lat = document.createElement('div'); lat.className = 'plate-latin'; lat.textContent = opts.latin; el.appendChild(lat); }
    }
    return el;
  }

  root.EGICScenes = { evidenceThumb: evidenceThumb, plateEl: plateEl, roundRect: roundRect };
})(typeof self !== 'undefined' ? self : this);
