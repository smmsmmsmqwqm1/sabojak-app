/* 확장 지점 (§15) — 이번 버전에서는 인터페이스만.
 * Player: prepare(score) · play(range) · stop() · previewNote(pitch) → 지금은 아무것도 하지 않는 NullPlayer (화면에 재생 버튼 없음, §15-1)
 * ScoreImporter: 사진/PDF 악보 인식(OMR) 자리
 * StaffKindStrategy: 보표 종류별 전략 — 지금은 'standard' 하나만 (TAB·드럼은 만들지 않음) */
(function (SJ) {
  'use strict';
  const NullPlayer = {
    prepare() { return Promise.resolve(); },
    play() { return Promise.resolve(); },
    stop() {},
    previewNote() {}
  };
  SJ.Player = NullPlayer;

  // 사진·PDF 악보 불러오기 자리 (후속 단계 OMR). canImport 가 false 라 화면에 나오지 않는다.
  SJ.ScoreImporters = [];
  SJ.registerScoreImporter = function (imp) {
    // imp: { id, label, accepts(file) → bool, import(file) → Promise<Score> }
    SJ.ScoreImporters.push(imp);
  };

  // 보표 종류 전략 — 레이아웃·입력·렌더가 kind 별로 이 객체를 통해 호출되도록 자리만 잡는다
  SJ.StaffKinds = {
    standard: { id: 'standard', lines: 5, label: '오선', positionToPitch: (pos, clef, fifths) => SJ.Pitch.headFromPos(pos, clef, fifths) }
  };
  SJ.staffKind = function (staffDef) { return SJ.StaffKinds[(staffDef && staffDef.kind) || 'standard'] || SJ.StaffKinds.standard; };
})(window.SJ = window.SJ || {});
