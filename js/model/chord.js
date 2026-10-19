/* 코드 기호: 문자열 해석·정리(♯♭)·조옮김 */
(function (SJ) {
  'use strict';
  const P = SJ.Pitch;
  const C = {};
  C.QUALITIES = ['', 'm', 'M7', '7', 'm7', 'dim', 'aug', 'sus4', 'add9', '6', '9', '11', '13', '♭5', '♯5', 'm7♭5', 'dim7', 'sus2', 'mM7', 'm6', '7sus4', '7♭9', '7♯9'];

  // 표시용 정리: b/# → ♭/♯ (근음·베이스·텐션), maj7 → M7 은 사용자가 쓴 그대로 둔다
  function prettyTail(s) {
    return s.replace(/#/g, '♯').replace(/(^|[^A-Za-z])b(?=\d)/g, '$1♭').replace(/\(b/g, '(♭');
  }

  // "F#m7b5/E" → {root:'F', alter:1, quality:'m7♭5', bass:{step:'E', alter:0}}
  C.parse = function (text) {
    const t = SJ.U.nfc(String(text || '')).trim();
    const m = /^([A-Ga-g])([#♯b♭]{0,2})(.*?)(?:\/([A-Ga-g])([#♯b♭]{0,2}))?$/.exec(t);
    if (!m) return { text: t, raw: true };
    const acc = s => (s.match(/[#♯]/g) || []).length - (s.match(/[b♭]/g) || []).length;
    const out = { root: m[1].toUpperCase(), alter: acc(m[2]), quality: prettyTail(m[3] || '') };
    if (m[4]) out.bass = { step: m[4].toUpperCase(), alter: acc(m[5] || '') };
    return out;
  };

  const accStr = a => a === 1 ? '♯' : a === -1 ? '♭' : a === 2 ? '𝄪' : a === -2 ? '𝄫' : '';
  C.format = function (c) {
    if (!c || c.raw) return c ? c.text : '';
    return c.root + accStr(c.alter) + (c.quality || '') + (c.bass ? '/' + c.bass.step + accStr(c.bass.alter) : '');
  };
  C.pretty = function (text) { return C.format(C.parse(text)); };

  function tp(step, alter, steps, semis) {
    const h = P.transposeHead({ step, alter, octave: 4 }, steps, semis);
    let r = h;
    if (Math.abs(r.alter) > 1) r = P.respell(r);
    return { step: r.step, alter: r.alter };
  }
  C.transpose = function (text, steps, semis) {
    const c = C.parse(text);
    if (c.raw) return text;
    const r = tp(c.root, c.alter, steps, semis);
    c.root = r.step; c.alter = r.alter;
    if (c.bass) { const b = tp(c.bass.step, c.bass.alter, steps, semis); c.bass = { step: b.step, alter: b.alter }; }
    return C.format(c);
  };

  SJ.Chord = C;
})(window.SJ = window.SJ || {});
