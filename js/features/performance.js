/* ★ 악보 모드 (§10): 보기 전용 전체 화면. 넘기기는 화면 폭 W의 정중앙 기준 — x < W/2 이전, x >= W/2 다음.
 * 다른 입력(확대·편집·길게 누르기)은 모두 꺼져 있다. 나가기 = 두 손가락 두 번 탭 또는 위 가운데 1초 누르기. */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI;
  const PM = {};
  const DEBOUNCE = 250, TAP_SLOP = 14, SWIPE = 40, HOLD_MS = 1000;
  let root, pv, pn, edgeL, edgeR, ctrl, slider, pgLbl, viewBtn, guide;
  let st = null, unBack = null, ro = null;

  // 넘김 판정 (시험 대상): 컨테이너 실제 폭 W, 같은 좌표계의 x
  PM.decide = function (x, W) { return x < W / 2 ? 'prev' : 'next'; };

  PM.open = async function (scoreId, from) {
    let score = SJ.Store.score && SJ.Store.score.id === scoreId ? SJ.Store.score : null;
    if (!score) { const r = await SJ.Storage.loadScore(scoreId); if (!r) { UI.alert(t('악보를 열 수 없어요'), ''); return; } score = r.score; }
    if (!root) build();
    const memo = (SJ.Settings.get('perfPages') || {})[scoreId] || 0;
    st = { score, from, view: SJ.Settings.get('perfView') || 'page', page: memo, lastTurn: 0, pages: [], spread: false };
    root.classList.remove('hidden');
    SJ.Platform.immersive(true);
    SJ.Platform.keepAwake(true);
    unBack = UI.pushBack(() => PM.showCtrl());     // 뒤로 단추는 바로 나가지 않고 컨트롤만 (실수 방지)
    PM.layout();
    if (!SJ.Settings.get('perfGuideSeen')) showGuide();
  };

  function build() {
    root = h('div', { class: 'perf hidden', role: 'application', 'aria-label': t('악보 모드') });
    pv = h('div', { class: 'pv' });
    pn = h('div', { class: 'pn' });
    edgeL = h('div', { class: 'edge l' }); edgeR = h('div', { class: 'edge r' });
    slider = h('input', { type: 'range', min: 1, max: 1, value: 1, 'aria-label': t('쪽 이동') });
    pgLbl = h('span', { class: 'pg' });
    viewBtn = h('button', { class: 'btn' });
    ctrl = h('div', { class: 'ctrl' }, [
      h('button', { class: 'btn', html: SJ.icon('back') + U.esc(t('나가기')), onclick: () => PM.close() }),
      slider, pgLbl, viewBtn
    ]);
    slider.addEventListener('input', () => { PM.go(Number(slider.value) - 1, true); PM.showCtrl(); });
    viewBtn.addEventListener('click', () => {
      st.view = st.view === 'page' ? 'reflow' : 'page';
      SJ.Settings.set('perfView', st.view);
      const ratio = st.pages.length ? st.page / st.pages.length : 0;
      PM.layout(ratio);
      PM.showCtrl();
    });
    root.append(pv, pn, edgeL, edgeR, ctrl);
    document.body.appendChild(root);
    attachInput();
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (st) PM.layout(st.pages.length ? st.page / st.pages.length : 0); }); ro.observe(root); }
  }

  // 화면 크기·방향에 맞춰 다시 배치 (회전·분할 화면 즉시 반영)
  PM.layout = function (keepRatio) {
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    if (st.view === 'reflow') {
      const L = SJ.Reflow.layout(st.score, { w: W, h: H, lines: SJ.Settings.get('perfLines') || 3 });
      st.pages = L.pages.map(p => SJ.SvgRender.page(p, {}));
      st.spread = false;
    } else {
      const L = SJ.Layout.layout(st.score);
      st.pages = L.pages.map(p => SJ.SvgRender.page(p, {}));
      // 아이패드 가로처럼 넓으면 두 쪽 펼침
      const pr = L.pages[0].w / L.pages[0].h;
      st.spread = W / H >= pr * 1.85 && L.pages.length > 1;
    }
    if (keepRatio !== undefined && keepRatio !== null) st.page = Math.round(keepRatio * st.pages.length);
    st.page = U.clamp(st.page, 0, Math.max(0, st.pages.length - 1));
    if (st.spread) st.page -= st.page % 2;
    slider.max = String(st.pages.length);
    viewBtn.textContent = st.view === 'page' ? t('화면 맞춤으로') : t('원본 쪽으로');
    PM.draw();
  };

  PM.draw = function () {
    const n = st.pages.length;
    pv.classList.toggle('two', st.spread);
    if (st.spread) pv.innerHTML = st.pages[st.page] + (st.pages[st.page + 1] || '');
    else pv.innerHTML = st.pages[st.page] || '';
    pv.querySelectorAll('svg').forEach(s => { s.removeAttribute('width'); s.removeAttribute('height'); });
    const label = st.spread ? (st.page + 1) + (st.page + 1 < n ? '–' + (st.page + 2) : '') + ' / ' + n : (st.page + 1) + ' / ' + n;
    pn.textContent = label;
    pn.style.display = SJ.Settings.get('perfPageNum') === false ? 'none' : '';
    slider.value = String(st.page + 1);
    pgLbl.textContent = label;
    const memo = Object.assign({}, SJ.Settings.get('perfPages') || {});
    memo[st.score.id] = st.page;
    SJ.Settings.set('perfPages', memo);
  };

  PM.go = function (i, silent) {
    const step = st.spread ? 2 : 1;
    const n = st.pages.length;
    if (i < 0 || i > n - 1) { edge(i < 0 ? 'l' : 'r'); return false; }
    if (st.spread) i -= i % 2;
    if (i === st.page) return false;
    st.page = i;
    if (!silent && SJ.Settings.get('perfAnim') === 'fade' && !U.reducedMotion()) {
      pv.style.transition = 'none'; pv.style.opacity = '0.35';
      PM.draw();
      requestAnimationFrame(() => { pv.style.transition = 'opacity .14s'; pv.style.opacity = '1'; });
    } else PM.draw();
    void step;
    return true;
  };
  PM.turn = function (dir) {
    const now = Date.now();
    if (now - st.lastTurn < DEBOUNCE) return;      // 연타 방지
    st.lastTurn = now;
    const step = st.spread ? 2 : 1;
    PM.go(st.page + dir * step);
  };
  function edge(side) {
    SJ.Platform.haptic('edge');
    const el = side === 'l' ? edgeL : edgeR;
    el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 300);
  }

  // ── 입력: 손가락 하나 탭/스와이프만. 둘 이상 접촉은 넘김 무시 ──
  function attachInput() {
    const ptrs = new Map();
    let one = null, multi = false, holdT = null, held = false, lastTwo = 0;
    root.addEventListener('pointerdown', e => {
      if (e.target.closest('.ctrl, .guide')) return;
      e.preventDefault();
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) {
        multi = false; held = false;
        const W = root.getBoundingClientRect();
        one = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, big: (e.width || 0) > 40 || (e.height || 0) > 40 };
        // 위 가운데 1초 누르기 → 컨트롤 (설정으로 끌 수 있음)
        const relX = (e.clientX - W.left) / W.width, relY = (e.clientY - W.top) / W.height;
        if (SJ.Settings.get('perfExitHold') !== false && relY < 0.16 && relX > 0.3 && relX < 0.7) {
          holdT = setTimeout(() => { held = true; SJ.Platform.haptic('light'); PM.showCtrl(); }, HOLD_MS);
        }
      } else {
        multi = true;
        clearTimeout(holdT);
        if (ptrs.size === 2) {
          const now = Date.now();
          // 두 손가락 두 번 탭
          if (SJ.Settings.get('perfExitTwoFinger') !== false && now - lastTwo < 450) { lastTwo = 0; PM.showCtrl(); }
          else lastTwo = now;
        }
      }
    });
    root.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (one && Math.hypot(e.clientX - one.x, e.clientY - one.y) > TAP_SLOP) clearTimeout(holdT);
    });
    const up = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      clearTimeout(holdT);
      if (!one || e.pointerId !== one.id || e.type === 'pointercancel') { if (!ptrs.size) one = null; return; }
      const o = one; one = null;
      if (multi || held || o.big || ptrs.size) return;       // 멀티터치·손바닥·길게 누르기는 넘김 아님
      if (ctrl.classList.contains('on')) { hideCtrl(); return; }
      const dx = e.clientX - o.x, dy = e.clientY - o.y;
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy) * 1.2) { PM.turn(dx < 0 ? 1 : -1); return; }   // 스와이프
      if (Math.hypot(dx, dy) > TAP_SLOP) return;
      // 탭: 손가락을 뗀 자리 x 와 컨테이너 실제 폭 W (같은 좌표계)
      const r = root.getBoundingClientRect();
      PM.turn(PM.decide(e.clientX - r.left, r.width) === 'prev' ? -1 : 1);
    };
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('wheel', e => { e.preventDefault(); if (Math.abs(e.deltaY) > 30 || Math.abs(e.deltaX) > 30) PM.turn((e.deltaY || e.deltaX) > 0 ? 1 : -1); }, { passive: false });
    window.addEventListener('keydown', e => {
      if (!st || root.classList.contains('hidden')) return;
      if (['ArrowRight', 'PageDown', ' ', 'ArrowDown'].indexOf(e.key) >= 0) { e.preventDefault(); PM.turn(1); }
      else if (['ArrowLeft', 'PageUp', 'ArrowUp'].indexOf(e.key) >= 0) { e.preventDefault(); PM.turn(-1); }
      else if (e.key === 'Escape') PM.showCtrl();
    });
  }

  let ctrlT = null;
  PM.showCtrl = function () {
    ctrl.classList.add('on');
    clearTimeout(ctrlT);
    ctrlT = setTimeout(hideCtrl, 4000);
    if (unBack) unBack();
    unBack = UI.pushBack(() => PM.close());
  };
  function hideCtrl() {
    ctrl.classList.remove('on');
    if (unBack) unBack();
    unBack = UI.pushBack(() => PM.showCtrl());
  }

  function showGuide() {
    guide = h('div', { class: 'guide' }, [h('div', { class: 'gbox' }, [
      h('h3', { text: t('악보 모드') }),
      h('div', { class: 'halves' }, [h('div', { text: '◀ ' + t('왼쪽 반 톡 = 이전') }), h('div', { text: t('오른쪽 반 톡 = 다음') + ' ▶' })]),
      h('p', { text: t('옆으로 밀어도 넘어가요. 확대·편집은 꺼져 있어요.') }),
      h('p', { text: t('나가기: 두 손가락으로 두 번 톡, 또는 화면 위 가운데를 1초 누르기') }),
      h('button', { class: 'btn primary', text: t('알겠어요'), onclick: () => { guide.remove(); SJ.Settings.set('perfGuideSeen', true); } })
    ])]);
    root.appendChild(guide);
  }

  PM.close = function () {
    if (!st) return;
    const from = st.from;
    root.classList.add('hidden');
    ctrl.classList.remove('on');
    if (guide) guide.remove();
    if (unBack) { unBack(); unBack = null; }
    SJ.Platform.immersive(false);
    SJ.Platform.keepAwake(false);
    st = null;
    pv.innerHTML = '';
    if (from === 'library' && SJ.Library) SJ.Library.refresh();
  };
  PM.isOpen = () => !!st;

  SJ.Performance = PM;
})(window.SJ = window.SJ || {});
