/* 음길이·틱 계산 — 정수 틱만 사용 (PPQ = 20160). 부동소수점 박 계산 금지. */
(function (SJ) {
  'use strict';
  const PPQ = SJ.C.PPQ;
  const D = {};

  D.TYPES = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th'];
  const BASE = { whole: PPQ * 4, half: PPQ * 2, quarter: PPQ, eighth: PPQ / 2, '16th': PPQ / 4, '32nd': PPQ / 8, '64th': PPQ / 16 };
  D.BASE = BASE;

  D.base = function (type) { return BASE[type] || 0; };
  D.isValidType = function (t) { return Object.prototype.hasOwnProperty.call(BASE, t); };

  // 점을 반영한 기보 틱 (잇단음 비율 전)
  D.notated = function (dur) {
    const b = BASE[dur.type] || 0;
    const dots = dur.dots || 0;
    if (dots === 1) return b + b / 2;
    if (dots === 2) return b + b / 2 + b / 4;
    return b;
  };

  // 실제 틱: tupletMap = {id: {actual, normal}}
  D.ticks = function (dur, tupletMap) {
    let t = D.notated(dur);
    if (dur.tuplet && tupletMap && tupletMap[dur.tuplet]) {
      const tp = tupletMap[dur.tuplet];
      t = t * tp.normal / tp.actual;
    }
    return Math.round(t);
  };

  D.tupletMap = function (voice) {
    const m = {};
    (voice.tuplets || []).forEach(t => { m[t.id] = t; });
    return m;
  };

  // 이벤트의 실제 틱 (꾸밈음 = 0)
  D.eventTicks = function (ev, tmap) {
    if (ev.kind === 'note' && ev.grace) return 0;
    return D.ticks(ev.dur, tmap);
  };

  // 성부 안 각 이벤트의 시작 틱과 전체 길이
  D.voiceStarts = function (voice) {
    const tmap = D.tupletMap(voice);
    const starts = [];
    let t = 0;
    for (const ev of voice.events) { starts.push(t); t += D.eventTicks(ev, tmap); }
    return { starts, total: t, tmap };
  };

  D.flags = function (type) {
    return { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 }[type] || 0;
  };

  // 틱 → 기보 가능한 음길이 목록 (큰 것부터, 점 허용) — 쉼표 채우기·붙임줄 이월에 사용
  D.decompose = function (ticks, opts) {
    const out = [];
    let rest = ticks;
    const allowDots = !(opts && opts.noDots);
    let guard = 0;
    while (rest > 0 && guard++ < 64) {
      let picked = null;
      for (const type of D.TYPES) {
        const b = BASE[type];
        const cands = allowDots ? [b + b / 2 + b / 4, b + b / 2, b] : [b];
        const dots = allowDots ? [2, 1, 0] : [0];
        for (let i = 0; i < cands.length; i++) {
          if (cands[i] <= rest && Number.isInteger(cands[i])) {
            // 겹점은 쉼표 채우기에서 피함
            if (dots[i] === 2 && opts && opts.rest) continue;
            if (!picked || cands[i] > picked.t) picked = { type, dots: dots[i], t: cands[i] };
          }
        }
        if (picked) break;
      }
      if (!picked) break;            // 64분음표보다 작은 나머지 (잇단음 조각) — 기보 불가
      out.push({ type: picked.type, dots: picked.dots });
      rest -= picked.t;
    }
    return { durs: out, remainder: rest };
  };

  // 박 위치에 맞춘 쉼표 채우기: startTick부터 endTick까지, 박 경계를 넘지 않게 나눔
  D.fillRests = function (startTick, endTick, beatTicks) {
    const out = [];
    let t = startTick;
    let guard = 0;
    while (t < endTick && guard++ < 128) {
      const toBeat = beatTicks > 0 ? (beatTicks - (t % beatTicks)) : (endTick - t);
      let span = endTick - t;
      // 박 중간이면 다음 박까지 먼저 채움
      if (t % beatTicks !== 0 && toBeat < span) span = toBeat;
      const dec = D.decompose(span, { rest: true });
      if (!dec.durs.length) break;
      const d0 = dec.durs[0];
      out.push(d0);
      t += D.notated(d0);
    }
    return out;
  };

  // 박자표의 마디 길이(틱)
  D.measureTicks = function (time) {
    if (!time) return PPQ * 4;
    return Math.round(time.num * (PPQ * 4) / time.den);
  };
  // 박 단위 틱 (복합 박자는 점4분)
  D.beatTicks = function (time) {
    if (!time) return PPQ;
    const unit = PPQ * 4 / time.den;
    if (time.den >= 8 && time.num % 3 === 0 && time.num > 3) return unit * 3;
    return unit;
  };

  // 사람이 읽는 박 수 (UI): 4분음표 = 1박 기준 소수 1자리 문자열
  D.beatsLabel = function (ticks, time) {
    const unit = time ? PPQ * 4 / time.den : PPQ;
    const v = Math.round(ticks / unit * 100) / 100;
    return String(v);
  };

  SJ.Dur = D;
})(window.SJ = window.SJ || {});
