/*!
 * EGIC · Arabic typography guard — POWERED BY DELMON & DEV SMART X
 * Arabic is a cursive script: letter-spacing and monospace label styles break its joining.
 * This wraps every Arabic run that sits inside a tracked / monospace label in <span class="ar-run">,
 * which restores the UI font and zero tracking. Runs once, then follows DOM changes.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined' || !window.MutationObserver) return;
  var AR = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
  var cache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function needs(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.classList && el.classList.contains('ar-run')) return false;
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'OPTION' || tag === 'TITLE') return false;
    if (el.namespaceURI === 'http://www.w3.org/2000/svg') return false;
    if (cache && cache.has(el)) return cache.get(el);
    var cs = getComputedStyle(el);
    var ls = parseFloat(cs.letterSpacing);
    var mono = /mono|consolas|courier/i.test((cs.fontFamily || '').split(',')[0]);
    var r = (!isNaN(ls) && Math.abs(ls) > 0.25) || mono;
    if (cache) cache.set(el, r);
    return r;
  }
  function fixText(t) {
    var p = t.parentNode;
    if (!p || !AR.test(t.nodeValue) || !needs(p)) return;
    var s = document.createElement('span');
    s.className = 'ar-run';
    p.replaceChild(s, t);
    s.appendChild(t);
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1 || root.namespaceURI === 'http://www.w3.org/2000/svg') return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [];
    while (w.nextNode()) if (AR.test(w.currentNode.nodeValue)) list.push(w.currentNode);
    for (var i = 0; i < list.length; i++) fixText(list[i]);
  }
  var queue = [], scheduled = false;
  function flush() {
    scheduled = false;
    var q = queue; queue = [];
    for (var i = 0; i < q.length; i++) if (q[i].isConnected !== false) walk(q[i]);
  }
  function start() {
    walk(document.body);
    new MutationObserver(function (ms) {
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i];
        if (m.type === 'characterData') { queue.push(m.target); continue; }
        for (var j = 0; j < m.addedNodes.length; j++) queue.push(m.addedNodes[j]);
      }
      if (queue.length && !scheduled) { scheduled = true; requestAnimationFrame(flush); }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
