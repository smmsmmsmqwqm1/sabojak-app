/* 공통 도구: id, 복제, 정규화, 반올림, DOM 만들기 */
(function (SJ) {
  'use strict';
  const U = {};

  U.uuid = function () {
    const b = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(b);
    else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };

  // 짧은 내부 id (이벤트·텍스트 등) — 충돌 확률 무시 가능
  U.sid = function () { return U.uuid(); };

  U.clone = function (o) {
    if (o === undefined) return undefined;
    return JSON.parse(JSON.stringify(o));
  };

  U.nfc = function (s) { return typeof s === 'string' && s.normalize ? s.normalize('NFC') : s; };

  // 객체 안의 모든 문자열을 NFC로 (제자리 변경)
  U.nfcDeep = function (o) {
    if (Array.isArray(o)) { for (let i = 0; i < o.length; i++) o[i] = typeof o[i] === 'string' ? U.nfc(o[i]) : U.nfcDeep(o[i]); return o; }
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) o[k] = typeof o[k] === 'string' ? U.nfc(o[k]) : U.nfcDeep(o[k]);
    }
    return o;
  };

  U.r3 = function (n) { return Math.round(n * 1000) / 1000; };
  U.r2 = function (n) { return Math.round(n * 100) / 100; };
  U.r4 = function (n) { return Math.round(n * 10000) / 10000; };
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };

  U.isoNow = function () { return new Date().toISOString(); };

  U.debounce = function (fn, ms) {
    let t = null;
    const d = function () { const a = arguments; clearTimeout(t); t = setTimeout(() => { t = null; fn.apply(null, a); }, ms); };
    d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    d.cancel = function () { clearTimeout(t); t = null; };
    d.pending = function () { return !!t; };
    return d;
  };

  U.esc = function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  // DOM 만들기: U.h('div', {class:'x', onclick: fn}, [자식...])
  U.h = function (tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v === undefined || v === null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    if (kids !== undefined && kids !== null) {
      (Array.isArray(kids) ? kids : [kids]).forEach(c => {
        if (c === null || c === undefined || c === false) return;
        e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
      });
    }
    return e;
  };

  U.qs = function (sel, root) { return (root || document).querySelector(sel); };

  // 날짜 표시 (UI 전용 — 파일에는 ISO만 저장)
  U.fmtDate = function (iso, lang) {
    try {
      const d = new Date(iso);
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      const p = n => String(n).padStart(2, '0');
      if (sameDay) return p(d.getHours()) + ':' + p(d.getMinutes());
      if (lang === 'en') return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
      return d.getFullYear() + '. ' + (d.getMonth() + 1) + '. ' + d.getDate() + '.';
    } catch (e) { return ''; }
  };

  // 파일 이름 정리 (§12-1 ⑨)
  U.safeFileName = function (title, ext) {
    let s = U.nfc(String(title || '')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '');
    s = s.replace(/^[\s.]+|[\s.]+$/g, '');
    if (!s) s = 'score';
    if (s.length > 80) s = s.slice(0, 80).replace(/[\s.]+$/g, '');
    return s + (ext || '');
  };

  // 바이트 ↔ base64
  U.bytesToB64 = function (bytes) {
    let s = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  };
  U.b64ToBytes = function (b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  };
  U.utf8 = function (str) { return new TextEncoder().encode(str); };
  U.fromUtf8 = function (bytes) { return new TextDecoder('utf-8').decode(bytes); };

  U.reducedMotion = function () {
    try { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };

  SJ.U = U;
})(window.SJ = window.SJ || {});
