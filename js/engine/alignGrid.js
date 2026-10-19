/* ★ 세로줄 정렬 시스템 (§6)
 * 모든 줄의 j번째 세로줄이 같은 x에 오도록 열(column) 폭을 정한다.
 * widthMode 'equal'(기본): 모든 마디 같은 폭. 어느 마디가 그 폭에 안 들어가면(음표가 찌그러짐) 'fit'으로 자동 전환.
 * widthMode 'fit': 열 j 폭 = 모든 줄 j번째 마디 최소 폭의 최댓값, 남는 폭은 같은 비율로 늘림(§6 알고리즘).
 * 그래도 줄 폭을 넘으면: 최소 폭의 92%까지는 조금 좁혀 허용, 그 이상이면 N을 1 줄인다(알림용 reduced 표시).
 * 줄 머리 폭(음자리표·조표)은 모든 줄 같은 값(최댓값), 마지막 줄이 짧으면 같은 열 폭 그대로 두고 오른쪽을 비운다. */
(function (SJ) {
  'use strict';
  const AG = {};
  const SQUEEZE = 0.92;

  /* items: [{minW(first), idealW(first), forceBreakAfter}] , avail: 머리 뒤 쓸 수 있는 폭(sp)
   * nSetting: 'auto' | 숫자, widthMode: 'equal' | 'fit'
   * 반환: {n, rows, colW, mode(실제 쓴 방식), reduced(요청 N보다 줄였는지), squeezed} */
  AG.solve = function (items, avail, nSetting, widthMode) {
    const count = items.length;
    if (!count) return { n: 0, rows: [], colW: [], mode: widthMode || 'equal' };
    const fixed = nSetting && nSetting !== 'auto';
    let n;
    if (fixed) n = Math.max(1, Math.min(count, Math.floor(Number(nSetting))));
    else {
      const avgIdeal = items.reduce((a, it) => a + it.idealW(false), 0) / count;
      n = Math.max(1, Math.min(8, count, Math.round(avail / Math.max(1, avgIdeal))));
    }
    const wanted = n;
    for (; n >= 1; n--) {
      const rows = AG.rows(items, n);
      const mins = AG.columns(items, rows, n);
      const used = mins.slice(0, Math.max(...rows.map(r => r.length)));
      // 1) 균등 폭
      if ((widthMode || 'equal') === 'equal') {
        const eq = avail / n;
        if (used.every(w => w <= eq + 1e-6)) {
          return { n, rows, colW: new Array(n).fill(eq), mode: 'equal', reduced: n < wanted, squeezed: false };
        }
      }
      // 2) 열별 최솟값 + 같은 비율 확대
      const sum = mins.reduce((a, w) => a + w, 0);
      if (sum <= avail + 1e-6) {
        const f = sum > 0 ? avail / sum : 1;
        return { n, rows, colW: mins.map(w => w * f), mode: 'fit', reduced: n < wanted, squeezed: false };
      }
      // 3) 조금 좁혀서라도 (최소 폭의 92%까지)
      if (sum * SQUEEZE <= avail + 1e-6 || n === 1) {
        const f = avail / sum;
        return { n, rows, colW: mins.map(w => w * f), mode: 'fit', reduced: n < wanted, squeezed: true };
      }
    }
    return { n: 1, rows: items.map((_, i) => [i]), colW: [avail], mode: 'fit', reduced: true, squeezed: true };
  };

  // N개씩 줄 나누기 (강제 줄바꿈이 있으면 그 뒤에서 새 줄, 열 번호는 0부터 다시)
  AG.rows = function (items, n) {
    const rows = [];
    let cur = [];
    items.forEach((it, i) => {
      cur.push(i);
      if (cur.length >= n || it.forceBreakAfter) { rows.push(cur); cur = []; }
    });
    if (cur.length) rows.push(cur);
    return rows;
  };

  // 열마다 최소 폭의 최댓값 (줄 첫 마디는 '첫 마디' 폭 사용)
  AG.columns = function (items, rows, n) {
    const colW = new Array(n).fill(0);
    rows.forEach(r => r.forEach((mi, j) => { colW[j] = Math.max(colW[j], items[mi].minW(j === 0)); }));
    // 아무 줄도 채우지 않은 열은 평균 폭으로 (마지막 줄 오른쪽 비움에 영향 없음)
    const filled = colW.filter(w => w > 0);
    const avg = filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : 1;
    return colW.map(w => w || avg);
  };

  SJ.AlignGrid = AG;
})(window.SJ = window.SJ || {});
