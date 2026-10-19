/* schema 버전별 변환 함수 체인. 옛 파일은 항상 열려야 한다(§12). */
(function (SJ) {
  'use strict';
  const M = {};
  // migrations[n] : schema n → n+1
  M.migrations = {
    // 0 → 1: 시험판(schema 없음/0) — 이름 바뀐 필드 정리
    0: function (s) {
      if (s.title !== undefined && (!s.meta || s.meta.title === undefined)) { s.meta = s.meta || {}; s.meta.title = s.title; delete s.title; }
      (s.measures || []).forEach(m => {
        if (m.attrs && m.attrs.barline && !m.attrs.barlineEnd) { m.attrs.barlineEnd = m.attrs.barline; delete m.attrs.barline; }
      });
      s.schema = 1;
      return s;
    }
  };

  M.current = function () { return SJ.APP.schema; };

  // 반환: {score, from, to} — 미래 schema면 error
  M.migrate = function (score) {
    let s = score;
    const from = typeof s.schema === 'number' ? s.schema : 0;
    if (from > SJ.APP.schema) return { error: 'future-schema', from, to: from, score: s };
    let v = from;
    while (v < SJ.APP.schema) {
      const fn = M.migrations[v];
      if (!fn) return { error: 'no-migration:' + v, from, to: v, score: s };
      s = fn(s);
      v = s.schema;
    }
    return { score: s, from, to: v };
  };

  SJ.Migrate = M;
})(window.SJ = window.SJ || {});
