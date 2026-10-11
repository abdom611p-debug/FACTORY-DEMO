/*!
 * EGIC · Scene renderer — stylised CCTV feeds for the simulated cameras, evidence thumbnails,
 * and Egyptian / Saudi licence-plate graphics.  POWERED BY DELMON & DEV SMART X
 * (Live AI views use the real camera; these feeds are clearly tagged "SIM".)
 */
(function (root) {
  'use strict';
  var E = root.EGICEngine;
  function rng(seed) { var R = new E.Rng(seed >>> 0); return R; }

  // noise tile (film grain) — generated once
  var grain = null;
  function grainTile() {
    if (grain) return grain;
    grain = document.createElement('canvas'); grain.width = grain.height = 128;
    var g = grain.getContext('2d'), id = g.createImageData(128, 128);
    for (var i = 0; i < id.data.length; i += 4) { var v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; }
    g.putImageData(id, 0, 0);
    return grain;
  }

  var PALETTE = {
    day: { wall: '#2a3531', wall2: '#222c28', floor: '#3a4540', floor2: '#2c3632', line: '#c9a227', metal: '#56615c', metal2: '#454f4a', light: 'rgba(255,248,220,0.10)' },
    hot: { wall: '#2d2622', wall2: '#241e1b', floor: '#3a322d', floor2: '#2e2723', line: '#c9a227', metal: '#5a524c', metal2: '#48413c', light: 'rgba(255,150,60,0.16)' },
    night: { wall: '#1c2420', wall2: '#161d1a', floor: '#27302c', floor2: '#1f2724', line: '#8fa39a', metal: '#3b4541', metal2: '#303935', light: 'rgba(180,255,210,0.05)' },
    yard: { wall: '#34403b', wall2: '#2b3531', floor: '#4a524e', floor2: '#3b423f', line: '#d8d2c0', metal: '#5f6a65', metal2: '#4e5853', light: 'rgba(255,255,240,0.08)' }
  };

  function Scene(canvas, cam, opts) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.cam = cam; this.opts = opts || {};
    this.seed = E.hashStr(cam.id);
    this.R = rng(this.seed);
    this.kind = cam.scene || 'production';
    this.pal = this.kind === 'hot' ? PALETTE.hot : this.kind === 'perimeter' ? PALETTE.night : (this.kind === 'gate' || this.kind === 'dock') ? PALETTE.yard : PALETTE.day;
    this.t0 = performance.now() - this.R.int(0, 60000);
    this.build();
  }
  Scene.prototype.build = function () {
    var R = this.R, k = this.kind;
    this.props = [];
    var n = k === 'storage' ? 4 : k === 'gate' || k === 'perimeter' ? 0 : R.int(3, 5);
    for (var i = 0; i < n; i++) this.props.push({ side: i % 2 ? 1 : -1, z: 0.15 + (i / Math.max(1, n)) * 0.7 + R.range(-0.04, 0.04), h: R.range(0.14, 0.3), w: R.range(0.12, 0.2), glow: k === 'hot' && R.chance(0.6), lamp: R.chance(0.5) });
    this.people = [];
    var np = k === 'perimeter' ? (R.chance(0.3) ? 1 : 0) : k === 'gate' ? 1 : R.int(2, 5);
    for (var j = 0; j < np; j++) {
      this.people.push({
        lane: R.range(-0.55, 0.55), speed: R.range(0.018, 0.045) * (R.chance(0.5) ? 1 : -1), phase: R.next(),
        helmet: R.chance(0.86) ? R.pick(['#e8c21f', '#f2f2ee', '#e8c21f', '#2f7fd8']) : null,
        vest: R.chance(0.88) ? R.pick(['#e8f23a', '#f08a1c']) : null, glasses: R.chance(0.8), shirt: R.pick(['#35506b', '#4b4f56', '#2e5b4a', '#5a4c42']),
        idle: R.chance(0.35)
      });
    }
    this.forklift = (k === 'storage' || k === 'dock' || k === 'forklift' || k === 'packing') ? { z: R.range(0.3, 0.7), dir: R.chance(0.5) ? 1 : -1, speed: R.range(0.03, 0.06) } : null;
    this.vehicle = k === 'gate' ? { t: R.next() } : null;
  };

  // perspective helpers: world x∈[-1,1], z∈[0 (far),1 (near)] → screen
  Scene.prototype.P = function (x, z, W, H) {
    var hz = H * 0.36, fy = H * 1.02;
    var y = hz + (fy - hz) * Math.pow(z, 1.25);
    var half = (W * 0.18) + (W * 0.62) * z;
    return { x: W / 2 + x * half, y: y, s: 0.25 + 0.95 * z };
  };

  Scene.prototype.draw = function (now, overlay) {
    var g = this.g, W = this.c.width, H = this.c.height, pal = this.pal, k = this.kind, self = this;
    var t = (now - this.t0) / 1000;
    // walls & floor
    g.fillStyle = pal.wall2; g.fillRect(0, 0, W, H);
    var hz = H * 0.36;
    var grd = g.createLinearGradient(0, 0, 0, hz); grd.addColorStop(0, pal.wall2); grd.addColorStop(1, pal.wall); g.fillStyle = grd; g.fillRect(0, 0, W, hz);
    var fl = g.createLinearGradient(0, hz, 0, H); fl.addColorStop(0, pal.floor2); fl.addColorStop(1, pal.floor); g.fillStyle = fl;
    g.beginPath(); g.moveTo(0, H); g.lineTo(W * 0.32, hz); g.lineTo(W * 0.68, hz); g.lineTo(W, H); g.closePath(); g.fill();
    // side walls (perspective)
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(W * 0.32, hz * 0.2); g.lineTo(W * 0.32, hz); g.lineTo(0, H); g.fill();
    g.beginPath(); g.moveTo(W, 0); g.lineTo(W * 0.68, hz * 0.2); g.lineTo(W * 0.68, hz); g.lineTo(W, H); g.fill();
    // ceiling lights
    if (k !== 'perimeter' && k !== 'gate') for (var li = 0; li < 4; li++) { var lz = 0.1 + li * 0.2, lp = this.P(0, lz, W, H); g.fillStyle = pal.light; g.beginPath(); g.ellipse(lp.x, hz * (0.25 + li * 0.18), 30 * lp.s, 5 * lp.s, 0, 0, Math.PI * 2); g.fill(); }
    // floor markings
    g.strokeStyle = pal.line; g.globalAlpha = 0.55; g.lineWidth = 2;
    [-0.62, 0.62].forEach(function (x) { var a = self.P(x, 0, W, H), b = self.P(x, 1, W, H); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); });
    if (k === 'forklift' || k === 'dock' || k === 'storage') { g.setLineDash([10, 10]); var a2 = self.P(0, 0, W, H), b2 = self.P(0, 1, W, H); g.beginPath(); g.moveTo(a2.x, a2.y); g.lineTo(b2.x, b2.y); g.stroke(); g.setLineDash([]); }
    if (k === 'test' || k === 'hot' || k === 'chemical') { // restricted zone hatch
      var z1 = 0.28, z2 = 0.5, x1 = 0.12, x2 = 0.55, q = [self.P(x1, z1, W, H), self.P(x2, z1, W, H), self.P(x2, z2, W, H), self.P(x1, z2, W, H)];
      g.fillStyle = 'rgba(214,90,40,0.12)'; g.strokeStyle = 'rgba(240,120,50,0.7)'; g.beginPath(); g.moveTo(q[0].x, q[0].y); q.slice(1).forEach(function (p) { g.lineTo(p.x, p.y); }); g.closePath(); g.fill(); g.stroke();
    }
    g.globalAlpha = 1;
    // racks / machines
    this.props.slice().sort(function (a, b) { return a.z - b.z; }).forEach(function (p) {
      var base = self.P(p.side * 0.82, p.z, W, H), w = W * p.w * base.s, h = H * p.h * base.s * (k === 'storage' ? 2.2 : 1);
      var x = base.x - w / 2;
      g.fillStyle = pal.metal2; g.fillRect(x, base.y - h, w, h);
      g.fillStyle = pal.metal; g.fillRect(x, base.y - h, w, h * 0.14);
      if (k === 'storage') { g.fillStyle = 'rgba(160,120,70,0.55)'; for (var sh = 1; sh < 4; sh++) { g.fillRect(x + 2, base.y - h + h * sh / 4 - h * 0.1, w - 4, h * 0.08); } g.fillStyle = '#8b6b3e'; for (var bx = 0; bx < 3; bx++) g.fillRect(x + 4 + bx * (w - 8) / 3, base.y - h * 0.72, (w - 14) / 3, h * 0.14); }
      else { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + w * 0.1, base.y - h * 0.7, w * 0.35, h * 0.35); if (p.lamp) { g.fillStyle = (Math.floor(t * 2 + p.z * 10) % 5 === 0) ? '#ffb020' : '#3fd68a'; g.beginPath(); g.arc(x + w * 0.8, base.y - h * 0.8, 2.2 * base.s + 1, 0, Math.PI * 2); g.fill(); } }
      if (p.glow) { var gg = g.createRadialGradient(base.x, base.y - h * 0.5, 2, base.x, base.y - h * 0.5, w * 0.9); gg.addColorStop(0, 'rgba(255,140,40,0.55)'); gg.addColorStop(1, 'rgba(255,140,40,0)'); g.fillStyle = gg; g.fillRect(base.x - w, base.y - h * 1.3, w * 2, h * 1.3); }
    });
    if (k === 'packing') { var c1 = self.P(-0.2, 0.2, W, H), c2 = self.P(-0.2, 0.95, W, H); g.strokeStyle = '#6b746f'; g.lineWidth = 10 * c2.s; g.beginPath(); g.moveTo(c1.x, c1.y); g.lineTo(c2.x, c2.y); g.stroke(); g.fillStyle = '#9a7a4a'; for (var bo = 0; bo < 5; bo++) { var bz = ((t * 0.05 + bo / 5) % 1) * 0.75 + 0.2, bp = self.P(-0.2, bz, W, H); g.fillRect(bp.x - 9 * bp.s, bp.y - 16 * bp.s, 18 * bp.s, 12 * bp.s); } }
    if (k === 'perimeter') { g.strokeStyle = 'rgba(200,220,210,0.35)'; g.lineWidth = 1; for (var fx = 0; fx < W; fx += 8) { g.beginPath(); g.moveTo(fx, hz * 0.55); g.lineTo(fx + 4, hz); g.stroke(); } g.beginPath(); g.moveTo(0, hz * 0.55); g.lineTo(W, hz * 0.55); g.stroke(); }
    if (k === 'gate') this.drawGate(g, W, H, t);
    // forklift
    var boxes = [];
    if (this.forklift) {
      var fz = 0.25 + (((t * this.forklift.speed) % 1) + 1) % 1 * 0.65, fp = this.P(this.forklift.dir * 0.28, fz, W, H), fw = 70 * fp.s, fh = 60 * fp.s;
      g.fillStyle = '#d9a21e'; g.fillRect(fp.x - fw / 2, fp.y - fh, fw * 0.7, fh * 0.7);
      g.fillStyle = '#2a2a2a'; g.fillRect(fp.x - fw / 2 + fw * 0.12, fp.y - fh * 0.95, fw * 0.4, fh * 0.35);
      g.fillStyle = '#555'; g.fillRect(fp.x + fw * 0.2, fp.y - fh * 1.05, fw * 0.05, fh * 1.05); g.fillRect(fp.x + fw * 0.2, fp.y - fh * 0.1, fw * 0.35, fh * 0.06);
      g.fillStyle = '#111'; g.beginPath(); g.arc(fp.x - fw * 0.3, fp.y - 5 * fp.s, 8 * fp.s, 0, Math.PI * 2); g.arc(fp.x + fw * 0.05, fp.y - 5 * fp.s, 8 * fp.s, 0, Math.PI * 2); g.fill();
      boxes.push({ x1: fp.x - fw / 2 - 4, y1: fp.y - fh * 1.08, x2: fp.x + fw * 0.58, y2: fp.y + 2, label: 'FORKLIFT', score: 0.9, ok: true, kind: 'vehicle' });
    }
    // people (depth-sorted)
    var ppl = this.people.map(function (p) {
      var z = p.idle ? 0.35 + p.phase * 0.5 : 0.18 + ((((t * Math.abs(p.speed)) + p.phase) % 1)) * 0.78;
      if (p.speed < 0 && !p.idle) z = 0.96 - (z - 0.18);
      return { p: p, z: z };
    }).sort(function (a, b) { return a.z - b.z; });
    ppl.forEach(function (o) {
      var p = o.p, pos = self.P(p.lane, o.z, W, H), hh = 118 * pos.s, bw = hh * 0.34;
      var step = p.idle ? 0 : Math.sin(t * 7 + p.phase * 10) * 0.18;
      var x = pos.x, y = pos.y;
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(x, y, bw * 0.55, bw * 0.12, 0, 0, Math.PI * 2); g.fill();
      // legs
      g.strokeStyle = '#2b2f36'; g.lineWidth = bw * 0.22; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - bw * 0.12, y - hh * 0.42); g.lineTo(x - bw * 0.12 + step * bw, y - 2); g.moveTo(x + bw * 0.12, y - hh * 0.42); g.lineTo(x + bw * 0.12 - step * bw, y - 2); g.stroke();
      // torso
      g.fillStyle = p.shirt; roundRect(g, x - bw / 2, y - hh * 0.8, bw, hh * 0.42, bw * 0.18); g.fill();
      if (p.vest) { g.fillStyle = p.vest; roundRect(g, x - bw * 0.46, y - hh * 0.78, bw * 0.92, hh * 0.36, bw * 0.15); g.fill(); g.fillStyle = 'rgba(230,230,230,0.8)'; g.fillRect(x - bw * 0.46, y - hh * 0.6, bw * 0.92, hh * 0.03); }
      // arms
      g.strokeStyle = p.shirt; g.lineWidth = bw * 0.18; g.beginPath(); g.moveTo(x - bw * 0.5, y - hh * 0.74); g.lineTo(x - bw * 0.62 - step * bw * 0.6, y - hh * 0.47); g.moveTo(x + bw * 0.5, y - hh * 0.74); g.lineTo(x + bw * 0.62 + step * bw * 0.6, y - hh * 0.47); g.stroke();
      // head
      g.fillStyle = '#b98b6a'; g.beginPath(); g.arc(x, y - hh * 0.88, hh * 0.085, 0, Math.PI * 2); g.fill();
      if (p.helmet) { g.fillStyle = p.helmet; g.beginPath(); g.arc(x, y - hh * 0.9, hh * 0.095, Math.PI, 0); g.fill(); g.fillRect(x - hh * 0.11, y - hh * 0.9, hh * 0.22, hh * 0.02); }
      var violation = !p.helmet ? 'NO HELMET' : !p.vest ? 'NO VEST' : null;
      boxes.push({ x1: x - bw * 0.75, y1: y - hh * 1.02, x2: x + bw * 0.75, y2: y + 2, label: 'PERSON', score: 0.86 + ((p.phase * 13) % 0.12), ok: !violation, violation: violation, kind: 'person' });
      // proximity line to forklift
      if (self.forklift && boxes[0] && boxes[0].kind === 'vehicle') { var fb = boxes[0], dx = (fb.x1 + fb.x2) / 2 - x, dy = fb.y2 - y; var dist = Math.sqrt(dx * dx + dy * dy); if (dist < 120 * pos.s) { g.strokeStyle = '#ff5a4f'; g.setLineDash([4, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y - hh * 0.4); g.lineTo((fb.x1 + fb.x2) / 2, fb.y2 - 10); g.stroke(); g.setLineDash([]); boxes[boxes.length - 1].ok = false; boxes[boxes.length - 1].violation = 'PROXIMITY'; } }
    });
    if (k === 'perimeter') { // IR look
      var id = g.getImageData(0, 0, W, H), d = id.data; for (var i2 = 0; i2 < d.length; i2 += 4) { var v = d[i2] * 0.3 + d[i2 + 1] * 0.59 + d[i2 + 2] * 0.11; d[i2] = v * 0.85; d[i2 + 1] = v * 1.08; d[i2 + 2] = v * 0.9; } g.putImageData(id, 0, 0);
    }
    // grain + vignette
    g.globalAlpha = 0.9; g.fillStyle = g.createPattern(grainTile(), 'repeat'); g.save(); g.translate((t * 37) % 128, (t * 23) % 128); g.fillRect(-128, -128, W + 256, H + 256); g.restore(); g.globalAlpha = 1;
    var vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    if (overlay !== false) this.drawOverlay(g, W, H, boxes, t);
    return boxes;
  };

  Scene.prototype.drawGate = function (g, W, H, t) {
    var self = this;
    // road & barrier
    var a = this.P(-0.35, 0, W, H), b = this.P(0.35, 0, W, H), c = this.P(0.35, 1, W, H), d = this.P(-0.35, 1, W, H);
    g.fillStyle = '#2f3533'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fill();
    var cyc = (t * 0.07 + this.vehicle.t) % 1;
    var open = cyc > 0.42 && cyc < 0.8;
    var bp = this.P(0.42, 0.55, W, H);
    g.fillStyle = '#c9c9c9'; g.fillRect(bp.x - 6, bp.y - 60 * bp.s, 12 * bp.s, 60 * bp.s);
    g.save(); g.translate(bp.x, bp.y - 52 * bp.s); g.rotate(open ? -1.2 : 0);
    for (var i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#d33' : '#eee'; g.fillRect(-i * 22 * bp.s - 22 * bp.s, -3 * bp.s, 22 * bp.s, 6 * bp.s); }
    g.restore();
    // vehicle approaching
    var z = cyc < 0.42 ? 0.08 + cyc / 0.42 * 0.5 : cyc < 0.8 ? 0.58 + (cyc - 0.42) / 0.38 * 0.42 : 1.1;
    if (z <= 1) {
      var vp = this.P(0, z, W, H), vw = 150 * vp.s, vh = 110 * vp.s;
      g.fillStyle = '#54606a'; roundRect(g, vp.x - vw / 2, vp.y - vh, vw, vh * 0.8, 8 * vp.s); g.fill();
      g.fillStyle = '#1e2429'; roundRect(g, vp.x - vw * 0.4, vp.y - vh * 0.95, vw * 0.8, vh * 0.32, 6 * vp.s); g.fill();
      g.fillStyle = '#f2f2ea'; g.fillRect(vp.x - vw * 0.16, vp.y - vh * 0.38, vw * 0.32, vh * 0.1);
      g.fillStyle = '#6aa0d8'; g.fillRect(vp.x - vw * 0.16, vp.y - vh * 0.38, vw * 0.32, vh * 0.025);
      g.fillStyle = '#ffe9a6'; g.fillRect(vp.x - vw * 0.46, vp.y - vh * 0.5, vw * 0.12, vh * 0.06); g.fillRect(vp.x + vw * 0.34, vp.y - vh * 0.5, vw * 0.12, vh * 0.06);
      this._plateBox = { x1: vp.x - vw * 0.2, y1: vp.y - vh * 0.42, x2: vp.x + vw * 0.2, y2: vp.y - vh * 0.24 };
    } else this._plateBox = null;
  };

  Scene.prototype.drawOverlay = function (g, W, H, boxes, t) {
    var cam = this.cam, fs = Math.max(9, Math.round(W / 44));
    g.font = '600 ' + fs + 'px "Plex Mono", ui-monospace, monospace';
    boxes.forEach(function (b) {
      var col = b.ok ? 'rgba(63,214,138,0.95)' : 'rgba(255,82,82,0.98)';
      g.strokeStyle = col; g.lineWidth = Math.max(1.2, W / 420);
      var L = Math.min(14, (b.x2 - b.x1) * 0.25);
      [[b.x1, b.y1, 1, 1], [b.x2, b.y1, -1, 1], [b.x1, b.y2, 1, -1], [b.x2, b.y2, -1, -1]].forEach(function (c) { g.beginPath(); g.moveTo(c[0], c[1] + L * c[3]); g.lineTo(c[0], c[1]); g.lineTo(c[0] + L * c[2], c[1]); g.stroke(); });
      var label = (b.violation || b.label) + ' ' + b.score.toFixed(2);
      var tw = g.measureText(label).width + 8;
      g.fillStyle = b.ok ? 'rgba(12,60,36,0.85)' : 'rgba(120,20,20,0.9)'; g.fillRect(b.x1, b.y1 - fs - 5, tw, fs + 5);
      g.fillStyle = '#fff'; g.fillText(label, b.x1 + 4, b.y1 - 5);
    });
    if (this._plateBox) { var p = this._plateBox; g.strokeStyle = '#ffb35a'; g.lineWidth = 1.5; g.strokeRect(p.x1, p.y1, p.x2 - p.x1, p.y2 - p.y1); g.fillStyle = 'rgba(80,40,0,0.85)'; var lt = 'PLATE 0.9' + (Math.floor(t) % 10); g.fillRect(p.x1, p.y1 - fs - 5, g.measureText(lt).width + 8, fs + 5); g.fillStyle = '#fff'; g.fillText(lt, p.x1 + 4, p.y1 - 5); }
    // HUD
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 0, W, fs + 10);
    g.fillStyle = '#e8efe9'; g.fillText(cam.id, 8, fs + 3);
    var d = new Date(), ts = d.toLocaleDateString('en-CA') + ' ' + d.toLocaleTimeString('en-GB');
    g.textAlign = 'right'; g.fillText(ts, W - 8, fs + 3); g.textAlign = 'left';
    if (Math.floor(t * 1.5) % 2 === 0) { g.fillStyle = '#ff4d4d'; g.beginPath(); g.arc(W - g.measureText(ts).width - 18, fs / 2 + 5, 3.5, 0, Math.PI * 2); g.fill(); }
  };

  function roundRect(g, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* ---------------- evidence thumbnail for simulated events ---------------- */
  var thumbCache = {};
  function evidenceThumb(ev, cam, w, h) {
    var key = ev.id + ':' + (w || 320);
    if (thumbCache[key]) return thumbCache[key];
    var c = document.createElement('canvas'); c.width = w || 320; c.height = h || 180;
    var sc = new Scene(c, cam || { id: ev.cameraId || 'CAM', scene: 'production' });
    var R = rng(E.hashStr(ev.id));
    // force one visible violating worker matching the event type
    sc.people = [{ lane: R.range(-0.25, 0.25), speed: 0, phase: 0.55, idle: true, shirt: '#35506b', helmet: ev.type === 'NO_HELMET' ? null : '#e8c21f', vest: ev.type === 'NO_VEST' ? null : '#e8f23a', glasses: ev.type !== 'NO_GLASSES' }].concat(sc.people.slice(0, 1));
    var boxes = sc.draw(sc.t0 + (E.hashStr(ev.id) % 20000), false);
    var g = c.getContext('2d');
    var main = boxes.filter(function (b) { return b.kind === 'person'; })[0];
    if (main) { main.ok = false; main.violation = (ev.typeEn || ev.type).toUpperCase(); main.score = ev.conf || 0.9; sc.drawOverlay(g, c.width, c.height, [main].concat(boxes.filter(function (b) { return b !== main && b.kind === 'vehicle'; })), 0); }
    else sc.drawOverlay(g, c.width, c.height, boxes, 0);
    var url = c.toDataURL('image/jpeg', 0.78);
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

  root.EGICScenes = { Scene: Scene, evidenceThumb: evidenceThumb, plateEl: plateEl, roundRect: roundRect };
})(typeof self !== 'undefined' ? self : this);
