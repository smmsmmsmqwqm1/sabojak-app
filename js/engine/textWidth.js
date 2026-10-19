/* 결정적 텍스트 폭 추정기 (§5): OS 글꼴 측정에 의존하지 않는다.
 * 같은 문자열 → 어느 기기에서나 같은 폭. 단위 = em (글자 크기 1 기준). */
(function (SJ) {
  'use strict';
  const T = {};
  // 비례폭 표 (Helvetica 계열 근사, em)
  const W = {};
  const set = (chars, w) => { for (const c of chars) W[c] = w; };
  set('il.,:;|!\'`', 0.26);
  set('jft()[]{}/\\-"r', 0.36);
  set(' ', 0.28);
  set('abcdeghknopqsuvxyz', 0.55);
  set('w', 0.74); set('m', 0.83);
  set('ABCDEFGHKNOPQRSTUVXYZ', 0.68);
  set('IJ', 0.32); set('L', 0.56); set('MW', 0.86);
  set('0123456789', 0.56);
  set('+=<>~^*_', 0.58); set('#%&@', 0.84); set('?$', 0.56);
  set('♯♭♮', 0.62); set('𝄪𝄫', 0.8); set('♩♪', 0.7); set('°ø△', 0.6);

  function charW(ch) {
    if (W[ch] !== undefined) return W[ch];
    const c = ch.codePointAt(0);
    if ((c >= 0xAC00 && c <= 0xD7AF) || (c >= 0x1100 && c <= 0x11FF) || (c >= 0x3130 && c <= 0x318F) ||
      (c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3040 && c <= 0x30FF) || (c >= 0xFF00 && c <= 0xFFEF) || (c >= 0x3000 && c <= 0x303F)) return 1.0;
    if (c >= 0x1F000) return 1.1;           // 이모지 등
    if (c >= 0x2000 && c <= 0x2BFF) return 0.7;   // 기호
    return 0.6;
  }

  // text 의 폭 (size 단위로), bold 면 약간 넓게
  T.width = function (text, size, bold) {
    let w = 0;
    for (const ch of String(text || '')) w += charW(ch);
    return w * size * (bold ? 1.06 : 1) * SJ.C.textSafety;
  };

  SJ.TextWidth = T;
})(window.SJ = window.SJ || {});
