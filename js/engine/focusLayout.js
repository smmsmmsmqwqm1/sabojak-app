/* 마디 집중 모드 배치 (§8-1): 그 마디만 화면 폭의 약 88~94%로 늘려 새로 레이아웃.
 * 앞뒤 마디는 가장자리에 조금 보이게(흐리게는 화면에서 덮개로). 결과 단위 = 화면 px. */
(function (SJ) {
  'use strict';
  const LS = SJ.LayoutSystem, MP = SJ.MeasurePrep, SB = SJ.SystemBuild, L = SJ.Layout;
  const FL = {};

  /* opts: {w, h, staffIds:[보일 보표 id], ghost:true} */
  FL.layout = function (score, mi, opts) {
    const all = LS.contexts(score);
    const staves = all.staves.filter(s => opts.staffIds.indexOf(s.id) >= 0).map((s, k) => Object.assign({}, s, { k }));
    const ctxs = { staves, ctxs: all.ctxs.map(c => Object.assign({}, c, { staves })) };
    const n = score.measures.length;
    // 왼쪽엔 늘 음자리표·조표·박자표(줄 머리)를 보여 문맥을 주고, 오른쪽엔 다음 마디를 조금(흐리게)
    const hasPrev = false, hasNext = mi < n - 1;
    const mis = [mi];
    if (hasNext) mis.push(mi + 1);
    const mds = {};
    mis.forEach(i => { mds[i] = MP.prepare(score, i, ctxs.ctxs[i]); });
    const nS = staves.length;
    const headerW0 = LS.headerWidth(ctxs.ctxs[mi]);
    // 보표 크기: 마디가 단순하면 크게, 빽빽하면 다 들어가도록 (최소 폭의 1.3배 확보)
    const need = Math.max(mds[mi].minWidth(true) * 1.3, 11) + headerW0 + 2;
    let spPx = Math.min(opts.h / (nS * 12.5 + 1), opts.w / need, opts.w / 16);

    let res = null;
    for (let pass = 0; pass < 2; pass++) {
      const Wsp = opts.w / spPx;
      const ghost = Wsp * 0.05;
      const headerW = headerW0;
      const xs = [];
      let x = headerW, viewX0 = 0;
      const curW = Wsp - headerW - ghost;
      xs.push({ x0: x, w: curW });
      const curX0 = x; x += curW;
      if (hasNext) xs.push({ x0: x, w: Math.max(mds[mi + 1].idealWidth(false), ghost * 2) });
      const sys = { mis, xs, indent: 0, headerW, partial: false, align: false };
      const state = { incomingTies: [], eventSys: {}, open: {} };
      SB.build(score, sys, 0, mds, ctxs, state, {});
      const topPad = Math.max(5, -sys.top + 0.8);
      const needH = (topPad + sys.bottom + 5) * spPx;
      if (needH > opts.h && pass === 0) { spPx *= opts.h / needH; continue; }
      const oy = topPad * spPx + Math.max(0, (opts.h - needH) / 2);
      const ox = -viewX0 * spPx;
      const items = sys.items.map(it => L.toUnits(it, ox, oy, spPx));
      const hits = sys.hits.map(h => ({ x0: ox + h.x0 * spPx, y0: oy + h.y0 * spPx, x1: ox + h.x1 * spPx, y1: oy + h.y1 * spPx, ref: h.ref, low: h.low }));
      const cur = sys.mpos.find(p => p.mi === mi);
      const X = v => ox + v * spPx;
      const md = mds[mi];
      const pl = cur.place;
      res = {
        items, hits, spPx, w: opts.w, h: opts.h,
        staves, staffTop: sys.staffTop.map(t => oy + t * spPx),
        cur: {
          x0: X(cur.x0), x1: X(cur.x1),
          contentStart: X(cur.x0 + pl.contentStart), contentEnd: X(cur.x0 + pl.contentEnd),
          segX: cur.segX.map(s => ({ tick: s.tick, x: X(s.x) }))
        },
        prev: hasPrev ? { x0: 0, x1: X(curX0) } : null,
        next: hasNext ? { x0: X(cur.x1), x1: opts.w } : null,
        events: Object.keys(sys.events).reduce((o, id) => {
          const e = sys.events[id];
          if (e.mi !== mi) return o;
          const st = sys.staffTop[e.k];
          o[id] = { x: X(e.x), w: (e.w || 1.18) * spPx, y0: oy + (st + e.top) * spPx, y1: oy + (st + e.bottom) * spPx, k: e.k, vi: e.vi, staffId: e.staffId,
            heads: (e.headYs || []).map(hh => ({ y: oy + (st + hh.y) * spPx, hi: hh.hi, x: X(e.x + hh.dx) })) };
          return o;
        }, {}),
        md, cap: md.cap
      };
      break;
    }
    return res;
  };

  // 틱 → x (현재 마디). 열 사이는 선형 보간
  FL.tickToX = function (F, tick) {
    const segs = F.cur.segX;
    const a = F.cur.contentStart + 1.0 * F.spPx, b = F.cur.contentEnd - 1.0 * F.spPx;
    if (!segs.length) return a + (b - a) * (tick / F.cap);
    if (tick <= segs[0].tick) return segs[0].x - (segs[0].tick - tick) / F.cap * (b - a);
    for (let i = 0; i < segs.length - 1; i++) {
      if (tick >= segs[i].tick && tick <= segs[i + 1].tick) {
        const t = (tick - segs[i].tick) / Math.max(1, segs[i + 1].tick - segs[i].tick);
        return segs[i].x + (segs[i + 1].x - segs[i].x) * t;
      }
    }
    const last = segs[segs.length - 1];
    const endT = Math.max(F.cap, last.tick + 1);
    return last.x + (b - last.x) * ((tick - last.tick) / Math.max(1, endT - last.tick));
  };

  // y(px) → 보표 위치(반칸 단위, 아래 첫 줄=0)
  FL.yToPos = function (F, k, y) {
    const top = F.staffTop[k];
    return Math.round(8 - ((y - top) / F.spPx) * 2);
  };
  FL.posToY = function (F, k, pos) { return F.staffTop[k] + (8 - pos) / 2 * F.spPx; };

  // y에서 가장 가까운 보표
  FL.staffAt = function (F, y) {
    let best = 0, bd = 1e9;
    F.staffTop.forEach((t, k) => { const d = Math.abs(y - (t + 2 * F.spPx)); if (d < bd) { bd = d; best = k; } });
    return best;
  };

  SJ.FocusLayout = FL;
})(window.SJ = window.SJ || {});
