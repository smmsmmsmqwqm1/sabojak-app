/* 음표 간격 (§5): 음길이에 비례하되 지수 0.6의 완만한 곡선. 최소 간격은 기호 폭으로. */
(function (SJ) {
  'use strict';
  const C = SJ.C;
  const Sp = {};

  // 시간 간격(틱) → 이상적 간격(sp)
  Sp.ideal = function (ticks) {
    if (ticks <= 0) return 0;
    const v = C.spaceQuarter * Math.pow(ticks / C.PPQ, C.spaceExponent);
    return Math.max(1.25, v);
  };

  /* gaps: [{min, ideal}] , total: 나눌 전체 폭 → 각 간격 폭 배열.
   * 이상적 간격에 같은 배율을 곱하되 최소값 아래로는 내려가지 않게 (물 채우기 방식, 결정적). */
  Sp.distribute = function (gaps, total) {
    const n = gaps.length;
    if (!n) return [];
    const sumMin = gaps.reduce((a, g) => a + g.min, 0);
    if (total <= sumMin + 1e-9) {
      // 모자라면 최소 간격 비율대로 (겹침 방지 우선)
      const f = sumMin > 0 ? total / sumMin : 0;
      return gaps.map(g => g.min * f);
    }
    // 배율 s: sum(max(min, ideal*s)) = total
    const fixed = new Array(n).fill(false);
    let s = 1;
    for (let iter = 0; iter < n + 2; iter++) {
      let fixedSum = 0, idealSum = 0;
      for (let i = 0; i < n; i++) { if (fixed[i]) fixedSum += gaps[i].min; else idealSum += Math.max(gaps[i].ideal, 1e-6); }
      s = idealSum > 0 ? (total - fixedSum) / idealSum : 1;
      let changed = false;
      for (let i = 0; i < n; i++) {
        if (!fixed[i] && Math.max(gaps[i].ideal, 1e-6) * s < gaps[i].min) { fixed[i] = true; changed = true; }
      }
      if (!changed) break;
    }
    return gaps.map((g, i) => fixed[i] ? g.min : Math.max(g.ideal, 1e-6) * s);
  };

  SJ.Spacing = Sp;
})(window.SJ = window.SJ || {});
