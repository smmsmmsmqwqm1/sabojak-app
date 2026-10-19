/* 앱 이름·버전은 이 한 곳에서만 관리한다 (app.json 의 name 과 함께 바꾼다). */
(function (SJ) {
  'use strict';
  SJ.APP = {
    name: '사보작',
    nameEn: 'SaboJak',
    id: 'SaboJak',
    ext: '.sabojak',
    mime: 'application/x-sabojak',
    version: '1.0.0',
    formatVersion: 1,      // .sabojak 파일 형식 버전
    minReaderVersion: 1,   // 이 파일을 읽으려면 필요한 최소 형식 버전
    schema: 1              // Score.schema (데이터 모델 마이그레이션용)
  };
})(window.SJ = window.SJ || {});
