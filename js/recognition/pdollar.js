/* $P 점구름 인식기 (Vatavu·Anthony·Wobbrock 2012) — 획 순서·방향·개수와 무관하게 모양을 비교 */
(function (SJ) {
  'use strict';
  const Gm = SJ.RecGeom;
  const N = 32;
  const PD = { N };

  PD.normalize = function (strokes) {
    let pts = Gm.resample(strokes, N);
    // 크기 맞춤 (비율 유지)
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(p => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
    const s = Math.max(x1 - x0, y1 - y0) || 1;
    pts = pts.map(p => ({ x: (p.x - x0) / s, y: (p.y - y0) / s, id: p.id }));
    let cx = 0, cy = 0;
    pts.forEach(p => { cx += p.x; cy += p.y; });
    cx /= pts.length; cy /= pts.length;
    return pts.map(p => ({ x: p.x - cx, y: p.y - cy, id: p.id }));
  };

  function cloudDistance(a, b, start) {
    const n = a.length;
    const matched = new Array(n).fill(false);
    let sum = 0, i = start;
    do {
      let min = Infinity, idx = -1;
      for (let j = 0; j < n; j++) {
        if (matched[j]) continue;
        const d = (a[i].x - b[j].x) * (a[i].x - b[j].x) + (a[i].y - b[j].y) * (a[i].y - b[j].y);
        if (d < min) { min = d; idx = j; }
      }
      matched[idx] = true;
      const weight = 1 - ((i - start + n) % n) / n;
      sum += weight * Math.sqrt(min);
      i = (i + 1) % n;
    } while (i !== start);
    return sum;
  }
  PD.distance = function (pts, tpl) {
    const n = pts.length;
    const step = Math.floor(Math.pow(n, 0.5));
    let min = Infinity;
    for (let i = 0; i < n; i += step) {
      min = Math.min(min, cloudDistance(pts, tpl, i), cloudDistance(tpl, pts, i));
    }
    return min;
  };

  // templates: [{label, pts(정규화됨)}] → 이름별 최소 거리 순 [{label, score(0..1), dist}]
  PD.rank = function (strokes, templates, allow) {
    const pts = PD.normalize(strokes);
    const best = {};
    templates.forEach(tp => {
      if (allow && allow.indexOf(tp.label) < 0) return;
      const d = PD.distance(pts, tp.pts);
      if (best[tp.label] === undefined || d < best[tp.label]) best[tp.label] = d;
    });
    return Object.keys(best).map(l => ({ label: l, dist: best[l], score: Math.max(0, 1 - best[l] / 6) })).sort((a, b) => a.dist - b.dist);
  };

  SJ.PDollar = PD;
})(window.SJ = window.SJ || {});
