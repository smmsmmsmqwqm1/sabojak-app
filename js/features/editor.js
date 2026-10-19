/* 편집 화면 (§7-3): 페이지 뷰 · 상단 막대 · 쪽 이동 · 선택 · 자동 저장 표시. 도구 막대는 editorTools.js */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store;
  const E = { L: null, page: 0, tool: 'select', sel: null, clip: null, zoom: 1, panX: 0, panY: 0, version: 0 };
  let root, stage, track, titleEl, saveEl, undoBtn, redoBtn, alignBtn, pageLbl, ctxbar, toolbar, floatBtn, hintEl, edgeL, edgeR;
  let slots = [], svgCache = {}, unsub = null;

  E.mount = function (container) {
    root = h('div', { class: 'view hidden', id: 'editor' });
    titleEl = h('div', { class: 'title', role: 'button', tabindex: 0, onclick: () => SJ.EditorSheets.metaSheet('title') });
    saveEl = h('span', { class: 'savestate', role: 'status' });
    undoBtn = UI.ibtn('undo', t('되돌리기'), () => E.undo(), { noLabel: true });
    redoBtn = UI.ibtn('redo', t('다시 실행'), () => E.redo(), { noLabel: true });
    alignBtn = UI.ibtn('align', t('정렬'), () => SJ.EditorSheets.alignPopover(alignBtn));
    const top = h('div', { class: 'topbar' }, [
      UI.ibtn('back', t('목록'), () => SJ.App.back(), { noLabel: true }), titleEl, saveEl, undoBtn, redoBtn, alignBtn,
      UI.ibtn('more', t('더보기'), () => SJ.EditorTools.moreMenu(), { noLabel: true })
    ]);
    stage = h('div', { class: 'editor-stage' });
    track = h('div', { class: 'pager-track' });
    edgeL = h('div', { class: 'edge-glow l' }); edgeR = h('div', { class: 'edge-glow r' });
    floatBtn = h('button', { class: 'float-input hidden', html: SJ.icon('edit') + '<span>' + U.esc(t('입력')) + '</span>', onclick: () => E.enterFocusFromSel() });
    hintEl = h('div', { class: 'hint hidden' });
    stage.append(track, edgeL, edgeR, floatBtn, hintEl);
    pageLbl = h('span', { class: 'pn' });
    const pagebar = h('div', { class: 'pagebar' }, [
      UI.ibtn('left', t('이전 쪽'), () => E.goPage(E.page - 1), { noLabel: true }), pageLbl,
      UI.ibtn('right', t('다음 쪽'), () => E.goPage(E.page + 1), { noLabel: true }),
      UI.ibtn('plus', t('쪽 추가'), () => SJ.EditorTools.addPage(), { noLabel: false })
    ]);
    ctxbar = h('div', { class: 'ctxbar hidden' });
    toolbar = h('div', { class: 'toolbar' });
    root.append(top, stage, pagebar, ctxbar, toolbar);
    container.appendChild(root);
    SJ.EditorGestures.attach(stage, E);
    window.addEventListener('resize', () => { if (!root.classList.contains('hidden')) E.renderPages(true); });
    return root;
  };

  E.el = () => ({ root, stage, track, ctxbar, toolbar, floatBtn, hintEl, edgeL, edgeR });

  E.open = async function (scoreId, opts) {
    const r = await SJ.Storage.loadScore(scoreId);
    if (!r) { UI.alert(t('악보를 열 수 없어요'), t('파일이 손상되어 열 수 없어요. 원본은 안전하게 따로 보관했어요.')); return false; }
    Store.open(r.score, { readonly: r.status === 'readonly' });
    if (r.status === 'repaired') UI.toast(t('일부를 복구했어요'));
    if (r.status === 'recovered') UI.toast(t('최근 기록에서 되살렸어요'));
    E.page = (opts && opts.page) || 0; E.sel = null; E.tool = 'select'; E.zoom = 1; svgCache = {};
    if (unsub) unsub();
    unsub = Store.on(why => E.onStore(why));
    root.classList.remove('hidden');
    E.relayout();
    SJ.EditorTools.drawToolbar();
    E.updateTop();
    // 집중 모드 임시 저장 복구 (§8-3)
    const d = await SJ.Storage.loadDraft(scoreId);
    if (d && d.measureId) {
      const mi = Store.score.measures.findIndex(m => m.id === d.measureId);
      if (mi >= 0 && await UI.confirm(t('작업 중이던 마디를 복구할까요?'), t('{n}번째 마디를 입력하다가 앱이 닫혔어요.', { n: mi + 1 }), { ok: t('복구하기'), cancel: t('버리기') })) {
        SJ.Focus.open(mi, d.staffId, { draft: d });
      } else await SJ.Storage.clearDraft(scoreId);
    }
    if (!SJ.Settings.get('focusHintSeen')) E.hint(t('마디를 두 번 톡톡 → 그 마디 입력'), 6000, () => SJ.Settings.set('focusHintSeen', true));
    return true;
  };

  E.close = async function () {
    await Store.flush();
    if (unsub) { unsub(); unsub = null; }
    root.classList.add('hidden');
    track.innerHTML = ''; slots = []; svgCache = {};
    Store.score = null;
  };
  E.isOpen = () => !root.classList.contains('hidden');

  E.onStore = function (why) {
    if (why === 'saveState') { E.updateSave(); return; }
    E.relayout();
    E.updateTop();
  };

  E.relayout = function () {
    const s = Store.score;
    if (!s) return;
    E.L = SJ.Layout.layout(s);
    E.version++;
    svgCache = {};
    if (E.page >= E.L.pages.length) E.page = E.L.pages.length - 1;
    E.renderPages(true);
    SJ.EditorTools.drawCtx();
    if (E.L.alignInfo && E.L.alignInfo.reduced && !E._reducedShown) {
      E._reducedShown = true;
      UI.toast(t('줄당 마디가 안 들어가는 곳이 있어 {n}마디로 맞췄어요', { n: E.L.alignInfo.n }));
    }
  };

  E.updateTop = function () {
    const s = Store.score; if (!s) return;
    titleEl.textContent = s.meta.title || t('제목 없음');
    undoBtn.disabled = !Store.canUndo(); redoBtn.disabled = !Store.canRedo();
    const ag = s.layout.alignGrid || {};
    alignBtn.classList.toggle('on', !!ag.enabled);
    alignBtn.querySelector('.lbl').textContent = ag.enabled ? t('정렬 ✓') : t('정렬');
    E.updateSave();
  };
  E.updateSave = function () {
    const st = Store.readonly ? 'ro' : Store.saveState;
    saveEl.className = 'savestate' + (st === 'saved' ? ' ok' : st === 'error' ? ' err' : '');
    // 좁은 화면에서 제목을 가리지 않게: 저장됨은 ✓ 하나 (문제가 있을 때만 글자로)
    saveEl.textContent = st === 'saved' ? '✓' : st === 'saving' || st === 'dirty' ? '…' : st === 'ro' ? t('읽기 전용') : t('저장 실패');
    saveEl.title = saveEl.ariaLabel = st === 'saved' ? t('저장됨') : st === 'saving' || st === 'dirty' ? t('저장 중') : saveEl.textContent;
  };

  // ── 쪽 그리기 ──
  E.stageSize = () => ({ w: stage.clientWidth, h: stage.clientHeight });
  E.renderPages = function (force) {
    if (!E.L) return;
    const { w, h: H } = E.stageSize();
    const n = E.L.pages.length;
    if (force || slots.length !== n) {
      track.innerHTML = '';
      slots = [];
      for (let i = 0; i < n; i++) {
        const slot = h('div', { class: 'page-slot', style: { width: w + 'px' } });
        track.appendChild(slot);
        slots.push({ el: slot, drawn: -1 });
      }
    }
    slots.forEach(s => { s.el.style.width = w + 'px'; });
    E.setTrack(-E.page * w, false);
    for (let i = 0; i < n; i++) {
      if (Math.abs(i - E.page) <= 1) drawSlot(i, w, H);
      else if (slots[i].drawn !== -1) { slots[i].el.innerHTML = ''; slots[i].drawn = -1; }
    }
    pageLbl.textContent = (E.page + 1) + ' / ' + n;
    E.drawOverlay();
  };
  function drawSlot(i, w, H) {
    const s = slots[i];
    if (s.drawn === E.version && s.w === w && s.h === H) return;
    const p = E.L.pages[i];
    const pad = 14;
    const scale = Math.min((w - pad * 2) / p.w, (H - pad * 2) / p.h);
    const pw = p.w * scale, ph = p.h * scale;
    if (!svgCache[i]) svgCache[i] = SJ.SvgRender.page(p, { screen: true, cls: 'score' });
    s.el.innerHTML = '';
    const paper = h('div', { class: 'page-paper', style: { width: pw + 'px', height: ph + 'px' } });
    paper.innerHTML = svgCache[i] + '<svg class="overlay" viewBox="0 0 ' + p.w + ' ' + p.h + '"></svg>';
    paper.dataset.page = i;
    s.el.appendChild(paper);
    s.drawn = E.version; s.w = w; s.h = H; s.paper = paper; s.scale = scale;
    if (i === E.page) applyZoom();
  }
  E.paperOf = i => slots[i] && slots[i].paper;

  E.setTrack = function (x, anim) {
    track.style.transition = anim && !U.reducedMotion() ? 'transform .18s cubic-bezier(.2,.7,.3,1)' : 'none';
    track.style.transform = 'translate3d(' + x + 'px,0,0)';
  };
  E.goPage = function (i, opts) {
    if (!E.L) return;
    const n = E.L.pages.length;
    if (i < 0 || i >= n) { E.edge(i < 0 ? 'l' : 'r'); E.setTrack(-E.page * E.stageSize().w, true); return false; }
    E.resetZoom();
    E.page = i;
    E.setTrack(-i * E.stageSize().w, !(opts && opts.instant));
    setTimeout(() => E.renderPages(false), 190);
    pageLbl.textContent = (E.page + 1) + ' / ' + n;
    return true;
  };
  E.edge = function (side) {
    SJ.Platform.haptic('edge');
    const el = side === 'l' ? edgeL : edgeR;
    el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 260);
  };

  // ── 확대 ──
  function applyZoom() {
    const s = slots[E.page]; if (!s || !s.paper) return;
    s.paper.style.transform = E.zoom === 1 ? '' : 'translate(' + E.panX + 'px,' + E.panY + 'px) scale(' + E.zoom + ')';
  }
  E.applyZoom = applyZoom;
  E.resetZoom = function () { E.zoom = 1; E.panX = 0; E.panY = 0; applyZoom(); };
  E.clampPan = function () {
    const s = slots[E.page]; if (!s || !s.paper) return;
    const pw = s.paper.offsetWidth, ph = s.paper.offsetHeight;
    const maxX = 0, minX = -(pw * E.zoom - pw), maxY = 0, minY = -(ph * E.zoom - ph);
    const { w, h: H } = E.stageSize();
    const slackX = Math.max(0, (w - pw) / 2), slackY = Math.max(0, (H - ph) / 2);
    E.panX = U.clamp(E.panX, minX - slackX, maxX + slackX);
    E.panY = U.clamp(E.panY, minY - slackY, maxY + slackY);
  };

  // 화면 좌표 → 쪽 mm 좌표
  E.toPage = function (cx, cy) {
    const s = slots[E.page]; if (!s || !s.paper) return null;
    const r = s.paper.getBoundingClientRect();
    const p = E.L.pages[E.page];
    return { x: (cx - r.left) / r.width * p.w, y: (cy - r.top) / r.height * p.h, page: E.page };
  };
  E.fromPage = function (x, y) {
    const s = slots[E.page]; if (!s || !s.paper) return null;
    const r = s.paper.getBoundingClientRect(), sr = stage.getBoundingClientRect();
    const p = E.L.pages[E.page];
    return { x: r.left - sr.left + x / p.w * r.width, y: r.top - sr.top + y / p.h * r.height };
  };

  // 누른 자리의 대상: 작은 것 우선, 마디(낮은 우선순위)는 마지막
  E.hitAt = function (pt) {
    if (!pt) return null;
    const hits = E.L.pages[pt.page].hits;
    let best = null, bestA = 1e9, low = null;
    hits.forEach(hh => {
      if (pt.x < hh.x0 || pt.x > hh.x1 || pt.y < hh.y0 || pt.y > hh.y1) return;
      const a = (hh.x1 - hh.x0) * (hh.y1 - hh.y0);
      if (hh.low) { if (!low) low = hh; return; }
      if (a < bestA) { best = hh; bestA = a; }
    });
    return best ? best.ref : (low ? low.ref : null);
  };
  // 가장 가까운 마디(빈 곳을 눌러도)
  E.measureNear = function (pt) {
    let best = null, bd = 1e9;
    Object.keys(E.L.measureBox).forEach(mi => {
      const b = E.L.measureBox[mi];
      if (b.page !== pt.page) return;
      const dx = pt.x < b.x0 ? b.x0 - pt.x : pt.x > b.x1 ? pt.x - b.x1 : 0;
      const dy = pt.y < b.y0 ? b.y0 - pt.y : pt.y > b.y1 ? pt.y - b.y1 : 0;
      const d = dx * 2 + dy;
      if (d < bd) { bd = d; best = Number(mi); }
    });
    return bd < 14 ? best : null;
  };
  // 마디 안 x 에 가장 가까운 열의 틱
  E.tickAt = function (mi, x) {
    const b = E.L.measureBox[mi];
    if (!b || !b.segX.length) return 0;
    let best = b.segX[0], bd = 1e9;
    b.segX.forEach(s => { const d = Math.abs(s.x - x); if (d < bd) { bd = d; best = s; } });
    return best.tick;
  };

  // ── 선택 표시 ──
  E.select = function (sel) {
    E.sel = sel;
    E.drawOverlay();
    SJ.EditorTools.drawCtx();
  };
  E.drawOverlay = function () {
    const s = slots[E.page]; if (!s || !s.paper || !E.L) return;
    const ov = s.paper.querySelector('svg.overlay');
    let body = '';
    const sel = E.sel;
    // 박 부족·초과 마디 표시 (저장은 막지 않음 — 표시만)
    const sc = Store.score;
    Object.keys(E.L.measureBox).forEach(mi => {
      const b = E.L.measureBox[mi];
      if (b.page !== E.page) return;
      const f = SJ.Score.measureFill(sc, Number(mi));
      if (f.status !== 0 && f.per.length) body += '<circle class="warn-dot" cx="' + (b.x1 - 1.4) + '" cy="' + (b.y0 - 1.2) + '" r="0.9"/>';
    });
    if (sel && (sel.type === 'measure')) {
      const a = Math.min(sel.mi0, sel.mi1), z = Math.max(sel.mi0, sel.mi1);
      for (let mi = a; mi <= z; mi++) {
        const b = E.L.measureBox[mi];
        if (!b || b.page !== E.page) continue;
        let y0 = b.y0, y1 = b.y1;
        if (sel.staffId && a === z && sel.single) { const k = SJ.LayoutSystem.contexts(sc).staves.findIndex(x => x.id === sel.staffId); if (k >= 0) { y0 = b.staffTops[k] - 1; y1 = b.staffTops[k] + E.L.spMm * 4 + 1; } }
        body += '<rect class="' + (a === z ? 'sel-measure' : 'sel-range') + '" x="' + b.x0 + '" y="' + y0 + '" width="' + (b.x1 - b.x0) + '" height="' + (y1 - y0) + '" rx="1"/>';
      }
    } else if (sel && sel.eventId) {
      const e = E.L.eventPos[sel.eventId];
      if (e && e.page === E.page) body += '<rect class="sel-note" x="' + (e.x - 0.8) + '" y="' + (e.y0 - 0.8) + '" width="' + (e.w + 1.6) + '" height="' + (e.y1 - e.y0 + 1.6) + '" rx="1"/>';
    }
    if (E.flashMi !== undefined) {
      const b = E.L.measureBox[E.flashMi];
      if (b && b.page === E.page) body += '<rect class="flash" x="' + b.x0 + '" y="' + b.y0 + '" width="' + (b.x1 - b.x0) + '" height="' + (b.y1 - b.y0) + '" rx="1"/>';
    }
    ov.innerHTML = body;
    positionFloat();
  };
  function positionFloat() {
    const sel = E.sel;
    if (!sel || sel.type !== 'measure' || sel.mi0 !== sel.mi1 || E.tool !== 'select') { floatBtn.classList.add('hidden'); return; }
    const b = E.L.measureBox[sel.mi0];
    if (!b || b.page !== E.page) { floatBtn.classList.add('hidden'); return; }
    const p = E.fromPage((b.x0 + b.x1) / 2, b.y0 - 2);
    if (!p) return;
    floatBtn.style.left = U.clamp(p.x, 60, stage.clientWidth - 60) + 'px';
    floatBtn.style.top = Math.max(48, p.y) + 'px';
    floatBtn.classList.remove('hidden');
  }
  E.flash = function (mi) {
    E.flashMi = mi;
    const b = E.L.measureBox[mi];
    if (b && b.page !== E.page) E.goPage(b.page, { instant: true });
    E.drawOverlay();
    setTimeout(() => { E.flashMi = undefined; E.drawOverlay(); }, 1200);
  };

  E.hint = function (text, ms, onClose) {
    hintEl.innerHTML = '';
    hintEl.append(h('span', { text }), h('button', { class: 'x', text: '×', 'aria-label': t('닫기'), onclick: () => { hintEl.classList.add('hidden'); if (onClose) onClose(); } }));
    hintEl.classList.remove('hidden');
    clearTimeout(E._hintT);
    if (ms) E._hintT = setTimeout(() => { hintEl.classList.add('hidden'); if (onClose) onClose(); }, ms);
  };
  E.hideHint = function () { hintEl.classList.add('hidden'); };

  // ── 되돌리기 ──
  E.undo = function () { const l = Store.doUndo(); if (l) UI.toast(t('되돌렸어요: {l}', { l })); };
  E.redo = function () { const l = Store.doRedo(); if (l) UI.toast(t('다시 했어요: {l}', { l })); };
  // 바꾸고 알림 (되돌리기 단추 포함)
  E.apply = function (label, fn, quiet) {
    const ok = Store.apply(label, fn);
    if (ok && !quiet) UI.toast(label, { action: { label: t('되돌리기'), fn: () => E.undo() } });
    return ok;
  };

  E.enterFocusFromSel = function () {
    const sel = E.sel;
    if (!sel) return;
    const mi = sel.type === 'measure' ? Math.min(sel.mi0, sel.mi1) : sel.mi;
    const staffId = sel.staffId || Store.score.staves[0].id;
    SJ.Focus.open(mi, staffId, { eventId: sel.eventId });
  };

  E.currentMeasure = function () {
    if (E.sel && E.sel.type === 'measure') return Math.min(E.sel.mi0, E.sel.mi1);
    if (E.sel && E.sel.mi !== undefined) return E.sel.mi;
    const ids = Object.keys(E.L.measureBox).filter(mi => E.L.measureBox[mi].page === E.page).map(Number);
    return ids.length ? ids[0] : 0;
  };

  SJ.Editor = E;
})(window.SJ = window.SJ || {});
