/* 시스템 안 장식: 붙임줄·이음줄·헤어핀·8va·셈여림·가사·코드·보표 위 기호 (보표별 sp 좌표) */
(function (SJ) {
  'use strict';
  const C = SJ.C, G = SJ.Glyphs, TW = SJ.TextWidth;
  const DC = {};
  const gw = n => (G[n] ? G[n].w : 1);

  // 항목들의 보표별 위/아래 끝 (sp)
  DC.extents = function (items, nStaves, xRange) {
    const top = new Array(nStaves).fill(0), bot = new Array(nStaves).fill(4);
    items.forEach(it => {
      if (it.k === undefined || it.k < 0) return;
      let y0, y1, x0, x1;
      if (it.t === 'g') { const g = G[it.n]; const s = it.s || 1; if (!g) return; y0 = it.y + g.y0 * s * (it.sy || 1); y1 = it.y + g.y1 * s * (it.sy || 1); x0 = it.x; x1 = it.x + g.w * s; }
      else if (it.t === 'l') { y0 = Math.min(it.y1, it.y2); y1 = Math.max(it.y1, it.y2); x0 = Math.min(it.x1, it.x2); x1 = Math.max(it.x1, it.x2); }
      else if (it.t === 'r') { y0 = it.y; y1 = it.y + it.h; x0 = it.x; x1 = it.x + it.w; }
      else if (it.t === 'poly') { y0 = Math.min(...it.pts.map(p => p[1])); y1 = Math.max(...it.pts.map(p => p[1])); x0 = Math.min(...it.pts.map(p => p[0])); x1 = Math.max(...it.pts.map(p => p[0])); }
      else if (it.t === 'tx') { y0 = it.y - it.size * 0.8; y1 = it.y + it.size * 0.25; x0 = it.x; x1 = it.x + 1; }
      else if (it.t === 'path' && it.bb) { y0 = it.bb[1]; y1 = it.bb[3]; x0 = it.bb[0]; x1 = it.bb[2]; }
      else return;
      if (xRange && (x1 < xRange[0] || x0 > xRange[1])) return;
      top[it.k] = Math.min(top[it.k], y0);
      bot[it.k] = Math.max(bot[it.k], y1);
    });
    return { top, bot };
  };

  // 초승달 곡선 path (sp 좌표 절대값), dir = -1 위로 볼록, +1 아래로 볼록
  DC.arc = function (k, x1, y1, x2, y2, dir, height, midW, cls) {
    const len = Math.max(0.1, x2 - x1);
    const h = height * dir;
    const c1x = x1 + len * 0.22, c2x = x2 - len * 0.22;
    const c1y = y1 + h * 1.33, c2y = y2 + h * 1.33;
    const t = midW * dir;
    const f = n => Math.round(n * 1000) / 1000;
    const d = [['M', x1, y1], ['C', c1x, c1y, c2x, c2y, x2, y2], ['C', c2x, c2y + t, c1x, c1y + t, x1, y1], ['Z']];
    const ys = [y1, y2, y1 + h, y2 + h, y1 + h + t, y2 + h + t];
    void f;
    return { t: 'path', k, d, bb: [x1, Math.min(...ys), x2, Math.max(...ys)], cls };
  };

  // 붙임줄: 머리 쌍 (같은 시스템)
  DC.tie = function (out, k, a, b, headA, stemDir, chordSize, idx) {
    // 화음은 위 절반 위로, 아래 절반 아래로; 단음은 스템 반대쪽
    let dir;
    if (chordSize > 1) dir = idx >= chordSize / 2 ? -1 : 1; else dir = stemDir < 0 ? 1 : -1;
    const y = headA.y + (dir > 0 ? 0.45 : -0.45);
    const x1 = a.x1 + 0.12, x2 = b.x0 - 0.12;
    if (x2 - x1 < 0.4) return;
    const height = Math.min(1.0, 0.45 + (x2 - x1) * 0.04);
    out.push(DC.arc(k, x1, y, x2, y, dir, height, C.tieMidW));
  };

  DC.dynGlyph = function (text) {
    return { p: 'dynamicPiano', pp: 'dynamicPP', ppp: 'dynamicPPP', mp: 'dynamicMP', mf: 'dynamicMF', f: 'dynamicForte', ff: 'dynamicFF',
      fff: 'dynamicFFF', sfz: 'dynamicSforzato', sf: 'dynamicSforzando1', fp: 'dynamicFortePiano', rfz: null }[text] || null;
  };
  DC.DYNAMICS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz', 'sf', 'fp'];

  /* 미뤄 둔 항목 처리: deferred → items. staffExt: 보표별 위/아래 끝 (음표 기준) */
  DC.resolve = function (out, deferred, nStaves, ext, verses) {
    const dynBase = new Array(nStaves).fill(0);
    const hasDyn = new Array(nStaves).fill(false);
    for (let k = 0; k < nStaves; k++) dynBase[k] = Math.max(6.2, ext.bot[k] + 2.0);
    deferred.forEach(d => { if (d.t === 'dyn' || d.t === 'hairpin') hasDyn[d.k] = true; });

    // 보표 위 기호 (페르마타·트릴 등)
    deferred.filter(d => d.t === 'above').forEach(d => {
      const g = G[d.n]; if (!g) return;
      const yb = Math.min(-0.9, d.top - 0.6);
      out.push({ t: 'g', k: d.k, n: d.n, x: d.x - g.w / 2, y: yb - g.y1 });
    });
    // 셈여림
    deferred.filter(d => d.t === 'dyn').forEach(d => {
      const gn = DC.dynGlyph(d.text);
      if (gn && G[gn]) out.push({ t: 'g', k: d.k, n: gn, x: d.x - 0.2, y: dynBase[d.k] });
      else out.push({ t: 'tx', k: d.k, x: d.x, y: dynBase[d.k], text: d.text, size: C.dynamicSize, font: 'serif', b: true, i: true, a: 'start' });
    });
    // 헤어핀
    deferred.filter(d => d.t === 'hairpin').forEach(d => {
      const y = dynBase[d.k] - 0.75, open = 0.55;
      const xa = d.x1, xb = Math.max(d.x1 + 1.5, d.x2);
      const narrowAtStart = d.kind === 'cresc';
      const yA1 = narrowAtStart && !d.contStart ? y : y - open, yA2 = narrowAtStart && !d.contStart ? y : y + open;
      const yB1 = !narrowAtStart && !d.contEnd ? y : y - open, yB2 = !narrowAtStart && !d.contEnd ? y : y + open;
      out.push({ t: 'l', k: d.k, x1: xa, y1: yA1, x2: xb, y2: yB1, w: C.hairpinW });
      out.push({ t: 'l', k: d.k, x1: xa, y1: yA2, x2: xb, y2: yB2, w: C.hairpinW });
    });
    // 가사
    const lyricBase = new Array(nStaves).fill(0);
    for (let k = 0; k < nStaves; k++) lyricBase[k] = Math.max(ext.bot[k] + 2.9, hasDyn[k] ? dynBase[k] + 2.4 : 0, 6.8);
    const lyrics = deferred.filter(d => d.t === 'lyric').sort((a, b) => a.k - b.k || a.verse - b.verse || a.x - b.x);
    lyrics.forEach((d, i) => {
      const y = lyricBase[d.k] + (d.verse - 1) * C.lyricLine;
      const w = TW.width(d.text, C.lyricSize);
      out.push({ t: 'tx', k: d.k, x: d.x, y, text: d.text, size: C.lyricSize, font: 'text', a: 'middle', ref: d.ref });
      out.hits && out.hits.push({ x0: d.x - w / 2 - 0.3, y0: y - C.lyricSize, x1: d.x + w / 2 + 0.3, y1: y + 0.5, k: d.k, ref: d.ref });
      const next = lyrics[i + 1] && lyrics[i + 1].k === d.k && lyrics[i + 1].verse === d.verse ? lyrics[i + 1] : null;
      if ((d.syllabic === 'begin' || d.syllabic === 'middle') && next) {
        const xa = d.x + w / 2, xb = next.x - TW.width(next.text, C.lyricSize) / 2;
        if (xb - xa > 0.8) out.push({ t: 'l', k: d.k, x1: (xa + xb) / 2 - 0.35, y1: y - 0.55, x2: (xa + xb) / 2 + 0.35, y2: y - 0.55, w: 0.13 });
      }
      if (d.extend) {
        const xa = d.x + w / 2 + 0.2;
        const xb = next ? next.x - TW.width(next.text, C.lyricSize) / 2 - 0.8 : (d.extendTo || xa + 2);
        if (xb - xa > 0.5) out.push({ t: 'l', k: d.k, x1: xa, y1: y + 0.15, x2: xb, y2: y + 0.15, w: 0.16 });
      }
    });
    void verses;
    return { dynBase, lyricBase };
  };

  // 코드 기호 (맨 위 보표 위, 겹치면 위로 쌓기)
  DC.chords = function (out, deferred, ext) {
    const list = deferred.filter(d => d.t === 'chord').sort((a, b) => a.x - b.x);
    if (!list.length) return null;
    const base = Math.min(-1.8, ext.top[0] - 0.9);
    let lastEnd = -1e9, lastY = base;
    let topY = base - C.chordSize;
    list.forEach(d => {
      const w = TW.width(d.text, C.chordSize, true);
      let y = base;
      if (d.x < lastEnd + 0.3) y = lastY - C.chordSize * 1.05;
      out.push({ t: 'tx', k: 0, x: d.x, y, text: d.text, size: C.chordSize, font: 'chord', b: true, a: 'start', ref: d.ref });
      out.hits && out.hits.push({ x0: d.x - 0.3, y0: y - C.chordSize, x1: d.x + w + 0.3, y1: y + 0.5, k: 0, ref: d.ref });
      lastEnd = d.x + w; lastY = y;
      topY = Math.min(topY, y - C.chordSize);
    });
    return topY;
  };

  SJ.Decor = DC;
})(window.SJ = window.SJ || {});
