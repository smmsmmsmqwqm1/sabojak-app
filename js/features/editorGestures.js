/* 편집 화면 손동작 (§7-3): 가로로 넘기듯 끌기 = 쪽 넘김(끝에선 가볍게 튕김+햅틱), 확대 중엔 끌기 = 이동,
 * 두 손가락 = 3배까지 확대, 탭 = 선택, 두 번 탭 = 마디 집중 모드. */
(function (SJ) {
  'use strict';
  const U = SJ.U;
  const EG = {};
  const TAP_MOVE = 10, DOUBLE_MS = 320, DOUBLE_PX = 36;

  EG.attach = function (stage, E) {
    const ptrs = new Map();
    let mode = null;          // 'pager' | 'pan' | 'pinch' | 'drag-text' | null
    let start = null, pinch0 = null, lastTap = null, dragText = null;

    stage.addEventListener('pointerdown', e => {
      if (e.target.closest('.float-input, .hint, button')) return;
      try { if (stage.setPointerCapture) stage.setPointerCapture(e.pointerId); } catch (er) { /* 이미 끝난 포인터 — 잡지 않아도 됨 */ }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const flow = !!(E.L && E.L.flow);
      if (ptrs.size === 1) {
        // 미끄러지던 스크롤을 손가락으로 멈춘 것은 톡(고르기)이 아니다
        const stopped = flow && E.stopFling();
        start = { x: e.clientX, y: e.clientY, t: Date.now(), panX: E.zoom > 1 ? E.panX : 0, panY: E.panY, track: -E.page * E.stageSize().w, stopped, lastY: e.clientY, vs: [] };
        mode = null;
        // 텍스트 도구: 텍스트를 잡으면 끌어서 옮기기
        if (E.tool === 'text') {
          const pt = E.toPage(e.clientX, e.clientY);
          const ref = E.hitAt(pt);
          if (ref && ref.type === 'text') dragText = { id: ref.id, pt0: pt, moved: false };
        }
      } else if (ptrs.size === 2) {
        const [a, b] = Array.from(ptrs.values());
        pinch0 = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: E.zoom, panX: E.panX, panY: E.panY, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        mode = 'pinch';
        if (dragText) dragText = null;
        if (flow) { E.stopFling(); pinch0.flow = true; pinch0.k = 1; }
        else E.setTrack(-E.page * E.stageSize().w, true);
      }
    });

    /* 흘림 보기 두 손가락 = 오선 크기 바꾸기: 손가락 사이는 그림만 키워 보여 주고(가볍게), 놓으면 그 크기로 줄을 다시 배치 —
     * 두 손가락 가운데에 있던 마디가 같은 높이에 남게 */
    const FLOW_MIN = 0.7, FLOW_MAX = 1.8;
    function flowPinchMove(a, b) {
      const paper = E.paperOf(0); if (!paper) return;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const k = U.clamp(d / Math.max(20, pinch0.d), FLOW_MIN / E.flowZoom, FLOW_MAX / E.flowZoom);
      pinch0.k = k;
      const r = paper.getBoundingClientRect();
      paper.style.transformOrigin = (pinch0.cx - r.left) + 'px ' + (pinch0.cy - r.top) + 'px';
      paper.style.transform = 'scale(' + k + ')';
    }
    function flowPinchEnd() {
      const paper = E.paperOf(0);
      const k = pinch0.k || 1;
      if (paper) { paper.style.transform = ''; paper.style.transformOrigin = ''; }
      if (Math.abs(k - 1) < 0.04) return;
      const pt = E.toPage(pinch0.cx, pinch0.cy);
      const near = pt ? E.measureNear(pt) : null;
      const mi = near !== null ? near : E.currentMeasure();
      const b0 = E.L.measureBox[mi];
      const sc0 = E.paperScale();
      const offY = b0 ? b0.y0 * sc0 - E.scrollTop() : 0;     // 그 마디가 화면 위에서 얼마나 아래에 있었나
      E.flowZoom = U.clamp(E.flowZoom * k, FLOW_MIN, FLOW_MAX);
      SJ.Settings.set('flowZoom', E.flowZoom);
      E.relayout();
      const b1 = E.L.measureBox[mi];
      if (b1) E.scrollTo(b1.y0 * E.paperScale() - offY);
    }

    stage.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (mode === 'pinch' && ptrs.size >= 2 && pinch0.flow) { const [a, b] = Array.from(ptrs.values()); flowPinchMove(a, b); return; }
      if (mode === 'pinch' && ptrs.size >= 2) {
        const [a, b] = Array.from(ptrs.values());
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const z = U.clamp(pinch0.zoom * d / Math.max(20, pinch0.d), 1, 3);
        const paper = E.paperOf(E.page); if (!paper) return;
        const r = paper.parentElement.getBoundingClientRect();
        const ox = paper.offsetLeft + r.left, oy = paper.offsetTop + r.top;
        // 두 손가락 가운데를 기준으로 확대
        const cx = pinch0.cx - ox, cy = pinch0.cy - oy;
        const k = z / pinch0.zoom;
        E.zoom = z;
        E.panX = cx - (cx - pinch0.panX) * k + ((a.x + b.x) / 2 - pinch0.cx);
        E.panY = cy - (cy - pinch0.panY) * k + ((a.y + b.y) / 2 - pinch0.cy);
        if (z === 1) { E.panX = 0; E.panY = 0; }
        E.clampPan(); E.applyZoom();
        return;
      }
      if (!start || ptrs.size !== 1) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (dragText) {
        if (Math.hypot(dx, dy) > TAP_MOVE || dragText.moved) {
          dragText.moved = true;
          const pt = E.toPage(e.clientX, e.clientY);
          SJ.TextTool.dragPreview(dragText.id, pt.x - dragText.pt0.x, pt.y - dragText.pt0.y);
        }
        return;
      }
      const flow = !!(E.L && E.L.flow);
      if (!mode && Math.hypot(dx, dy) > TAP_MOVE) mode = flow ? 'scroll' : E.zoom > 1 ? 'pan' : (Math.abs(dx) > Math.abs(dy) ? 'pager' : 'none');
      if (mode === 'scroll') {
        // 흘림 보기: 위아래로 끌면 종이가 손가락을 따라온다(가로 움직임은 무시)
        const now = Date.now();
        E.scrollBy(start.lastY - e.clientY);
        start.vs.push({ t: now, y: e.clientY });
        while (start.vs.length > 2 && now - start.vs[0].t > 90) start.vs.shift();
        start.lastY = e.clientY;
        return;
      }
      if (mode === 'pager') {
        const n = E.L.pages.length;
        let x = dx;
        if ((E.page === 0 && dx > 0) || (E.page === n - 1 && dx < 0)) x = dx * 0.18;   // 가장자리에서 가볍게만
        E.setTrack(start.track + x, false);
      } else if (mode === 'pan') {
        E.panX = start.panX + dx; E.panY = start.panY + dy;
        E.clampPan(); E.applyZoom();
      }
    });

    const end = e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (mode === 'pinch') {
        if (pinch0 && pinch0.flow && !pinch0.done) { pinch0.done = true; flowPinchEnd(); }
        if (ptrs.size === 0) { mode = null; start = null; } else start = null;
        return;
      }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y, dt = Date.now() - start.t;
      if (dragText) {
        const dtx = dragText; dragText = null;
        if (dtx.moved) { const pt = E.toPage(e.clientX, e.clientY); SJ.TextTool.commitDrag(dtx.id, pt.x - dtx.pt0.x, pt.y - dtx.pt0.y); start = null; return; }
      }
      if (mode === 'scroll') {
        // 놓을 때의 빠르기로 조금 더 미끄러진다(마지막 90ms · 멈췄다 놓으면 그대로)
        const vs = start.vs, now = Date.now();
        let v = 0;
        if (vs.length >= 2 && now - vs[vs.length - 1].t < 60) v = (vs[vs.length - 1].y - vs[0].y) / Math.max(8, vs[vs.length - 1].t - vs[0].t);
        if (e.type !== 'pointercancel') E.fling(U.clamp(v, -3.5, 3.5));   // 아주 세게 튕겨도 몇 화면 정도만
        mode = null; start = null; return;
      }
      if (mode === 'pager') {
        const w = E.stageSize().w;
        const v = dx / Math.max(1, dt);
        let target = E.page;
        if (dx < -w * 0.18 || v < -0.45) target = E.page + 1;
        else if (dx > w * 0.18 || v > 0.45) target = E.page - 1;
        if (target !== E.page) E.goPage(target); else E.setTrack(-E.page * w, true);
      } else if (!mode && !start.stopped && Math.hypot(dx, dy) <= TAP_MOVE && dt < 500 && e.type !== 'pointercancel') {
        const now = Date.now();
        const dbl = lastTap && now - lastTap.t < DOUBLE_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_PX;
        const pt = E.toPage(e.clientX, e.clientY);
        // 두 번째 톡은 첫 톡 자리로 판단 (첫 톡에 마디 도구 막대가 나타나며 쪽이 살짝 밀려도 같은 마디)
        const firstPt = dbl ? lastTap.pt : null;
        lastTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY, pt };
        if (dbl) SJ.EditorTools.onDoubleTap(firstPt || pt); else SJ.EditorTools.onTap(pt, e);
      }
      mode = null; start = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // 마우스 휠(태블릿 키보드·PC 미리보기): 쪽 넘김
    stage.addEventListener('wheel', e => {
      if (E.L && E.L.flow) { E.stopFling(); return; }      // 흘림 보기: 휠 · 터치패드는 기본 스크롤 그대로
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? Math.abs(e.deltaX) > 30 : Math.abs(e.deltaY) > 60) {
        e.preventDefault();
        const now = Date.now();
        if (stage._wheelT && now - stage._wheelT < 350) return;
        stage._wheelT = now;
        E.goPage(E.page + ((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) > 0 ? 1 : -1));
      }
    }, { passive: false });
  };

  SJ.EditorGestures = EG;
})(window.SJ = window.SJ || {});
