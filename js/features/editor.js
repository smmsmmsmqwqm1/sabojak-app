/* 편집 화면 (§7-3): 페이지 뷰 · 상단 막대 · 쪽 이동 · 선택 · 자동 저장 표시. 도구 막대는 editorTools.js */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store;
  const E = { L: null, page: 0, tool: 'select', sel: null, clip: null, zoom: 1, panX: 0, panY: 0, version: 0 };
  let root, stage, track, titleEl, saveEl, undoBtn, redoBtn, alignBtn, pageLbl, ctxbar, toolbar, floatBtn, hintEl, edgeL, edgeR;
  let slots = [], svgCache = {}, unsub = null, pagebarEl = null;

  E.mount = function (container) {
    root = h('div', { class: 'view hidden', id: 'editor' });
    titleEl = h('div', { class: 'title', role: 'button', tabindex: 0, onclick: () => SJ.EditorSheets.metaSheet('title') });
    saveEl = h('span', { class: 'savestate', role: 'status' });
    // 위 막대: 뒤로 · 제목 · 저장 표시 · 되돌리기 · ⋯ (다시 실행 · 정렬 · 보기 바꾸기 · 내보내기 … 는 ⋯ 안)
    undoBtn = UI.ibtn('undo', t('되돌리기'), () => E.undo(), { noLabel: true });
    redoBtn = { disabled: false };
    alignBtn = null;
    const top = h('div', { class: 'topbar' }, [
      UI.ibtn('back', t('목록'), () => SJ.App.back(), { noLabel: true }), titleEl, saveEl, undoBtn,
      UI.ibtn('more', t('더보기'), () => SJ.EditorTools.moreMenu(), { noLabel: true })
    ]);
    stage = h('div', { class: 'editor-stage' });
    track = h('div', { class: 'pager-track' });
    edgeL = h('div', { class: 'edge-glow l' }); edgeR = h('div', { class: 'edge-glow r' });
    floatBtn = h('button', { class: 'float-input hidden', html: SJ.icon('edit') + '<span>' + U.esc(t('입력')) + '</span>', onclick: () => E.enterFocusFromSel() });
    hintEl = h('div', { class: 'hint hidden' });
    stage.append(track, edgeL, edgeR, floatBtn, hintEl);
    pageLbl = h('span', { class: 'pn' });
    const pagebar = pagebarEl = h('div', { class: 'pagebar' }, [
      UI.ibtn('left', t('이전 쪽'), () => E.goPage(E.page - 1), { noLabel: true }), pageLbl,
      UI.ibtn('right', t('다음 쪽'), () => E.goPage(E.page + 1), { noLabel: true }),
      h('span', { class: 'addpage' }, [UI.ibtn('plus', t('쪽 추가'), () => SJ.EditorTools.addPage(), { noLabel: false })])
    ]);
    ctxbar = h('div', { class: 'ctxbar hidden' });
    toolbar = h('div', { class: 'toolbar' });
    root.append(top, stage, pagebar, ctxbar, toolbar);
    container.appendChild(root);
    SJ.EditorGestures.attach(stage, E);
    // 화면 크기가 바뀌면: 흘림 보기는 다시 배치(줄 길이가 화면 폭), 쪽 보기는 다시 맞춤
    let lastW = 0, lastH = 0;
    const onResize = () => {
      if (root.classList.contains('hidden') || !Store.score) return;
      const w = stage.clientWidth, H = stage.clientHeight;
      if (w === lastW && H === lastH) return;
      lastW = w; lastH = H;
      // 흘림이면(또는 돌려서 보기가 바뀌면) 다시 배치 — 보던 마디는 그대로 보여 준다
      if (E.isFlow() || !!(E.L && E.L.flow) !== E.isFlow()) { const keep = E.L ? E.currentMeasure() : 0; E.relayout(); E.showMeasure(keep, { top: !E.sel }); }
      else E.renderPages(true);
    };
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(stage); else window.addEventListener('resize', onResize);
    return root;
  };

  E.el = () => ({ root, stage, track, ctxbar, toolbar, floatBtn, hintEl, edgeL, edgeR });

  E.open = async function (scoreId, opts) {
    const r = await SJ.Storage.loadScore(scoreId);
    if (r && r.tooNew) { UI.alert(t('앱을 최신 버전으로 업데이트해 주세요'), t('이 악보는 더 새로운 버전의 사보작에서 만들어졌어요. 파일은 그대로 두었어요.')); return false; }
    if (!r) { UI.alert(t('악보를 열 수 없어요'), t('파일이 손상되어 열 수 없어요. 원본은 안전하게 따로 보관했어요.')); return false; }
    Store.open(r.score, { readonly: r.status === 'readonly' });
    if (r.status === 'repaired') UI.toast(t('일부를 복구했어요'));
    if (r.status === 'recovered') UI.toast(t('최근 기록에서 되살렸어요'));
    E.page = (opts && opts.page) || 0; E.sel = null; E.tool = 'select'; E.zoom = 1; E.forcePage = false; svgCache = {};
    if (unsub) unsub();
    unsub = Store.on(why => E.onStore(why));
    root.classList.remove('hidden');
    E.flowZoom = SJ.Settings.get('flowZoom') || 1;
    track.scrollTop = 0;
    E.relayout();
    SJ.EditorTools.drawToolbar();
    E.updateTop();
    // 집중 모드 임시 저장 복구 (§8-3)
    const d = await SJ.Storage.loadDraft(scoreId);
    if (d && d.measureId) {
      const mi = Store.score.measures.findIndex(m => m.id === d.measureId);
      // 되살릴 것이 없으면(그린 잉크 없음 · 마디 내용이 이미 저장된 것과 같음) 묻지 않고 지운다 — 옛 임시 저장이 새 내용을 덮지 않게(점검원 ⑥ 해소 확인)
      const same = mi >= 0 && !(d.ink && d.ink.length) && JSON.stringify(d.measure) === JSON.stringify(Store.score.measures[mi]);
      if (same) await SJ.Storage.clearDraft(scoreId);
      else if (mi >= 0 && await UI.confirm(t('작업 중이던 마디를 복구할까요?'), t('{n}번째 마디를 입력하다가 앱이 닫혔어요.', { n: mi + 1 }), { ok: t('복구하기'), cancel: t('버리기') })) {
        SJ.Focus.open(mi, d.staffId, { draft: d });
      } else await SJ.Storage.clearDraft(scoreId);
    }
    if (!SJ.Settings.get('focusHintSeen')) E.hint(t('마디를 두 번 톡톡 → 그 마디 입력'), 6000, () => SJ.Settings.set('focusHintSeen', true));
    return true;
  };

  // 닫기 → 저장이 안 되면 닫지 않고 붙잡는다(나가면 사라진다는 것을 알리고 고르게) · 닫았으면 true
  E.close = async function () {
    for (;;) {
      if (await Store.flush()) break;
      const v = await UI.choose(t('저장하지 못했어요'), t('저장 공간이 부족하거나 기기가 잠시 막혔을 수 있어요. 지금 나가면 마지막 저장 뒤에 고친 것이 사라져요.'),
        [{ label: t('다시 저장해 보기'), value: 'retry', kind: 'primary' }, { label: t('악보에 머물기'), value: 'stay' }, { label: t('저장하지 않고 나가기'), value: 'leave', kind: 'danger' }]);
      if (v === 'leave') break;
      if (v !== 'retry') return false;
    }
    // 쓰던 도구(가사 · 표현 등)도 함께 끝낸다 — 다음 악보에 막대가 남거나 뒤로가 헛돌지 않게(점검원 ③ 11-02)
    try { if (SJ.LyricsTool && SJ.LyricsTool.stop) SJ.LyricsTool.stop(); } catch (e) { /* 무시 */ }
    try { if (SJ.EditorTools && SJ.EditorTools.setTool) SJ.EditorTools.setTool('select'); } catch (e) { /* 무시 */ }
    if (unsub) { unsub(); unsub = null; }
    root.classList.add('hidden');
    track.innerHTML = ''; slots = []; svgCache = {};
    Store.score = null;
    return true;
  };
  E.isOpen = () => !root.classList.contains('hidden');

  E.onStore = function (why) {
    if (why === 'saveState') { E.updateSave(); return; }
    // 되돌리기 등으로 마디가 줄었으면, 없어진 마디를 고른 채로 두지 않는다([입력]이 없는 마디를 열던 오류 · 점검원 ③ 11-02)
    const n = Store.score ? Store.score.measures.length : 0;
    if (E.sel && ((E.sel.mi0 !== undefined && E.sel.mi0 >= n) || (E.sel.mi1 !== undefined && E.sel.mi1 >= n) || (E.sel.mi !== undefined && E.sel.mi >= n))) E.sel = null;
    E.relayout();
    E.updateTop();
  };

  /* 보기: '흘림'(화면 폭에 맞춰 줄을 다시 배치 — 폰 세로의 기본, 오선이 큼) / '쪽'(인쇄 모양 그대로 — 넓은 화면의 기본 · 인쇄 미리보기)
   * 설정 editView: 'auto' | 'flow' | 'page'. 저장된 악보 배치(인쇄)는 어느 보기에서도 바뀌지 않는다 */
  // 기기 기본: 화면의 짧은 쪽이 700 미만(폰 — 세로든 가로든)이면 흘림. 화면을 돌려도 같은 보기
  E.autoFlow = function () {
    // 높이에는 쪽 막대를 더한다 — 흘림에서는 막대가 숨어 칸이 커지므로, 안 더하면 650~700px 화면에서 두 보기가 끝없이 번갈아 바뀜(점검원 11-02)
    const w = stage.clientWidth, H = stage.clientHeight + (pagebarEl ? pagebarEl.offsetHeight : 0);
    return w > 0 && Math.min(w, H || w) < 700;
  };
  E.isFlow = function () {
    if (E.forcePage) return false;               // 글(텍스트) 도구는 쪽 보기에서
    const v = SJ.Settings.get('editView') || 'auto';
    if (v === 'flow') return true;
    if (v === 'page') return false;
    return E.autoFlow();
  };
  // 흘림 보기 = 세로로 긴 종이 한 장(줄을 위아래로 이어 붙임) · 위아래로 끌어 스크롤 · 두 손가락 = 오선 크기(E.flowZoom)
  E.flowZoom = 1;
  function flowLayout(s) {
    const w = Math.max(240, track.clientWidth || stage.clientWidth), H = Math.max(160, stage.clientHeight);
    const margin = Math.round(Math.min(w, H) * 0.04);
    // 칸 크기: 폰 375px ≈ 11px(쪽 보기의 약 2.3배) · 넓을수록 크게, 15px까지 · 낮은 화면(가로 폰)은 한 줄 전체가 들어가게 —
    // 한 줄 높이 = 보표마다 4칸 + 보표 사이 6칸 + 위아래 여유 8칸(대보표 2개면 22칸 · 예전 '12칸 고정'은 피아노 아래 보표가 잘렸음 · 점검원 ③ 11-02)
    const nSt = Math.max(1, (SJ.Score.visibleStaves ? SJ.Score.visibleStaves(s) : s.staves).length);
    const rows = Math.max(12, 4 * nSt + 7 * (nSt - 1) + 8);   // (묶음 없는 보표 사이는 7칸 · 점검원 ③ 해소 확인)
    const base = Math.max(5, Math.min(15, w / 33, (H - 2 * margin) / rows));
    // 두 손가락으로 키운 만큼(한 줄이 화면 높이를 넘지 않게 · 한 줄에 한 마디는 들어가게)
    const sp = Math.max(5, Math.min(base * E.flowZoom, (H - 2 * margin) / rows * 1.0001, w / 16, 26));
    // 제목 칸(인쇄용 · mm 크기)은 쪽 보기에서만 — 흘림 보기에서는 제목이 위 막대에 있고 톡 해서 고친다. 줄은 자연 간격으로(쪽 높이에 맞춰 벌리지 않음)
    // 쪽 높이를 끝없이 두어 모든 줄을 한 장에 놓고, 마지막 줄 아래에서 종이를 자른다(빈 종이 없이 · 화면보다 짧으면 화면 높이)
    const L = SJ.Layout.layout(s, { pageW: w, pageH: 1e7, margins: { top: margin, bottom: margin, left: margin, right: margin }, staffSize: sp * 4,
      titleBlock: false, pageNumbers: false, noJustify: true, ignoreBreaks: true, textScale: sp / (s.page.staffSize / 4) });
    const p = L.pages[0];
    let bottom = 0;
    L.systems.forEach(sy => { bottom = Math.max(bottom, sy.y + sy.bottom * sp); });
    p.hits.forEach(hh => { if (hh.y1 < 1e6) bottom = Math.max(bottom, hh.y1); });
    p.h = Math.max(H, Math.ceil(bottom + margin * 2));
    L.pages.length = 1;
    return L;
  }
  E.relayout = function () {
    const s = Store.score;
    if (!s) return;
    const flow = E.isFlow();
    root.classList.toggle('flow', flow);           // 먼저 — 흘림의 줄 길이는 스크롤 칸의 안쪽 폭
    E.L = flow ? flowLayout(s) : SJ.Layout.layout(s);
    E.L.flow = flow;
    E.version++;
    svgCache = {};
    if (E.page >= E.L.pages.length) E.page = E.L.pages.length - 1;
    E.renderPages(true);
    SJ.EditorTools.drawCtx();
    SJ.EditorTools.drawToolbar();
    if (!flow && E.L.alignInfo && E.L.alignInfo.reduced && !E._reducedShown) {
      E._reducedShown = true;
      UI.toast(t('줄당 마디가 안 들어가는 곳이 있어 {n}마디로 맞췄어요', { n: E.L.alignInfo.n }));
    }
  };

  E.updateTop = function () {
    const s = Store.score; if (!s) return;
    titleEl.textContent = s.meta.title || t('제목 없음');
    undoBtn.disabled = !Store.canUndo();
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
    const keepTop = track.scrollTop;               // 흘림: 다시 그려도 보던 곳 그대로
    if (force || slots.length !== n) {
      track.innerHTML = '';
      slots = [];
      for (let i = 0; i < n; i++) {
        const slot = h('div', { class: 'page-slot', style: { width: w + 'px' } });
        track.appendChild(slot);
        slots.push({ el: slot, drawn: -1 });
      }
    }
    // 흘림: 종이 한 장이 스크롤 칸 폭 그대로(넘김 없음) / 쪽: 화면 폭 칸을 가로로 늘어놓고 넘긴다
    const sw = E.L.flow ? (track.clientWidth || w) : w;
    slots.forEach(s => { s.el.style.width = sw + 'px'; });
    if (E.L.flow) { track.style.transition = 'none'; track.style.transform = ''; }
    else E.setTrack(-E.page * w, false);
    for (let i = 0; i < n; i++) {
      if (Math.abs(i - E.page) <= 1) drawSlot(i, sw, H);
      else if (slots[i].drawn !== -1) { slots[i].el.innerHTML = ''; slots[i].drawn = -1; }
    }
    if (E.L.flow) track.scrollTop = keepTop;
    pageLbl.textContent = (E.page + 1) + ' / ' + n;
    // 흘림 보기: 종이 그림자 · 둥근 모서리 없이 화면이 곧 종이 · 쪽 막대 없음 / '쪽 추가'는 인쇄 쪽 개념이라 쪽 보기에서만
    root.classList.toggle('flow', !!E.L.flow);
    E.drawOverlay();
  };
  function drawSlot(i, w, H) {
    const s = slots[i];
    if (s.drawn === E.version && s.w === w && s.h === H) return;
    const p = E.L.pages[i];
    const pad = E.L.flow ? 0 : 14;                 // 흘림 보기는 화면이 곧 종이
    const scale = E.L.flow ? w / p.w : Math.min((w - pad * 2) / p.w, (H - pad * 2) / p.h);
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
    if (E.L.flow) return i === 0;                  // 흘림 보기는 한 장(넘김 없음 — 위아래 스크롤)
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
    return bd < 8 * E.L.spMm ? best : null;
  };
  // 실제로 마디(오선 영역) 위를 눌렀을 때만 그 마디 — 줄 사이 · 여백의 빈 종이는 null (보기만 하려는 톡이 입력으로 바뀌지 않게)
  E.measureAt = function (pt) {
    const tol = E.L.spMm * 0.8;
    let found = null;
    Object.keys(E.L.measureBox).forEach(mi => {
      const b = E.L.measureBox[mi];
      if (b.page !== pt.page) return;
      if (pt.x >= b.x0 && pt.x <= b.x1 && pt.y >= b.y0 - tol && pt.y <= b.y1 + tol) found = Number(mi);
    });
    return found;
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
    const u = E.L.spMm;          // 오선 한 칸 (쪽 보기 = mm, 흘림 보기 = px) — 표시 크기는 칸 기준으로
    // 박 부족·초과 마디 표시 (저장은 막지 않음 — 표시만)
    const sc = Store.score;
    Object.keys(E.L.measureBox).forEach(mi => {
      const b = E.L.measureBox[mi];
      if (b.page !== E.page) return;
      const f = SJ.Score.measureFill(sc, Number(mi));
      if (f.status !== 0 && f.per.length) body += '<circle class="warn-dot" cx="' + (b.x1 - 0.8 * u) + '" cy="' + (b.y0 - 0.7 * u) + '" r="' + (0.5 * u) + '"/>';
    });
    if (sel && (sel.type === 'measure')) {
      const a = Math.min(sel.mi0, sel.mi1), z = Math.max(sel.mi0, sel.mi1);
      for (let mi = a; mi <= z; mi++) {
        const b = E.L.measureBox[mi];
        if (!b || b.page !== E.page) continue;
        let y0 = b.y0, y1 = b.y1;
        if (sel.staffId && a === z && sel.single) { const k = SJ.LayoutSystem.contexts(sc).staves.findIndex(x => x.id === sel.staffId); if (k >= 0) { y0 = b.staffTops[k] - 0.6 * u; y1 = b.staffTops[k] + u * 4.6; } }
        body += '<rect class="' + (a === z ? 'sel-measure' : 'sel-range') + '" x="' + b.x0 + '" y="' + y0 + '" width="' + (b.x1 - b.x0) + '" height="' + (y1 - y0) + '" rx="' + (0.6 * u) + '"/>';
      }
    } else if (sel && sel.eventId) {
      const e = E.L.eventPos[sel.eventId];
      if (e && e.page === E.page) body += '<rect class="sel-note" x="' + (e.x - 0.45 * u) + '" y="' + (e.y0 - 0.45 * u) + '" width="' + (e.w + 0.9 * u) + '" height="' + (e.y1 - e.y0 + 0.9 * u) + '" rx="' + (0.6 * u) + '"/>';
    }
    if (E.flashMi !== undefined) {
      const b = E.L.measureBox[E.flashMi];
      if (b && b.page === E.page) body += '<rect class="flash" x="' + b.x0 + '" y="' + b.y0 + '" width="' + (b.x1 - b.x0) + '" height="' + (b.y1 - b.y0) + '" rx="' + (0.6 * u) + '"/>';
    }
    ov.innerHTML = body;
    positionFloat();
  };
  // (마디 위에 뜨던 [입력] 단추는 마디를 가려서 뺐다 — 아래 막대의 [음표 넣기]가 대신한다)
  function positionFloat() { floatBtn.classList.add('hidden'); }
  E.flash = function (mi) {
    E.flashMi = mi;
    E.reveal(E.L.measureBox[mi]);
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

  // 그 마디가 있는 쪽(화면)으로 · 흘림 보기는 그 줄이 보이게 스크롤(이미 보이면 그대로)
  E.showMeasure = function (mi, opts) {
    const b = E.L && E.L.measureBox[mi];
    if (b) E.reveal(b, opts);
  };
  // 상자 {page, y0, y1}(쪽 좌표)가 보이게 — opts.top: 그 줄을 위쪽에 두기(화면 크기가 바뀐 뒤 보던 자리 지키기)
  E.reveal = function (b, opts) {
    if (!E.L || !b) return;
    if (!E.L.flow) { if (b.page !== E.page) E.goPage(b.page, { instant: true }); return; }
    const s = slots[0]; if (!s || !s.paper) return;
    const sc = s.scale || 1, pad = E.L.spMm * 3 * sc;
    const y0 = b.y0 * sc - pad, y1 = b.y1 * sc + pad, H = track.clientHeight, top = track.scrollTop;
    let to = top;
    if (opts && opts.top) to = y0;
    else if (y0 < top) to = y0;
    else if (y1 > top + H) to = Math.min(y0, y1 - H);
    E.scrollTo(to, opts && opts.smooth);
  };
  E.scrollTo = function (y, smooth) {
    const max = Math.max(0, track.scrollHeight - track.clientHeight);
    y = U.clamp(y, 0, max);
    stopFling();
    if (smooth && !U.reducedMotion()) {
      const y0 = track.scrollTop, t0 = performance.now(), d = 220;
      const step = now => { const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3); track.scrollTop = y0 + (y - y0) * e; if (k < 1) flingRaf = requestAnimationFrame(step); else flingRaf = 0; };
      flingRaf = requestAnimationFrame(step);
    } else track.scrollTop = y;
  };
  // 손가락을 놓은 뒤 미끄러지듯 이어 가는 스크롤(관성) — 손동작은 editorGestures.js
  let flingRaf = 0;
  function stopFling() { if (flingRaf) { cancelAnimationFrame(flingRaf); flingRaf = 0; return true; } return false; }
  E.stopFling = stopFling;
  E.fling = function (v) {          // v = px/ms (아래로 끌면 +)
    stopFling();
    if (U.reducedMotion() || Math.abs(v) < 0.05) return;
    let last = performance.now();
    const step = now => {
      const dt = Math.min(40, now - last); last = now;
      const before = track.scrollTop;
      track.scrollTop = before - v * dt;
      v *= Math.pow(0.996, dt);                    // 약 0.35초에 반쯤 · 1초 남짓에 멈춤
      if (Math.abs(v) < 0.02 || track.scrollTop === before) { flingRaf = 0; return; }
      flingRaf = requestAnimationFrame(step);
    };
    flingRaf = requestAnimationFrame(step);
  };
  E.scrollBy = function (dy) { track.scrollTop += dy; };
  E.paperScale = () => (slots[0] && slots[0].scale) || 1;
  E.scrollTop = () => track.scrollTop;
  // 지금 보이는 곳의 '인쇄' 쪽 번호 (흘림 보기의 화면 조각 번호는 인쇄 쪽이 아니다)
  E.printPage = function () {
    if (!E.L || !E.L.flow) return E.page;
    const mi = E.currentMeasure();
    const P = SJ.Layout.layout(Store.score);
    const b = P.measureBox[mi];
    return b ? b.page : 0;
  };
  E.currentMeasure = function () {
    if (E.sel && E.sel.type === 'measure') return Math.min(E.sel.mi0, E.sel.mi1);
    if (E.sel && E.sel.mi !== undefined) return E.sel.mi;
    // 흘림 보기: 화면 맨 위에 보이는 줄의 첫 마디
    const sc = (slots[0] && slots[0].scale) || 1, top = E.L.flow ? track.scrollTop / sc : -1;
    const ids = Object.keys(E.L.measureBox).filter(mi => E.L.measureBox[mi].page === E.page && E.L.measureBox[mi].y1 > top).map(Number);
    return ids.length ? Math.min.apply(null, ids) : 0;
  };

  SJ.Editor = E;
})(window.SJ = window.SJ || {});
