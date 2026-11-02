/* 설정 (§14) — settings.json 에 저장 */
(function (SJ) {
  'use strict';
  const DEFAULTS = {
    lang: 'auto', theme: 'system', haptics: true, uiScale: 1,     // lang: 'auto'(기기 언어 따라) | 'ko' | 'en'
    // 필기
    // pencilOnly: 펜이 닿은 적 있는 기기(penSeen)에서만 '펜 = 쓰기, 손가락 = 고르기'. 펜 없는 폰은 손가락으로 그린다
    pencilOnly: true, penSeen: false, recogDelay: 600, scratchErase: true,
    // 악보 모드
    perfExitTwoFinger: true, perfExitHold: true, perfAnim: 'none', perfPageNum: true, perfLines: 3, perfView: 'page',
    // 정렬 (새 악보 기본값)
    alignDefault: true, alignN: 4, alignWidth: 'equal',
    // 집중 모드
    inputMode: 'tap', focusAllStaves: false, lastDur: 'quarter',
    // 안내
    onboarded: false, perfGuideSeen: false, focusHintSeen: false,
    // 소리 미리듣기(§15-1: 배제 — 화면에 노출하지 않음)
    soundPreview: false,
    defaultPaper: 'A4', defaultOrientation: 'portrait'
  };
  let data = Object.assign({}, DEFAULTS);
  const listeners = [];
  const S = {};
  S.load = async function () {
    const j = await SJ.Storage.loadJson('settings.json', {});
    data = Object.assign({}, DEFAULTS, j || {});
    S.apply();
    return data;
  };
  S.get = k => data[k];
  S.all = () => Object.assign({}, data);
  S.set = function (k, v) {
    data[k] = v;
    SJ.Storage.saveJson('settings.json', data).catch(() => {});
    S.apply();
    listeners.forEach(fn => fn(k, v));
  };
  S.on = fn => listeners.push(fn);
  S.reset = function (keys) { keys.forEach(k => { data[k] = DEFAULTS[k]; }); SJ.Storage.saveJson('settings.json', data).catch(() => {}); S.apply(); };
  S.isDark = function () {
    if (data.theme === 'dark') return true;
    if (data.theme === 'light') return false;
    try { if (window.Android && window.Android.isDark) return window.Android.isDark() === true || window.Android.isDark() === 'true'; } catch (e) { /* 무시 */ }
    return !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  };
  // 기기 언어: 한국어면 한국어, 그 밖의 언어는 영어
  S.deviceLang = function () {
    const ls = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'ko']);
    return /^ko\b/i.test(String(ls[0] || '')) ? 'ko' : 'en';
  };
  S.lang = () => (data.lang === 'ko' || data.lang === 'en' ? data.lang : S.deviceLang());
  S.apply = function () {
    SJ.setLang(S.lang());
    const dark = S.isDark();
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.documentElement.style.setProperty('--ui-scale', String(data.uiScale || 1));
    if (SJ.Platform) SJ.Platform.statusBar(dark ? '#1B1A21' : '#FBF8F3', !dark);
    // 아이폰 홈 화면 웹앱 · 웹: 맨 위 상태 막대 색도 테마를 따르게(밝은색 고정이던 것 · 점검원 ⑤ 11-02)
    try { document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', dark ? '#1B1A21' : '#FBF8F3')); } catch (e) { /* 무시 */ }
  };
  S.DEFAULTS = DEFAULTS;
  SJ.Settings = S;
})(window.SJ = window.SJ || {});
