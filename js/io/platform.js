/* 기기 다리 (안드로이드 · 아이폰 · 브라우저) — 모든 함수는 Promise.
 * 안드로이드: window.Android (MainActivity.java 의 @JavascriptInterface, 동기 → 여기서 Promise로 감쌈)
 * 아이폰: window.webkit.messageHandlers.sj.postMessage({id, fn, args}) → window.SJNative.resolve(id, result)
 * 브라우저(시험·미리보기): IndexedDB(없으면 메모리) */
(function (SJ) {
  'use strict';
  const U = SJ.U;
  const P = {};
  const A = window.Android;
  const IOS = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.sj;
  P.kind = A && A.fsWrite ? 'android' : IOS ? 'ios' : 'web';
  P.native = P.kind !== 'web';

  /* 아이폰 · 아이패드: 두 손가락으로 '앱 화면 전체'가 확대되는 것 막기 — 웹킷 전용 제스처 이벤트(GestureEvent)를 막는다.
   * viewport 의 user-scalable=no 는 iOS 10부터 사파리가 따르지 않는다. 악보 확대는 편집 · 악보 모드가 포인터로 따로 한다(영향 없음) */
  const apple = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (apple) ['gesturestart', 'gesturechange', 'gestureend'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));

  // ── 아이폰 비동기 호출 ──
  const pending = {};
  let seq = 0;
  function ios(fn, args) {
    return new Promise((resolve, reject) => {
      const id = 'c' + (++seq);
      pending[id] = { resolve, reject };
      try { IOS.postMessage({ id, fn, args: args || [] }); } catch (e) { delete pending[id]; reject(e); }
    });
  }
  // 네이티브 → 웹 콜백
  window.SJNative = window.SJNative || {};
  window.SJNative.resolve = function (id, result, error) {
    const p = pending[id]; if (!p) return;
    delete pending[id];
    if (error) p.reject(new Error(error)); else p.resolve(result);
  };
  // 안드로이드 비동기(파일 고르기 · 저장 위치 고르기) 콜백
  window.SJNative.onAndroid = function (id, result, error) { window.SJNative.resolve(id, result, error); };
  function androidAsync(fn, args) {
    return new Promise((resolve, reject) => {
      const id = 'a' + (++seq);
      pending[id] = { resolve, reject };
      try { A[fn].apply(A, [id].concat(args || [])); } catch (e) { delete pending[id]; reject(e); }
    });
  }

  // ── 브라우저 저장소 (IndexedDB → 메모리) ──
  const mem = {};
  let dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(resolve => {
      try {
        const rq = indexedDB.open('sabojak', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('fs');
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
    return dbp;
  }
  async function webGet(path) {
    const db = await idb();
    if (!db) return Object.prototype.hasOwnProperty.call(mem, path) ? mem[path] : null;
    return new Promise(res => { const t = db.transaction('fs').objectStore('fs').get(path); t.onsuccess = () => res(t.result === undefined ? null : t.result); t.onerror = () => res(null); });
  }
  async function webPut(path, val) {
    const db = await idb();
    if (!db) { if (val === null) delete mem[path]; else mem[path] = val; return true; }
    return new Promise((res, rej) => {
      const tx = db.transaction('fs', 'readwrite');
      if (val === null) tx.objectStore('fs').delete(path); else tx.objectStore('fs').put(val, path);
      tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  }
  async function webKeys(prefix) {
    const db = await idb();
    if (!db) return Object.keys(mem).filter(k => k.startsWith(prefix));
    return new Promise(res => { const t = db.transaction('fs').objectStore('fs').getAllKeys(); t.onsuccess = () => res((t.result || []).filter(k => String(k).startsWith(prefix))); t.onerror = () => res([]); });
  }

  // ── 파일 (앱 전용 저장 공간 안의 상대 경로) ──
  P.read = function (path) {
    if (P.kind === 'android') return Promise.resolve(A.fsRead(path));
    if (P.kind === 'ios') return ios('fsRead', [path]);
    return webGet(path);
  };
  // 원자적 쓰기: 임시 파일 → 다시 읽어 확인 → 교체 (네이티브가 수행)
  P.write = function (path, text) {
    if (P.kind === 'android') {
      const r = A.fsWrite(path, text);
      return r === 'ok' ? Promise.resolve(true) : Promise.reject(new Error(r || 'write-failed'));
    }
    if (P.kind === 'ios') return ios('fsWrite', [path, text]).then(r => { if (r !== 'ok') throw new Error(r || 'write-failed'); return true; });
    return webPut(path, text);
  };
  P.remove = function (path) {
    if (P.kind === 'android') return Promise.resolve(A.fsDelete(path) === 'ok');
    if (P.kind === 'ios') return ios('fsDelete', [path]).then(r => r === 'ok');
    return webPut(path, null);
  };
  // dir 아래 파일 경로 목록 (재귀)
  P.list = function (dir) {
    if (P.kind === 'android') { try { return Promise.resolve(JSON.parse(A.fsList(dir) || '[]')); } catch (e) { return Promise.resolve([]); } }
    if (P.kind === 'ios') return ios('fsList', [dir]).then(r => { try { return JSON.parse(r || '[]'); } catch (e) { return []; } });
    return webKeys(dir.endsWith('/') ? dir : dir + '/');
  };

  // ── 공유 · 저장 · 열기 ──
  // data: 문자열(텍스트) 또는 Uint8Array(이진)
  P.shareFile = async function (name, mime, data, title) {
    const isBin = data instanceof Uint8Array;
    const payload = isBin ? U.bytesToB64(data) : data;
    if (P.kind === 'android') { const r = A.shareFile(name, mime, payload, isBin, title || name); if (r !== 'ok') throw new Error(r); return true; }
    if (P.kind === 'ios') { const r = await ios('shareFile', [name, mime, payload, isBin]); if (r !== 'ok' && r !== 'cancel') throw new Error(r); return r === 'ok'; }
    const blob = new Blob([isBin ? data : U.utf8(data)], { type: mime });
    try {
      const file = new File([blob], name, { type: mime });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: title || name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    P.download(name, blob);
    return true;
  };
  // 기기에 저장 (안드로이드: 저장 위치 고르기 · 아이폰: 공유 시트의 '파일에 저장')
  P.saveFile = async function (name, mime, data) {
    const isBin = data instanceof Uint8Array;
    const payload = isBin ? U.bytesToB64(data) : data;
    if (P.kind === 'android') { const r = await androidAsync('saveFile', [name, mime, payload, isBin]); return r === 'ok'; }
    if (P.kind === 'ios') { const r = await ios('saveFile', [name, mime, payload, isBin]); return r === 'ok'; }
    P.download(name, new Blob([isBin ? data : U.utf8(data)], { type: mime }));
    return true;
  };
  P.download = function (name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };
  // 파일 고르기 → [{name, bytes(Uint8Array)}]
  P.pickFiles = async function (multiple) {
    if (P.kind === 'android') {
      const r = await androidAsync('pickFiles', [!!multiple]);
      const arr = JSON.parse(r || '[]');
      return arr.map(f => ({ name: f.name, bytes: U.b64ToBytes(f.data) }));
    }
    if (P.kind === 'ios') {
      const r = await ios('pickFiles', [!!multiple]);
      const arr = JSON.parse(r || '[]');
      return arr.map(f => ({ name: f.name, bytes: U.b64ToBytes(f.data) }));
    }
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = !!multiple; inp.style.display = 'none';
      inp.onchange = async () => {
        const out = [];
        for (const f of Array.from(inp.files || [])) out.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
        inp.remove(); resolve(out);
      };
      document.body.appendChild(inp); inp.click();
    });
  };

  // 인쇄 (HTML 문서, 용지 mm) — 안드로이드: 인쇄 관리자(PDF로 저장 포함) · 아이폰: AirPrint · 브라우저: window.print
  P.print = function (html, jobName, wmm, hmm) {
    if (P.kind === 'android') { A.printHtml(html, jobName, wmm, hmm); return Promise.resolve(true); }
    if (P.kind === 'ios') return ios('printHtml', [html, jobName, wmm, hmm]);
    return new Promise(resolve => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
      document.body.appendChild(f);
      f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
      setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* 무시 */ } setTimeout(() => { f.remove(); resolve(true); }, 1000); }, 400);
    });
  };

  // ── 화면 · 촉감 ──
  let wakeLock = null;
  P.keepAwake = function (on) {
    if (P.kind === 'android') { A.keepAwake(!!on); return; }
    if (P.kind === 'ios') { ios('keepAwake', [!!on]); return; }
    try {
      if (on && navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { wakeLock = l; }).catch(() => {});
      else if (!on && wakeLock) { wakeLock.release(); wakeLock = null; }
    } catch (e) { /* 무시 */ }
  };
  P.immersive = function (on) {
    if (P.kind === 'android') { A.immersive(!!on); return; }
    if (P.kind === 'ios') { ios('immersive', [!!on]); return; }
    try {
      if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
    } catch (e) { /* 무시 */ }
  };
  P.haptic = function (kind) {
    if (SJ.Settings && SJ.Settings.get('haptics') === false) return;
    if (P.kind === 'android') { try { A.haptic(kind || 'light'); } catch (e) { /* 무시 */ } return; }
    if (P.kind === 'ios') { ios('haptic', [kind || 'light']); return; }
    try { if (navigator.vibrate) navigator.vibrate(kind === 'edge' ? 8 : 12); } catch (e) { /* 무시 */ }
  };
  P.statusBar = function (color, darkIcons) {
    if (P.kind === 'android') { try { A.statusBar(color, !!darkIcons); } catch (e) { /* 무시 */ } }
    else if (P.kind === 'ios') ios('statusBar', [!!darkIcons]);
  };
  P.copy = function (text) {
    if (P.kind === 'android') { A.copy(text); return Promise.resolve(); }
    if (navigator.clipboard) return navigator.clipboard.writeText(text).catch(() => {});
    return Promise.resolve();
  };

  // 앱 밖에서 파일로 열렸을 때 (.sabojak 탭) — 네이티브가 window.SJNative.openFile(name, b64) 호출
  P.onOpenFile = null;
  const queued = [];
  window.SJNative.openFile = function (name, b64) {
    const f = { name, bytes: U.b64ToBytes(b64) };
    if (P.onOpenFile) P.onOpenFile(f); else queued.push(f);
  };
  P.takeQueuedFiles = function () { return queued.splice(0); };

  SJ.Platform = P;
})(window.SJ = window.SJ || {});
