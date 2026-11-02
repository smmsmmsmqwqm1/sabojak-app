/* ★ 마디 집중 모드 (§8): 그 마디 전용 입력 화면. 마디 복사본(draft)을 고치고 [✓ 확인] 때 한 번에 반영.
 * 매 입력마다 임시 저장(draft.json) → 앱이 꺼져도 복구. 집중 모드 안 되돌리기/다시 실행. */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store, S = SJ.Score, ME = SJ.MeasureEdit, FL = SJ.FocusLayout;
  const F = {};
  let root = null, stageEl, svgHost, ovEl, beatEl, fillBtn, carryEl, staffLbl, modeSeg, voiceSeg, grandBtn, ghostL, ghostR, ntool, candEl;
  let unBack = null, ro = null;

  F.st = null;   // 상태

  F.open = function (mi, staffId, opts) {
    opts = opts || {};
    const score = Store.score;
    if (!score) return;
    if (F.st) F.close();
    const d = opts.draft;
    const measure = d && d.measure ? U.clone(d.measure) : U.clone(score.measures[mi]);
    F.st = {
      mi, staffId: d ? d.staffId || staffId : staffId, vi: d ? d.vi || 0 : 0,
      measure, carry: d && d.carry ? d.carry : null, dirty: !!d,
      undo: [], redo: [],
      dur: { type: SJ.Settings.get('lastDur') || 'quarter', dots: 0 },
      accNext: null, tuplet: null, grace: false,
      sel: null, cursor: null,
      inputMode: SJ.Settings.get('inputMode') || 'tap',
      showAll: !!SJ.Settings.get('focusAllStaves'),
      openedAt: Date.now()
    };
    const v = ME.voice(F.st.measure, F.st.staffId, F.st.vi);
    F.st.cursor = v.events.length;
    if (opts.eventId) {
      const i = v.events.findIndex(e => e.id === opts.eventId);
      if (i >= 0) { F.st.sel = { ei: i, hi: 0 }; F.st.cursor = i + 1; }
    }
    if (!root) build();
    root.classList.remove('hidden');
    // 뒤로 = 넣고 나가기 (넣은 것은 사라지지 않는다 — 버리기는 ⋯ 안)
    const onBack = () => { unBack = null; F.confirm(false).then(() => { if (F.st && !unBack) unBack = UI.pushBack(onBack); }); };
    unBack = UI.pushBack(onBack);
    F.render();
    SJ.FocusInput.drawTools();
    if (d) {
      UI.toast(t('작업 중이던 마디를 되살렸어요'));
      if (d.ink && d.ink.length && SJ.Handwriting) { if (F.st.inputMode !== 'pen') F.setMode('pen'); SJ.Handwriting.restore(d.ink); }
    }
  };

  function build() {
    root = h('div', { class: 'focus hidden', role: 'dialog', 'aria-label': t('마디 입력') });
    /* 위 한 줄: [✓ 완료](넣고 나가기) · ◀ N마디 ▶(넣고 앞/뒤 마디) · 되돌리기 · ⋯
     * 아래 한 줄: 남은 박 · 쉼표로 채우기 · 이월 · [탭|손글씨]
     * 넣은 것은 사라지지 않는다(원칙 1): 나가기 = 저장, 버리기는 ⋯ 안에 */
    beatEl = h('div', { class: 'beat', role: 'status' });
    staffLbl = h('span', { class: 'cap' });
    const fbar = h('div', { class: 'fbar' }, [
      h('button', { class: 'btn soft compact done', html: SJ.icon('check') + '<span>' + U.esc(t('완료')) + '</span>', onclick: () => F.confirm(false) }),
      h('span', { class: 'grow' }),
      UI.ibtn('left', t('앞 마디'), () => F.go(-1), { noLabel: true }),
      staffLbl,
      UI.ibtn('right', t('다음 마디'), () => F.go(1), { noLabel: true }),
      h('span', { class: 'grow' }),
      UI.ibtn('undo', t('되돌리기'), () => F.undo(), { noLabel: true }),
      UI.ibtn('more', t('더보기'), () => F.more(), { noLabel: true })
    ]);
    fillBtn = h('button', { class: 'chip warn hidden', text: t('쉼표로 채우기'), onclick: () => SJ.FocusInput.fillRests() });
    carryEl = h('span', { class: 'chip hidden' });
    modeSeg = UI.seg([{ label: t('탭'), value: 'tap' }, { label: t('손글씨'), value: 'pen' }], 'tap', v => F.setMode(v));
    voiceSeg = { set: () => {} };
    grandBtn = null;
    const fsub = h('div', { class: 'fsub' }, [beatEl, fillBtn, carryEl, h('span', { class: 'grow' }), modeSeg]);
    stageEl = h('div', { class: 'fstage' });
    svgHost = h('div', { style: { position: 'absolute', inset: 0 } });
    ovEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ghostL = h('div', { class: 'ghost' }); ghostR = h('div', { class: 'ghost' });
    stageEl.append(svgHost, ghostL, ghostR, ovEl);
    candEl = h('div', { class: 'cands hidden' });
    ntool = h('div', { class: 'ntool' });
    root.append(fbar, fsub, stageEl, candEl, ntool);
    document.body.appendChild(root);
    SJ.FocusInput.attach(stageEl);
    if (window.ResizeObserver) { ro = new ResizeObserver(() => { if (F.st) F.render(); }); ro.observe(stageEl); }
    else window.addEventListener('resize', () => { if (F.st) F.render(); });
  }
  F.el = () => ({ root, stageEl, ntool, candEl, ovEl, svgHost });

  // 보일 보표 (함께 보기면 전체, 아니면 지금 보표)
  F.staffIds = function () {
    const vis = S.visibleStaves(Store.score).map(s => s.id);
    return F.st.showAll ? vis : [F.st.staffId];
  };
  // 화면용 악보: 현재 마디만 draft 로 바꿔 끼움
  F.viewScore = function () {
    const s = Object.assign({}, Store.score, { measures: Store.score.measures.slice() });
    s.measures[F.st.mi] = SJ.Handwriting && F.st.inputMode === 'pen' && SJ.Handwriting.hasInk() ? Object.assign({}, F.st.measure, { 'x-noPlaceholder': true }) : F.st.measure;
    return s;
  };

  F.render = function () {
    const st = F.st; if (!st) return;
    const w = stageEl.clientWidth, H = stageEl.clientHeight;
    if (w < 50 || H < 50) return;
    const ids = F.staffIds();
    let L;
    try { L = FL.layout(F.viewScore(), st.mi, { w, h: H, staffIds: ids }); }
    catch (e) { console.error(e); UI.toast(t('화면을 그리지 못했어요')); return; }
    F.L = L;
    svgHost.innerHTML = SJ.SvgRender.page({ w, h: H, items: L.items }, { screen: true });
    const svg = svgHost.querySelector('svg');
    svg.setAttribute('width', w); svg.setAttribute('height', H);
    // 앞뒤 마디는 흐리게
    if (L.prev) { ghostL.style.left = '0px'; ghostL.style.width = Math.max(0, L.prev.x1 - 4) + 'px'; ghostL.style.display = ''; } else ghostL.style.display = 'none';
    if (L.next) { ghostR.style.left = (L.next.x0 + 4) + 'px'; ghostR.style.width = Math.max(0, w - L.next.x0 - 4) + 'px'; ghostR.style.display = ''; } else ghostR.style.display = 'none';
    drawOverlay(w, H);
    // 막대 글자
    const k = L.staves.findIndex(s => s.id === st.staffId);
    const def = Store.score.staves.find(s => s.id === st.staffId);
    staffLbl.textContent = t('{n}마디', { n: st.mi + 1 }) + (Store.score.staves.length > 1 ? ' · ' + (def.name || t('보표 {n}', { n: Store.score.staves.indexOf(def) + 1 })) : '') + (st.vi ? ' · ' + t('성부 2') : '');
    modeSeg.set(st.inputMode);
    void k;
    F.updateBeat();
    if (SJ.Handwriting) SJ.Handwriting.sync();
  };

  // 박 보조선 · 커서 · 선택 · 지금 보표 띠
  function drawOverlay(w, H) {
    const st = F.st, L = F.L;
    ovEl.setAttribute('viewBox', '0 0 ' + w + ' ' + H);
    ovEl.setAttribute('width', w); ovEl.setAttribute('height', H);
    ovEl.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    let b = '';
    const k = L.staves.findIndex(s => s.id === st.staffId);
    const sp = L.spPx;
    const time = S.timeAt(F.viewScore(), st.mi);
    const unit = SJ.Dur.beatTicks(time);
    const top = L.staffTop[k];
    if (L.staves.length > 1) b += '<rect x="' + L.cur.x0 + '" y="' + (top - sp * 1.2) + '" width="' + (L.cur.x1 - L.cur.x0) + '" height="' + (sp * 6.4) + '" fill="rgba(124,140,222,.07)" rx="8"/>';
    // 박 구분 보조선 (옅게)
    for (let tk = unit; tk < L.cap; tk += unit) {
      const x = FL.tickToX(L, tk);
      L.staffTop.forEach(tp => { b += '<line x1="' + x + '" y1="' + (tp - sp * 0.6) + '" x2="' + x + '" y2="' + (tp + sp * 4.6) + '" stroke="rgba(124,140,222,.28)" stroke-width="1" stroke-dasharray="3 4"/>'; });
    }
    // 선택
    const v = ME.voice(st.measure, st.staffId, st.vi);
    if (st.sel && v.events[st.sel.ei]) {
      const e = L.events[v.events[st.sel.ei].id];
      if (e) b += '<rect x="' + (e.x - sp * 0.5) + '" y="' + (e.y0 - sp * 0.6) + '" width="' + (e.w + sp) + '" height="' + (e.y1 - e.y0 + sp * 1.2) + '" rx="6" fill="rgba(124,140,222,.22)" stroke="rgba(124,140,222,.8)"/>';
    }
    // 입력 커서
    const cx = F.cursorX();
    if (cx !== null && st.inputMode === 'tap') {
      b += '<line x1="' + cx + '" y1="' + (top - sp * 1.5) + '" x2="' + cx + '" y2="' + (top + sp * 5.5) + '" stroke="#EE9E73" stroke-width="2.5" stroke-linecap="round"/>';
      b += '<path d="M' + (cx - 6) + ' ' + (top - sp * 1.5 - 7) + 'l6 7 6-7z" fill="#EE9E73"/>';
    }
    ovEl.innerHTML = b;
  }
  F.cursorX = function () {
    const st = F.st, L = F.L;
    const v = ME.voice(st.measure, st.staffId, st.vi);
    const starts = ME.starts(v);
    if (st.cursor < v.events.length) {
      const e = L.events[v.events[st.cursor].id];
      return e ? e.x - L.spPx * 0.7 : null;
    }
    const tot = ME.total(v);
    if (tot >= L.cap && v.events.length) { const last = L.events[v.events[v.events.length - 1].id]; return last ? last.x + last.w + L.spPx * 0.8 : null; }
    void starts;
    return FL.tickToX(L, tot);
  };

  F.updateBeat = function () {
    const st = F.st;
    const v = ME.voice(st.measure, st.staffId, st.vi);
    const time = S.timeAt(F.viewScore(), st.mi);
    const cap = SJ.Dur.measureTicks(time);
    const info = ME.beatInfo(v, cap, time, st.measure.attrs.pickup);
    // 박 상태만 짧게 (박자표는 오선에 보임). 빈 마디는 중립 색
    const empty = !v.events.length;
    beatEl.className = 'beat ' + (empty ? '' : info.state === 'full' ? 'full' : info.state === 'over' ? 'over' : info.state === 'short' ? 'short' : '');
    beatEl.textContent = empty ? t('빈 마디') :
      info.state === 'full' ? t('꽉 찼어요 ✓') :
        info.state === 'over' ? t('{n}박 넘침', { n: info.text }) :
          t('남은 박 {n}', { n: info.text });
    fillBtn.classList.toggle('hidden', !(info.state === 'short' && v.events.length));
    if (st.carry && st.carry.events.length) { carryEl.textContent = t('다음 마디로 {n}개 이월', { n: st.carry.events.length }); carryEl.classList.remove('hidden'); }
    else carryEl.classList.add('hidden');
  };

  // ── 바꾸기 (되돌리기 기록 + 임시 저장) ──
  F.change = function (fn, opts) {
    const st = F.st;
    st.undo.push({ measure: U.clone(st.measure), carry: U.clone(st.carry), sel: st.sel, cursor: st.cursor });
    if (st.undo.length > 100) st.undo.shift();
    st.redo = [];
    st.measure = U.clone(st.measure);     // 새 객체로 (배치 캐시가 옛 그림을 쓰지 않게)
    fn(st.measure);
    st.dirty = true;
    saveDraft();
    if (!(opts && opts.noRender)) F.render();
    SJ.FocusInput.drawTools();
  };
  F.undo = function () {
    // 아직 넣지 않은 손글씨가 있으면 되돌리기 = 마지막 한 획 지우기
    if (F.st.inputMode === 'pen' && SJ.Handwriting && SJ.Handwriting.hasInk()) { SJ.Handwriting.undoStroke(); return; }
    const st = F.st, e = st.undo.pop(); if (!e) return;
    st.redo.push({ measure: U.clone(st.measure), carry: U.clone(st.carry), sel: st.sel, cursor: st.cursor });
    Object.assign(st, { measure: e.measure, carry: e.carry, sel: e.sel, cursor: e.cursor });
    saveDraft(); F.render(); SJ.FocusInput.drawTools();
  };
  F.redo = function () {
    const st = F.st, e = st.redo.pop(); if (!e) return;
    st.undo.push({ measure: U.clone(st.measure), carry: U.clone(st.carry), sel: st.sel, cursor: st.cursor });
    Object.assign(st, { measure: e.measure, carry: e.carry, sel: e.sel, cursor: e.cursor });
    saveDraft(); F.render(); SJ.FocusInput.drawTools();
  };
  const saveDraft = U.debounce(() => {
    const st = F.st; if (!st || !Store.score) return;
    const ink = SJ.Handwriting && SJ.Handwriting.hasInk() ? SJ.Handwriting.snapshot() : null;
    SJ.Storage.saveDraft(Store.score.id, { scoreId: Store.score.id, measureId: st.measure.id, mi: st.mi, staffId: st.staffId, vi: st.vi, measure: st.measure, carry: st.carry, ink, savedAt: U.isoNow() }).catch(() => {});
  }, 150);
  // 앱이 뒤로 갈 때: 바꾼 것이 있거나 그리던 잉크가 있으면 지금 바로 임시 저장(잉크까지)
  F.saveDraftNow = function () { const st = F.st; if (st && (st.dirty || (SJ.Handwriting && SJ.Handwriting.hasInk()))) saveDraft(); saveDraft.flush(); };

  // ── 확인 · 취소 · 이동 ──
  F.commit = function () {
    const st = F.st;
    if (SJ.Handwriting) SJ.Handwriting.commitAll();
    if (!st.dirty) return false;
    const mi = st.mi, measure = st.measure, carry = st.carry, staffId = st.staffId, vi = st.vi;
    const ok = Store.apply(t('{n}마디 입력', { n: mi + 1 }), s => {
      let x = SJ.Ops.replaceMeasure(s, mi, measure);
      if (carry && carry.events.length) {
        if (mi + 1 >= x.measures.length) x = SJ.Ops.appendMeasures(x, 1);
        x = SJ.Ops.editMeasure(x, mi + 1, m => ME.prependCarry(m, staffId, vi, carry));
      }
      return x;
    });
    st.dirty = false;
    return ok;
  };
  // 손글씨를 마디에 넣기 (남은 '?'는 모아서 묻는다) → false 면 사용자가 '돌아가서 고치기'
  const flushInk = async () => !(SJ.Handwriting && F.st && F.st.inputMode === 'pen') || SJ.Handwriting.flush();
  F.confirm = async function (next) {
    if (!(await flushInk())) return;
    const st = F.st;
    if (!st) return;
    const changed = F.commit();
    // 진짜 저장이 된 뒤에만 임시 저장을 지운다(그 사이 앱이 꺼지거나 저장이 실패하면 마디 입력이 사라졌음 · 점검원 ⑥ 11-02)
    if (changed) { SJ.Platform.haptic('light'); await Store.save(); }
    // 저장을 기다리는 사이 더 넣은 것이 있으면 한 번 더 반영(사라지던 것 · 점검원 ⑥ 해소 확인)
    if (F.st === st && st.dirty) { const c0 = st.carry; st.carry = null; if (F.commit()) await Store.save(); st.carry = c0; }   // (이월은 이미 붙였으니 두 번 붙지 않게)
    if (Store.saveState !== 'error') await SJ.Storage.clearDraft(Store.score.id);
    if (next) {
      if (st.mi + 1 >= Store.score.measures.length) Store.apply(t('마디를 더했어요'), s => SJ.Ops.appendMeasures(s, 1));
      F.open(st.mi + 1, st.staffId);
      return;
    }
    const mi = st.mi;
    F.close();
    // 편집 화면은 마지막으로 고친 마디를 고른 채로(◀▶로 옮겼어도 · 점검원 ③ 11-02)
    SJ.Editor.select({ type: 'measure', mi0: mi, mi1: mi, staffId: st.staffId, single: true });
    SJ.Editor.flash(mi);
  };
  F.cancel = async function (fromBack) {
    const st = F.st; if (!st) return;
    const ink = SJ.Handwriting && SJ.Handwriting.hasInk();
    if ((st.dirty || ink) && !(await UI.confirm(t('이 마디에서 바꾼 것을 버릴까요?'), t('이 마디에 넣은 음표와 그린 것이 사라져요.'), { ok: t('버리기'), danger: true, cancel: t('계속 입력') }))) {
      return;
    }
    await SJ.Storage.clearDraft(Store.score.id);
    F.close(fromBack);
  };
  F.close = function (fromBack) {
    if (!F.st) return;
    if (SJ.Handwriting) SJ.Handwriting.reset();
    F.st = null;
    root.classList.add('hidden');
    if (!fromBack && unBack) unBack();
    unBack = null;
  };
  // 앞뒤 마디 (지금 마디는 반영하고 이동)
  F.go = async function (dir) {
    if (F.st.mi + dir < 0) { SJ.Platform.haptic('edge'); UI.toast(t('첫 마디예요')); return; }
    if (!(await flushInk())) return;
    const st = F.st;
    if (!st) return;
    const ni = st.mi + dir;
    if (F.commit()) await Store.save();
    if (F.st === st && st.dirty) { const c0 = st.carry; st.carry = null; if (F.commit()) await Store.save(); st.carry = c0; }   // (기다리는 사이 넣은 것 · 이월은 두 번 안 붙게)
    if (Store.saveState !== 'error') await SJ.Storage.clearDraft(Store.score.id);
    if (ni >= Store.score.measures.length) Store.apply(t('마디를 더했어요'), s => SJ.Ops.appendMeasures(s, 1));
    F.open(ni, st.staffId);
  };
  F.switchStaff = async function (dir) {
    if (!(await flushInk())) return;
    const st = F.st;
    const vis = S.visibleStaves(Store.score);
    const i = vis.findIndex(s => s.id === st.staffId) + dir;
    if (i < 0 || i >= vis.length) { SJ.Platform.haptic('edge'); return; }
    // 다른 보표로: 같은 마디 draft 는 그대로 (보표마다 데이터가 따로)
    st.staffId = vis[i].id; st.vi = 0; st.sel = null;
    st.cursor = ME.voice(st.measure, st.staffId, 0).events.length;
    F.render(); SJ.FocusInput.drawTools();
  };
  F.setMode = async function (m) {
    // 손글씨 → 탭: 그려 둔 것을 먼저 넣는다 (그대로 두면 잉크가 숨겨진 채 남음)
    if (m !== 'pen' && !(await flushInk())) { modeSeg.set(F.st.inputMode); return; }
    F.st.inputMode = m;
    SJ.Settings.set('inputMode', m);
    F.render(); SJ.FocusInput.drawTools();
  };
  // ⋯ : 자주 안 쓰는 것 (다시 실행 · 성부 · 보표 · 버리기)
  F.more = function () {
    const st = F.st;
    const many = Store.score.staves.length > 1;
    UI.menu(t('마디 입력'), [
      { icon: 'redo', label: t('다시 실행'), onClick: () => F.redo() },
      { icon: 'layers', label: st.vi ? t('성부 1로 입력') : t('성부 2로 입력'), sub: t('같은 보표에 두 번째 선율'), onClick: async () => { if (!(await flushInk())) return; st.vi = st.vi ? 0 : 1; ME.voice(st.measure, st.staffId, st.vi); st.sel = null; st.cursor = ME.voice(st.measure, st.staffId, st.vi).events.length; F.render(); SJ.FocusInput.drawTools(); } },
      many ? { icon: 'up', label: t('위 보표'), onClick: () => F.switchStaff(-1) } : null,
      many ? { icon: 'down', label: t('아래 보표'), onClick: () => F.switchStaff(1) } : null,
      many ? { icon: 'layers', label: st.showAll ? t('이 보표만 보기') : t('보표 함께 보기'), onClick: () => { st.showAll = !st.showAll; SJ.Settings.set('focusAllStaves', st.showAll); F.render(); } } : null,
      { icon: 'trash', label: t('이 마디에서 바꾼 것 버리기'), danger: true, onClick: () => F.cancel() }
    ]);
  };
  F.isOpen = () => !!F.st;

  SJ.Focus = F;
})(window.SJ = window.SJ || {});
