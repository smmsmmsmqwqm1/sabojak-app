/* 줄(시스템) 구성: 마디 문맥 계산 → 줄바꿈(일반/정렬) → 각 마디 x·폭 결정 */
(function (SJ) {
  'use strict';
  const C = SJ.C, S = SJ.Score, P = SJ.Pitch, G = SJ.Glyphs, MP = SJ.MeasurePrep, Sp = SJ.Spacing, TW = SJ.TextWidth;
  const LS = {};
  const gw = n => (G[n] ? G[n].w : 1);

  // 마디별 문맥 (보이는 보표 기준)
  LS.contexts = function (score) {
    const staves = score.staves.map((st, i) => ({ id: st.id, def: st })).filter(s => s.def.visible !== false);
    staves.forEach((s, k) => { s.k = k; });
    const ctxs = [];
    let prevKey = null, prevTime = null;
    const prevClef = {};
    staves.forEach(s => { prevClef[s.id] = s.def.clef; });
    score.measures.forEach((m, mi) => {
      const key = m.attrs.key || prevKey || { fifths: 0, mode: 'major' };
      const time = m.attrs.time || prevTime || { num: 4, den: 4 };
      const clefs = {}, clefChanged = {};
      staves.forEach(s => {
        const sm = m.staves[s.id];
        const c = sm && sm.clefChange ? sm.clefChange : prevClef[s.id];
        clefs[s.id] = c;
        clefChanged[s.id] = mi > 0 && c !== prevClef[s.id];
        prevClef[s.id] = c;
      });
      const keyChanged = mi > 0 && !!m.attrs.key && (!prevKey || prevKey.fifths !== key.fifths);
      const timeChanged = mi === 0 || (!!m.attrs.time && (!prevTime || prevTime.num !== time.num || prevTime.den !== time.den || (prevTime.symbol || '') !== (time.symbol || '')));
      ctxs.push({ staves, clefs, clefChanged, key, keyChanged, prevKey: prevKey || key, time, timeChanged, beam44: score.layout.beam44 || 'half' });
      prevKey = key; prevTime = time;
    });
    return { ctxs, staves };
  };

  // 줄 머리(음자리표 + 조표) 폭
  LS.headerWidth = function (ctx) {
    let clefW = 0;
    ctx.staves.forEach(s => { clefW = Math.max(clefW, gw(P.CLEFS[ctx.clefs[s.id]].glyph)); });
    const kw = MP.keySigWidth(ctx.key.fifths);
    return 0.6 + clefW + 0.7 + kw + (kw ? 0.5 : 0);
  };

  /* 보표 이름표: 보표마다 nameShow = 'auto'(첫 줄 이름·다음 줄 약어) | 'first'(첫 줄만) | 'always'(모든 줄 이름) | 'hidden'
   * 특정 줄만 다르게: 그 줄 첫 마디의 attrs.labels[staffId] (빈 글자면 그 줄만 숨김) */
  LS.label = function (score, def, mi, firstSystem) {
    const m = score.measures[mi];
    if (m && m.attrs.labels && Object.prototype.hasOwnProperty.call(m.attrs.labels, def.id)) return m.attrs.labels[def.id] || '';
    const mode = def.nameShow || 'auto';
    if (mode === 'hidden') return '';
    if (mode === 'always') return def.name || def.abbr || '';
    if (mode === 'first') return firstSystem ? (def.name || '') : '';
    return firstSystem ? (def.name || '') : (def.abbr || '');
  };
  LS.NAME_SIZE = 1.9;
  // 그 줄의 들여쓰기 (이름표 폭 + 중괄호)
  LS.indentFor = function (score, staves, mi, firstSystem) {
    let w = 0;
    staves.forEach(s => { const t = LS.label(score, s.def, mi, firstSystem); if (t) w = Math.max(w, TW.width(t, LS.NAME_SIZE)); });
    const brace = staves.some(s => s.def.groupId) ? 1.4 : 0;
    return (w ? w + 1.2 : 0) + brace;
  };
  LS.indents = function (score, staves) {
    // 정렬 모드용: 어느 줄이 와도 같은 들여쓰기 (가장 긴 이름표 기준)
    let max = LS.indentFor(score, staves, 0, true);
    score.measures.forEach((m, mi) => { max = Math.max(max, LS.indentFor(score, staves, mi, false)); });
    return { first: LS.indentFor(score, staves, 0, true), max };
  };

  /* 줄 나누기. width: 줄 전체 폭(sp). 반환: systems [{mis:[...], xs:[{x0,w}], indent, headerW, partial}] */
  LS.breakSystems = function (score, mds, ctxs, width, opts) {
    const staves = ctxs.staves;
    const ind = LS.indents(score, staves);
    const n = score.measures.length;
    const align = (opts && opts.align !== undefined) ? opts.align : !!(score.layout.alignGrid && score.layout.alignGrid.enabled);
    const nSetting = align ? (score.layout.alignGrid.measuresPerSystem || score.layout.measuresPerSystem || 'auto') : (score.layout.measuresPerSystem || 'auto');
    const forceAfter = mi => !!(score.measures[mi].attrs.systemBreak || score.measures[mi].attrs.pageBreak);
    const systems = [];

    if (align) {
      // 머리 폭 통일(최댓값) — 규칙 5. 들여쓰기도 '다음 줄' 값으로 통일해 첫 세로줄까지 맞춘다
      let headerW = 0;
      ctxs.ctxs.forEach(c => { headerW = Math.max(headerW, LS.headerWidth(c)); });
      const indent = ind.max;
      const avail = width - indent - headerW;
      const items = mds.map((md, mi) => ({ minW: f => md.minWidth(f), idealW: f => md.idealWidth(f), forceBreakAfter: forceAfter(mi) }));
      const sol = SJ.AlignGrid.solve(items, avail, nSetting, score.layout.alignGrid.widthMode || 'equal');
      sol.rows.forEach((row, ri) => {
        let x = indent + headerW;
        const xs = row.map((mi, j) => { const r = { x0: x, w: sol.colW[j] }; x += sol.colW[j]; return r; });
        systems.push({ mis: row, xs, indent, headerW, partial: row.length < sol.n, align: true, n: sol.n, colW: sol.colW });
      });
      systems.alignInfo = { n: sol.n, mode: sol.mode, reduced: sol.reduced, squeezed: sol.squeezed };
      return systems;
    }

    // 일반 모드: 이상적 폭으로 채우고 양쪽 끝 맞춤
    let mi = 0;
    while (mi < n) {
      const indent = LS.indentFor(score, staves, mi, systems.length === 0);
      const headerW = LS.headerWidth(ctxs.ctxs[mi]);
      const avail = width - indent - headerW;
      const row = [];
      let sumIdeal = 0, sumMin = 0;
      const fixedN = nSetting !== 'auto' ? Math.max(1, Number(nSetting)) : 0;
      while (mi < n) {
        const first = row.length === 0;
        const iw = mds[mi].idealWidth(first), mw = mds[mi].minWidth(first);
        if (row.length && (fixedN ? (row.length >= fixedN || sumMin + mw > avail) : (sumIdeal + iw > avail * 1.05 || sumMin + mw > avail))) break;
        row.push(mi); sumIdeal += iw; sumMin += mw;
        mi++;
        if (forceAfter(mi - 1)) break;
      }
      const last = mi >= n;
      const gaps = row.map((k, j) => ({ min: mds[k].minWidth(j === 0), ideal: mds[k].idealWidth(j === 0) }));
      let ws;
      const fill = sumIdeal / avail;
      if (last && fill < 0.7 && !fixedN) ws = gaps.map(g => Math.max(g.min, g.ideal));
      else ws = Sp.distribute(gaps, avail);
      let x = indent + headerW;
      const xs = ws.map(w => { const r = { x0: x, w }; x += w; return r; });
      systems.push({ mis: row, xs, indent, headerW, partial: last && fill < 0.7 && !fixedN, align: false });
    }
    return systems;
  };

  SJ.LayoutSystem = LS;
})(window.SJ = window.SJ || {});
