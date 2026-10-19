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
      stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) {
        start = { x: e.clientX, y: e.clientY, t: Date.now(), panX: E.zoom > 1 ? E.panX : 0, panY: E.panY, track: -E.page * E.stageSize().w };
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
        E.setTrack(-E.page * E.stageSize().w, true);
      }
    });

    stage.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
      if (!mode && Math.hypot(dx, dy) > TAP_MOVE) mode = E.zoom > 1 ? 'pan' : (Math.abs(dx) > Math.abs(dy) ? 'pager' : 'none');
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
      if (mode === 'pinch') { if (ptrs.size === 0) { mode = null; start = null; } else start = null; return; }
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y, dt = Date.now() - start.t;
      if (dragText) {
        const dtx = dragText; dragText = null;
        if (dtx.moved) { const pt = E.toPage(e.clientX, e.clientY); SJ.TextTool.commitDrag(dtx.id, pt.x - dtx.pt0.x, pt.y - dtx.pt0.y); start = null; return; }
      }
      if (mode === 'pager') {
        const w = E.stageSize().w;
        const v = dx / Math.max(1, dt);
        let target = E.page;
        if (dx < -w * 0.18 || v < -0.45) target = E.page + 1;
        else if (dx > w * 0.18 || v > 0.45) target = E.page - 1;
        if (target !== E.page) E.goPage(target); else E.setTrack(-E.page * w, true);
      } else if (!mode && Math.hypot(dx, dy) <= TAP_MOVE && dt < 500 && e.type !== 'pointercancel') {
        const now = Date.now();
        const dbl = lastTap && now - lastTap.t < DOUBLE_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < DOUBLE_PX;
        lastTap = dbl ? null : { t: now, x: e.clientX, y: e.clientY };
        const pt = E.toPage(e.clientX, e.clientY);
        if (dbl) SJ.EditorTools.onDoubleTap(pt); else SJ.EditorTools.onTap(pt, e);
      }
      mode = null; start = null;
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // 마우스 휠(태블릿 키보드·PC 미리보기): 쪽 넘김
    stage.addEventListener('wheel', e => {
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
