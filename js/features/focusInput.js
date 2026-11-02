/* 집중 모드 탭 입력 (§8-2 A): 오선을 톡 → 가장 가까운 줄/칸에 음, 같은 박을 다른 높이로 톡 → 화음,
 * 음표 도구 막대(길이·점·쉼표·임시표·붙임줄·잇단음·꾸밈음·음이름·옥타브), 고른 음 편집, 박 검증과 이월 (§8-4) */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store, S = SJ.Score, P = SJ.Pitch, D = SJ.Dur, ME = SJ.MeasureEdit, FL = SJ.FocusLayout;
  const FI = {};
  const F = () => SJ.Focus;
  const TYPES = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th'];
  const TYPE_LBL = { whole: '온', half: '2분', quarter: '4분', eighth: '8분', '16th': '16분', '32nd': '32분', '64th': '64분' };

  function ctx() {
    const st = F().st;
    const vs = F().viewScore();
    const clef = S.clefAt(vs, st.mi, st.staffId);
    const key = S.keyAt(vs, st.mi);
    const time = S.timeAt(vs, st.mi);
    return { st, clef, fifths: key.fifths, time, cap: D.measureTicks(time), v: ME.voice(st.measure, st.staffId, st.vi) };
  }

  /* 누르기 → (누르는 동안 그 높이에 흐린 음표 + 음이름) → 위아래로 맞추기 → 떼면 입력.
   * 옆으로 크게 밀면 앞/뒤 마디로. 머리를 톡 = 고르기. */
  const SOLFA = { C: '도', D: '레', E: '미', F: '파', G: '솔', A: '라', B: '시' };
  FI.attach = function (stageEl) {
    let g = null;
    const local = e => { const r = stageEl.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    stageEl.addEventListener('pointerdown', e => {
      const st = F().st;
      if (!st || (st.inputMode === 'pen' && SJ.Handwriting && SJ.Handwriting.wants(e))) return;
      // 펜으로 쓰는 중의 손바닥 · 큰 접촉은 고르기 · 끌기로도 쓰지 않는다(넣어 둔 음표가 끌려 옮겨지지 않게)
      if (st.inputMode === 'pen' && ((e.width || 0) > 40 || (e.height || 0) > 40 || (SJ.Handwriting && SJ.Handwriting.penActive()))) return;
      if (g) return;                                  // 두 번째 손가락 무시
      const p = local(e);
      let res = FI.resolve(p.x, p.y);
      // 손글씨일 때 손가락(펜 기기)은 고르기 · 끌어 고치기만 — 톡으로 음이 박히거나 마디가 넘어가지 않게
      if (st.inputMode === 'pen' && res && res.type !== 'select') res = null;
      g = { id: e.pointerId, x0: p.x, y0: p.y, t: Date.now(), res, pen: st.inputMode === 'pen' };
      if (g.res && (g.res.type === 'insert' || g.res.type === 'chord')) FI.preview(g.res, p.y);
      try { stageEl.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ }
    });
    stageEl.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const p = local(e);
      const sp = F().L ? F().L.spPx : 20;
      const dx = p.x - g.x0, dy = p.y - g.y0;
      // 잡은 음표: 처음 움직인 방향으로 고정 — 옆 = 가로 위치 옮기기, 위아래 = 높이 바꾸기
      if (g.dragX) { FI.dragShift(g.res, dx); return; }
      if (g.dragHead) { FI.preview(Object.assign({}, g.res, { type: 'move' }), p.y); return; }
      if (g.res && g.res.type === 'select') {
        if (Math.abs(dx) > sp * 0.5 && Math.abs(dx) > Math.abs(dy) * 1.2) { g.dragX = true; FI.hidePreview(); FI.beginShift(g.res); FI.dragShift(g.res, dx); return; }
        if (!g.res.rest && Math.abs(dy) > sp * 0.4 && Math.abs(dx) < 60) { g.dragHead = true; FI.preview(Object.assign({}, g.res, { type: 'move' }), p.y); return; }
      }
      if (g.res && (g.res.type === 'insert' || g.res.type === 'chord') && Math.abs(p.x - g.x0) < 60) FI.preview(g.res, p.y);
      else FI.hidePreview();
    });
    const up = e => {
      if (!g || e.pointerId !== g.id) return;
      const p = local(e), d = g; g = null;
      FI.hidePreview();
      if (e.type === 'pointercancel' || !d.res) return;
      const dx = p.x - d.x0, dy = p.y - d.y0;
      if (d.dragX) { FI.endShift(d.res); return; }
      if (d.dragHead) { FI.moveHead(d.res, p.y); return; }
      if (!d.pen && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 2) { F().go(dx < 0 ? 1 : -1); return; }   // 옆으로 밀기 = 마디 이동 (탭 입력일 때만)
      if (d.res.type === 'insert' || d.res.type === 'chord') { FI.commitAt(d.res, p.y); return; }
      if (Math.hypot(dx, dy) > 14) return;
      FI.commitAt(d.res, p.y);
    };
    stageEl.addEventListener('pointerup', up);
    stageEl.addEventListener('pointercancel', up);
  };

  // 누른 자리의 뜻 (고르기 · 화음 · 새 음 · 보표 바꾸기 · 다음 마디)
  FI.resolve = function (x, y) {
    const st = F().st, L = F().L;
    if (!st || !L) return null;
    if (Date.now() - st.openedAt < 450) return null;      // 두 번 톡으로 들어올 때의 남은 톡 무시
    if (x > L.cur.x1 + 4) return L.next ? { type: 'next' } : null;
    if (x < L.cur.x0 - 4) return null;
    const k = FL.staffAt(L, y);
    const sid = L.staves[k].id;
    if (sid !== st.staffId) return { type: 'staff', staffId: sid };
    const c = ctx();
    const sp = L.spPx;
    let hitEv = null, hitHead = -1, near = null, nearD = 1e9;
    c.v.events.forEach((ev, ei) => {
      const e = L.events[ev.id]; if (!e) return;
      const cx = e.x + e.w / 2;
      const dx = Math.abs(x - cx);
      if (dx < e.w / 2 + sp * 0.5) {
        (e.heads || []).forEach(hd => { if (Math.abs(hd.y - y) < sp * 0.55 && dx < e.w / 2 + sp * 0.4) { hitEv = ei; hitHead = hd.hi; } });
        if (ev.kind === 'rest' && y > e.y0 - sp && y < e.y1 + sp) hitEv = ei;
      }
      if (dx < sp * 1.1 && dx < nearD) { nearD = dx; near = ei; }
    });
    if (hitEv !== null) {
      const he = L.events[c.v.events[hitEv].id];
      return { type: 'select', ei: hitEv, hi: Math.max(0, hitHead), k, x: he ? he.x : x, w: he ? he.w : sp, rest: c.v.events[hitEv].kind === 'rest' };
    }
    // 커서(다음 음 자리)에 더 가까우면 화음이 아니라 새 음
    const curX = F().cursorX();
    if (near !== null && curX !== null && Math.abs(x - curX) < nearD) near = null;
    if (near !== null && nearD > sp * 0.9) near = null;
    if (near !== null && c.v.events[near].kind === 'note' && !c.v.events[near].grace) {
      const e = L.events[c.v.events[near].id];
      return { type: 'chord', ei: near, k, x: e.x, w: e.w };
    }
    return { type: 'insert', k, x: F().cursorX() };
  };

  FI.posAt = function (res, y) { return U.clamp(FL.yToPos(F().L, res.k, y), -8, 16); };
  FI.commitAt = function (res, y) {
    const st = F().st;
    if (!res || !st) return;
    if (res.type === 'next') { F().go(1); return; }
    if (res.type === 'staff') {
      st.staffId = res.staffId; st.vi = 0; st.sel = null; st.cursor = ME.voice(st.measure, res.staffId, 0).events.length;
      F().render(); FI.drawTools(); UI.toast(t('이 보표에 입력해요'));
      return;
    }
    if (res.type === 'select') {
      if (st.sel && st.sel.ei === res.ei && st.sel.hi === res.hi) { st.sel = null; st.cursor = res.ei + 1; }   // 다시 톡 = 선택 풀고 그 뒤에 커서
      else { st.sel = { ei: res.ei, hi: res.hi }; st.cursor = res.ei + 1; }
      // 필기 인식이 확신하지 못했던 음표(주황)는 톡 해서 보면 '확인함'
      const sv = ME.voice(st.measure, st.staffId, st.vi).events[res.ei];
      // (넣을 때 남긴 후보가 있으면 같은 후보 그림으로 고치기 — 없던 예전 악보는 '확인함'만)
      if (sv && sv['x-check'] && sv['x-cands'] && SJ.Handwriting && SJ.Handwriting.fixEvent(sv.id)) { F().render(); FI.drawTools(); return; }
      if (sv && sv['x-check']) { F().change(m => { const e0 = ME.voice(m, st.staffId, st.vi).events[res.ei]; delete e0['x-check']; delete e0['x-cands']; }, { noRender: true }); UI.toast(t('확인했어요 · 틀렸으면 아래에서 고치세요')); }
      F().render(); FI.drawTools();
      return;
    }
    const c = ctx();
    const head = FI.headAt(c, FI.posAt(res, y), res.type === 'chord' ? res.ei : st.cursor);
    if (res.type === 'chord') {
      F().change(m => { const v = ME.voice(m, st.staffId, st.vi); ME.addHead(v.events[res.ei], head); });
      st.sel = null; st.cursor = res.ei + 1;
      SJ.Platform.haptic('light');
      F().render();
      return;
    }
    FI.insertNote([head]);
  };
  FI.tap = function (x, y) { FI.commitAt(FI.resolve(x, y), y); };
  // 끌어서 옮긴 머리의 높이 반영 (임시표는 조표·마디 상태로 다시 계산)
  FI.moveHead = function (res, y) {
    const st = F().st;
    const c = ctx();
    const pos = FI.posAt(res, y);
    const nh = FI.headAt(c, pos, res.ei);
    F().change(m => {
      const v = ME.voice(m, st.staffId, st.vi);
      const ev = v.events[res.ei];
      if (!ev || ev.kind !== 'note') return;
      delete ev['x-check']; delete ev['x-cands'];
      const keep = ev.heads[res.hi] || ev.heads[0];
      const moved = Object.assign({}, keep, { step: nh.step, octave: nh.octave, alter: nh.alter });
      delete moved.accidental;
      ev.heads = ev.heads.filter(x => x !== keep && !(x.step === moved.step && x.octave === moved.octave)).concat([moved]).sort((a, b) => P.dn(a) - P.dn(b));
      st.sel = { ei: res.ei, hi: ev.heads.indexOf(moved) };
    });
    SJ.Platform.haptic('light');
  };

  /* 가로 위치 옮기기 (손으로 정한 자리): 기본은 자동 배치, 끌어 놓으면 그 자리.
   * 값 = ev.xShift (마디 폭에 대한 비율) → 페이지 · 인쇄 · 다른 화면 크기에서도 같은 자리. 되돌리기 한 번 = 끌기 한 번 */
  let shiftStart = 0;
  FI.beginShift = function (res) {
    const st = F().st;
    F().change(m => { const ev = ME.voice(m, st.staffId, st.vi).events[res.ei]; if (ev) ev.xShift = ev.xShift || 0; }, { noRender: true });
    const ev = ME.voice(st.measure, st.staffId, st.vi).events[res.ei];
    shiftStart = ev ? ev.xShift || 0 : 0;
  };
  FI.dragShift = function (res, dxPx) {
    const st = F().st, L = F().L;
    const ev = ME.voice(st.measure, st.staffId, st.vi).events[res.ei];
    if (!ev || !L) return;
    const w = Math.max(1, L.cur.x1 - L.cur.x0);
    ev.xShift = U.clamp(shiftStart + dxPx / w, -0.9, 0.9);
    F().render();
  };
  FI.endShift = function (res) {
    const st = F().st;
    const ev = ME.voice(st.measure, st.staffId, st.vi).events[res.ei];
    if (ev && Math.abs(ev.xShift || 0) < 0.004) delete ev.xShift;
    st.sel = { ei: res.ei, hi: res.hi || 0 };
    F().render(); FI.drawTools();
    SJ.Platform.haptic('light');
    if (!SJ.Settings.get('shiftHintSeen')) { SJ.Settings.set('shiftHintSeen', true); UI.toast(t('자리를 옮겼어요 · 아래 [자동 위치]로 되돌릴 수 있어요')); }
  };
  FI.resetShift = function () {
    const st = F().st;
    if (!st.sel) return;
    F().change(m => { const ev = ME.voice(m, st.staffId, st.vi).events[st.sel.ei]; if (ev) delete ev.xShift; });
    FI.drawTools();
  };

  // 누르는 동안 미리보기: 흐린 머리 + 덧줄 + 음이름
  let pvName = null;
  FI.preview = function (res, y) {
    const st = F().st, L = F().L;
    const c = ctx();
    const pos = FI.posAt(res, y);
    const base = P.headFromPos(pos, c.clef, c.fifths);
    const starts = ME.starts(c.v);
    const before = res.type === 'chord' || res.type === 'move' ? res.ei : st.cursor;
    const tick = before < starts.length ? starts[before] : ME.total(c.v);
    const alter = st.accNext !== null && st.accNext !== undefined && res.type !== 'move' ? st.accNext : ME.alterFor(st.measure, st.staffId, base.step, base.octave, c.fifths, tick);
    const sp = L.spPx;
    const cx = res.type === 'chord' || res.type === 'move' ? res.x : (res.x === null ? L.cur.contentStart + sp : res.x + sp * 0.4);
    const hy = FL.posToY(L, res.k, pos);
    const ov = F().el().ovEl;
    let gEl = ov.querySelector('#pv');
    if (!gEl) { gEl = document.createElementNS('http://www.w3.org/2000/svg', 'g'); gEl.id = 'pv'; ov.appendChild(gEl); }
    let b = '';
    const top = L.staffTop[res.k];
    for (let p = -2; p >= pos; p -= 2) b += '<line x1="' + (cx - sp * 0.9) + '" x2="' + (cx + sp * 1.9) + '" y1="' + FL.posToY(L, res.k, p) + '" y2="' + FL.posToY(L, res.k, p) + '" stroke="#7C8CDE" stroke-width="2"/>';
    for (let p = 10; p <= pos; p += 2) b += '<line x1="' + (cx - sp * 0.9) + '" x2="' + (cx + sp * 1.9) + '" y1="' + FL.posToY(L, res.k, p) + '" y2="' + FL.posToY(L, res.k, p) + '" stroke="#7C8CDE" stroke-width="2"/>';
    b += '<ellipse cx="' + (cx + sp * 0.5) + '" cy="' + hy + '" rx="' + (sp * 0.62) + '" ry="' + (sp * 0.46) + '" transform="rotate(-20 ' + (cx + sp * 0.5) + ' ' + hy + ')" fill="rgba(124,140,222,.55)"/>';
    b += '<line x1="0" x2="' + L.w + '" y1="' + hy + '" y2="' + hy + '" stroke="rgba(124,140,222,.25)" stroke-width="' + (sp * 0.9) + '"/>';
    gEl.innerHTML = b;
    void top;
    if (!pvName) { pvName = h('div', { class: 'pv-name' }); F().el().stageEl.appendChild(pvName); }
    pvName.style.display = '';
    pvName.style.left = (cx + sp * 0.5) + 'px';
    pvName.style.top = (hy - sp * 0.8) + 'px';
    // 한국어: '솔 · G4' (계이름 함께), 영어: 'G4'
    pvName.textContent = (SJ.getLang() === 'en' ? '' : SOLFA[base.step] + (alter ? P.accSymbol(alter) : '') + ' · ') + base.step + (alter ? P.accSymbol(alter) : '') + base.octave + (res.type === 'chord' ? ' ' + t('(화음)') : '');
  };
  FI.hidePreview = function () {
    const ov = F().el().ovEl;
    const gEl = ov && ov.querySelector('#pv');
    if (gEl) gEl.remove();
    if (pvName) pvName.style.display = 'none';
  };

  // 위치 → 음 (임시표: 고른 것 > 마디 안 앞 음 > 조표)
  FI.headAt = function (c, pos, beforeIndex) {
    const st = c.st;
    const base = P.headFromPos(pos, c.clef, c.fifths);
    const starts = ME.starts(c.v);
    const tick = beforeIndex < starts.length ? starts[beforeIndex] : ME.total(c.v);
    let alter = ME.alterFor(st.measure, st.staffId, base.step, base.octave, c.fifths, tick);
    if (st.accNext !== null && st.accNext !== undefined) { alter = st.accNext; st.accNext = null; }
    return { step: base.step, octave: base.octave, alter };
  };

  // 새 음표/쉼표 넣기 (+잇단음·꾸밈음·넘침 처리)
  FI.insertNote = function (heads, isRest) {
    const st = F().st;
    const c = ctx();
    const dur = { type: st.dur.type, dots: st.dur.dots };
    const ev = isRest ? S.newRest(dur) : S.newNote(dur, heads);
    if (!isRest && st.grace) { ev.grace = 'acciaccatura'; ev.dur = { type: 'eighth', dots: 0 }; }
    let overflow = false;
    F().change(m => {
      const v = ME.voice(m, st.staffId, st.vi);
      // 잇단음
      if (st.tuplet && !ev.grace) {
        let tp = st.tuplet.id ? v.tuplets.find(x => x.id === st.tuplet.id) : null;
        if (!tp) { tp = ME.newTuplet(v, st.tuplet.actual, st.tuplet.normal, dur.type); st.tuplet.id = tp.id; }
        ev.dur.tuplet = tp.id;
      }
      ME.insert(v, st.cursor, ev);
      st.cursor += 1;
      if (st.tuplet && st.tuplet.id && ME.tupletFull(v, st.tuplet.id)) { st.tuplet = null; }
      overflow = ME.total(v) > c.cap && !m.attrs.pickup;
    }, { noRender: true });
    st.sel = null;
    SJ.Platform.haptic('light');
    F().render();
    if (overflow) FI.askOverflow();
    if (SJ.Player && SJ.Settings.get('soundPreview') && !isRest) SJ.Player.previewNote(heads[0]);
  };

  // 넘침: 입력을 막고 이월을 제안 (§8-4)
  FI.askOverflow = async function () {
    const st = F().st;
    const choice = await UI.choose(t('마디를 넘쳤어요'), t('넘치는 음을 붙임줄로 이어서 다음 마디로 넘길까요?'), [
      { label: t('다음 마디로 이월'), value: 'carry', kind: 'primary' },
      { label: t('방금 입력 취소'), value: 'undo' },
      { label: t('그대로 두기 (넘친 표시)'), value: 'keep' }
    ]);
    if (choice === 'carry') {
      F().change(m => {
        const v = ME.voice(m, st.staffId, st.vi);
        const cap = D.measureTicks(S.timeAt(F().viewScore(), st.mi));
        const c = ME.splitOverflow(v, cap);
        const prev = st.carry && st.carry.events ? st.carry : { events: [], tuplets: [] };
        st.carry = { events: prev.events.concat(c.events), tuplets: prev.tuplets.concat(c.tuplets) };
        st.cursor = v.events.length;
      });
      UI.toast(t('[확인]하면 다음 마디 앞에 붙어요'));
    } else if (choice === 'undo' || choice === null) F().undo();
    return choice;   // (손글씨는 '취소'면 그린 잉크를 되살리고 화면에 머문다 — handwriting commit)
  };

  FI.fillRests = function () {
    const st = F().st;
    F().change(m => {
      const v = ME.voice(m, st.staffId, st.vi);
      ME.fillRests(v, D.measureTicks(S.timeAt(F().viewScore(), st.mi)), S.timeAt(F().viewScore(), st.mi));
      st.cursor = v.events.length;
    });
  };

  // 고른 음표 (없으면 커서 바로 앞 음표)
  function target(allowLast) {
    const st = F().st;
    const v = ME.voice(st.measure, st.staffId, st.vi);
    if (st.sel && v.events[st.sel.ei]) return { ei: st.sel.ei, hi: st.sel.hi, ev: v.events[st.sel.ei], selected: true };
    if (allowLast && st.cursor > 0 && v.events[st.cursor - 1]) return { ei: st.cursor - 1, hi: 0, ev: v.events[st.cursor - 1], selected: false };
    return null;
  }
  function editTarget(fn, allowLast) {
    const st = F().st;
    const tg = target(allowLast);
    if (!tg) return false;
    F().change(m => { const v = ME.voice(m, st.staffId, st.vi); fn(v.events[tg.ei], tg, v); });
    return true;
  }

  // ── 도구 동작 ──
  FI.setDur = function (type) {
    const st = F().st;
    st.dur.type = type;
    SJ.Settings.set('lastDur', type);
    if (st.sel) editTarget(ev => { ev.dur.type = type; });     // 고른 음표면 길이 바꾸기
    else FI.drawTools();
  };
  FI.setDots = function (n) {
    const st = F().st;
    st.dur.dots = st.dur.dots === n ? 0 : n;
    if (st.sel) editTarget(ev => { ev.dur.dots = st.dur.dots; });
    else FI.drawTools();
  };
  FI.accidental = function (alter) {
    const st = F().st;
    if (st.sel) {
      editTarget((ev, tg) => {
        if (ev.kind !== 'note') return;
        const hd = ev.heads[tg.hi] || ev.heads[0];
        hd.alter = hd.alter === alter && alter !== 0 ? 0 : alter;
        hd.accidental = 'auto';
      });
    } else {
      st.accNext = st.accNext === alter ? null : alter;
      FI.drawTools();
      if (st.accNext !== null) UI.toast(t('다음 음에 {a} 붙여요', { a: P.accSymbol(alter) }), { ms: 1200 });
    }
  };
  FI.tie = function () {
    const ok = editTarget(ev => {
      if (ev.kind !== 'note') return;
      const on = !ev.heads.every(x => x.tieNext);
      ev.heads.forEach(x => { x.tieNext = on; if (!on) delete x.tieNext; });
    }, true);
    if (!ok) UI.toast(t('먼저 음표를 넣거나 골라 주세요'));
  };
  FI.rest = function () {
    const st = F().st;
    if (st.sel) { editTarget(ev => { if (ev.kind === 'note') { ev.kind = 'rest'; delete ev.heads; delete ev.lyrics; delete ev.grace; } }); return; }
    FI.insertNote(null, true);
  };
  FI.noteName = function (step) {
    const st = F().st;
    const c = ctx();
    // 앞 음표와 가장 가까운 옥타브
    let ref = null;
    for (let i = st.cursor - 1; i >= 0; i--) { const e = c.v.events[i]; if (e && e.kind === 'note') { ref = e.heads[e.heads.length - 1]; break; } }
    const mid = P.headFromPos(4, c.clef, 0);
    const refDn = ref ? P.dn(ref) : P.dn(mid);
    let best = null;
    for (let o = 0; o <= 8; o++) { const dn = o * 7 + P.STEPS.indexOf(step); if (!best || Math.abs(dn - refDn) < Math.abs(best - refDn)) best = dn; }
    const pos = best - P.CLEFS[c.clef].bottomDn;
    const head = FI.headAt(c, pos, st.cursor);
    if (st.sel) { editTarget((ev, tg) => { if (ev.kind === 'note') ME.addHead(ev, head); }); return; }
    FI.insertNote([head]);
  };
  FI.octave = function (d) {
    const ok = editTarget(ev => ME.octave(ev, d), true);
    if (!ok) UI.toast(t('먼저 음표를 넣거나 골라 주세요'));
  };
  FI.step = function (d) {
    const st = F().st;
    const c = ctx();
    editTarget((ev, tg, v) => {
      if (ev.kind !== 'note') return;
      const tick = ME.starts(v)[tg.ei];
      const ni = ME.stepHead(st.measure, st.staffId, ev, tg.hi, d, c.fifths, tick);
      if (st.sel) st.sel.hi = ni;
    });
  };
  FI.addChordTone = function () {
    editTarget((ev, tg) => {
      if (ev.kind !== 'note') return;
      const top = ev.heads[ev.heads.length - 1];
      const s = P.fromDn(P.dn(top) + 2);
      const c = ctx();
      ME.addHead(ev, { step: s.step, octave: s.octave, alter: P.keyAlter(s.step, c.fifths) });
    });
  };
  FI.enharmonic = function () { editTarget((ev, tg) => { if (ev.kind === 'note') { ev.heads[tg.hi] = Object.assign(P.enharmonic(ev.heads[tg.hi]), { accidental: 'auto' }); } }); };
  FI.cycle = function (prop, vals) { editTarget(ev => { const i = vals.indexOf(ev[prop] || vals[0]); ev[prop] = vals[(i + 1) % vals.length]; if (ev[prop] === 'auto') delete ev[prop]; }); };
  FI.removeSel = function () {
    const st = F().st;
    const tg = target(true);
    if (!tg) return;
    F().change(m => {
      const v = ME.voice(m, st.staffId, st.vi);
      const ev = v.events[tg.ei];
      if (tg.selected && ev.kind === 'note' && ev.heads.length > 1) ev.heads.splice(tg.hi, 1);     // 화음이면 그 머리만
      else { ME.remove(v, tg.ei); if (st.cursor > tg.ei) st.cursor--; }
      st.sel = null;
    });
  };
  FI.tuplet = async function () {
    const st = F().st;
    if (st.tuplet) { st.tuplet = null; FI.drawTools(); return; }
    const choice = await UI.choose(t('잇단음표'), t('다음에 넣는 음표들을 묶어요 (지금 음길이 기준).'), [
      { label: t('셋잇단 (3)'), value: [3, 2] }, { label: t('다섯잇단 (5)'), value: [5, 4] }, { label: t('여섯잇단 (6)'), value: [6, 4] }, { label: t('일곱잇단 (7)'), value: [7, 4] }, { label: t('직접 a:b'), value: 'custom' }]);
    if (!choice) return;
    let a, b;
    if (choice === 'custom') {
      const s = await UI.prompt(t('잇단음 a:b'), '3:2', { placeholder: '5:4' });
      const m = /^(\d+)\s*[:：]\s*(\d+)$/.exec(s || '');
      if (!m) return;
      a = U.clamp(Number(m[1]), 2, 32); b = U.clamp(Number(m[2]), 1, 32);
    } else { a = choice[0]; b = choice[1]; }
    st.tuplet = { actual: a, normal: b };
    FI.drawTools();
    UI.toast(t('{a}잇단: 다음 음표부터 묶어요', { a }));
  };
  FI.grace = function () { const st = F().st; st.grace = !st.grace; FI.drawTools(); };
  FI.exprMenu = function () {
    const tg = target(true);
    if (!tg || tg.ev.kind !== 'note') { UI.toast(t('먼저 음표를 넣거나 골라 주세요')); return; }
    const items = SJ.ExprTool.ITEMS.filter(i => i.g !== 'span');
    const st = F().st;
    const body = h('div', {});
    body.append(h('label', { class: 'lab', text: t('셈여림') }), UI.chips(items.filter(i => i.g === 'dyn').map(i => ({ label: i.v, value: i.v })), tg.ev.dynamic || null,
      v => F().change(m => { const ev = ME.voice(m, st.staffId, st.vi).events[tg.ei]; if (v) ev.dynamic = v; else delete ev.dynamic; }), { toggle: true }));
    body.append(h('label', { class: 'lab', text: t('아티큘레이션 · 장식') }), UI.chips(items.filter(i => i.g === 'art').map(i => ({ label: t(i.label), value: i.v })), tg.ev.articulations || [],
      v => F().change(m => { ME.voice(m, st.staffId, st.vi).events[tg.ei].articulations = v.slice(); }), { multi: true }));
    UI.sheet({ title: t('표현'), body: [body] });
  };

  // ── 도구 막대 그리기 (상황별) ──
  FI.drawTools = function () {
    const st = F().st; if (!st) return;
    const el = F().el().ntool;
    el.innerHTML = '';
    const sel = target(false);
    const nb = (html, label, fn, opts) => {
      opts = opts || {};
      return h('button', { class: 'nbtn' + (opts.on ? ' on' : '') + (opts.txt ? ' txt' : ''), 'aria-label': label, title: label, onclick: fn, disabled: opts.disabled },
        [h('span', { html }), opts.noLabel ? null : h('span', { class: 'lbl', text: label })]);
    };
    const sep = () => h('span', { class: 'nsep' });
    // 손글씨: 위 줄 = 그린 것 상태(? 확인 · 한 획 지우기), 아래 줄 = 그리기 어려운 것을 톡으로(임시표 · 점 · 쉼표 · 붙임줄 — 고른 음표나 바로 앞 음표에)
    if (st.inputMode === 'pen' && SJ.Handwriting) {
      el.appendChild(SJ.Handwriting.barRow());
      const r = h('div', { class: 'nrow' });
      // 그리는 중이면 방금 그린(오른쪽 끝) 음표에, 아니면 고른 음표 · 바로 앞 음표에
      const HW = SJ.Handwriting;
      const onInk = (kind, val) => HW.hasInk() && HW.modifyLast(kind, val);
      [[1, 'accidentalSharp', '올림'], [-1, 'accidentalFlat', '내림'], [0, 'accidentalNatural', '제자리']].forEach(a => r.appendChild(nb(UI.glyphSvg(a[1], 22), t(a[2]), () => { if (onInk('acc', a[0])) return; if (!target(true)) { UI.toast(t('먼저 음표를 넣거나 골라 주세요')); return; } if (!st.sel) { const tg = target(true); st.sel = { ei: tg.ei, hi: 0 }; } FI.accidental(a[0]); })));
      r.appendChild(sep());
      const tg0 = target(true);
      const dt = tg0 ? tg0.ev.dur.type : st.dur.type;
      r.appendChild(nb(UI.noteIcon(dt, { dots: 1, px: 24 }), t('점'), () => { if (onInk('dot')) return; const tg = target(true); if (!tg) { UI.toast(t('먼저 음표를 넣거나 골라 주세요')); return; } F().change(m => { const ev = ME.voice(m, st.staffId, st.vi).events[tg.ei]; ev.dur.dots = (ev.dur.dots || 0) >= 1 ? 0 : 1; }); }));
      r.appendChild(nb(SJ.icon('tie'), t('붙임줄'), () => { if (onInk('tie')) return; FI.tie(); }));
      r.appendChild(sep());
      // (넣은 음표를 지우는 단추 — 잉크 지우기는 위 줄 [한 획 지우기 · 모두 지우기] · 이름을 하는 일과 같게 · 점검원 ① 11-02)
      r.appendChild(nb(SJ.icon('trash'), t('넣은 음 지우기'), () => FI.removeSel(), { disabled: !target(true) }));
      el.appendChild(r);
      return;
    }
    // 1줄: 음길이 · 점 · 쉼표 · 붙임줄 · 잇단음 · 꾸밈음
    const r1 = h('div', { class: 'nrow' });
    const curType = sel ? sel.ev.dur.type : st.dur.type;
    const curDots = sel ? sel.ev.dur.dots : st.dur.dots;
    TYPES.forEach(tp => r1.appendChild(nb(UI.noteIcon(tp, { px: 26 }), t(TYPE_LBL[tp]), () => FI.setDur(tp), { on: curType === tp })));
    r1.appendChild(sep());
    r1.appendChild(nb(UI.noteIcon(curType, { dots: 1, px: 24 }), t('점'), () => FI.setDots(1), { on: curDots === 1 }));
    r1.appendChild(nb(UI.noteIcon(curType, { dots: 2, px: 24 }), t('겹점'), () => FI.setDots(2), { on: curDots === 2 }));
    r1.appendChild(sep());
    r1.appendChild(nb(UI.noteIcon(curType, { rest: true, px: 24 }), sel ? t('쉼표로') : t('쉼표 넣기'), () => FI.rest()));
    r1.appendChild(nb(SJ.icon('tie'), t('붙임줄'), () => FI.tie(), { on: !!(sel && sel.ev.kind === 'note' && sel.ev.heads.every(x => x.tieNext)) }));
    r1.appendChild(nb(SJ.icon('tuplet'), st.tuplet ? t('{a}잇단 중', { a: st.tuplet.actual }) : t('잇단음'), () => FI.tuplet(), { on: !!st.tuplet }));
    r1.appendChild(nb(SJ.icon('grace'), t('꾸밈음'), () => FI.grace(), { on: st.grace }));
    el.appendChild(r1);
    // 2줄: 임시표 · (고른 음 편집 | 음이름 키패드) · 옥타브 · 표현
    const r2 = h('div', { class: 'nrow' });
    [[1, 'accidentalSharp', '올림'], [-1, 'accidentalFlat', '내림'], [0, 'accidentalNatural', '제자리'], [2, 'accidentalDoubleSharp', '겹올림'], [-2, 'accidentalDoubleFlat', '겹내림']].forEach(a => {
      const on = sel ? (sel.ev.kind === 'note' && (sel.ev.heads[sel.hi] || sel.ev.heads[0]).alter === a[0] && a[0] !== 0) : st.accNext === a[0];
      r2.appendChild(nb(UI.glyphSvg(a[1], 22), t(a[2]), () => FI.accidental(a[0]), { on }));
    });
    r2.appendChild(sep());
    if (sel) {
      r2.appendChild(nb(SJ.icon('up'), t('한 음 위'), () => FI.step(1)));
      r2.appendChild(nb(SJ.icon('down'), t('한 음 아래'), () => FI.step(-1)));
      r2.appendChild(nb(SJ.icon('plus'), t('화음 더하기'), () => FI.addChordTone(), { disabled: sel.ev.kind !== 'note' }));
      r2.appendChild(nb(SJ.icon('flip'), t('이명동음'), () => FI.enharmonic(), { disabled: sel.ev.kind !== 'note' }));
      r2.appendChild(nb(SJ.icon('stem'), t('기둥 ') + ({ up: '↑', down: '↓' }[sel.ev.stem] || t('자동')), () => FI.cycle('stem', ['auto', 'up', 'down']), { disabled: sel.ev.kind !== 'note' }));
      r2.appendChild(nb(SJ.icon('beam'), t('빔 ') + ({ none: t('풀기'), force: t('묶기') }[sel.ev.beam] || t('자동')), () => FI.cycle('beam', ['auto', 'none', 'force']), { disabled: sel.ev.kind !== 'note' }));
      // 손으로 옮긴 음표만: 자동 위치로 되돌리기
      if (sel.ev.xShift) r2.appendChild(nb(SJ.icon('restore'), t('자동 위치'), () => FI.resetShift()));
      r2.appendChild(nb(SJ.icon('trash'), t('지우기'), () => FI.removeSel()));
    } else {
      'CDEFGAB'.split('').forEach(s => r2.appendChild(nb('<b style="font-size:var(--fs-md)">' + s + '</b>', t({ C: '도', D: '레', E: '미', F: '파', G: '솔', A: '라', B: '시' }[s]), () => FI.noteName(s))));
      r2.appendChild(nb(SJ.icon('erase'), t('앞 음 지우기'), () => FI.removeSel(), { disabled: st.cursor === 0 }));
    }
    r2.appendChild(sep());
    r2.appendChild(nb('<b style="font-size:var(--fs)">8ᵛᵃ↑</b>', t('옥타브 위'), () => FI.octave(1)));
    r2.appendChild(nb('<b style="font-size:var(--fs)">8ᵛᵇ↓</b>', t('옥타브 아래'), () => FI.octave(-1)));
    r2.appendChild(nb(SJ.icon('expr'), t('표현'), () => FI.exprMenu()));
    el.appendChild(r2);
  };

  SJ.FocusInput = FI;
})(window.SJ = window.SJ || {});
