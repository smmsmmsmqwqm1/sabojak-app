/* 페이지 분할과 최종 렌더 IR(mm 좌표). 화면·PDF·PNG 모두 이 결과 하나에서 나온다(§1-5 WYSIWYG). */
(function (SJ) {
  'use strict';
  const C = SJ.C, U = SJ.U, LS = SJ.LayoutSystem, MP = SJ.MeasurePrep, SB = SJ.SystemBuild, TW = SJ.TextWidth;
  const L = {};

  /* opts (모두 선택): {pageW, pageH, margins, staffSize, titleBlock, pageNumbers, align, measuresPerSystem, linesPerPage}
   * 반환: {pages:[{w,h,items,hits,index}], systems, measurePage:{mi:{page,sys}}, eventPos:{id:{page,x,y0,y1}}, spMm} */
  L.layout = function (score, opts) {
    opts = opts || {};
    const t0 = Date.now();
    const pg = score.page;
    const pageW = opts.pageW || pg.width, pageH = opts.pageH || pg.height;
    const mg = opts.margins || pg.margins;
    const spMm = (opts.staffSize || pg.staffSize) / 4;
    const titleBlock = opts.titleBlock !== false;
    const contentW = (pageW - mg.left - mg.right) / spMm;

    const ctxs = LS.contexts(score);
    const mds = score.measures.map((m, mi) => MP.prepare(score, mi, ctxs.ctxs[mi]));
    const lsOpts = {};
    if (opts.align !== undefined) lsOpts.align = opts.align;
    const systems = LS.breakSystems(score, mds, ctxs, contentW, lsOpts);
    const state = { incomingTies: [], eventSys: {}, open: {} };
    systems.forEach((sys, si) => SB.build(score, sys, si, mds, ctxs, state, opts));

    // ── 쪽 나누기 ──
    const pages = [];
    const newPage = () => { const p = { index: pages.length, w: pageW, h: pageH, items: [], hits: [], systems: [] }; pages.push(p); return p; };
    let page = newPage();
    let y = mg.top;
    if (titleBlock) y = titleItems(score, page, pageW, mg, y);
    const bottomLimit = pageH - mg.bottom - (titleBlock ? 6 : 0);
    const gapMin = (score.layout.systemDistance || C.systemDistance) * spMm;
    const placed = [];
    systems.forEach((sys, si) => {
      const hTop = -sys.top * spMm, hBody = sys.bottom * spMm;
      let sy = y + (page.systems.length ? gapMin : (si === 0 && titleBlock ? 2 : 0)) + hTop;
      const prevBreak = si > 0 && score.measures[systems[si - 1].mis[systems[si - 1].mis.length - 1]].attrs.pageBreak;
      if ((sy + hBody > bottomLimit && page.systems.length) || prevBreak) {
        page = newPage();
        y = mg.top;
        sy = y + hTop;
      }
      sys.page = page.index;
      sys.y = sy;
      page.systems.push(sys);
      placed.push(sys);
      y = sy + hBody;
    });

    // 세로 고르게 펴기 (마지막 쪽 제외, 70% 이상 찬 쪽만)
    pages.forEach((p, pi) => {
      if (p.systems.length < 2 || opts.noJustify) return;
      const last = p.systems[p.systems.length - 1];
      const used = last.y + last.bottom * spMm;
      const free = bottomLimit - used;
      const top = p.systems[0].y + p.systems[0].top * spMm;
      const fill = (used - top) / (bottomLimit - top);
      // 마지막 쪽은 거의 찬 경우(85%↑)만 펴서 아래 빈칸이 어색하지 않게
      if (fill < (pi === pages.length - 1 ? 0.85 : 0.7) || free <= 0) return;
      const add = Math.min(free / (p.systems.length - 1), gapMin * 2.5);
      p.systems.forEach((s, i) => { s.y += add * i; });
    });

    // ── mm 로 변환 ──
    const measurePage = {}, eventPos = {}, measureBox = {};
    placed.forEach(sys => {
      const p = pages[sys.page];
      const ox = mg.left, oy = sys.y;
      sys.items.forEach(it => p.items.push(toMm(it, ox, oy, spMm)));
      sys.hits.forEach(h => p.hits.push({ x0: ox + h.x0 * spMm, y0: oy + h.y0 * spMm, x1: ox + h.x1 * spMm, y1: oy + h.y1 * spMm, ref: h.ref, low: h.low }));
      sys.mpos.forEach(mp => {
        measurePage[mp.mi] = { page: sys.page, sys: sys.index };
        measureBox[mp.mi] = {
          page: sys.page, x0: ox + mp.x0 * spMm, x1: ox + mp.x1 * spMm,
          y0: oy + (sys.staffTop[0] - 0.5) * spMm, y1: oy + (sys.staffTop[sys.staffTop.length - 1] + 4.5) * spMm,
          staffTops: sys.staffTop.map(t => oy + t * spMm), segX: mp.segX.map(s => ({ tick: s.tick, x: ox + s.x * spMm }))
        };
      });
      Object.keys(sys.events).forEach(id => {
        const e = sys.events[id];
        const st = sys.staffTop[e.k];
        eventPos[id] = { page: sys.page, x: ox + e.x * spMm, w: (e.w || 1.18) * spMm, y0: oy + (st + e.top) * spMm, y1: oy + (st + e.bottom) * spMm, mi: e.mi, staffId: e.staffId, vi: e.vi };
      });
    });

    // ── 자유 텍스트 ──
    (score.texts || []).forEach(t => {
      let p, x, yy;
      if (t.anchor.type === 'measure') {
        const mi = score.measures.findIndex(m => m.id === t.anchor.measureId);
        const box = measureBox[mi];
        if (!box) return;
        p = pages[box.page]; x = box.x0 + (t.anchor.x || 0); yy = box.y0 + (t.anchor.y || 0);
      } else {
        p = pages[Math.min(t.anchor.page || 0, pages.length - 1)]; x = t.anchor.x; yy = t.anchor.y;
      }
      const size = (t.size || 12) * 0.3528 * (opts.textScale || 1);   // pt → mm (화면 맞춤에서는 보표 크기 비율)
      p.items.push({ t: 'tx', x, y: yy, text: t.text, size, font: 'text', b: !!t.bold, i: !!t.italic, a: 'start', ref: { type: 'text', id: t.id } });
      const w = TW.width(t.text, size, t.bold);
      p.hits.push({ x0: x - 1, y0: yy - size, x1: x + w + 1, y1: yy + size * 0.3, ref: { type: 'text', id: t.id } });
    });

    // ── 쪽 번호 · 머리글 · 바닥글 · 저작권 ──
    const showNums = opts.pageNumbers !== undefined ? opts.pageNumbers : pg.pageNumbers;
    pages.forEach((p, pi) => {
      if (titleBlock && pi === 0 && score.meta.copyright) {
        p.items.push({ t: 'tx', x: pageW / 2, y: pageH - mg.bottom / 2, text: score.meta.copyright, size: C.copyrightSize, font: 'text', a: 'middle', ref: { type: 'meta', field: 'copyright' } });
      }
      if (titleBlock && showNums && pi > 0) p.items.push({ t: 'tx', x: pageW / 2, y: pageH - mg.bottom / 2, text: String(pi + 1), size: C.pageNumberSize, font: 'serif', a: 'middle' });
      if (titleBlock && pg.header && pi > 0) p.items.push({ t: 'tx', x: pageW / 2, y: mg.top / 2 + 1, text: pg.header, size: 2.8, font: 'text', a: 'middle' });
      if (titleBlock && pg.footer) p.items.push({ t: 'tx', x: mg.left, y: pageH - mg.bottom / 2, text: pg.footer, size: 2.6, font: 'text', a: 'start' });
    });

    return { pages, systems: placed, measurePage, measureBox, eventPos, spMm, ms: Date.now() - t0, contentW, alignInfo: systems.alignInfo || null };
  };

  // 첫 쪽 제목 칸
  function titleItems(score, page, pageW, mg, y) {
    const m = score.meta;
    const add = it => page.items.push(it);
    const hit = (x0, y0, x1, y1, field) => page.hits.push({ x0, y0, x1, y1, ref: { type: 'meta', field } });
    const ts = Object.assign({ size: C.titleSize, bold: true, italic: false, underline: true }, score.page.titleStyle || {});
    const cs = Object.assign({ size: C.creditSize, bold: false, italic: false }, score.page.creditStyle || {});
    let cy = y + ts.size * 0.85;
    const title = m.title || '';
    const tw = Math.max(40, TW.width(title || ' ', ts.size, ts.bold));
    if (title) add({ t: 'tx', x: pageW / 2, y: cy, text: title, size: ts.size, font: 'serif', b: ts.bold, i: ts.italic, a: 'middle', ref: { type: 'meta', field: 'title' } });
    else add({ t: 'tx', x: pageW / 2, y: cy, text: SJ.t ? SJ.t('제목을 입력하세요') : '제목', size: ts.size * 0.8, font: 'text', a: 'middle', ph: true });
    // 제목 칸 밑줄 (인쇄에도 나옴 — 손으로 제목을 쓸 수 있는 칸). 제목 모양에서 끌 수 있다
    if (ts.underline) {
      const lw = Math.max(100, tw + 16);
      add({ t: 'l', x1: pageW / 2 - lw / 2, y1: cy + 2.2, x2: pageW / 2 + lw / 2, y2: cy + 2.2, w: 0.25 });
    }
    hit(pageW / 2 - Math.max(tw, 100) / 2 - 4, cy - ts.size - 1, pageW / 2 + Math.max(tw, 100) / 2 + 4, cy + 3.5, 'title');
    cy += 3.2;
    if (m.subtitle) {
      cy += C.subtitleSize;
      add({ t: 'tx', x: pageW / 2, y: cy, text: m.subtitle, size: C.subtitleSize, font: 'serif', a: 'middle', ref: { type: 'meta', field: 'subtitle' } });
      const sw = TW.width(m.subtitle, C.subtitleSize);
      hit(pageW / 2 - sw / 2 - 3, cy - C.subtitleSize, pageW / 2 + sw / 2 + 3, cy + 1.5, 'subtitle');
      cy += 1.5;
    } else hit(pageW / 2 - 25, cy - 0.5, pageW / 2 + 25, cy + 4, 'subtitle');
    // 작곡가(오른쪽) · 작사가(왼쪽) · 편곡(오른쪽 아래)
    const lineY = cy + cs.size + 2;
    const right = pageW - mg.right, left = mg.left;
    const credit = (x, yy, text, a, field, ph) => {
      if (text) add({ t: 'tx', x, y: yy, text, size: cs.size, font: 'serif', b: cs.bold, i: cs.italic, a, ref: { type: 'meta', field } });
      else add({ t: 'tx', x, y: yy, text: SJ.t ? SJ.t(ph) : ph, size: cs.size * 0.9, font: 'text', a, ph: true });
      const w = Math.max(30, TW.width(text || ph, cs.size) + 2);
      hit(a === 'end' ? x - w : x - 1, yy - cs.size - 0.5, a === 'end' ? x + 1 : x + w, yy + 1, field);
    };
    credit(right, lineY, m.composer, 'end', 'composer', '작곡');
    credit(left, lineY, m.lyricist, 'start', 'lyricist', '작사');
    let end = lineY + 1.5;
    if (m.arranger) {
      end += cs.size + 0.5;
      add({ t: 'tx', x: right, y: end, text: m.arranger, size: cs.size * 0.9, font: 'serif', b: cs.bold, i: cs.italic, a: 'end', ref: { type: 'meta', field: 'arranger' } });
      hit(right - TW.width(m.arranger, cs.size) - 2, end - cs.size, right + 1, end + 1, 'arranger');
    }
    return end + 4;
  }

  function toMm(it, ox, oy, sp) {
    const X = x => U.r3(ox + x * sp), Y = y => U.r3(oy + y * sp);
    switch (it.t) {
      case 'g': return { t: 'g', n: it.n, x: X(it.x), y: Y(it.y), s: U.r4(sp * (it.s || 1)), sx: it.sx, sy: it.sy, ref: it.ref, cls: it.cls };
      case 'l': return { t: 'l', x1: X(it.x1), y1: Y(it.y1), x2: X(it.x2), y2: Y(it.y2), w: U.r3(it.w * sp), dash: it.dash ? it.dash.map(d => U.r3(d * sp)) : undefined };
      case 'r': return { t: 'r', x: X(it.x), y: Y(it.y), w: U.r3(it.w * sp), h: U.r3(it.h * sp), cls: it.cls };
      case 'poly': return { t: 'poly', pts: it.pts.map(p => [X(p[0]), Y(p[1])]) };
      case 'path': return { t: 'path', d: it.d.map(seg => seg.map((v, i) => i === 0 ? v : (i % 2 === 1 ? X(v) : Y(v)))) };
      case 'pathRaw': return { t: 'pathRaw', d: it.d, x: X(it.x), y: Y(it.y), s: U.r4(sp) };
      case 'tx': return { t: 'tx', x: X(it.x), y: Y(it.y), text: it.text, size: U.r3(it.size * sp), font: it.font, b: it.b, i: it.i, a: it.a, ref: it.ref, ph: it.ph };
      case 'box': return { t: 'box', x: X(it.x), y: Y(it.y), w: U.r3(it.w * sp), h: U.r3(it.h * sp), sw: U.r3(it.sw * sp) };
      default: return it;
    }
  }

  // 첫 쪽이 꽉 차는 만큼만 마디를 남김 (새 악보 기본값 '한 쪽 가득')
  L.fitFirstPage = function (score) {
    const R = L.layout(score);
    let n = 0;
    score.measures.forEach((m, mi) => { if (R.measurePage[mi] && R.measurePage[mi].page === 0) n = mi + 1; });
    if (n <= 0 || n >= score.measures.length) return score;
    const s = Object.assign({}, score, { measures: score.measures.slice(0, n) });
    const last = Object.assign({}, s.measures[n - 1]);
    last.attrs = Object.assign({}, last.attrs, { barlineEnd: 'final' });
    s.measures[n - 1] = last;
    return s;
  };

  L.toUnits = toMm;
  SJ.Layout = L;
})(window.SJ = window.SJ || {});
