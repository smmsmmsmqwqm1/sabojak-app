/* 필기 입력 UI (§8-2 B, §9): 잉크 → (멈춤 600ms) 인식 → 미리보기(흐린 음표) + 후보 칩 → 칩 톡으로 교체 → 다음 획 그리면 자동 확정 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, S = SJ.Score, P = SJ.Pitch, ME = SJ.MeasureEdit, R = SJ.Recognizer;
  const HW = {};
  let canvas = null, g = null, strokes = [], cur = null, timer = null, penSeen = false, fingerOk = false;
  let pending = [];         // [{sym, eventIds:[...], strokes:[...], active}]
  let activeIdx = -1;
  const F = () => SJ.Focus;

  function ensureCanvas() {
    const el = F().el();
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none';
      el.stageEl.appendChild(canvas);
      g = canvas.getContext('2d');
      attach();
    }
    const dpr = window.devicePixelRatio || 1;
    const w = el.stageEl.clientWidth, H = el.stageEl.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    }
  }

  // 집중 모드가 다시 그려질 때마다
  HW.sync = function () {
    const st = F().st;
    if (!st) return;
    const pen = st.inputMode === 'pen';
    if (pen) ensureCanvas();
    if (canvas) canvas.style.display = pen ? '' : 'none';
    drawCands();
  };

  // 이 접촉으로 그릴지 (펜만 필기 설정 · 손바닥 무시)
  HW.wants = function (e) {
    if (e.pointerType === 'pen') { penSeen = true; return true; }
    if ((e.width || 0) > 35 || (e.height || 0) > 35) return false;
    if (cur && cur.pointerType === 'pen') return false;
    if (!SJ.Settings.get('pencilOnly') || fingerOk) return true;
    return false;
  };

  function attach() {
    canvas.addEventListener('pointerdown', e => {
      if (!HW.wants(e)) return;
      e.preventDefault(); e.stopPropagation();
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      clearTimeout(timer);
      // 다음 획을 그리면 직전 후보 자동 확정
      if (pending.length && !strokes.length) HW.commitAll(true);
      const r = canvas.getBoundingClientRect();
      cur = { id: e.pointerId, pointerType: e.pointerType, pts: [{ x: e.clientX - r.left, y: e.clientY - r.top, t: Date.now(), p: e.pressure || 0.5 }] };
    });
    canvas.addEventListener('pointermove', e => {
      if (!cur || e.pointerId !== cur.id) return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      evs.forEach(ev => cur.pts.push({ x: ev.clientX - r.left, y: ev.clientY - r.top, t: Date.now(), p: ev.pressure || 0.5 }));
      drawStroke(cur, '#2C2B34');
    });
    const end = e => {
      if (!cur || e.pointerId !== cur.id) return;
      if (cur.pts.length === 1) cur.pts.push({ x: cur.pts[0].x + 0.5, y: cur.pts[0].y + 0.5, t: Date.now() });
      strokes.push(cur);
      cur = null;
      clearTimeout(timer);
      timer = setTimeout(recognizeNow, SJ.Settings.get('recogDelay') || 600);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    // 펜이 아닌 접촉은 그대로 부모(fstage)로 올라가 탭 입력·선택으로 쓰인다
  }

  function drawStroke(s, color) {
    const p = s.pts; if (p.length < 2) return;
    g.strokeStyle = color; g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = Math.max(1.6, (F().L ? F().L.spPx : 10) * 0.16);
    g.beginPath(); g.moveTo(p[p.length - 2].x, p[p.length - 2].y); g.lineTo(p[p.length - 1].x, p[p.length - 1].y); g.stroke();
  }
  function redraw() {
    if (!g) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    strokes.forEach(s => { for (let i = 1; i < s.pts.length; i++) drawStroke({ pts: s.pts.slice(i - 1, i + 1) }, '#2C2B34'); });
  }

  function ctx() {
    const st = F().st, L = F().L;
    const k = L.staves.findIndex(s => s.id === st.staffId);
    const vs = F().viewScore();
    return { sp: L.spPx, staffTop: L.staffTop[k], clef: S.clefAt(vs, st.mi, st.staffId), fifths: S.keyAt(vs, st.mi).fifths, defaultDur: st.dur, scratch: SJ.Settings.get('scratchErase') !== false };
  }

  function recognizeNow() {
    if (!strokes.length || !F().st) return;
    const c = ctx();
    const batch = strokes; strokes = [];
    let syms;
    try { syms = R.recognize(batch, c); } catch (e) { console.error(e); syms = []; }
    redraw();
    if (!syms.length) { UI.toast(t('알아보지 못했어요 · 다시 그려 주세요')); return; }
    fitContext(syms);
    apply(syms, batch, c);
  }

  /* 마디 문맥으로 다시 줄 세우기: 1등이 남은 박을 넘치고 확신도 낮은데, 2·3등 후보 중 남은 박에 들어가는 것이 있으면 그것을 앞으로.
   * (모양만으로는 반반인 경우를 사람처럼 '박자'로 판단 — 바꾼 것은 '확인해 주세요'로 표시) */
  function fitContext(syms) {
    const st = F().st;
    if (!st) return;
    const D = SJ.Dur;
    const v = ME.voice(st.measure, st.staffId, st.vi);
    let left = D.measureTicks(S.timeAt(F().viewScore(), st.mi)) - ME.total(v);
    const ticks = c => {
      const val = c.value;
      if (val.rest !== undefined) return D.notated({ type: val.rest, dots: 0 });
      return val.type ? D.notated({ type: val.type, dots: val.dots || 0 }) : 0;
    };
    syms.filter(s => (s.kind === 'note' || s.kind === 'rest') && s.cands.length).sort((a, b) => a.x - b.x).forEach(s => {
      if (left <= 0) return;
      if (ticks(s.cands[0]) > left && s.conf < 0.85) {
        const k = s.cands.slice(1, 3).findIndex(c => ticks(c) > 0 && ticks(c) <= left);
        if (k >= 0) {
          const c = s.cands.splice(k + 1, 1)[0];
          s.cands.unshift(c); s.value = c.value;
          s.kind = c.value.rest !== undefined ? 'rest' : 'note';
          s.conf = Math.min(s.conf, 0.55);
        }
      }
      left -= ticks(s.cands[0]);
    });
  }

  // 인식 결과 → 마디에 미리보기(흐린) 이벤트로
  function apply(syms, batch, c) {
    const st = F().st, L = F().L;
    const erase = syms.filter(s => s.kind === 'erase');
    if (erase.length) {
      F().change(m => {
        const v = ME.voice(m, st.staffId, st.vi);
        erase.forEach(er => {
          for (let i = v.events.length - 1; i >= 0; i--) {
            const e = L.events[v.events[i].id];
            if (e && e.x + e.w >= er.x - 4 && e.x <= er.x1 + 4 && e.y1 >= er.y0 - 10 && e.y0 <= er.y1 + 10) { ME.remove(v, i); if (st.cursor > i) st.cursor--; }
          }
        });
      });
      SJ.Platform.haptic('light');
    }
    const rest = syms.filter(s => s.kind !== 'erase');
    if (!rest.length) return;
    // 셈여림 글자 합치기 (m + f → mf)
    const dyn = rest.filter(s => s.kind === 'dyn').sort((a, b) => a.x - b.x);
    let dynText = dyn.map(s => s.value.dynLetter).join('');
    if (dynText && SJ.Decor.DYNAMICS.indexOf(dynText) < 0) dynText = dyn[0].value.dynLetter;
    const pend = { syms: rest.filter(s => s.kind !== 'dyn'), dynText: SJ.Decor.DYNAMICS.indexOf(dynText) >= 0 ? dynText : '', dynX: dyn.length ? dyn[0].x : 0, strokes: batch, ids: [] };
    F().change(m => place(m, pend, c), { noRender: true });
    pending.push(pend);
    activeIdx = pending.length - 1;
    // 가장 신뢰도 낮은 기호에 칩
    let low = 0;
    pend.syms.forEach((s, i) => { if (s.conf < pend.syms[low].conf) low = i; });
    pend.active = low;
    F().render();
  }

  // 미리보기 이벤트 넣기/다시 넣기 (pend.ids 기록)
  function place(m, pend, c) {
    const st = F().st, L = F().L;
    const v = ME.voice(m, st.staffId, st.vi);
    // 전에 넣었던 미리보기 지우기
    if (pend.ids.length) {
      v.events = v.events.filter(e => pend.ids.indexOf(e.id) < 0);
      v.tuplets = v.tuplets.filter(tp => v.events.some(e => e.dur.tuplet === tp.id));
    }
    pend.ids = [];
    const existing = v.events.map(e => ({ id: e.id, x: L.events[e.id] ? L.events[e.id].x : -1 }));
    const noteLike = pend.syms.filter(s => s.kind === 'note' || s.kind === 'rest').sort((a, b) => a.x - b.x);
    noteLike.forEach(s => {
      let ev;
      if (s.kind === 'rest') ev = S.newRest({ type: s.value.rest, dots: 0 });
      else {
        const heads = s.value.heads.map(hd => {
          const base = P.headFromPos(hd.pos, c.clef, c.fifths);
          const alter = hd.acc !== null && hd.acc !== undefined ? hd.acc : ME.alterFor(m, st.staffId, base.step, base.octave, c.fifths, 1e12);
          return { step: base.step, octave: base.octave, alter };
        });
        ev = S.newNote({ type: s.value.type, dots: s.value.dots }, heads);
        if (s.value.staccato) ev.articulations.push('staccato');
      }
      ev['x-pending'] = true;
      // 순서: 기존 음표 중 x 가 더 작은 것 뒤
      let idx = existing.filter(e => e.x >= 0 && e.x < s.x).length;
      // 같은 묶음에서 앞서 넣은 미리보기 뒤로
      pend.ids.forEach(id => { const i = v.events.findIndex(e => e.id === id); if (i >= 0 && i + 1 > idx) idx = i + 1; });
      v.events.splice(idx, 0, ev);
      pend.ids.push(ev.id);
      s.eventId = ev.id;
    });
    st.cursor = Math.max(st.cursor, v.events.findIndex(e => e.id === pend.ids[pend.ids.length - 1]) + 1);
    // 홀로 쓴 임시표 · 붙임줄 · 아티큘레이션 · 셈여림 → 가장 가까운 음표에
    const nearest = (x, side) => {
      let best = null, bd = 1e9;
      v.events.forEach(e => {
        if (e.kind !== 'note') return;
        const pe = L.events[e.id];
        const ex = pe ? pe.x : (pend.syms.find(s => s.eventId === e.id) || {}).x;
        if (ex === undefined) return;
        if (side === 'right' && ex < x - 4) return;
        if (side === 'left' && ex > x + 4) return;
        const d = Math.abs(ex - x);
        if (d < bd) { bd = d; best = e; }
      });
      return best;
    };
    pend.syms.forEach(s => {
      if (s.kind === 'accidental') { const e = nearest(s.x1 || s.x, 'right'); if (e) e.heads[0].alter = s.value.acc; else st.accNext = s.value.acc; }
      else if (s.kind === 'tie') { const e = nearest(s.x, 'left'); if (e) e.heads.forEach(hd => { hd.tieNext = true; }); }
      else if (s.kind === 'artic') { const e = nearest(s.x, null); if (e && e.articulations.indexOf(s.value.art) < 0) e.articulations.push(s.value.art); }
    });
    if (pend.dynText) { const e = nearest(pend.dynX, null); if (e) e.dynamic = pend.dynText; }
  }

  // 후보 칩
  function drawCands() {
    const el = F().el().candEl;
    const st = F().st;
    el.innerHTML = '';
    const show = st && st.inputMode === 'pen';
    el.classList.toggle('hidden', !show);
    if (!show) return;
    if (SJ.Settings.get('pencilOnly') && !penSeen) {
      el.appendChild(h('button', { class: 'chip' + (fingerOk ? ' on' : ''), html: SJ.icon('hand') + U.esc(t('손가락으로 그리기')), onclick: () => { fingerOk = !fingerOk; drawCands(); } }));
    }
    const pend = pending[activeIdx];
    if (!pend) { el.appendChild(h('span', { class: 'small muted', text: t('오선 위에 음표를 그려 보세요 · 지그재그로 긁으면 지워요') })); return; }
    // 기호 고르기 (여러 개면 번호)
    const syms = pend.syms;
    if (syms.length > 1) syms.forEach((s, i) => el.appendChild(h('button', { class: 'chip' + (i === pend.active ? ' on' : '') + (s.conf < 0.6 ? ' warn' : ''), text: '①②③④⑤⑥⑦⑧⑨'[i] || String(i + 1), onclick: () => { pend.active = i; drawCands(); } })));
    const s = syms[pend.active];
    if (s) {
      if (s.conf < 0.6) el.appendChild(h('span', { class: 'chip warn', text: t('확인해 주세요') }));
      s.cands.forEach((cd, ci) => el.appendChild(h('button', { class: 'chip' + (ci === 0 && !s.changed ? ' on' : (s.chosen === ci ? ' on' : '')), text: cd.label, onclick: () => choose(pend, s, ci) })));
    }
    el.appendChild(h('button', { class: 'chip', html: SJ.icon('check') + U.esc(t('확정')), onclick: () => HW.commitAll() }));
    el.appendChild(h('button', { class: 'chip', html: SJ.icon('x') + U.esc(t('지우기')), onclick: () => HW.discardLast() }));
  }

  function choose(pend, s, ci) {
    const cd = s.cands[ci];
    const before = s.value;
    s.value = cd.value; s.chosen = ci; s.changed = true;
    // 후보에는 음표·쉼표가 섞일 수 있다 (다른 해석) — 고른 값에 맞춰 종류도 바꾼다
    if (cd.value.rest !== undefined) s.kind = 'rest';
    else if (cd.value.type) s.kind = 'note';
    // 배우기: $P 기호는 템플릿으로, 음표는 채움 기준
    try {
      if (s.kind === 'note' && s.headInner !== null) {
        const wasFilled = !(before.type === 'whole' || before.type === 'half'), nowFilled = !(cd.value.type === 'whole' || cd.value.type === 'half');
        if (wasFilled !== nowFilled) R.learnFill(s.headInner, nowFilled);
      } else if (s.label && s.strokes) {
        const map = { rest: { quarter: 'r:quarter', eighth: 'r:eighth', '16th': 'r:16th', whole: 'r:bar', half: 'r:bar' } };
        let label = null;
        if (cd.value.rest) label = map.rest[cd.value.rest];
        else if (cd.value.acc !== undefined) label = { 1: 'sharp', '-1': 'flat', 0: 'natural', 2: 'dsharp', '-2': 'dflat' }[cd.value.acc];
        else if (cd.value.art) label = cd.value.art;
        if (label && label !== s.label) R.learn(label, s.strokes.map(i => pend.strokes[i]));
      }
    } catch (e) { /* 배우기 실패는 무시 */ }
    const c = ctx();
    F().change(m => place(m, pend, c), { noRender: true });
    F().render();
  }

  // 미리보기 확정
  HW.commitAll = function (quiet) {
    if (!pending.length || !F().st) { pending = []; return; }
    const st = F().st;
    // 확신이 낮았는데 고르지 않고 넘어간 것 = 1순위로 넣되 주황 표시로 남김 (톡 해서 확인하면 사라짐, 인쇄엔 안 나옴)
    const unsure = [];
    pending.forEach(p => p.syms.forEach(s => { if (s.eventId && s.conf < 0.6 && !s.changed) unsure.push(s.eventId); }));
    F().change(m => {
      Object.keys(m.staves).forEach(sid => m.staves[sid].voices.forEach(v => v.events.forEach(e => {
        delete e['x-pending'];
        if (unsure.indexOf(e.id) >= 0) e['x-check'] = true;
      })));
    }, { noRender: true });
    if (unsure.length && quiet) UI.toast(t('확실하지 않은 음표는 주황색으로 남겨 뒀어요 · 톡 해서 확인'));
    pending = []; activeIdx = -1;
    const v = ME.voice(st.measure, st.staffId, st.vi);
    const cap = SJ.Dur.measureTicks(S.timeAt(F().viewScore(), st.mi));
    F().render();
    if (ME.total(v) > cap && !st.measure.attrs.pickup && !quiet) SJ.FocusInput.askOverflow();
  };
  HW.discardLast = function () {
    const pend = pending.pop();
    if (!pend) return;
    const st = F().st;
    F().change(m => {
      const v = ME.voice(m, st.staffId, st.vi);
      v.events = v.events.filter(e => pend.ids.indexOf(e.id) < 0);
      st.cursor = Math.min(st.cursor, v.events.length);
    });
    activeIdx = pending.length - 1;
  };
  HW.reset = function () { pending = []; activeIdx = -1; strokes = []; cur = null; clearTimeout(timer); if (g) redraw(); };

  // ── 내 필기 등록 마법사 (선택 · 약 2분) ──
  HW.enrollWizard = function () {
    const steps = [
      { label: '4분음표', kind: 'note', filled: true }, { label: '2분음표', kind: 'note', filled: false }, { label: '8분음표', kind: 'note', filled: true },
      { label: '올림표 ♯', sym: 'sharp' }, { label: '내림표 ♭', sym: 'flat' }, { label: '제자리표 ♮', sym: 'natural' },
      { label: '4분쉼표', sym: 'r:quarter' }, { label: '8분쉼표', sym: 'r:eighth' }, { label: '붙임줄', sym: 'tie' }
    ];
    let i = 0, ss = [], cv, cg, cur2 = null;
    const title = h('h3', { style: { margin: '0 0 8px' } });
    cv = h('canvas', { style: { width: '100%', height: '220px', background: '#fff', borderRadius: '14px', border: '1px solid var(--line)', touchAction: 'none', display: 'block' } });
    const nextBtn = h('button', { class: 'btn primary', text: t('다음') });
    const clearBtn = h('button', { class: 'btn', text: t('다시 그리기') });
    const sh = UI.sheet({ title: t('내 필기 등록'), body: [h('p', { class: 'small muted', text: t('보이는 기호를 평소처럼 한 번 그려 주세요. 건너뛰어도 돼요.') }), title, cv], foot: [clearBtn, nextBtn] });
    const sp = 18;
    const drawStaff = () => {
      const dpr = window.devicePixelRatio || 1;
      cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr;
      cg = cv.getContext('2d'); cg.setTransform(dpr, 0, 0, dpr, 0, 0);
      cg.clearRect(0, 0, cv.clientWidth, cv.clientHeight);
      cg.strokeStyle = '#CFCAD8'; cg.lineWidth = 1;
      for (let l = 0; l < 5; l++) { const y = 70 + l * sp; cg.beginPath(); cg.moveTo(10, y); cg.lineTo(cv.clientWidth - 10, y); cg.stroke(); }
      title.textContent = (i + 1) + ' / ' + steps.length + ' · ' + t(steps[i].label);
      ss = [];
    };
    setTimeout(drawStaff, 240);
    cv.addEventListener('pointerdown', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); cur2 = { pts: [{ x: e.clientX - r.left, y: e.clientY - r.top, t: Date.now() }] }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!cur2) return;
      const r = cv.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top, t: Date.now() }, q = cur2.pts[cur2.pts.length - 1];
      cur2.pts.push(p);
      cg.strokeStyle = '#2C2B34'; cg.lineWidth = 2.5; cg.lineCap = 'round'; cg.beginPath(); cg.moveTo(q.x, q.y); cg.lineTo(p.x, p.y); cg.stroke();
    });
    cv.addEventListener('pointerup', () => { if (cur2) { if (cur2.pts.length === 1) cur2.pts.push({ x: cur2.pts[0].x + 0.5, y: cur2.pts[0].y, t: Date.now() }); ss.push(cur2); } cur2 = null; });
    clearBtn.addEventListener('click', drawStaff);
    nextBtn.addEventListener('click', () => {
      const stp = steps[i];
      if (ss.length) {
        if (stp.sym) R.learn(stp.sym, ss);
        else {
          const r = R.recognize(ss, { sp, staffTop: 70, defaultDur: { type: 'quarter', dots: 0 } });
          const n = r.find(x => x.kind === 'note');
          if (n && n.headInner !== null) R.learnFill(n.headInner, stp.filled);
        }
      }
      i++;
      if (i >= steps.length) { sh.close(); UI.toast(t('내 필기를 등록했어요')); return; }
      drawStaff();
    });
  };

  SJ.Handwriting = HW;
})(window.SJ = window.SJ || {});
