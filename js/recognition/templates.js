/* 필기 기호 모양 정의 (sp 단위) — ① $P 기본 템플릿 ② 합성 획 시험 데이터 생성(gen-synthetic-strokes)에 같이 쓴다 */
(function (SJ) {
  'use strict';
  const T = {};
  const ell = (cx, cy, rx, ry, rot, turns, a0, n, shrink) => {
    const out = [];
    n = n || 28; turns = turns || 1; a0 = a0 || -Math.PI / 2;
    const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
    for (let i = 0; i <= n * turns; i++) {
      const a = a0 + (i / n) * 2 * Math.PI;
      const k = shrink ? 1 - shrink * (i / (n * turns)) : 1;
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      out.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return out;
  };
  const line = (x1, y1, x2, y2, n) => { n = n || 10; const o = []; for (let i = 0; i <= n; i++) o.push([x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n]); return o; };
  const curve = (pts, n) => {      // 2차 베지어 조각들
    const o = [];
    n = n || 12;
    for (let k = 0; k + 2 < pts.length; k += 2) {
      const [a, b, c] = [pts[k], pts[k + 1], pts[k + 2]];
      for (let i = (k ? 1 : 0); i <= n; i++) { const t = i / n; o.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * b[0] + t * t * c[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * b[1] + t * t * c[1]]); }
    }
    return o;
  };
  const dot = (x, y) => ell(x, y, 0.12, 0.12, 0, 1, 0, 8);

  // ── 음표 (머리 가운데 = 0,0) ──
  T.head = function (filled) {
    return filled ? ell(0, 0, 0.6, 0.42, -0.35, 2.4, 0, 20, 0.75) : ell(0, 0, 0.62, 0.45, -0.35, 1.05, -2.6, 24);
  };
  // opts: {type, dots, stemDown, heads:[dy...](화음), flagsStyle}
  T.note = function (opts) {
    const type = opts.type;
    const filled = !(type === 'whole' || type === 'half');
    const strokes = [];
    const ys = opts.heads || [0];
    ys.forEach(dy => strokes.push(T.head(filled).map(p => [p[0], p[1] + dy])));
    if (type === 'whole') { if (opts.dots) for (let d = 0; d < opts.dots; d++) strokes.push(dot(1.25 + d * 0.5, -0.2)); return strokes; }
    const top = Math.min(...ys), bot = Math.max(...ys);
    const down = !!opts.stemDown;
    const sx = down ? -0.58 : 0.58;
    const y1 = down ? top : bot, y2 = down ? bot + 3.4 : top - 3.4;
    if (type !== 'head') strokes.push(line(sx, y1, sx, y2, 14));
    const flags = { eighth: 1, '16th': 2, '32nd': 3, '64th': 4 }[type] || 0;
    for (let f = 0; f < flags; f++) {
      const fy = y2 + (down ? -f * 0.8 : f * 0.8);
      const dir = down ? -1 : 1;
      strokes.push(curve([[sx, fy], [sx + 0.9, fy + dir * 0.9], [sx + 0.95, fy + dir * 2.2]], 10));
    }
    for (let d = 0; d < (opts.dots || 0); d++) strokes.push(dot(0.95 + d * 0.5, -0.25));
    return strokes;
  };

  // ── 다른 기호 (가운데 = 0,0) ──
  T.SYMBOLS = {
    sharp: () => [line(-0.25, -1.3, -0.25, 1.4), line(0.25, -1.4, 0.25, 1.3), line(-0.55, -0.35, 0.55, -0.6), line(-0.55, 0.6, 0.55, 0.35)],
    sharp2: () => [line(-0.55, -0.35, 0.55, -0.6), line(-0.55, 0.6, 0.55, 0.35), line(-0.25, -1.3, -0.25, 1.4), line(0.25, -1.4, 0.25, 1.3)],
    flat: () => [line(-0.4, -1.7, -0.4, 0.55).concat(curve([[-0.4, 0.55], [0.6, 0.0], [0.35, -0.45], [-0.05, -0.65], [-0.4, -0.15]], 8))],
    flat2: () => [line(-0.4, -1.7, -0.4, 0.55), curve([[-0.4, -0.15], [0.1, -0.7], [0.45, -0.3], [0.5, 0.1], [-0.4, 0.55]], 8)],
    natural: () => [line(-0.35, -1.3, -0.35, 0.45).concat(line(-0.35, 0.45, 0.35, 0.3)), line(-0.35, -0.3, 0.35, -0.45).concat(line(0.35, -0.45, 0.35, 1.3))],
    natural2: () => [line(-0.35, -1.3, -0.35, 0.45), line(0.35, -0.45, 0.35, 1.3), line(-0.35, -0.3, 0.35, -0.45), line(-0.35, 0.45, 0.35, 0.3)],
    dsharp: () => [line(-0.5, -0.5, 0.5, 0.5), line(0.5, -0.5, -0.5, 0.5)],
    dflat: () => [line(-0.8, -1.6, -0.8, 0.55).concat(curve([[-0.8, 0.55], [0.0, 0.0], [-0.2, -0.45], [-0.5, -0.6], [-0.8, -0.15]], 6)),
      line(0.1, -1.6, 0.1, 0.55).concat(curve([[0.1, 0.55], [0.9, 0.0], [0.7, -0.45], [0.4, -0.6], [0.1, -0.15]], 6))],
    'r:quarter': () => [line(-0.3, -1.4, 0.35, -0.55).concat(line(0.35, -0.55, -0.3, 0.25), line(-0.3, 0.25, 0.35, 0.9), curve([[0.35, 0.9], [-0.5, 0.75], [-0.05, 1.45]], 8))],
    'r:eighth': () => [ell(-0.3, -0.5, 0.18, 0.18, 0, 1.4, 0, 8, 0.6), curve([[-0.3, -0.35], [0.1, -0.2], [0.45, -0.75]], 8).concat(line(0.45, -0.75, -0.05, 1.0, 10))],
    'r:16th': () => [ell(-0.25, -0.5, 0.18, 0.18, 0, 1.4, 0, 8, 0.6), curve([[-0.25, -0.35], [0.15, -0.2], [0.5, -0.75]], 8).concat(line(0.5, -0.75, -0.1, 1.9, 12)),
      ell(-0.5, 0.5, 0.18, 0.18, 0, 1.4, 0, 8, 0.6), curve([[-0.5, 0.65], [-0.1, 0.8], [0.27, 0.3]], 6)],
    'r:bar': () => [line(-0.55, 0, 0.55, 0, 8).concat(line(0.55, 0, 0.55, 0.12, 2), line(0.55, 0.12, -0.55, 0.12, 8), line(-0.55, 0.12, -0.55, 0.24, 2), line(-0.55, 0.24, 0.55, 0.24, 8))],
    tie: () => [curve([[-2, 0], [0, 1.1], [2, 0]], 16)],
    tieUp: () => [curve([[-2, 0], [0, -1.1], [2, 0]], 16)],
    accent: () => [line(-0.6, -0.35, 0.6, 0, 6).concat(line(0.6, 0, -0.6, 0.35, 6))],
    tenuto: () => [line(-0.6, 0, 0.6, 0, 8)],
    fermata: () => [curve([[-1.1, 0.4], [0, -1.3], [1.1, 0.4]], 14), dot(0, 0.1)],
    'dyn:p': () => [line(-0.2, -0.5, -0.5, 1.2, 8).concat(curve([[-0.5, 1.2], [-0.25, -0.55], [0.5, -0.4], [0.55, 0.3], [-0.3, 0.35]], 8))],
    'dyn:f': () => [curve([[0.55, -1.0], [0.2, -1.4], [-0.05, -0.6], [-0.3, 0.8], [-0.7, 0.9]], 8), line(-0.45, -0.25, 0.4, -0.25, 6)],
    'dyn:m': () => [line(-0.8, 0.5, -0.65, -0.3, 4).concat(curve([[-0.65, -0.3], [-0.35, -0.6], [-0.25, 0.5], [-0.1, -0.6], [0.2, -0.3], [0.35, 0.1], [0.5, 0.5]], 6))],
    'dyn:z': () => [line(-0.45, -0.4, 0.45, -0.4, 5).concat(line(0.45, -0.4, -0.45, 0.45, 6), line(-0.45, 0.45, 0.45, 0.45, 5))],
    'dyn:s': () => [curve([[0.4, -0.45], [-0.5, -0.6], [-0.2, -0.05], [0.6, 0.3], [-0.45, 0.45]], 8)]
  };
  // 이름 → 같은 뜻 (변형 템플릿 합치기)
  T.CANON = { sharp2: 'sharp', flat2: 'flat', natural2: 'natural', tieUp: 'tie' };
  T.LABEL = {
    sharp: '올림표 ♯', flat: '내림표 ♭', natural: '제자리표 ♮', dsharp: '겹올림 𝄪', dflat: '겹내림 𝄫',
    'r:quarter': '4분쉼표', 'r:eighth': '8분쉼표', 'r:16th': '16분쉼표', 'r:bar': '온·2분쉼표', tie: '붙임줄', accent: '악센트', tenuto: '테누토', fermata: '페르마타',
    'dyn:p': 'p', 'dyn:f': 'f', 'dyn:m': 'm', 'dyn:z': 'z', 'dyn:s': 's'
  };

  // sp 좌표 획 → 화면 획 ({pts:[{x,y,t}]})
  T.toStrokes = function (arrs, ox, oy, sp, t0) {
    let t = t0 || 0;
    return arrs.map(a => ({ pts: a.map(p => ({ x: ox + p[0] * sp, y: oy + p[1] * sp, t: (t += 8) })) }));
  };

  // 기본 $P 템플릿 (정규화)
  T.base = function () {
    const out = [];
    Object.keys(T.SYMBOLS).forEach(k => {
      const strokes = T.toStrokes(T.SYMBOLS[k](), 0, 0, 10);
      out.push({ label: T.CANON[k] || k, pts: SJ.PDollar.normalize(strokes), builtin: true });
    });
    return out;
  };

  SJ.RecTemplates = T;
})(window.SJ = window.SJ || {});
