/* 악보 글리프 — 앱 안에서 만든 SVG path (단위 sp, y 아래로 증가).
 * 이름은 SMuFL 이름을 따른다. Bravura 폰트를 받을 수 있으면 scripts/build_glyphs.py 로 같은 이름의 path로 교체할 수 있다.
 * 기준점: 음표머리·임시표·쉼표 = 왼쪽 끝, y=0이 놓이는 줄/칸 가운데.
 *         음자리표 = 왼쪽 끝, y=0이 기준 줄(높은음=G줄, 낮은음=F줄, 가온=가운데 C줄). */
(function (SJ) {
  'use strict';
  const P = SJ.Pen;
  const G = {};

  function bboxOf(d) {
    const nums = d.replace(/[A-Za-z]/g, ' ').trim().split(/[\s,]+/).map(Number);
    // M/L 좌표쌍만 정확, 호(A)는 아래 수동 값으로 덮음
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const cmds = d.match(/[MLA][^MLAZ]*/g) || [];
    cmds.forEach(c => {
      const v = c.slice(1).trim().split(/[\s,]+/).map(Number);
      const px = c[0] === 'A' ? v[5] : v[0], py = c[0] === 'A' ? v[6] : v[1];
      if (isFinite(px)) { x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py); }
    });
    void nums;
    return { x0, y0, x1, y1 };
  }
  function def(name, d, box) {
    const b = box || bboxOf(d);
    G[name] = { d, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, w: b.x1 - Math.min(0, b.x0) };
  }

  // ── 음표머리 ───────────────────────────────
  (function () {
    const rx = 0.6, ry = 0.47, rot = -20;
    const e = P.ellipseExt(rx, ry, rot);
    const cx = e[0];
    def('noteheadBlack', P.ellipse(cx, 0, rx, ry, rot), { x0: 0, y0: -e[1], x1: 2 * cx, y1: e[1] });
    def('noteheadHalf', P.ellipse(cx, 0, rx, ry, rot) + P.ellipse(cx, 0, 0.47, 0.19, -33, true), { x0: 0, y0: -e[1], x1: 2 * cx, y1: e[1] });
    const wx = 0.845, wy = 0.5;
    def('noteheadWhole', P.ellipse(wx, 0, wx, wy, 0) + P.ellipse(wx, 0, 0.42, 0.26, -58, true), { x0: 0, y0: -wy, x1: 2 * wx, y1: wy });
    // 필기 미리보기용 'x' 머리 (인식 실패 표시) — 사용하지 않으면 무시
  })();

  // ── 임시표 ────────────────────────────────
  (function () {
    const sv = 0.15;
    // 올림표 ♯
    def('accidentalSharp',
      P.rect(0.2, -1.25, sv, 2.65) + P.rect(0.66, -1.4, sv, 2.65) +
      P.bar(0, -0.36, 1.0, -0.66, 0.38) + P.bar(0, 0.64, 1.0, 0.34, 0.38),
      { x0: 0, y0: -1.4, x1: 1.0, y1: 1.4 });
    // 내림표 ♭
    def('accidentalFlat',
      P.rect(0, -1.75, 0.16, 2.3) +
      'M0.16 -0.12C0.42 -0.52 0.98 -0.66 0.97 -0.2C0.96 0.12 0.52 0.36 0.16 0.55Z' +
      'M0.16 0.34C0.45 0.17 0.73 -0.04 0.71 -0.24C0.69 -0.45 0.38 -0.33 0.16 -0.03Z',
      { x0: 0, y0: -1.75, x1: 0.97, y1: 0.55 });
    // 제자리표 ♮
    def('accidentalNatural',
      P.rect(0, -1.35, 0.15, 2.0) + P.rect(0.6, -0.65, 0.15, 2.0) +
      P.bar(0, -0.22, 0.75, -0.42, 0.34) + P.bar(0, 0.42, 0.75, 0.22, 0.34),
      { x0: 0, y0: -1.35, x1: 0.75, y1: 1.35 });
    // 겹올림표 𝄪
    const xs = [];
    xs.push(P.bar(0.12, -0.38, 0.88, 0.38, 0.2));
    xs.push(P.bar(0.12, 0.38, 0.88, -0.38, 0.2));
    [[0, -0.5], [0.62, -0.5], [0, 0.12], [0.62, 0.12]].forEach(q => xs.push(P.rect(q[0], q[1], 0.38, 0.38)));
    def('accidentalDoubleSharp', xs.join(''), { x0: 0, y0: -0.5, x1: 1.0, y1: 0.5 });
    // 겹내림표 𝄫 (내림표 두 개)
    const fl = G.accidentalFlat.d;
    const shift = (d, dx) => d.replace(/([MLC])([^MLCZA]*)/g, (m, c, args) => {
      const v = args.trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i < v.length; i += 2) v[i] = Math.round((v[i] + dx) * 1000) / 1000;
      return c + v.join(' ');
    });
    def('accidentalDoubleFlat', fl + shift(fl, 0.78), { x0: 0, y0: -1.75, x1: 1.75, y1: 0.55 });
  })();

  // ── 음자리표 ──────────────────────────────
  (function () {
    // 높은음자리표 (G줄 = y 0, 오선 줄 y = +1, 0, -1, -2, -3)
    const g = P.stroke([
      [1.52, -0.12, 0.09], [1.18, -0.62, 0.16], [0.52, -0.5, 0.26], [0.32, 0.25, 0.34],
      [0.82, 1.02, 0.24], [1.62, 1.12, 0.16], [2.32, 0.62, 0.3], [2.42, -0.22, 0.42],
      [1.95, -1.05, 0.34], [1.18, -1.72, 0.3], [0.62, -2.62, 0.3], [0.74, -3.62, 0.22],
      [1.38, -4.4, 0.12], [1.86, -4.1, 0.12], [1.86, -3.38, 0.16], [1.5, -2.55, 0.17],
      [1.36, -1.6, 0.16], [1.42, 0.0, 0.16], [1.56, 1.6, 0.17], [1.5, 2.3, 0.2], [1.1, 2.6, 0.2]
    ], { per: 16, roundEnd: true });
    def('gClef', g + P.circle(0.98, 2.2, 0.42), { x0: 0.15, y0: -4.45, x1: 2.6, y1: 2.65 });

    // 낮은음자리표 (F줄 = y 0, 점은 y ±0.5)
    const fcl = P.stroke([
      [0.32, -0.32, 0.22], [0.75, -0.92, 0.2], [1.55, -1.02, 0.28], [2.12, -0.42, 0.5],
      [2.08, 0.55, 0.52], [1.55, 1.45, 0.38], [0.85, 2.15, 0.18], [0.12, 2.62, 0.05]
    ], { per: 16 });
    def('fClef', fcl + P.circle(0.52, 0.02, 0.44) + P.circle(2.72, -0.5, 0.2) + P.circle(2.72, 0.5, 0.2),
      { x0: 0, y0: -1.15, x1: 2.92, y1: 2.65 });

    // 가온음자리표 (가운데 = y 0)
    const half = sgn => P.stroke([
      [0.96, -0.02 * sgn, 0.12], [1.32, -0.62 * sgn, 0.16], [1.9, -0.92 * sgn, 0.28], [2.3, -1.4 * sgn, 0.44],
      [2.05, -1.92 * sgn, 0.3], [1.55, -2.0 * sgn, 0.14]
    ], { per: 14 });
    def('cClef',
      P.rect(0, -2, 0.56, 4) + P.rect(0.74, -2, 0.16, 4) + half(1) + half(-1) +
      P.circle(1.62, -1.62, 0.38) + P.circle(1.62, 1.62, 0.38),
      { x0: 0, y0: -2.05, x1: 2.55, y1: 2.05 });
  })();

  // ── 쉼표 (y 0 = 가운데 줄) ─────────────────
  (function () {
    def('restWhole', P.rect(0, -1, 1.13, 0.5));
    def('restHalf', P.rect(0, -0.5, 1.13, 0.5));
    def('restQuarter', P.stroke([
      [0.3, -1.48, 0.07], [0.62, -1.1, 0.1], [0.94, -0.68, 0.12], [0.62, -0.2, 0.38],
      [0.48, 0.15, 0.34], [0.9, 0.72, 0.12], [0.55, 0.92, 0.22], [0.32, 1.15, 0.3], [0.52, 1.48, 0.1]
    ], { per: 10 }), { x0: 0.12, y0: -1.5, x1: 1.08, y1: 1.5 });
    // 8분·16분·32분·64분 쉼표: 갈고리 n개 + 비스듬한 기둥
    const flagRest = function (n) {
      const hooks = n === 1 ? [-0.5] : n === 2 ? [-0.5, 0.5] : n === 3 ? [-1.5, -0.5, 0.5] : [-1.5, -0.5, 0.5, 1.5];
      const bottom = n === 1 ? 1.0 : n === 2 ? 2.0 : n === 3 ? 2.0 : 3.0;
      const slope = 0.3;              // y 1당 x 이동
      const topY = hooks[0] - 0.22;
      const top = [0.95 + (n - 1) * 0.3 * slope * 0 + (hooks.length - 1) * 0.0, topY];
      const sx = y => top[0] + 0.12 - (y - topY) * slope + (hooks.length > 2 ? 0.3 : 0);
      let d = P.poly([[sx(topY) - 0.13, topY], [sx(topY), topY], [sx(bottom), bottom], [sx(bottom) - 0.13, bottom]]);
      hooks.forEach(hy => {
        const ax = sx(hy - 0.2);
        const bx = ax - 0.68;
        d += P.circle(bx, hy + 0.02, 0.25);
        d += P.stroke([[bx + 0.02, hy + 0.2, 0.1], [bx + 0.35, hy + 0.15, 0.13], [ax - 0.1, hy - 0.08, 0.13], [ax - 0.02, hy - 0.22, 0.12]], { per: 8 });
      });
      return d;
    };
    ['rest8th', 'rest16th', 'rest32nd', 'rest64th'].forEach((nm, i) => {
      const d = flagRest(i + 1);
      const b = bboxOf(d);
      def(nm, d, { x0: Math.min(0, b.x0), y0: b.y0, x1: b.x1, y1: b.y1 });
    });
  })();

  // ── 꼬리 (기준점 = 기둥 끝, 기둥 왼쪽 가장자리 x=0) ─────────
  (function () {
    const up = P.stroke([
      [0.06, 0.0, 0.16], [0.18, 0.62, 0.34], [0.62, 1.18, 0.34], [1.02, 1.82, 0.26],
      [1.02, 2.5, 0.15], [0.78, 3.1, 0.07]
    ], { per: 12 });
    def('flag8thUp', up + P.rect(0, 0, 0.12, 0.3), { x0: 0, y0: 0, x1: 1.12, y1: 3.15 });
    const mirror = d => d.replace(/([MLA])([^MLAZ]*)/g, (m, c, args) => {
      const v = args.trim().split(/[\s,]+/).map(Number);
      if (c === 'A') { v[6] = -v[6]; v[4] = v[4] ? 0 : 1; v[2] = -v[2]; }
      else for (let i = 1; i < v.length; i += 2) v[i] = -v[i];
      return c + v.map(x => Math.round(x * 1000) / 1000).join(' ');
    });
    G._mirrorY = mirror;
    def('flag8thDown', mirror(G.flag8thUp.d), { x0: 0, y0: -3.15, x1: 1.12, y1: 0 });
    // 여러 꼬리 (16분 이상)는 엔진이 0.75sp 간격으로 겹쳐 그린다
    const upInner = P.stroke([[0.06, 0.0, 0.16], [0.2, 0.55, 0.32], [0.66, 1.05, 0.3], [1.0, 1.55, 0.2], [0.98, 2.0, 0.08]], { per: 10 });
    def('flagInnerUp', upInner, { x0: 0, y0: 0, x1: 1.1, y1: 2.05 });
    def('flagInnerDown', mirror(upInner), { x0: 0, y0: -2.05, x1: 1.1, y1: 0 });
  })();

  // ── 박자표: 4/4(C) · 2/2(cut) ─────────────
  (function () {
    const c = P.stroke([
      [1.42, -0.62, 0.1], [0.95, -0.98, 0.14], [0.36, -0.52, 0.42], [0.3, 0.28, 0.46],
      [0.78, 0.94, 0.2], [1.38, 0.86, 0.12], [1.6, 0.55, 0.08]
    ], { per: 12 }) + P.circle(1.3, -0.48, 0.24);
    def('timeSigCommon', c, { x0: 0.08, y0: -1.0, x1: 1.66, y1: 1.0 });
    def('timeSigCutCommon', c + P.rect(0.86, -1.45, 0.16, 2.9), { x0: 0.08, y0: -1.45, x1: 1.66, y1: 1.45 });
  })();

  // ── 점·아티큘레이션·장식 ────────────────────
  (function () {
    def('augmentationDot', P.circle(0.2, 0, 0.2), { x0: 0, y0: -0.2, x1: 0.4, y1: 0.2 });
    def('repeatDot', P.circle(0.22, 0, 0.22), { x0: 0, y0: -0.22, x1: 0.44, y1: 0.22 });
    def('articStaccato', P.circle(0.18, 0, 0.17), { x0: 0, y0: -0.18, x1: 0.36, y1: 0.18 });
    def('articTenuto', P.rect(0, -0.08, 1.15, 0.16));
    def('articAccent', P.poly([[0, -0.42], [1.25, -0.05], [1.25, 0.05], [0, 0.42], [0, 0.3], [1.0, 0], [0, -0.3]]),
      { x0: 0, y0: -0.42, x1: 1.25, y1: 0.42 });
    def('articMarcatoAbove', P.poly([[0, 0], [0.48, -1.12], [0.62, -1.12], [1.08, 0], [0.8, 0], [0.5, -0.72], [0.18, 0]]),
      { x0: 0, y0: -1.12, x1: 1.08, y1: 0 });
    def('articMarcatoBelow', P.poly([[0, 0], [0.48, 1.12], [0.62, 1.12], [1.08, 0], [0.8, 0], [0.5, 0.72], [0.18, 0]]),
      { x0: 0, y0: 0, x1: 1.08, y1: 1.12 });
    const ferm = P.stroke([[0.05, 0, 0.06], [0.35, -0.8, 0.16], [1.2, -1.28, 0.24], [2.05, -0.8, 0.16], [2.35, 0, 0.06]], { per: 12 });
    def('fermataAbove', ferm + P.circle(1.2, -0.24, 0.21), { x0: 0, y0: -1.4, x1: 2.4, y1: 0.06 });
    def('fermataBelow', G._mirrorY(ferm + P.circle(1.2, -0.24, 0.21)), { x0: 0, y0: -0.06, x1: 2.4, y1: 1.4 });
    // 모르덴트 (짧은 지그재그 + 세로줄)
    const zig = P.stroke([[0, 0.25, 0.1], [0.32, -0.25, 0.26], [0.62, 0.25, 0.1], [0.95, -0.25, 0.26], [1.25, 0.25, 0.1], [1.58, -0.25, 0.26], [1.82, 0.12, 0.1]], { per: 6 });
    def('ornamentMordent', zig + P.rect(0.86, -0.62, 0.13, 1.24), { x0: 0, y0: -0.62, x1: 1.85, y1: 0.62 });
    def('ornamentShortTrill', zig, { x0: 0, y0: -0.35, x1: 1.85, y1: 0.35 });
  })();

  // ── 세뇨 · 코다 ──────────────────────────
  (function () {
    const s = P.stroke([
      [1.32, -0.95, 0.1], [0.82, -1.18, 0.16], [0.32, -0.82, 0.28], [0.52, -0.22, 0.34],
      [1.18, 0.28, 0.36], [1.32, 0.88, 0.26], [0.82, 1.2, 0.15], [0.28, 0.98, 0.1]
    ], { per: 12 });
    def('segno', s + P.bar(0.1, 1.15, 1.6, -1.15, 0.13) + P.circle(0.28, 0.22, 0.2) + P.circle(1.38, -0.22, 0.2),
      { x0: 0, y0: -1.3, x1: 1.65, y1: 1.3 });
    const ring = P.ellipse(1.1, 0, 0.78, 0.92, 0) + P.ellipse(1.1, 0, 0.5, 0.82, 0, true);
    def('coda', ring + P.rect(0, -0.07, 2.2, 0.14) + P.rect(1.03, -1.3, 0.14, 2.6), { x0: 0, y0: -1.3, x1: 2.2, y1: 1.3 });
  })();

  // ── 중괄호 (높이 h sp에 맞춰 생성) ─────────
  G.braceProc = function (h) {
    const w = Math.min(1.25, 0.55 + h * 0.035);
    const t = Math.min(0.42, 0.18 + h * 0.012);
    return P.stroke([
      [w, 0, 0.04], [w * 0.42, h * 0.07, t * 0.55], [w * 0.38, h * 0.22, t], [w * 0.36, h * 0.38, t * 0.8],
      [0.02, h * 0.5, 0.05],
      [w * 0.36, h * 0.62, t * 0.8], [w * 0.38, h * 0.78, t], [w * 0.42, h * 0.93, t * 0.55], [w, h, 0.04]
    ], { per: 14 });
  };
  G.braceWidth = function (h) { return Math.min(1.25, 0.55 + h * 0.035) + 0.15; };

  // ── 이음줄·붙임줄 모양 (두 끝 사이 초승달) ──────
  G.arcPath = function (x1, y1, x2, y2, height, midW) {
    // height: 위로 볼록이면 음수
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const hh = height;
    const c1 = [x1 + dx * 0.25 + nx * hh * 1.33 * (ny > 0 ? 1 : -1) * 0, y1 + dy * 0.25 + hh * 1.33];
    const c2 = [x1 + dx * 0.75, y1 + dy * 0.75 + hh * 1.33];
    const t = midW * (hh < 0 ? -1 : 1);
    const f = n => Math.round(n * 1000) / 1000;
    void nx;
    return 'M' + f(x1) + ' ' + f(y1) +
      'C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(x2) + ' ' + f(y2) +
      'C' + f(c2[0]) + ' ' + f(c2[1] - t) + ' ' + f(c1[0]) + ' ' + f(c1[1] - t) + ' ' + f(x1) + ' ' + f(y1) + 'Z';
  };

  // ── Bravura 글리프가 있으면 같은 이름을 모두 덮어쓴다 (glyphs.generated.js) ──
  if (SJ.GlyphsBravura) {
    const B = SJ.GlyphsBravura;
    Object.keys(B).forEach(k => {
      const b = B[k];
      G[k] = { d: b.d, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, w: b.adv || (b.x1 - Math.min(0, b.x0)), anchors: b.anchors };
    });
    G.source = 'Bravura';
    // Bravura 중괄호는 1em(4sp) 높이 — 높이 h에 맞춰 늘린다
    G.braceScale = function (h) { const sy = h / 4; return { sx: Math.min(sy, 1 + sy * 0.55), sy }; };
  } else {
    G.source = 'builtin';
  }
  if (SJ.EngravingBravura) {
    const E = SJ.EngravingBravura, C = SJ.C;
    C.staffLineW = E.staffLineThickness; C.stemW = E.stemThickness; C.beamW = E.beamThickness; C.beamGap = E.beamSpacing;
    C.ledgerW = E.legerLineThickness; C.ledgerExt = E.legerLineExtension; C.thinBarW = E.thinBarlineThickness;
    C.thickBarW = E.thickBarlineThickness; C.barSep = E.barlineSeparation; C.repeatDotSep = E.repeatBarlineDotSeparation;
    C.tieMidW = E.tieMidpointThickness; C.slurMidW = E.slurMidpointThickness; C.hairpinW = E.hairpinThickness;
    C.bracketW = E.bracketThickness; C.octaveLineW = E.octaveLineThickness; C.tupletBracketW = E.tupletBracketThickness;
  }

  // 이름으로 찾기 (없으면 null)
  G.get = function (name) { return G[name] && G[name].d ? G[name] : null; };

  SJ.Glyphs = G;
})(window.SJ = window.SJ || {});
