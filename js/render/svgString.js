/* 렌더 IR(mm) → SVG 문자열. 화면 렌더러와 내보내기(PDF·PNG)가 같은 함수를 쓴다. */
(function (SJ) {
  'use strict';
  const G = SJ.Glyphs, U = SJ.U;
  const R = {};
  const INK = '#151515';
  R.FONTS = {
    text: "'Pretendard','Apple SD Gothic Neo','Noto Sans KR','Noto Sans CJK KR','Malgun Gothic',sans-serif",
    serif: "'Noto Serif KR','Noto Serif CJK KR','AppleMyungjo','Nanum Myeongjo','Times New Roman',serif",
    chord: "'Helvetica Neue',Helvetica,Arial,'Apple SD Gothic Neo','Noto Sans KR',sans-serif"
  };
  const n3 = v => (Math.round(v * 1000) / 1000).toString();

  function pathD(segs) {
    let d = '';
    segs.forEach(s => { d += s[0] + s.slice(1).map(n3).join(' '); });
    return d;
  }

  // 한 쪽 → SVG 문자열. opts: {width, height (CSS 단위 문자열), mmUnits(true면 width="210mm"), cls, gray}
  R.page = function (page, opts) {
    opts = opts || {};
    const used = new Set();
    let body = '';
    const fill = opts.gray ? '#333' : INK;
    page.items.forEach(it => {
      switch (it.t) {
        case 'g': {
          const g = G[it.n]; if (!g) break;
          used.add(it.n);
          const sx = it.s * (it.sx || 1), sy = it.s * (it.sy || 1);
          const tr = 'translate(' + n3(it.x) + ' ' + n3(it.y) + ') scale(' + n3(sx) + (sx !== sy ? ' ' + n3(sy) : '') + ')';
          body += '<use href="#sjg-' + it.n + '" transform="' + tr + '"' + (it.cls ? ' class="' + it.cls + '"' : '') + '/>';
          break;
        }
        case 'l':
          body += '<line x1="' + n3(it.x1) + '" y1="' + n3(it.y1) + '" x2="' + n3(it.x2) + '" y2="' + n3(it.y2) + '" stroke="' + fill + '" stroke-width="' + n3(it.w) + '"' +
            (it.dash ? ' stroke-dasharray="' + it.dash.map(n3).join(' ') + '"' : '') + '/>';
          break;
        case 'r':
          body += '<rect x="' + n3(it.x) + '" y="' + n3(it.y) + '" width="' + n3(Math.max(0.01, it.w)) + '" height="' + n3(Math.max(0.01, it.h)) + '"' + (it.cls ? ' class="' + it.cls + '"' : '') + '/>';
          break;
        case 'poly':
          body += '<polygon points="' + it.pts.map(p => n3(p[0]) + ',' + n3(p[1])).join(' ') + '"/>';
          break;
        case 'path':
          body += '<path d="' + pathD(it.d) + '"/>';
          break;
        case 'pathRaw':
          body += '<path d="' + it.d + '" transform="translate(' + n3(it.x) + ' ' + n3(it.y) + ') scale(' + n3(it.s) + ')"/>';
          break;
        case 'box':
          body += '<rect x="' + n3(it.x) + '" y="' + n3(it.y) + '" width="' + n3(it.w) + '" height="' + n3(it.h) + '" fill="none" stroke="' + fill + '" stroke-width="' + n3(it.sw) + '" rx="' + n3(it.h * 0.08) + '"/>';
          break;
        case 'tx':
          if (!it.text) break;
          if (it.ph && !opts.screen) break;      // 빈 칸 안내 글(제목을 입력하세요 등)은 화면에서만
          body += '<text x="' + n3(it.x) + '" y="' + n3(it.y) + '" font-size="' + n3(it.size) + '" font-family="' + U.esc(R.FONTS[it.font || 'text']) + '"' +
            (it.ph ? ' fill="#B8B3C6"' : '') +
            (it.b ? ' font-weight="700"' : '') + (it.i ? ' font-style="italic"' : '') +
            (it.a && it.a !== 'start' ? ' text-anchor="' + it.a + '"' : '') + '>' + U.esc(it.text) + '</text>';
          break;
      }
    });
    let defs = '';
    used.forEach(n => { defs += '<path id="sjg-' + n + '" d="' + G[n].d + '"/>'; });
    const w = page.w, h = page.h;
    const size = opts.mmUnits ? ' width="' + n3(w) + 'mm" height="' + n3(h) + 'mm"' : (opts.width ? ' width="' + opts.width + '" height="' + opts.height + '"' : '');
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ' + n3(w) + ' ' + n3(h) + '"' + size +
      (opts.cls ? ' class="' + opts.cls + '"' : '') + ' preserveAspectRatio="xMidYMid meet">' +
      '<defs>' + defs + '</defs>' +
      '<rect x="0" y="0" width="' + n3(w) + '" height="' + n3(h) + '" fill="#ffffff"/>' +
      '<g fill="' + fill + '" stroke="none">' + body + '</g></svg>';
  };

  SJ.SvgRender = R;
})(window.SJ = window.SJ || {});
