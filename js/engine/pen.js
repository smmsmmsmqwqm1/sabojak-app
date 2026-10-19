/* 펜 도구: 점 목록(+두께) → 붓글씨 같은 채운 윤곽 path.
 * 악보 글리프(음자리표·꼬리·쉼표·중괄호 등)를 앱 안에서 만들어 낸다.
 * 좌표 단위 = sp, y는 아래로 증가. */
(function (SJ) {
  'use strict';
  const P = {};
  const f = n => (Math.round(n * 1000) / 1000).toString();

  // 구심형 Catmull-Rom: 매듭점을 지나는 부드러운 곡선 표본
  function crSegment(p0, p1, p2, p3, n, out, wa, wb, wOut) {
    const tj = (ti, a, b) => ti + Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6, 0.5);
    const t0 = 0, t1 = tj(t0, p0, p1), t2 = tj(t1, p1, p2), t3 = tj(t2, p2, p3);
    for (let i = 0; i < n; i++) {
      const t = t1 + (t2 - t1) * (i / n);
      const L = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
      const A1 = L(p0, p1, t0, t1), A2 = L(p1, p2, t1, t2), A3 = L(p2, p3, t2, t3);
      const B1 = L(A1, A2, t0, t2), B2 = L(A2, A3, t1, t3);
      const C = L(B1, B2, t1, t2);
      out.push(C);
      const u = i / n, s = (1 - Math.cos(Math.PI * u)) / 2;
      wOut.push(wa + (wb - wa) * s);
    }
  }

  // 매듭점 [[x,y,w], ...] → 표본점과 두께
  P.sample = function (knots, per) {
    per = per || 14;
    const pts = [], ws = [];
    const k = knots;
    for (let i = 0; i < k.length - 1; i++) {
      const p0 = k[Math.max(0, i - 1)], p1 = k[i], p2 = k[i + 1], p3 = k[Math.min(k.length - 1, i + 2)];
      const e0 = i === 0 ? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]] : p0;
      const e3 = i + 2 >= k.length ? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]] : p3;
      crSegment(e0, p1, p2, e3, per, pts, p1[2], p2[2], ws);
    }
    const last = k[k.length - 1];
    pts.push([last[0], last[1]]); ws.push(last[2]);
    return { pts, ws };
  };

  // 표본 → 윤곽 polygon (둥근 끝)
  P.outline = function (pts, ws, opts) {
    opts = opts || {};
    const n = pts.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const h = ws[i] / 2;
      L.push([pts[i][0] - dy * h, pts[i][1] + dx * h]);
      R.push([pts[i][0] + dy * h, pts[i][1] - dx * h]);
    }
    const poly = L.slice();
    // 끝 둥글게
    const cap = (c, from, to, w, steps) => {
      const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
      let a1 = Math.atan2(to[1] - c[1], to[0] - c[0]);
      let da = a1 - a0;
      if (opts.capDir === undefined) { while (da > 0) da -= 2 * Math.PI; while (da < -2 * Math.PI) da += 2 * Math.PI; if (da < -Math.PI * 1.01) da += 2 * Math.PI; }
      const out = [];
      for (let s = 1; s < steps; s++) { const aa = a0 + da * s / steps; out.push([c[0] + Math.cos(aa) * w / 2, c[1] + Math.sin(aa) * w / 2]); }
      return out;
    };
    if (opts.roundEnd !== false) cap(pts[n - 1], L[n - 1], R[n - 1], ws[n - 1], 6).forEach(p => poly.push(p));
    for (let i = n - 1; i >= 0; i--) poly.push(R[i]);
    if (opts.roundStart !== false) cap(pts[0], R[0], L[0], ws[0], 6).forEach(p => poly.push(p));
    return poly;
  };

  P.polyD = function (poly) {
    let d = 'M' + f(poly[0][0]) + ' ' + f(poly[0][1]);
    for (let i = 1; i < poly.length; i++) d += 'L' + f(poly[i][0]) + ' ' + f(poly[i][1]);
    return d + 'Z';
  };

  P.stroke = function (knots, opts) {
    const s = P.sample(knots, opts && opts.per);
    return P.polyD(P.outline(s.pts, s.ws, opts));
  };

  // 원 (반시계/시계 방향 선택: hole=true면 반대 방향)
  P.circle = function (cx, cy, r, hole) {
    const s = hole ? 0 : 1;
    return 'M' + f(cx - r) + ' ' + f(cy) + 'A' + f(r) + ' ' + f(r) + ' 0 1 ' + s + ' ' + f(cx + r) + ' ' + f(cy) +
      'A' + f(r) + ' ' + f(r) + ' 0 1 ' + s + ' ' + f(cx - r) + ' ' + f(cy) + 'Z';
  };

  // 회전 타원 (deg, y-아래 좌표에서 음수 = 반시계로 보임)
  P.ellipse = function (cx, cy, rx, ry, deg, hole) {
    const t = deg * Math.PI / 180, ux = rx * Math.cos(t), uy = rx * Math.sin(t);
    const s = hole ? 0 : 1;
    return 'M' + f(cx - ux) + ' ' + f(cy - uy) + 'A' + f(rx) + ' ' + f(ry) + ' ' + f(deg) + ' 1 ' + s + ' ' + f(cx + ux) + ' ' + f(cy + uy) +
      'A' + f(rx) + ' ' + f(ry) + ' ' + f(deg) + ' 1 ' + s + ' ' + f(cx - ux) + ' ' + f(cy - uy) + 'Z';
  };
  // 회전 타원의 가로/세로 반폭
  P.ellipseExt = function (rx, ry, deg) {
    const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    return [Math.sqrt(rx * rx * c * c + ry * ry * s * s), Math.sqrt(rx * rx * s * s + ry * ry * c * c)];
  };

  P.poly = function (pts) { return P.polyD(pts); };
  P.rect = function (x, y, w, h) { return P.polyD([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); };

  // 평행사변형 막대 (x0→x1, 가운데 y가 yc0→yc1, 두께 th)
  P.bar = function (x0, yc0, x1, yc1, th) {
    return P.polyD([[x0, yc0 - th / 2], [x1, yc1 - th / 2], [x1, yc1 + th / 2], [x0, yc0 + th / 2]]);
  };

  SJ.Pen = P;
})(window.SJ = window.SJ || {});
