/* 언어: 한국어가 기본(문장 자체가 열쇠), 영어는 i18n_en.js 의 표. 번역이 없으면 한국어로 보인다(빈칸 없음). */
(function (SJ) {
  'use strict';
  let lang = 'ko';
  SJ.EN = SJ.EN || {};
  SJ.setLang = function (l) { lang = l === 'en' ? 'en' : 'ko'; document.documentElement.lang = lang; };
  SJ.getLang = function () { return lang; };
  SJ.t = function (s, params) {
    let out = lang === 'en' && SJ.EN[s] ? SJ.EN[s] : s;
    if (params) Object.keys(params).forEach(k => { out = out.split('{' + k + '}').join(params[k]); });
    return out;
  };
})(window.SJ = window.SJ || {});
