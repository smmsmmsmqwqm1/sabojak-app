/* 마디 집중 모드의 편집 연산 — 마디 복사본(draft)을 직접 고친다. 확인 때 악보에 한 번에 반영(되돌리기 1단계). */
(function (SJ) {
  'use strict';
  const U = SJ.U, D = SJ.Dur, P = SJ.Pitch, S = SJ.Score;
  const ME = {};

  ME.voice = function (m, staffId, vi) {
    const sm = m.staves[staffId];
    while (sm.voices.length <= vi) sm.voices.push(S.newVoice());
    return sm.voices[vi];
  };
  ME.total = function (v) { return D.voiceStarts(v).total; };
  ME.starts = function (v) { return D.voiceStarts(v).starts; };

  // 커서 앞까지의 같은 음(이름+옥타브) 임시표 상태 → 조표 반영한 alter
  ME.alterFor = function (m, staffId, step, octave, fifths, beforeTick) {
    let alter = P.keyAlter(step, fifths);
    const evs = [];
    m.staves[staffId].voices.forEach(v => { const st = D.voiceStarts(v).starts; v.events.forEach((ev, i) => evs.push({ ev, t: st[i] })); });
    evs.sort((a, b) => a.t - b.t);
    evs.forEach(x => {
      if (x.t >= beforeTick || x.ev.kind !== 'note') return;
      x.ev.heads.forEach(h => { if (h.step === step && h.octave === octave) alter = h.alter || 0; });
    });
    return alter;
  };

  ME.insert = function (v, index, ev) { v.events.splice(U.clamp(index, 0, v.events.length), 0, ev); };
  ME.remove = function (v, index) {
    const ev = v.events.splice(index, 1)[0];
    if (ev && ev.dur.tuplet && !v.events.some(e => e.dur.tuplet === ev.dur.tuplet)) v.tuplets = v.tuplets.filter(t => t.id !== ev.dur.tuplet);
    return ev;
  };

  // 화음에 음 더하기 (같은 음이면 무시)
  ME.addHead = function (ev, head) {
    if (ev.kind !== 'note') return false;
    if (ev.heads.some(h => h.step === head.step && h.octave === head.octave)) return false;
    ev.heads.push(head);
    ev.heads.sort((a, b) => P.dn(a) - P.dn(b));
    return true;
  };

  // 남은 길이를 쉼표로 채우기 (박 경계에 맞춰)
  ME.fillRests = function (v, cap, time) {
    const tot = ME.total(v);
    if (tot >= cap) return 0;
    const ds = D.fillRests(tot, cap, D.beatTicks(time));
    ds.forEach(d => v.events.push(S.newRest(d)));
    return ds.length;
  };

  /* 넘침 나누기: 마디 길이를 넘는 부분을 잘라 '다음 마디로 이월'할 이벤트 목록을 돌려준다.
   * 경계에 걸친 음은 붙임줄로 나눈다(쉼표는 그냥 나눔). 잇단음 안에서는 나누지 않고 통째로 넘긴다. */
  ME.splitOverflow = function (v, cap) {
    const vs = D.voiceStarts(v);
    if (vs.total <= cap) return { events: [], tuplets: [] };
    let i = 0;
    while (i < v.events.length && vs.starts[i] + D.eventTicks(v.events[i], vs.tmap) <= cap) i++;
    const carry = [];
    if (i < v.events.length) {
      const ev = v.events[i];
      const start = vs.starts[i];
      const inside = cap - start;
      if (inside > 0 && !ev.dur.tuplet && !(ev.kind === 'note' && ev.grace)) {
        const total = D.eventTicks(ev, vs.tmap);
        const a = D.decompose(inside), b = D.decompose(total - inside);
        if (!a.remainder && !b.remainder && a.durs.length && b.durs.length) {
          const first = a.durs.map((d, k) => ME.cloneWith(ev, d, k > 0));
          const second = b.durs.map(d => ME.cloneWith(ev, d, true));
          // 붙임줄 연결
          const chain = first.concat(second);
          if (ev.kind === 'note') chain.forEach((e, k) => { e.heads.forEach((h, hi) => { h.tieNext = k < chain.length - 1 ? true : !!ev.heads[hi].tieNext; }); });
          v.events.splice(i, 1, ...first);
          carry.push(...second);
          i += first.length;
        }
      }
      carry.push(...v.events.splice(i));
    }
    // 이월된 잇단음 정의도 옮김
    const ids = new Set(carry.map(e => e.dur.tuplet).filter(Boolean));
    const tups = v.tuplets.filter(t => ids.has(t.id));
    v.tuplets = v.tuplets.filter(t => !ids.has(t.id) || v.events.some(e => e.dur.tuplet === t.id));
    return { events: carry, tuplets: tups };
  };
  ME.cloneWith = function (ev, dur, keepOnlyPitch) {
    const c = U.clone(ev);
    c.id = U.sid();
    c.dur = { type: dur.type, dots: dur.dots };
    if (keepOnlyPitch) { delete c.lyrics; delete c.dynamic; c.articulations = []; }
    return c;
  };
  // 다음 마디 앞에 이월 이벤트 넣기 (그 마디 성부가 넘치면 또 넘김은 하지 않음 — 표시만)
  ME.prependCarry = function (m, staffId, vi, carry) {
    if (!carry || !carry.events || !carry.events.length) return;
    const v = ME.voice(m, staffId, vi);
    v.events = carry.events.concat(v.events);
    v.tuplets = (carry.tuplets || []).concat(v.tuplets);
  };

  // 잇단음 시작: 이 음부터 actual 개(기보 길이 기준)를 묶는 그룹
  ME.newTuplet = function (v, actual, normal, unitType) {
    const t = { id: U.sid(), actual, normal, unit: unitType };
    v.tuplets.push(t);
    return t;
  };
  // 잇단음이 다 찼는지 (기보 길이 합 ≥ actual × 단위)
  ME.tupletFull = function (v, tupletId) {
    const t = v.tuplets.find(x => x.id === tupletId);
    if (!t) return true;
    const unit = D.base(t.unit || 'eighth');
    const sum = v.events.filter(e => e.dur.tuplet === tupletId).reduce((a, e) => a + D.notated(e.dur), 0);
    return sum >= t.actual * unit;
  };

  // 머리 위/아래 한 칸 (온음계), 임시표는 조표·마디 상태로 다시 계산
  ME.stepHead = function (m, staffId, ev, hi, delta, fifths, tick) {
    const h = ev.heads[hi];
    const s = P.fromDn(P.dn(h) + delta);
    const nh = Object.assign({}, h, { step: s.step, octave: s.octave });
    nh.alter = ME.alterFor(m, staffId, s.step, s.octave, fifths, tick);
    delete nh.accidental;
    ev.heads[hi] = nh;
    ev.heads.sort((a, b) => P.dn(a) - P.dn(b));
    return ev.heads.indexOf(nh);
  };
  ME.octave = function (ev, delta) {
    if (ev.kind !== 'note') return;
    ev.heads = ev.heads.map(h => Object.assign({}, h, { octave: U.clamp(h.octave + delta, 0, 9) }));
  };

  // 박 상태 문자열 (UI)
  ME.beatInfo = function (v, cap, time, pickup) {
    const tot = ME.total(v);
    const unit = SJ.C.PPQ * 4 / time.den;
    const fmt = t => { const x = Math.round(t / unit * 100) / 100; return String(x); };
    if (tot === cap) return { state: 'full', remain: 0, text: fmt(0) };
    if (tot > cap) return { state: 'over', over: tot - cap, text: fmt(tot - cap) };
    return { state: pickup ? 'pickup' : 'short', remain: cap - tot, text: fmt(cap - tot) };
  };

  SJ.MeasureEdit = ME;
})(window.SJ = window.SJ || {});
