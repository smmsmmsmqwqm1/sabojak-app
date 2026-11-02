/* 필기 입력 (§8-2 B, §9) — 2차(2026-11-02)
 * 원칙: 저절로 확정하지 않는다. 그린 잉크는 남고(알아들은 것은 옅게), 같은 자리에 '이렇게 알아들었어요' 미리보기가 바로 뜬다.
 *       손을 뗄 때마다 아직 넣지 않은 획 '전부'를 함께 다시 읽는다(머리 · 기둥을 따로 그려도, 기둥을 먼저 그려도 한 음표).
 *       애매한 기호는 오선 위에 '?' — 톡 하면 후보를 악보 그림으로 보여 주고 고른 것으로 박힌다.
 *       마디에 넣는 때 = [완료] · 다음/앞 마디 · 탭 입력으로 바꿀 때. 그때 남은 '?'를 한 화면에 모아 묻는다.
 * 잉크는 오선 칸 단위(마디 시작 · 보표 맨 윗줄 기준)로 저장 → 화면이 돌아가거나 크기가 바뀌어도 음높이가 어긋나지 않는다. */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, S = SJ.Score, P = SJ.Pitch, ME = SJ.MeasureEdit, R = SJ.Recognizer;
  const HW = {};
  const F = () => SJ.Focus;
  let canvas = null, g = null, svg = null, badgeEl = null;
  let ink = [];            // [{id, pts:[{u,v,t,p}]}]  u = (x − 마디 왼쪽)/칸, v = (y − 보표 맨 윗줄)/칸
  let nextId = 1;
  let syms = [];           // 마지막으로 읽은 결과 (ids = 이 기호를 이룬 잉크 획 id)
  let locks = [];          // 사용자가 고른 답 [{key, value, orig}] — 같은 획 묶음이면 다시 읽어도 유지
  let cur = null, timer = null;
  // 손을 멈췄나: 그리는 중(펜이 닿아 있거나 마지막 획 뒤 0.9초 안)에는 주황 · '?'를 숨기고 옅은 미리보기만 — 그리는 도중에 묻지 않게 (조수 협의 11-02)
  let settled = true, settleTimer = null;
  let readKey = '';   // 마지막으로 읽었을 때의 화면 크기(돌리면 다시 읽기)
  const SETTLE_MS = 900;

  // ── 좌표: 오선 칸 단위 ↔ 화면 px ──
  function frame() {
    const st = F().st, L = F().L;
    if (!st || !L) return null;
    const k = Math.max(0, L.staves.findIndex(s => s.id === st.staffId));
    return { x0: L.cur.x0, W: Math.max(1, L.cur.x1 - L.cur.x0), top: L.staffTop[k], sp: L.spPx, k };
  }
  /* 획 하나의 자리 = '마디 폭에 대한 비율'(박 자리) + 모양은 칸 단위.
   * 화면을 돌려 마디 폭(칸 수)이 바뀌어도 그린 기호는 같은 박 자리 · 같은 모양으로 남는다 */
  const toPx = (fr, p, s) => ({ x: fr.x0 + (s && s.a !== undefined ? s.a * fr.W + (p.u - s.uc) * fr.sp : p.u * fr.sp), y: fr.top + p.v * fr.sp, t: p.t, p: p.p });
  const toUnit = (fr, x, y) => ({ u: (x - fr.x0) / fr.sp, v: (y - fr.top) / fr.sp });
  const strokePx = (fr, s) => ({ pts: s.pts.map(p => toPx(fr, p, s)) });
  let hist = [];           // 잉크 되돌리기(획 더하기 · 긁어 지우기 한 단계씩)
  const snap = () => { hist.push({ ink: ink.slice(), locks: locks.slice() }); if (hist.length > 60) hist.shift(); };

  function ensureLayers() {
    const el = F().el();
    if (!canvas) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText = 'position:absolute;inset:0;pointer-events:none';
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:none';
      badgeEl = h('div', { class: 'hw-badges' });
      el.stageEl.append(svg, canvas, badgeEl);
      g = canvas.getContext('2d');
      attach();
    }
    const dpr = window.devicePixelRatio || 1;
    const w = el.stageEl.clientWidth, H = el.stageEl.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    svg.setAttribute('width', w); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + w + ' ' + H);
  }

  // 집중 화면이 다시 그려질 때마다
  HW.sync = function () {
    const st = F().st;
    if (!st) return;
    const pen = st.inputMode === 'pen';
    if (pen) ensureLayers();
    if (canvas) { canvas.style.display = pen ? '' : 'none'; svg.style.display = pen ? '' : 'none'; badgeEl.style.display = pen ? '' : 'none'; }
    // 화면을 돌리는 등 크기가 바뀌었으면 다시 읽는다(읽은 결과는 화면 좌표라 옛 자리에 남았음 · 점검원 ① 11-02) — 크기가 같으면 그리기만
    if (pen) { const fr = frame(); const k = fr ? [fr.sp, fr.W, fr.x0, fr.top].map(v => Math.round(v)).join(',') : ''; if (ink.length && k !== readKey) recognizeAll(); else draw(); }
    const cand = F().el().candEl;
    if (cand) cand.classList.add('hidden');
  };

  /* 이 접촉으로 그릴까?
   * 펜이 한 번이라도 닿은 기기(아이패드 + 펜 등) = 펜으로만 쓰고 손가락은 고르기 · 옮기기(StaffPad 방식).
   * 펜이 없는 폰 = 손가락으로 그린다(손글씨 모드일 때). 손바닥처럼 큰 접촉은 무시. */
  HW.penSeen = () => !!SJ.Settings.get('penSeen');
  HW.wants = function (e) {
    if (e.pointerType === 'pen') { if (!HW.penSeen()) SJ.Settings.set('penSeen', true); return true; }
    if ((e.width || 0) > 40 || (e.height || 0) > 40) return false;
    if (cur && cur.pen) return false;
    if (HW.penSeen() && SJ.Settings.get('pencilOnly') !== false) return false;
    return true;
  };

  function attach() {
    canvas.addEventListener('pointerdown', e => {
      // '?' · 점 표는 손가락(마우스)만 받는다 — 펜은 그 자리에서도 늘 그린다(높은 음 자리를 표가 덮어 획 대신 창이 열리던 것 · 점검원 ① 11-02).
      // 표 자체는 누름을 통과시키고(pointer-events none) 여기서 손가락이 표 근처(44px)를 눌렀는지 본다
      let badgeHit = null;
      if (e.pointerType !== 'pen' && !cur && badgeEl) {
        const hit = Array.from(badgeEl.children).find(b => { const r = b.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2; return Math.abs(e.clientX - cx) <= 22 && Math.abs(e.clientY - cy) <= 22; });
        // 손가락이 그리기 도구가 아닌 기기(펜 기기)면 바로 열고, 손가락으로 그리는 폰이면 일단 그리기로 받고 손 뗄 때 '짧은 톡'이었을 때만 연다(점검원 ① 해소 확인)
        if (hit && hit._open && !HW.wants(e)) { e.preventDefault(); e.stopPropagation(); hit._open(); return; }
        if (hit && hit._open) badgeHit = hit;
      }
      if (!HW.wants(e)) return;
      if (cur) return;                                  // 두 번째 손가락 무시
      e.preventDefault(); e.stopPropagation();
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ }
      clearTimeout(timer);
      clearTimeout(settleTimer);
      if (settled) { settled = false; if (badgeEl) badgeEl.innerHTML = ''; }
      const fr = frame(); if (!fr) return;
      const r = canvas.getBoundingClientRect();
      const q = toUnit(fr, e.clientX - r.left, e.clientY - r.top);
      cur = { id: e.pointerId, pen: e.pointerType === 'pen', badge: badgeHit, pts: [{ u: q.u, v: q.v, t: Date.now(), p: e.pressure || 0.5 }] };
      // 첫 획: 악보를 한 번 다시 그려 빈 마디 자리표(온쉼표)를 숨긴다 — 그린 것과 겹쳐 헷갈리지 않게 (잉크는 칸 단위라 배치가 바뀌어도 그대로)
      if (!ink.length) F().render();
    });
    canvas.addEventListener('pointermove', e => {
      if (!cur || e.pointerId !== cur.id) return;
      e.preventDefault();
      const fr = frame(); if (!fr) return;
      const r = canvas.getBoundingClientRect();
      // 합쳐진 이동 점(빠른 펜 · 120Hz)을 모두 받되, 목록이 비어 오는 기기 · 브라우저도 있으므로 그때는 이 이벤트 하나로
      const co = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
      const evs = co && co.length ? co : [e];
      evs.forEach(ev => { const q = toUnit(fr, ev.clientX - r.left, ev.clientY - r.top); cur.pts.push({ u: q.u, v: q.v, t: Date.now(), p: ev.pressure || 0.5 }); });
      drawStroke(fr, cur.pts.slice(-evs.length - 1), 1);
    });
    const end = e => {
      if (!cur || e.pointerId !== cur.id) return;
      const s = cur; cur = null;
      // 표 근처에서 시작한 짧은 톡(0.4칸 안 · 0.4초 안) = 표 누르기 — 획으로 넣지 않고 표를 연다
      if (s.badge) {
        let du = 0, dv = 0; s.pts.forEach(p => { du = Math.max(du, Math.abs(p.u - s.pts[0].u)); dv = Math.max(dv, Math.abs(p.v - s.pts[0].v)); });
        if (Math.max(du, dv) < 0.4 && s.pts[s.pts.length - 1].t - s.pts[0].t < 400) { settled = true; draw(); s.badge._open(); return; }
      }
      if (s.pts.length === 1) s.pts.push({ u: s.pts[0].u + 0.02, v: s.pts[0].v + 0.02, t: Date.now() });
      const fr = frame();
      let u0 = 1e9, u1 = -1e9;
      s.pts.forEach(p => { u0 = Math.min(u0, p.u); u1 = Math.max(u1, p.u); });
      const uc = (u0 + u1) / 2;
      snap();
      ink.push({ id: nextId++, pts: s.pts, uc, a: fr ? uc * fr.sp / fr.W : undefined });
      clearTimeout(timer);
      timer = setTimeout(recognizeAll, 90);           // 손 뗀 뒤 바로 다시 읽기 (확정은 하지 않음)
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => { settled = true; draw(); drawBar(); }, SETTLE_MS);
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    // 펜 기기에서 손가락 접촉은 그대로 아래(탭 입력 · 고르기)로 내려간다
  }

  function ctx() {
    const st = F().st;
    const vs = F().viewScore();
    const fr = frame();
    // 이미 넣은 음표 자리(긁기가 지울 것이 있는지 인식기가 보게 — 없으면 긁듯 칠한 쉼표로 읽음)
    const L = F().L, v = ME.voice(st.measure, st.staffId, st.vi);
    const eraseTargets = v.events.map(ev => L.events[ev.id]).filter(Boolean).map(e => ({ x0: e.x, x1: e.x + e.w, y0: e.y0, y1: e.y1 }));
    return { sp: fr.sp, staffTop: fr.top, clef: S.clefAt(vs, st.mi, st.staffId), fifths: S.keyAt(vs, st.mi).fifths, defaultDur: st.dur, scratch: SJ.Settings.get('scratchErase') !== false, eraseTargets };
  }

  // ── 아직 넣지 않은 획 전부를 함께 읽기 ──
  function recognizeAll() {
    clearTimeout(timer);
    if (!F().st) return;
    const fr = frame();
    if (!ink.length || !fr) { syms = []; locks = []; F().render(); drawBar(); return; }     // 다 지웠으면 빈 마디 자리표를 되살림
    const c = ctx();
    readKey = [fr.sp, fr.W, fr.x0, fr.top].map(v => Math.round(v)).join(',');
    let out;
    try { out = R.recognize(ink.map(s => strokePx(fr, s)), c); } catch (e) { console.error(e); out = []; }
    out.forEach(s => { s.ids = (s.strokes || []).map(i => ink[i] && ink[i].id).filter(Boolean); });
    // 긁어 지우기: 긁은 자리의 잉크(아직 안 넣은 것)와 이미 넣은 음표를 지운다
    const erase = out.filter(s => s.kind === 'erase');
    if (erase.length) {
      const scratchIds = new Set(erase.reduce((a, s) => a.concat(s.ids), []));
      const hit = s => { const b = bboxPx(fr, s); return erase.some(er => b.x1 >= er.x - 4 && b.x0 <= er.x1 + 4 && b.y1 >= er.y0 - 6 && b.y0 <= er.y1 + 6); };
      const before = ink.length;
      // (지우기도 되돌리기 한 단계 — 직전 기록은 긁은 획을 더한 상태라 그 앞 상태로 되돌아가게 바꿔 둔다)
      if (hist.length) hist[hist.length - 1] = { ink: ink.filter(s => !scratchIds.has(s.id)), locks: locks.slice() };
      ink = ink.filter(s => !scratchIds.has(s.id) && !hit(s));
      eraseCommitted(erase);
      SJ.Platform.haptic('light');
      if (ink.length !== before) return recognizeAll();
    }
    syms = out.filter(s => s.kind !== 'erase');
    // 어느 기호에도 속하지 않은 획은 버리지 않고 '?'로 묻는다(모든 획은 설명되거나 물어야 한다)
    const covered = new Set(syms.reduce((a, s) => a.concat(s.ids), []));
    ink.filter(s => !covered.has(s.id)).forEach(s => {
      const b = bboxPx(fr, s);
      syms.push({ kind: 'unknown', x: b.x0, x1: b.x1, y: (b.y0 + b.y1) / 2, y0: b.y0, y1: b.y1, conf: 0.2, amb: true, value: null, cands: [], ids: [s.id] });
    });
    // 점 하나(스타카토)는 가까운 음표(2.5칸 안)가 있을 때만 — 폰에서 음표를 고르려는 톡이 엉뚱한 음표의 스타카토가 되지 않게
    const L = F().L, v0 = ME.voice(F().st.measure, F().st.staffId, F().st.vi);
    syms.filter(s => s.kind === 'artic' && s.value && s.value.art === 'staccato').forEach(s => {
      const near = syms.some(o => o.kind === 'note' && Math.abs(o.x - s.x) < 2.5 * fr.sp) || v0.events.some(e => e.kind === 'note' && L.events[e.id] && Math.abs(L.events[e.id].x - s.x) < 2.5 * fr.sp);
      if (!near) { s.amb = true; s.conf = Math.min(s.conf, 0.4); }
    });
    // 고른 답 되살리기 (같은 획 묶음일 때만 — 획이 더해지면 그 기호는 새로 읽는다)
    const keyOf = symKey;
    syms.forEach(s => {
      const lk = locks.find(l => l.key === keyOf(s));
      if (!lk) return;
      applyValue(s, lk.value);
      s.locked = true; s.amb = false;
    });
    locks = locks.filter(l => syms.some(s => keyOf(s) === l.key));
    fitContext();
    draw(); drawBar();
  }
  // 고른 답의 잠금 키 = 이룬 획 + 같은 획 묶음 안에서 왼쪽부터 몇 번째(빔으로 이은 음표처럼 한 묶음에서 여럿이 나오면 획 목록이 같아서,
  // 하나에서 고른 답이 다른 음표까지 덮었음 · 점검원 ② 11-02). 화면을 돌려 좌표가 바뀌어도 순서는 같아 안정
  function symKey(s) {
    const ids = s.ids.slice().sort((a, b) => a - b).join(',');
    const same = syms.filter(o => o.ids && o.ids.slice().sort((a, b) => a - b).join(',') === ids).sort((a, b) => a.x - b.x);
    return ids + '#' + Math.max(0, same.indexOf(s));
  }
  function bboxPx(fr, s) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    s.pts.forEach(p => { const q = toPx(fr, p, s); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); });
    return { x0, y0, x1, y1 };
  }
  function eraseCommitted(erase) {
    const st = F().st, L = F().L;
    const v = ME.voice(st.measure, st.staffId, st.vi);
    const gone = v.events.filter(ev => { const e = L.events[ev.id]; return e && erase.some(er => e.x + e.w >= er.x - 4 && e.x <= er.x1 + 4 && e.y1 >= er.y0 - 10 && e.y0 <= er.y1 + 10); });
    if (!gone.length) return;
    F().change(m => {
      const vv = ME.voice(m, st.staffId, st.vi);
      gone.forEach(ev => { const i = vv.events.findIndex(x => x.id === ev.id); if (i >= 0) { ME.remove(vv, i); if (st.cursor > i) st.cursor--; } });
    });
  }
  function kindOf(v) {
    if (!v) return 'unknown';
    return v.rest !== undefined ? 'rest' : v.type ? 'note' : v.acc !== undefined ? 'accidental' : v.tie ? 'tie' : v.art ? 'artic' : v.dynLetter ? 'dyn' : 'unknown';
  }
  function applyValue(s, v) {
    s.value = v; s.kind = kindOf(v);
    const i = s.cands.findIndex(c => JSON.stringify(c.value) === JSON.stringify(v));
    if (i > 0) s.cands.unshift(s.cands.splice(i, 1)[0]);
  }

  /* 마디 문맥: 1등이 남은 박을 넘치는데 확신이 낮고, 2 · 3등 중 남은 박에 맞는 것이 있으면 그것을 앞으로 — 바꾼 것은 '?'로 둔다 */
  function fitContext() {
    const st = F().st, D = SJ.Dur;
    const v = ME.voice(st.measure, st.staffId, st.vi);
    let left = D.measureTicks(S.timeAt(F().viewScore(), st.mi)) - ME.total(v);
    const ticks = val => (!val ? 0 : val.rest !== undefined ? D.notated({ type: val.rest, dots: 0 }) : val.type ? D.notated({ type: val.type, dots: val.dots || 0 }) : 0);
    syms.filter(s => (s.kind === 'note' || s.kind === 'rest') && s.cands.length).sort((a, b) => a.x - b.x).forEach(s => {
      if (!s.locked && ticks(s.value) > left && left > 0 && s.conf < 0.85) {
        const k = s.cands.slice(1, 4).findIndex(c => ticks(c.value) > 0 && ticks(c.value) <= left);
        if (k >= 0) { applyValue(s, s.cands[k + 1].value); s.amb = true; s.conf = Math.min(s.conf, 0.55); }
      }
      left -= ticks(s.value);
    });
  }

  // ── 그리기: 잉크(알아들은 것은 옅게) · 미리보기 기호 · '?' ──
  function drawStroke(fr, pts, alpha, s) {
    if (pts.length < 2) return;
    g.globalAlpha = alpha;
    g.strokeStyle = SJ.Settings.isDark && SJ.Settings.isDark() ? '#2C2B34' : '#2C2B34';
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = Math.max(1.8, fr.sp * 0.15);
    g.beginPath();
    const a = toPx(fr, pts[0], s); g.moveTo(a.x, a.y);
    for (let i = 1; i < pts.length; i++) { const q = toPx(fr, pts[i], s); g.lineTo(q.x, q.y); }
    g.stroke();
    g.globalAlpha = 1;
  }
  function draw() {
    if (!g || !F().st) return;
    const fr = frame(); if (!fr) return;
    g.clearRect(0, 0, canvas.width, canvas.height);
    const known = new Set();
    syms.forEach(s => { if (s.kind !== 'unknown') s.ids.forEach(id => known.add(id)); });
    ink.forEach(s => drawStroke(fr, s.pts, known.has(s.id) ? 0.28 : 0.95, s));
    // 미리보기 기호 (악보 글꼴 그대로)
    const G = SJ.Glyphs, sp = fr.sp, top = fr.top;
    let b = '';
    const glyph = (name, x, y, col) => { const gl = G[name]; return gl ? '<path d="' + gl.d + '" fill="' + col + '" transform="translate(' + x + ' ' + y + ') scale(' + sp + ')"/>' : ''; };
    const yOf = pos => top + (8 - pos) / 2 * sp;
    syms.forEach(s => {
      const col = s.amb && settled ? '#E0803F' : '#5F6FCF';
      const x = s.kind === 'note' ? s.x - sp * 0.6 : (s.x + (s.x1 || s.x)) / 2 - sp * 0.5;
      if (s.kind === 'note' && s.value && s.value.heads) {
        const v = s.value, hs = v.heads.map(hd => hd.pos);
        const hn = SJ.MeasurePrep.headGlyph(v.type);
        const up = hs.reduce((a, p) => a + p, 0) / hs.length < 4;
        hs.forEach((p, i) => {
          for (let lp = -2; lp >= p; lp -= 2) b += '<line x1="' + (x - sp * 0.4) + '" x2="' + (x + sp * 1.6) + '" y1="' + yOf(lp) + '" y2="' + yOf(lp) + '" stroke="' + col + '" stroke-width="' + Math.max(1, sp * 0.12) + '"/>';
          for (let lp = 10; lp <= p; lp += 2) b += '<line x1="' + (x - sp * 0.4) + '" x2="' + (x + sp * 1.6) + '" y1="' + yOf(lp) + '" y2="' + yOf(lp) + '" stroke="' + col + '" stroke-width="' + Math.max(1, sp * 0.12) + '"/>';
          b += glyph(hn, x, yOf(p), col);
          const acc = v.heads[i].acc;
          if (acc !== null && acc !== undefined) b += glyph(SJ.MeasurePrep.accGlyph(acc), x - sp * 1.3, yOf(p), col);
        });
        if (v.type !== 'whole') {
          const lo = Math.min(...hs), hi = Math.max(...hs);
          const sx = up ? x + sp * 1.18 - sp * 0.06 : x + sp * 0.06;
          const y1 = up ? yOf(lo) : yOf(hi), y2 = up ? yOf(hi) - sp * 3.5 : yOf(lo) + sp * 3.5;
          b += '<line x1="' + sx + '" x2="' + sx + '" y1="' + y1 + '" y2="' + y2 + '" stroke="' + col + '" stroke-width="' + Math.max(1.2, sp * 0.12) + '"/>';
          const fl = { eighth: '8th', '16th': '16th', '32nd': '32nd', '64th': '64th' }[v.type];
          if (fl) b += glyph('flag' + fl + (up ? 'Up' : 'Down'), sx, y2, col);
        }
        for (let d = 0; d < (v.dots || 0); d++) b += '<circle cx="' + (x + sp * (1.6 + d * 0.55)) + '" cy="' + (yOf(hs[0]) - (hs[0] % 2 === 0 ? sp * 0.5 : 0)) + '" r="' + sp * 0.2 + '" fill="' + col + '"/>';
      } else if (s.kind === 'rest') {
        const rt = s.value.rest;
        const y = rt === 'whole' ? top + sp : top + 2 * sp;
        b += glyph(SJ.MeasurePrep.restGlyph(rt), x, y, col);
      } else if (s.kind === 'accidental') {
        b += glyph(SJ.MeasurePrep.accGlyph(s.value.acc), x, s.y, col);
      } else if (s.kind !== 'unknown') {
        b += '<text x="' + x + '" y="' + (top - sp * 1.2) + '" fill="' + col + '" font-size="' + Math.max(11, sp * 0.8) + '">' + U.esc(s.cands[0] ? s.cands[0].label : '') + '</text>';
      }
    });
    svg.innerHTML = b;
    // 오선 위 표: 애매한 것은 '?', 알아들은 것은 작은 점(톡 하면 바꾸기)
    badgeEl.innerHTML = '';
    if (!settled) return;                           // 그리는 중엔 표를 숨김(손을 멈추면 나타남)
    syms.forEach(s => {
      const x = s.kind === 'note' ? s.x + sp * 0.6 : (s.x + (s.x1 || s.x)) / 2;
      const ask = s.amb || s.kind === 'unknown';
      const btn = h('button', { class: 'hw-badge' + (ask ? ' ask' : ''), 'aria-label': ask ? t('이 기호 확인하기') : t('이 기호 바꾸기'), html: ask ? '?' : '' });
      btn.style.left = Math.round(x) + 'px';
      btn.style.top = Math.round(top - sp * 2.6) + 'px';
      btn._open = () => chooseFor(s);
      btn.addEventListener('click', e => { e.stopPropagation(); chooseFor(s); });   // (키보드 · 화면 읽기용)
      badgeEl.appendChild(btn);
    });
    // 이미 넣은 주황(확실하지 않음) 기호에도 '?' — 누르면 넣을 때 남긴 후보로 고침
    const Lf = F().L, vf = ME.voice(F().st.measure, F().st.staffId, F().st.vi);
    vf.events.forEach(ev => {
      const pe = Lf && Lf.events[ev.id];
      if (!pe || !ev['x-check'] || !ev['x-cands']) return;
      const btn = h('button', { class: 'hw-badge ask', 'aria-label': t('이 기호 확인하기'), html: '?' });
      btn.style.left = Math.round(pe.x + (pe.w || 0) / 2) + 'px';
      btn.style.top = Math.round(top - sp * 2.6) + 'px';
      btn._open = () => HW.fixEvent(ev.id);
      btn.addEventListener('click', e => { e.stopPropagation(); HW.fixEvent(ev.id); });
      badgeEl.appendChild(btn);
    });
  }

  // ── 후보 그림 ──
  function candIcon(v) {
    if (!v) return '';
    if (v.rest !== undefined) return UI.noteIcon(v.rest, { rest: true, px: 34 });
    if (v.type) return UI.noteIcon(v.type, { dots: v.dots || 0, px: 34 });
    if (v.acc !== undefined) return UI.glyphSvg(SJ.MeasurePrep.accGlyph(v.acc), 28);
    return '';
  }
  function candBtn(c, on, fn) {
    return h('button', { class: 'cand' + (on ? ' on' : ''), onclick: fn }, [h('span', { class: 'ci', html: candIcon(c.value) }), h('span', { class: 'cl', text: c.label })]);
  }
  // '이 기호가 무엇인가요?' — 후보를 악보 그림으로 (가장 비슷한 순) + 다시 그리기
  function chooseFor(s) {
    const list = h('div', { class: 'cand-grid' });
    const sh = UI.sheet({ title: t('이렇게 그린 기호가 무엇인가요?'), body: [h('p', { class: 'small muted', text: t('가장 비슷한 것부터 보여 드려요. 고르면 그대로 넣어요.') }), list] });
    const named = nameCands(s.cands.filter(c => c.value).slice(0, 4));
    named.forEach((c, i) => list.appendChild(candBtn(c, !s.amb && i === 0, () => { pick(s, c.value); sh.close(); })));
    // 후보에 없으면: 자주 쓰는 기호판에서 바로 고르기(지우고 다시 그리는 헛수고 없이)
    list.appendChild(h('button', { class: 'cand redraw', onclick: () => { sh.close(); paletteFor(s); } }, [h('span', { class: 'ci', html: SJ.icon('more') }), h('span', { class: 'cl', text: t('다른 기호') })]));
    list.appendChild(h('button', { class: 'cand redraw', onclick: () => { redraw(s); sh.close(); } }, [h('span', { class: 'ci', html: SJ.icon('erase') }), h('span', { class: 'cl', text: t('지우고 다시 그리기') })]));
  }
  // 자주 쓰는 기호 전부: 음표(높이 = 음표로 읽혔으면 그 머리 · 아니면 그린 자리) · 쉼표 · 임시표
  // 이름이 같은 후보(화음 · 머리 하나 · 높이만 다름)는 사용자가 구별할 수 있게 이름에 덧붙인다 — 똑같은 그림 · 이름 둘은 고를 수 없음
  // (후보 창 · 넣은 뒤 고치는 창 · 알아보지 못한 획 창이 같이 씀)
  function nameCands(shown) {
    const base = shown[0] && shown[0].value.heads ? shown[0].value.heads[0].pos : null;
    return shown.map(c => {
      const dup = shown.filter(o => o.label === c.label).length > 1, hs = c.value.heads;
      if (!dup || !hs) return c;
      let l = c.label + (hs.length > 1 ? ' · ' + t('화음') : '');
      const d = base === null ? 0 : hs[0].pos - base;
      if (hs.length === 1 && d) l += ' · ' + t(d > 0 ? '{n}칸 위' : '{n}칸 아래', { n: Math.abs(d) });
      return Object.assign({}, c, { label: l });
    });
  }
  function paletteFor(s, after) {
    const fr = frame();
    const heads = s.kind === 'note' && s.value && s.value.heads ? s.value.heads : [{ pos: R.posAt(s.y, { staffTop: fr.top, sp: fr.sp }), acc: null }];
    const AC = [[1, '올림표 ♯'], [-1, '내림표 ♭'], [0, '제자리표 ♮']];
    const items = paletteItems(heads).concat(AC.map(([a, l]) => ({ label: t(l), value: { acc: a } })));
    const grid = h('div', { class: 'cand-grid' });
    const sh = UI.sheet({ title: t('어떤 기호인가요?'), body: [grid] });
    items.forEach(c => grid.appendChild(candBtn(c, false, () => { if (!s.cands.some(x => JSON.stringify(x.value) === JSON.stringify(c.value))) s.cands.push(c); pick(s, c.value); sh.close(); if (after) after(c.value); })));
  }
  function paletteItems(heads) {
    const NT = [['whole', '온음표'], ['half', '2분음표'], ['quarter', '4분음표'], ['eighth', '8분음표'], ['16th', '16분음표']];
    const RS = [['whole', '온쉼표'], ['half', '2분쉼표'], ['quarter', '4분쉼표'], ['eighth', '8분쉼표'], ['16th', '16분쉼표']];
    return NT.map(([tp, l]) => ({ label: t(l), value: { type: tp, dots: 0, heads: heads.map(hd => ({ pos: hd.pos, acc: hd.acc })) } }))
      .concat(RS.map(([r, l]) => ({ label: t(l), value: { rest: r } })));
  }
  function pick(s, value) {
    const key = symKey(s);
    locks = locks.filter(l => l.key !== key).concat([{ key, value, orig: s.cands[0] && s.cands[0].value, ids: s.ids.slice() }]);
    applyValue(s, value); s.locked = true; s.amb = false;
    draw(); drawBar();
  }
  function redraw(s) {
    const ids = new Set(s.ids);
    ink = ink.filter(x => !ids.has(x.id));
    recognizeAll();
  }

  // ── 아래 막대 (손글씨일 때) ──
  function drawBar() {
    if (SJ.FocusInput && F().st && F().st.inputMode === 'pen') SJ.FocusInput.drawTools();
  }
  HW.barRow = function () {
    const ask = syms.filter(s => s.amb || s.kind === 'unknown').length;
    const row = h('div', { class: 'nrow hw-row' });
    if (!ink.length) {
      row.appendChild(h('span', { class: 'hw-hint', text: HW.penSeen() ? t('펜으로 오선에 그려 보세요 · 손가락은 고르기') : t('오선에 손가락으로 그려 보세요 · 다 그리고 [완료]') }));
      return row;
    }
    // (그리는 중에는 '확인' 단추 · 알아들은 수를 보이지 않음 — 손을 멈추면 나타남)
    if (settled) {
      if (ask) row.appendChild(h('button', { class: 'btn warn compact', text: t('? {n}개 확인', { n: ask }), onclick: () => { const s = syms.find(x => x.amb || x.kind === 'unknown'); if (s) chooseFor(s); } }));
      else row.appendChild(h('span', { class: 'hw-hint ok', text: t('{n}개 알아들었어요 · [완료]나 다음 마디로 넣어요', { n: syms.length }) }));
    }
    row.appendChild(h('button', { class: 'btn compact', html: SJ.icon('undo') + '<span>' + U.esc(t('한 획 지우기')) + '</span>', onclick: () => HW.undoStroke() }));
    // 모두 지우기는 실수로 눌러도 되돌릴 수 있게(알림의 [되돌리기] = 지우기 전 잉크 그대로)
    row.appendChild(h('button', { class: 'btn compact', text: t('모두 지우기'), onclick: () => { snap(); ink = []; locks = []; recognizeAll(); UI.toast(t('모두 지웠어요'), { action: { label: t('되돌리기'), fn: () => HW.undoStroke() } }); } }));
    return row;
  };
  HW.hasInk = () => ink.length > 0 || !!cur;
  // 되돌리기 = 잉크 한 단계(획 하나 더한 것 · 긁어 지운 것)
  HW.undoStroke = function () {
    if (!ink.length && !hist.length) return false;
    const h0 = hist.pop();
    if (h0) { ink = h0.ink; locks = h0.locks; } else ink.pop();
    recognizeAll();
    return true;
  };
  HW.penActive = () => !!(cur && cur.pen);
  // 앱이 뒤로 갈 때 · 다시 열 때: 아직 넣지 않은 잉크도 임시 저장에 함께
  HW.snapshot = () => ink.map(s => ({ pts: s.pts, uc: s.uc, a: s.a }));
  HW.restore = function (list) {
    if (!list || !list.length) return;
    ink = list.map(s => Object.assign({ id: nextId++ }, s)); hist = []; locks = [];
    setTimeout(recognizeAll, 60);
  };

  /* ── 마디에 넣기 ── → Promise<boolean> (false = 사용자가 돌아가서 고치기로 함)
   * 막아 세우지 않는다(조수 협의 11-02 · 사용자 "계속 이거 맞아요 저거 맞아요? 물어서 불편하지 않게"): 후보가 있는 '?'는 1등으로 넣고
   * 주황 표시 + 후보를 음표에 함께 남긴다(나중에 그 음표를 누르면 같은 후보 그림 — HW.fixEvent).
   * 묻는 것은 '알아보지 못한 획'(후보 하나 없음)뿐 — 그냥 넘어가면 몰래 사라지는 것이라. */
  HW.flush = async function () {
    if (!F().st) return true;
    if (cur) { const e = { pointerId: cur.id }; canvas.dispatchEvent(new PointerEvent('pointerup', e)); }
    if (!ink.length) return true;
    recognizeAll();
    const open = syms.filter(s => s.kind === 'unknown' || !s.value);
    if (open.length) {
      const ok = await review(open);
      if (!ok) return false;
    }
    // 넘침 질문은 답을 받은 뒤에 다음 마디로 가거나 닫는다(답이 엉뚱한 마디에 적용되지 않게) · 취소면 false = 머문다
    return (await commit()) !== false;
  };
  /* 아래 막대(♯ · ♭ · ♮ · 점 · 붙임줄)를 그리는 중에 누르면: 이미 넣은 음표가 아니라 '방금 그린' 오른쪽 끝 음표에 */
  HW.modifyLast = function (kind, val) {
    const n = syms.filter(s => s.kind === 'note' && s.value && s.value.heads).sort((a, b) => b.x - a.x)[0];
    if (!n) return false;
    const v = JSON.parse(JSON.stringify(n.value));
    if (kind === 'acc') v.heads = v.heads.map((hd, i) => (i === 0 ? Object.assign({}, hd, { acc: hd.acc === val ? null : val }) : hd));
    else if (kind === 'dot') v.dots = (v.dots || 0) >= 1 ? 0 : 1;
    else if (kind === 'tie') v.tie = !v.tie;
    pick(n, v);
    return true;
  };
  function review(open) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (done) return; done = true; sh.close(); resolve(v); };
      const body = h('div', {});
      const draw2 = () => {
        body.innerHTML = '';
        body.appendChild(h('p', { class: 'small muted', text: t('알아보지 못한 획이 있어요. 기호를 고르거나, 넣지 않고 넘어갈 수 있어요.') }));
        open.forEach((s, i) => {
          const grid = h('div', { class: 'cand-grid' });
          nameCands(s.cands.filter(c => c.value).slice(0, 4)).forEach((c, ci) => grid.appendChild(candBtn(c, s.locked && ci === 0, () => { pick(s, c.value); draw2(); })));
          grid.appendChild(h('button', { class: 'cand redraw', onclick: () => paletteFor(s, () => draw2()) }, [h('span', { class: 'ci', html: SJ.icon('more') }), h('span', { class: 'cl', text: t('다른 기호') })]));
          grid.appendChild(h('button', { class: 'cand redraw', onclick: () => { s.skip = !s.skip; draw2(); } }, [h('span', { class: 'ci', html: SJ.icon('x') }), h('span', { class: 'cl', text: s.skip ? t('넣지 않음 ✓') : t('넣지 않기') })]));
          body.appendChild(h('div', { class: 'rv-item' }, [h('b', { text: t('{n}번째 기호', { n: i + 1 }) + (s.locked ? ' ✓' : '') }), grid]));
        });
      };
      draw2();
      const sh = UI.sheet({
        title: t('이 획은 무엇인가요?'), body: [body],
        foot: [h('button', { class: 'btn', text: t('돌아가서 고치기'), onclick: () => finish(false) }), h('button', { class: 'btn primary', text: t('이대로 넣기'), onclick: () => finish(true) })],
        onClose: () => finish(false)
      });
    });
  }
  // 인식 결과 값 → 마디 이벤트 (넣기 · 나중에 고치기가 함께 씀)
  function eventFrom(m, value, c, st) {
    if (value.rest !== undefined) return S.newRest({ type: value.rest, dots: 0 });
    const heads = value.heads.map(hd => {
      const base = P.headFromPos(hd.pos, c.clef, c.fifths);
      const alter = hd.acc !== null && hd.acc !== undefined ? hd.acc : ME.alterFor(m, st.staffId, base.step, base.octave, c.fifths, 1e12);
      return { step: base.step, octave: base.octave, alter };
    });
    const ev = S.newNote({ type: value.type, dots: value.dots || 0 }, heads);
    if (value.staccato) ev.articulations.push('staccato');
    if (value.tie) ev.heads.forEach(hd => { hd.tieNext = true; });
    return ev;
  }
  /* 넣은 뒤 주황(확실하지 않음) 음표 · 쉼표 고치기: 넣을 때 남긴 후보 그림 + [다른 기호] + [맞아요] — 막아 세우지 않고 언제든 한 번에 */
  HW.fixEvent = function (eventId) {
    const st = F().st; if (!st) return false;
    const v0 = ME.voice(st.measure, st.staffId, st.vi);
    const ev = v0.events.find(e => e.id === eventId);
    if (!ev || !ev['x-check'] || !ev['x-cands']) return false;
    const c = ctx();
    const cands = ev['x-cands'];
    const firstNote = cands.find(cd => cd.value.heads);
    const heads = firstNote ? firstNote.value.heads : [{ pos: 4, acc: null }];
    const apply = value => {
      F().change(m => {
        const v = ME.voice(m, st.staffId, st.vi);
        const i = v.events.findIndex(e => e.id === eventId);
        if (i < 0) return;
        const old = v.events[i], nv = eventFrom(m, value, c, st);
        // 따로 붙인 아티큘레이션 · 셈여림은 음표끼리면 그대로 옮김
        if (old.kind === 'note' && nv.kind === 'note') { (old.articulations || []).forEach(a => { if (nv.articulations.indexOf(a) < 0) nv.articulations.push(a); }); if (old.dynamic) nv.dynamic = old.dynamic; }
        v.events.splice(i, 1, nv);
      });
      F().render();
    };
    const confirm = () => { F().change(m => { const e = ME.voice(m, st.staffId, st.vi).events.find(x => x.id === eventId); if (e) { delete e['x-check']; delete e['x-cands']; } }); F().render(); };
    const list = h('div', { class: 'cand-grid' });
    const sh = UI.sheet({ title: t('이렇게 그린 기호가 무엇인가요?'), body: [h('p', { class: 'small muted', text: t('가장 비슷한 것부터 보여 드려요. 고르면 그대로 넣어요.') }), list] });
    nameCands(cands.slice(0, 4)).forEach((cd, i) => list.appendChild(candBtn(cd, i === 0, () => { sh.close(); if (i === 0) confirm(); else apply(cd.value); })));
    list.appendChild(h('button', { class: 'cand redraw', onclick: () => {
      sh.close();
      const grid = h('div', { class: 'cand-grid' });
      const sh2 = UI.sheet({ title: t('어떤 기호인가요?'), body: [grid] });
      paletteItems(heads).forEach(cd => grid.appendChild(candBtn(cd, false, () => { sh2.close(); apply(cd.value); })));
    } }, [h('span', { class: 'ci', html: SJ.icon('more') }), h('span', { class: 'cl', text: t('다른 기호') })]));
    return true;
  };
  function commit() {
    const st = F().st, L = F().L;
    const fr = frame();
    const c = ctx();
    const placeable = syms.filter(s => !s.skip && s.kind !== 'unknown' && s.value);
    // 배우기: 사용자가 바꿔 고른 답만 (그 사람 글씨로)
    locks.forEach(lk => {
      try {
        const s = syms.find(x => x.locked && symKey(x) === lk.key);
        if (!s || !lk.orig || JSON.stringify(lk.orig) === JSON.stringify(lk.value)) return;
        const strokes = ink.filter(x => lk.ids.indexOf(x.id) >= 0).map(x => strokePx(fr, x));
        const v = lk.value;
        if (v.type && s.headInner !== null && s.headInner !== undefined && lk.orig.type) {
          const wasFilled = !(lk.orig.type === 'whole' || lk.orig.type === 'half'), nowFilled = !(v.type === 'whole' || v.type === 'half');
          if (wasFilled !== nowFilled) R.learnFill(s.headInner, nowFilled);
        } else {
          const label = v.rest ? { quarter: 'r:quarter', eighth: 'r:eighth', '16th': 'r:16th', whole: 'r:bar', half: 'r:bar' }[v.rest] :
            v.acc !== undefined ? { 1: 'sharp', '-1': 'flat', 0: 'natural', 2: 'dsharp', '-2': 'dflat' }[v.acc] : v.art || null;
          if (label) R.learn(label, strokes);
        }
      } catch (e) { /* 배우기 실패는 무시 */ }
    });
    const unsure = placeable.filter(s => s.amb && !s.locked);
    let overflow = false, dropped = 0;
    F().change(m => {
      const v = ME.voice(m, st.staffId, st.vi);
      const existing = v.events.map(e => ({ id: e.id, x: L.events[e.id] ? L.events[e.id].x : -1 }));
      const ids = [];
      placeable.filter(s => s.kind === 'note' || s.kind === 'rest').sort((a, b) => a.x - b.x).forEach(s => {
        const ev = eventFrom(m, s.value, c, st);
        if (unsure.indexOf(s) >= 0) {
          ev['x-check'] = true;
          // 후보도 함께(나중에 이 음표를 누르면 같은 후보 그림으로 고침 — HW.fixEvent)
          ev['x-cands'] = s.cands.filter(cd => cd.value && (cd.value.type || cd.value.rest !== undefined)).slice(0, 5).map(cd => ({ label: cd.label, value: cd.value }));
        }
        let idx = existing.filter(e => e.x >= 0 && e.x < s.x).length;
        ids.forEach(id => { const i = v.events.findIndex(e => e.id === id); if (i >= 0 && i + 1 > idx) idx = i + 1; });
        v.events.splice(idx, 0, ev);
        ids.push(ev.id);
        s.eventId = ev.id;
      });
      if (ids.length) st.cursor = Math.max(st.cursor, v.events.findIndex(e => e.id === ids[ids.length - 1]) + 1);
      // 홀로 쓴 임시표 · 붙임줄 · 아티큘레이션 · 셈여림 → 가장 가까운 음표에
      // 따로 쓴 기호는 가까운(maxD 안) 음표에만 붙인다 — 멀리 찍힌 점 · ♯가 엉뚱한 음표에 말없이 붙던 것(점검원 ① 11-02)
      const nearest = (x, side, maxD) => {
        let best = null, bd = maxD || 1e9;
        v.events.forEach(e => {
          if (e.kind !== 'note') return;
          const pe = L.events[e.id];
          const ex = pe ? pe.x : (placeable.find(s => s.eventId === e.id) || {}).x;
          if (ex === undefined) return;
          if (side === 'right' && ex < x - 4) return;
          if (side === 'left' && ex > x + 4) return;
          const d = Math.abs(ex - x);
          if (d < bd) { bd = d; best = e; }
        });
        return best;
      };
      const dyn = placeable.filter(s => s.kind === 'dyn').sort((a, b) => a.x - b.x);
      const dynText = dyn.map(s => s.value.dynLetter).join('');
      const near = 4 * fr.sp;
      placeable.forEach(s => {
        if (s.kind === 'accidental') { const e = nearest(s.x1 || s.x, 'right', near); if (e) e.heads[0].alter = s.value.acc; else dropped++; }
        else if (s.kind === 'tie') { const e = nearest(s.x, 'left', 2 * near); if (e) e.heads.forEach(hd => { hd.tieNext = true; }); else dropped++; }
        else if (s.kind === 'artic') { const e = nearest(s.x, null, near); if (e) { if (e.articulations.indexOf(s.value.art) < 0) e.articulations.push(s.value.art); } else dropped++; }
      });
      if (dynText && SJ.Decor.DYNAMICS.indexOf(dynText) >= 0) { const e = nearest(dyn[0].x, null); if (e) e.dynamic = dynText; }
      overflow = ME.total(v) > SJ.Dur.measureTicks(S.timeAt(F().viewScore(), st.mi)) && !m.attrs.pickup;
    }, { noRender: true });
    if (dropped) UI.toast(t('붙일 음표가 가까이 없어 기호 {n}개는 넣지 않았어요', { n: dropped }));
    else if (unsure.length) UI.toast(t('확실하지 않은 기호는 주황색으로 남겨 뒀어요 · 톡 해서 확인'));
    const back = { ink, locks, hist };
    ink = []; syms = []; locks = []; hist = [];
    F().render();
    if (!overflow) return Promise.resolve(true);
    // 박 넘침 → [방금 입력 취소](또는 창 닫기)면: 넣은 것은 되돌리고 그린 잉크는 그대로 되살려 이 마디에 머문다(그린 것이 다 사라지던 문제 · 점검원 ① 11-02)
    return SJ.FocusInput.askOverflow().then(ch => {
      if (ch !== 'undo' && ch !== null) return true;
      ink = back.ink; locks = back.locks; hist = back.hist;
      // 되돌린 '넣기'를 [다시 실행]으로 되살리면 잉크와 함께 음표가 두 벌이 됨 → 다시 실행 기록을 비우고, 자리표가 잉크와 겹치지 않게 다시 그림(점검원 ① 해소 확인)
      if (F().st && F().st.redo) F().st.redo = [];
      F().render();
      recognizeAll();
      UI.toast(t('넣기를 취소했어요 · 그린 것은 그대로 있어요'));
      return false;
    });
  }
  // 예전 이름 (focus.js 등에서 부름): 남은 잉크를 넣기 — 묻지 않고(주황 표시)
  HW.commitAll = function () { if (!ink.length) return; recognizeAll(); commit(); };
  HW.reset = function () { ink = []; syms = []; locks = []; hist = []; cur = null; clearTimeout(timer); if (g) { g.clearRect(0, 0, canvas.width, canvas.height); svg.innerHTML = ''; badgeEl.innerHTML = ''; } };

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
