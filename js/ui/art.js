/* 작은 그림 (직접 그린 단순 도형만) — 로고 · 빈 화면 · 안내 */
(function (SJ) {
  'use strict';
  const A = {};
  // 둥근 음표 친구 (눈 두 개) — 앱 아이콘과 같은 모양
  A.logo = function (px) {
    return '<svg viewBox="0 0 48 48" style="width:' + (px || 30) + 'px;height:' + (px || 30) + 'px" aria-hidden="true">' +
      '<rect x="2" y="2" width="44" height="44" rx="14" fill="#7C8CDE"/>' +
      '<path d="M27 11v19" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/>' +
      '<path d="M27 11c4 1.2 7 3.5 7.5 7.5" stroke="#fff" stroke-width="3.4" stroke-linecap="round" fill="none"/>' +
      '<ellipse cx="21" cy="31" rx="7.6" ry="6.2" transform="rotate(-18 21 31)" fill="#fff"/>' +
      '<circle cx="18.4" cy="30.6" r="1.3" fill="#7C8CDE"/><circle cx="22.8" cy="29.4" r="1.3" fill="#7C8CDE"/>' +
      '<path d="M19 33.6q1.9 1.3 3.8-.4" stroke="#EE9E73" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
  };
  A.empty = function () {
    return '<svg class="ill" viewBox="0 0 150 120" aria-hidden="true">' +
      '<ellipse cx="75" cy="106" rx="48" ry="7" fill="var(--surface-3)"/>' +
      '<g stroke="var(--line)" stroke-width="2">' + [36, 46, 56, 66, 76].map(y => '<path d="M14 ' + y + 'h122"/>').join('') + '</g>' +
      '<path d="M86 22v52" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"/>' +
      '<path d="M86 22c9 2.5 15 8 16 17" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" fill="none"/>' +
      '<ellipse cx="72" cy="78" rx="17" ry="13" transform="rotate(-18 72 78)" fill="var(--accent)"/>' +
      '<circle cx="66.5" cy="77" r="2.4" fill="#fff"/><circle cx="76" cy="74" r="2.4" fill="#fff"/>' +
      '<path d="M67 83q4.5 3 8.6-.8" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="42" cy="26" r="4" fill="var(--apricot)" opacity=".7"/><circle cx="118" cy="88" r="3" fill="var(--mint)" opacity=".7"/></svg>';
  };
  // 첫 실행 안내 그림 3장
  A.onb = function (i) {
    const paper = '<rect x="40" y="18" width="140" height="132" rx="10" fill="#fff" stroke="var(--line)" stroke-width="2"/>' +
      '<g stroke="#C9C4D4" stroke-width="1.4">' + [50, 56, 62, 68, 74, 96, 102, 108, 114, 120].map(y => '<path d="M54 ' + y + 'h112"/>').join('') + '</g>' +
      '<path d="M54 50v24M82 50v24M110 50v24M138 50v24M166 50v24M54 96v24M82 96v24M110 96v24M138 96v24M166 96v24" stroke="#C9C4D4" stroke-width="1.4"/>';
    if (i === 0) return '<svg class="ill" viewBox="0 0 220 170">' + paper + '<rect x="78" y="26" width="64" height="8" rx="4" fill="var(--accent-weak)"/>' +
      '<circle cx="176" cy="140" r="18" fill="var(--accent)"/><path d="M176 131v18M167 140h18" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>';
    if (i === 1) return '<svg class="ill" viewBox="0 0 220 170">' + paper + '<rect x="83" y="46" width="26" height="32" rx="4" fill="rgba(124,140,222,.2)" stroke="var(--accent)" stroke-width="2"/>' +
      '<circle cx="96" cy="62" r="12" fill="none" stroke="var(--apricot)" stroke-width="2.4" stroke-dasharray="3 3"/><circle cx="96" cy="62" r="5" fill="var(--apricot)"/>' +
      '<text x="96" y="160" text-anchor="middle" font-size="12" fill="var(--ink-2)" font-weight="700">' + SJ.t('톡톡') + '</text></svg>';
    return '<svg class="ill" viewBox="0 0 220 170"><rect x="30" y="14" width="160" height="140" rx="12" fill="#fff" stroke="var(--line)" stroke-width="2"/>' +
      '<path d="M110 14v140" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>' +
      '<text x="70" y="90" text-anchor="middle" font-size="22" fill="var(--accent)">◀</text><text x="150" y="90" text-anchor="middle" font-size="22" fill="var(--accent)">▶</text>' +
      '<text x="70" y="112" text-anchor="middle" font-size="11" fill="var(--ink-2)">' + SJ.t('이전') + '</text><text x="150" y="112" text-anchor="middle" font-size="11" fill="var(--ink-2)">' + SJ.t('다음') + '</text></svg>';
  };
  SJ.Art = A;
})(window.SJ = window.SJ || {});
