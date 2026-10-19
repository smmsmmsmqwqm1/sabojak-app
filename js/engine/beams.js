/* 빔 묶음 규칙 (§5): 박자에 따른 박 단위 자동 묶음 + 사용자 강제 묶기/풀기 */
(function (SJ) {
  'use strict';
  const D = SJ.Dur, PPQ = SJ.C.PPQ;
  const B = {};

  // 박자표 → 묶음 경계 틱 목록 (마디 시작 0 포함, 끝 포함)
  B.cuts = function (time, cap, beam44) {
    const num = time.num, den = time.den;
    const unit = PPQ * 4 / den;
    let groups = [];
    if (den === 8 || den === 16) {
      if (num % 3 === 0) groups = new Array(num / 3).fill(3);
      else if (num === 5) groups = [3, 2];
      else if (num === 7) groups = [2, 2, 3];
      else if (num === 8) groups = [3, 3, 2];
      else groups = new Array(Math.ceil(num / 2)).fill(2);
      groups = groups.map(g => g * unit);
    } else if (den === 2) {
      groups = new Array(num).fill(unit);
    } else {
      groups = new Array(num).fill(unit);
    }
    const cuts = [0];
    let t = 0;
    groups.forEach(g => { t += g; cuts.push(t); });
    if (t < cap) cuts.push(cap);
    cuts.half = (num === 4 && den === 4 && beam44 !== 'beat') ? [0, 2 * PPQ, 4 * PPQ] : null;
    return cuts;
  };

  function groupIndex(cuts, tick) {
    for (let i = cuts.length - 1; i >= 0; i--) if (tick >= cuts[i]) return i;
    return 0;
  }

  /* infos: 한 성부의 이벤트 정보 [{ev, start, ticks, grace}] → 빔 그룹 배열 [[idx...], ...] */
  B.groups = function (infos, time, cap, beam44) {
    const cuts = B.cuts(time, cap, beam44);
    const beamable = i => {
      const x = infos[i];
      return x.ev.kind === 'note' && !x.grace && D.flags(x.ev.dur.type) > 0 && x.ev.beam !== 'none';
    };
    const raw = [];
    let cur = [];
    let curGroup = -1;
    const flush = () => { if (cur.length >= 2) raw.push(cur); cur = []; };
    for (let i = 0; i < infos.length; i++) {
      const x = infos[i];
      if (x.grace) continue;
      if (!beamable(i)) {
        flush();
        curGroup = -1;
        continue;
      }
      const g = groupIndex(cuts, x.start);
      const force = x.ev.beam === 'force' && cur.length > 0;
      // 음이 박 경계를 걸치면 그 뒤로 새 묶음
      if (cur.length && !force && g !== curGroup) flush();
      cur.push(i);
      curGroup = g;
      const endTick = x.start + x.ticks;
      if (!force && cuts.indexOf(endTick) >= 0 && infos[i + 1] && infos[i + 1].ev.beam !== 'force') { flush(); curGroup = -1; }
    }
    flush();
    // 4/4 두 박 묶기: 같은 반 마디 안의 8분음표 4개 묶음 둘을 하나로
    if (cuts.half) {
      const merged = [];
      for (let gi = 0; gi < raw.length; gi++) {
        const a = raw[gi], b = raw[gi + 1];
        const all8 = arr => arr.every(i => infos[i].ev.dur.type === 'eighth' && !infos[i].ev.dur.dots && !infos[i].ev.dur.tuplet);
        if (b && all8(a) && all8(b) && a.length === 2 && b.length === 2) {
          const s = infos[a[0]].start;
          const e = infos[b[b.length - 1]].start + infos[b[b.length - 1]].ticks;
          const contiguous = b[0] === a[a.length - 1] + 1;
          if (contiguous && (s === 0 || s === 2 * PPQ) && e === s + 2 * PPQ) { merged.push(a.concat(b)); gi++; continue; }
        }
        merged.push(a);
      }
      return merged;
    }
    return raw;
  };

  SJ.Beams = B;
})(window.SJ = window.SJ || {});
