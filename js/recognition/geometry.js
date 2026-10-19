/* 필기 기하 도구: 획 특징(크기·닫힘·밀도·곧음·방향 전환), 다시 표본 뽑기 */
(function (SJ) {
  'use strict';
  const Gm = {};

  Gm.bbox = function (pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(p => { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; });
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  Gm.length = function (pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
  Gm.merge = function (a, b) { return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) }; };
  Gm.gap = function (a, b) {
    const dx = Math.max(0, Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1));
    const dy = Math.max(0, Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1));
    return Math.hypot(dx, dy);
  };

  // 획 하나의 특징 (단위 = sp)
  Gm.features = function (stroke, sp) {
    const pts = stroke.pts;
    const b = Gm.bbox(pts);
    const len = Gm.length(pts) / sp;
    const w = b.w / sp, h = b.h / sp;
    const diag = Math.hypot(w, h);
    const chord = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) / sp;
    const closed = diag > 0 ? chord / Math.max(diag, 0.2) : 0;
    // 방향 전환·감김은 손 떨림을 걸러 낸 매끈한 선으로 잰다 (일정 간격으로 다시 뽑고 이웃 평균)
    const sm = Gm.smooth(pts, sp);
    const smLen = Gm.length(sm) / sp;
    const straight = smLen > 0 ? Math.min(1, chord / smLen) : 1;
    // 방향 전환(지그재그) 수: 가로 방향 부호 바뀜
    let turnsX = 0, turnsY = 0, lastSx = 0, lastSy = 0;
    const step = 1;
    for (let i = step; i < sm.length; i += step) {
      const dx = sm[i].x - sm[i - step].x, dy = sm[i].y - sm[i - step].y;
      const sx = Math.abs(dx) > sp * 0.03 ? Math.sign(dx) : 0, sy = Math.abs(dy) > sp * 0.03 ? Math.sign(dy) : 0;
      if (sx && lastSx && sx !== lastSx) turnsX++;
      if (sy && lastSy && sy !== lastSy) turnsY++;
      if (sx) lastSx = sx; if (sy) lastSy = sy;
    }
    // 잉크 밀도: 길이 / 상자 둘레
    const perim = Math.max(0.3, 2 * (w + h));
    const density = len / perim;
    // 감긴 각도 합 (닫힌 고리 판정)
    let wind = 0;
    for (let i = 2 * step; i < sm.length; i += step) {
      const a1 = Math.atan2(sm[i - step].y - sm[i - 2 * step].y, sm[i - step].x - sm[i - 2 * step].x);
      const a2 = Math.atan2(sm[i].y - sm[i - step].y, sm[i].x - sm[i - step].x);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      wind += d;
    }
    const ax = Gm.axisInner(pts);
    // 가장 긴 '곧은 세로' 구간 길이(sp): 머리에는 없고 ♭·기둥에는 있다
    let vrun = 0, cur = 0, curSign = 0;
    for (let i = 0; i < sm.length; i++) {
      const a = sm[Math.max(0, i - 2)], c = sm[Math.min(sm.length - 1, i + 2)];
      const dx = c.x - a.x, dy = c.y - a.y;
      const sg = Math.abs(dy) > 1e-6 && Math.abs(dx) <= 0.4 * Math.abs(dy) ? Math.sign(dy) : 0;
      if (sg && sg === curSign) cur++; else { cur = sg ? 1 : 0; curSign = sg; }
      if (cur > vrun) vrun = cur;
    }
    vrun = Math.max(0, vrun - 1) * 0.1;
    return { b, w, h, diag, len, chord, closed, straight, turnsX, turnsY, density, wind: Math.abs(wind) / (2 * Math.PI),
      start: pts[0], end: pts[pts.length - 1], n: pts.length, inner: ax.inner, thin: ax.thin, vrun };
  };

  // 0.1sp 간격으로 다시 뽑은 뒤 앞뒤 2점 평균 (끝점은 그대로)
  Gm.smooth = function (pts, sp) {
    const step = 0.1 * sp, q = [{ x: pts[0].x, y: pts[0].y }];
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y);
      if (!d) continue;
      let pos = step - acc;
      while (pos <= d) { const t = pos / d; q.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); pos += step; }
      acc = (acc + d) % step;
    }
    q.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    if (q.length < 5) return q;
    return q.map((p, i) => {
      if (i < 2 || i > q.length - 3) return p;
      let x = 0, y = 0;
      for (let k = -2; k <= 2; k++) { x += q[i + k].x; y += q[i + k].y; }
      return { x: x / 5, y: y / 5 };
    });
  };

  // 기울여 그린 머리도 똑바로 놓고 잰다: 획의 주축(PCA) 방향으로 돌린 뒤 innerFill
  // 반환 {inner, thin}: thin = 짧은 축 / 긴 축 (얇게 오간 빗금 ≈ 0.1~0.3, 둥근 고리 ≈ 0.6~1)
  Gm.axisInner = function (pts) {
    if (pts.length < 3) return { inner: Gm.innerFill(pts, Gm.bbox(pts)), thin: 0 };
    let mx = 0, my = 0;
    pts.forEach(p => { mx += p.x; my += p.y; });
    mx /= pts.length; my /= pts.length;
    let sxx = 0, syy = 0, sxy = 0;
    pts.forEach(p => { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; });
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const c = Math.cos(th), s = Math.sin(th);
    const rp = pts.map(p => { const dx = p.x - mx, dy = p.y - my; return { x: dx * c + dy * s, y: -dx * s + dy * c }; });
    const rb = Gm.bbox(rp);
    return { inner: Gm.innerFill(rp, rb), thin: rb.w > 0 ? Math.min(rb.w, rb.h) / Math.max(rb.w, rb.h) : 0 };
  };

  // 머리 안쪽이 실제로 칠해졌는지: 상자를 8×8 칸으로 나눠, 가운데 타원(반지름 55%) 안 칸 중 잉크가 지나간 비율
  // (손떨림으로 잉크가 길어져도 빈 고리는 가운데를 안 지나가므로 흔들리지 않는다)
  Gm.innerFill = function (pts, b) {
    const N = 8, w = Math.max(b.w, 1e-6), h = Math.max(b.h, 1e-6);
    const grid = new Uint8Array(N * N);
    const mark = (x, y) => {
      const i = Math.min(N - 1, Math.max(0, Math.floor((x - b.x0) / w * N))), j = Math.min(N - 1, Math.max(0, Math.floor((y - b.y0) / h * N)));
      grid[j * N + i] = 1;
    };
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], c = pts[k];
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(c.x - a.x) / w, Math.abs(c.y - a.y) / h) * N * 2));
      for (let s = 0; s <= steps; s++) mark(a.x + (c.x - a.x) * s / steps, a.y + (c.y - a.y) * s / steps);
    }
    let inner = 0, hit = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const nx = (i + 0.5) / N * 2 - 1, ny = (j + 0.5) / N * 2 - 1;
      if (nx * nx + ny * ny <= 0.55 * 0.55 * 1.0) { inner++; if (grid[j * N + i]) hit++; }
    }
    return inner ? hit / inner : 0;
  };

  /* 펜을 안 떼고 이어 그린 획(머리→기둥→꼬리)을 조각으로 나눈다.
   * 가장 긴 '거의 세로로 곧은 구간'(기둥 후보)을 찾아, 그 앞·뒤에 남는 부분이 충분히 길면 따로 떼어 낸다.
   * 반환: 나눌 것이 없으면 null, 아니면 [{pts}, ...] (그린 순서) */
  Gm.splitJoined = function (stroke, sp) {
    const src = stroke.pts;
    if (src.length < 6) return null;
    const step = 0.12 * sp;
    const q = [{ x: src[0].x, y: src[0].y, t: src[0].t }];
    let acc = 0;
    for (let i = 1; i < src.length; i++) {
      const a = src[i - 1], b = src[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (!d) continue;
      let pos = step - acc;
      while (pos <= d) { const t = pos / d; q.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, t: a.t + ((b.t || 0) - (a.t || 0)) * t }); pos += step; }
      acc = (acc + d) % step;
    }
    const last = src[src.length - 1];
    q.push({ x: last.x, y: last.y, t: last.t });
    const n = q.length;
    if (n < 12) return null;
    // 손 떨림을 걸러 낸 선(앞뒤 2점 평균)으로 방향·곧음을 잰다
    const m = q.map((p, i) => {
      let x = 0, y = 0, c = 0;
      for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) { x += q[k].x; y += q[k].y; c++; }
      return { x: x / c, y: y / c };
    });
    // 각 점의 방향(앞뒤 3칸 창) → 세로에 가깝고 위/아래 방향 부호
    const dirSign = new Int8Array(n);
    for (let i = 0; i < n; i++) {
      const a = m[Math.max(0, i - 3)], b = m[Math.min(n - 1, i + 3)];
      const dx = b.x - a.x, dy = b.y - a.y;
      dirSign[i] = Math.abs(dy) > 1e-6 && Math.abs(dx) <= 0.58 * Math.abs(dy) ? Math.sign(dy) : 0;
    }
    let bs = -1, be = -1;
    for (let i = 0; i < n;) {
      if (!dirSign[i]) { i++; continue; }
      let j = i;
      while (j + 1 < n && dirSign[j + 1] === dirSign[i]) j++;
      if (j - i > be - bs) { bs = i; be = j; }
      i = j + 1;
    }
    if (bs < 0) return null;
    let runLen = 0;
    for (let i = bs + 1; i <= be; i++) runLen += Math.hypot(m[i].x - m[i - 1].x, m[i].y - m[i - 1].y);
    const chord = Math.hypot(m[be].x - m[bs].x, m[be].y - m[bs].y);
    if (chord < 1.4 * sp || chord / runLen < 0.88) return null;
    const pre = bs * step, post = (n - 1 - be) * step;
    const keepPre = pre >= 0.45 * sp, keepPost = post >= 0.45 * sp;
    if (!keepPre && !keepPost) return null;
    const s0 = keepPre ? bs : 0, e0 = keepPost ? be : n - 1;
    const parts = [];
    if (keepPre) parts.push({ pts: q.slice(0, bs + 1) });
    parts.push({ pts: q.slice(s0, e0 + 1), run: true });
    if (keepPost) parts.push({ pts: q.slice(be) });
    return parts;
  };

  // $P 용: n개로 다시 뽑기 (여러 획을 이어서)
  Gm.resample = function (strokes, n) {
    const pts = [];
    strokes.forEach((s, si) => s.pts.forEach(p => pts.push({ x: p.x, y: p.y, id: si })));
    if (pts.length === 1) return new Array(n).fill(0).map(() => ({ x: pts[0].x, y: pts[0].y, id: 0 }));
    let I = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i].id === pts[i - 1].id) I += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    I = I / (n - 1);
    if (I <= 0) return new Array(n).fill(0).map(() => ({ x: pts[0].x, y: pts[0].y, id: 0 }));
    const out = [{ x: pts[0].x, y: pts[0].y, id: pts[0].id }];
    let D = 0;
    const work = pts.slice();
    for (let i = 1; i < work.length; i++) {
      if (work[i].id !== work[i - 1].id) continue;
      const d = Math.hypot(work[i].x - work[i - 1].x, work[i].y - work[i - 1].y);
      if (D + d >= I && d > 0) {
        const t = (I - D) / d;
        const q = { x: work[i - 1].x + t * (work[i].x - work[i - 1].x), y: work[i - 1].y + t * (work[i].y - work[i - 1].y), id: work[i].id };
        out.push(q);
        work.splice(i, 0, q);
        D = 0;
      } else D += d;
    }
    while (out.length < n) out.push(Object.assign({}, work[work.length - 1]));
    return out.slice(0, n);
  };

  SJ.RecGeom = Gm;
})(window.SJ = window.SJ || {});
