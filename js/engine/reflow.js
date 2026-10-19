/* 악보 모드 '화면 맞춤' 재배치 (§10): 저장된 레이아웃은 건드리지 않고 화면 비율에 맞춰 다시 배치.
 * 결과 단위 = 화면 px. 같은 화면 크기 → 같은 결과(결정적). 정렬 모드면 정렬을 유지한다. */
(function (SJ) {
  'use strict';
  const RF = {};
  const cache = { key: null, res: null };

  /* opts: {w, h (px), lines (화면당 줄 수, 기본 3)} */
  RF.layout = function (score, opts) {
    const w = Math.max(200, Math.round(opts.w)), h = Math.max(200, Math.round(opts.h));
    const lines = Math.max(1, Math.min(8, opts.lines || 3));
    const key = score.id + '|' + score.meta.updatedAt + '|' + w + 'x' + h + '|' + lines + '|' + score.measures.length;
    if (cache.key === key && cache.score === score) return cache.res;
    const margin = Math.round(Math.min(w, h) * 0.035);
    const margins = { top: margin, bottom: margin, left: margin, right: margin };
    // 1차: 기준 보표 크기로 한 줄 높이(sp) 재기
    const probeStaff = 28;
    const probe = SJ.Layout.layout(score, { pageW: w, pageH: 100000, margins, staffSize: probeStaff, titleBlock: false, pageNumbers: false, noJustify: true });
    const hs = probe.systems.map(s => s.bottom - s.top).sort((a, b) => a - b);
    const med = hs.length ? hs[Math.floor(hs.length / 2)] : 12;
    const gapSp = (score.layout.systemDistance || SJ.C.systemDistance) * 0.8;
    let sp = (h - margins.top - margins.bottom) / (lines * med + (lines - 1) * gapSp + 1);
    // 너무 크거나 작지 않게: 가로 폭에 최소 1마디 이상 들어가게
    sp = Math.max(Math.min(sp, w / 28), 3);
    const res = SJ.Layout.layout(score, { pageW: w, pageH: h, margins, staffSize: sp * 4, titleBlock: false, pageNumbers: false, noJustify: false,
      textScale: sp / (score.page.staffSize / 4) });
    cache.key = key; cache.score = score; cache.res = res;
    return res;
  };

  SJ.Reflow = RF;
})(window.SJ = window.SJ || {});
