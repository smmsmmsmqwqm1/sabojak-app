/* 간격·크기·사보 상수 — 모든 값은 여기 한 곳에서. 단위가 없으면 sp(보표 줄 간격). */
(function (SJ) {
  'use strict';
  SJ.C = {
    PPQ: 20160,                 // 4분음표 하나의 틱 수 (3·5·7잇단과 점음표를 정수로)

    // 음표 간격 (§5)
    spaceQuarter: 3.3,          // 4분음표 기본 간격
    spaceExponent: 0.6,         // 로그형 곡선 지수
    spaceMinGap: 0.45,          // 이웃 기호 사이 최소 여유
    measureLeadPad: 1.1,        // 세로줄 뒤 첫 음까지
    measureTailMin: 1.2,        // 마지막 음 뒤 세로줄까지 최소
    emptyMeasureWidth: 8,       // 빈 마디(온쉼표) 이상적 폭
    textSafety: 1.05,           // 텍스트 폭 추정기 안전 여유

    // 선 두께 (Bravura engravingDefaults 근사)
    staffLineW: 0.13,
    stemW: 0.12,
    ledgerW: 0.16,
    ledgerExt: 0.4,
    beamW: 0.5,
    beamGap: 0.25,
    thinBarW: 0.16,
    thickBarW: 0.5,
    barSep: 0.4,
    repeatDotSep: 0.45,
    tieMidW: 0.22,
    slurMidW: 0.22,
    hairpinW: 0.16,
    bracketW: 0.5,
    tupletBracketW: 0.16,
    octaveLineW: 0.16,
    voltaLineW: 0.16,

    // 크기
    headW: 1.18,
    wholeW: 1.69,
    stemLen: 3.5,
    dotR: 0.2,
    dotGap: 0.35,
    dotSep: 0.5,
    accGap: 0.22,
    graceScale: 0.62,
    cueScale: 0.75,
    clefW: 2.7,
    keyAccW: 1.0,
    timeSigW: 2.1,

    // 세로 배치
    staffDistance: 6,           // 보표 사이(아래 줄 → 다음 위 줄)
    systemDistance: 8,          // 시스템 사이 최소 빈칸
    lyricLine: 2.4,             // 가사 줄 간격
    chordSize: 2.2,             // 코드 기호 글자 크기(sp)
    lyricSize: 1.9,
    dynamicSize: 2.3,
    tempoSize: 1.9,
    numberSize: 1.35,           // 마디 번호

    // 페이지 (mm)
    titleSize: 7.5,
    subtitleSize: 4.4,
    creditSize: 3.4,
    copyrightSize: 2.6,
    pageNumberSize: 3.0
  };
})(window.SJ = window.SJ || {});
