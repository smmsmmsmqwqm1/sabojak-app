/* .sabojak 파일 형식 (§12-1): UTF-8 JSON 한 파일 + 머리 정보(envelope) + SHA-256 체크섬.
 * 어느 기기(아이폰·갤럭시·아이패드)에서 만들어도 어느 기기에서나 같은 내용으로 열린다. */
(function (SJ) {
  'use strict';
  const F = {};
  const ENV_KEYS = ['format', 'formatVersion', 'minReaderVersion', 'app', 'scoreId', 'revision', 'checksum', 'score'];

  // 숫자 표기 고정: 정수는 그대로, 소수는 4자리까지
  function num(v) {
    if (!isFinite(v)) return 'null';
    if (Number.isInteger(v)) return String(v);
    let r = Math.round(v * 10000) / 10000;
    if (Object.is(r, -0)) r = 0;
    return String(r);
  }
  // 정규화 직렬화: 키 알파벳순, 공백 없음, 문자열 NFC
  F.canonical = function canon(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return num(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'string') return JSON.stringify(v.normalize ? v.normalize('NFC') : v);
    if (Array.isArray(v)) return '[' + v.map(x => x === undefined ? 'null' : canon(x)).join(',') + ']';
    const keys = Object.keys(v).filter(k => v[k] !== undefined && typeof v[k] !== 'function').sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  };

  F.checksum = function (score) { return 'sha256:' + SJ.sha256(F.canonical(score)); };

  // 저장용 정리: 레이아웃 결과·캐시 같은 파생 데이터는 넣지 않는다 (모델에 없음)
  F.serialize = function (score, info) {
    info = info || {};
    const s = SJ.U.nfcDeep(SJ.U.clone(score));
    const extra = s['x-envelopeExtra'] || {};
    delete s['x-envelopeExtra'];
    const env = Object.assign({}, extra, {
      format: 'sabojak', formatVersion: SJ.APP.formatVersion, minReaderVersion: SJ.APP.minReaderVersion,
      app: { name: SJ.APP.id, version: SJ.APP.version, platform: info.platform || (SJ.Platform ? SJ.Platform.kind : 'web') },
      scoreId: s.id, revision: info.revision || 1, checksum: F.checksum(s), score: s
    });
    return F.canonical(env);
  };

  /* 열기: 반환 {status, score, envelope, issues, checksumOk, revision}
   * status: 'ok' | 'repaired' | 'too-new' | 'invalid' | 'readonly' */
  F.parse = function (text) {
    if (typeof text !== 'string') return { status: 'invalid', reason: 'not-text' };
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { status: 'invalid', reason: 'not-json' }; }
    let env, score;
    if (obj && obj.format === 'sabojak') {
      env = obj;
      if (typeof env.minReaderVersion === 'number' && env.minReaderVersion > SJ.APP.formatVersion) {
        return { status: 'too-new', envelope: { formatVersion: env.formatVersion, minReaderVersion: env.minReaderVersion, app: env.app } };
      }
      score = env.score;
    } else if (obj && Array.isArray(obj.measures) && Array.isArray(obj.staves)) {
      env = null; score = obj;             // 머리 정보 없는 옛 악보 데이터
    } else return { status: 'invalid', reason: 'not-sabojak' };
    if (!score || typeof score !== 'object') return { status: 'invalid', reason: 'no-score' };

    let checksumOk = true;
    if (env && env.checksum) checksumOk = F.checksum(score) === env.checksum;
    const mig = SJ.Migrate.migrate(SJ.U.clone(score));
    if (mig.error) return { status: 'too-new', reason: mig.error };
    const v = SJ.Validate.validate(mig.score);
    if (!v.ok || !v.score) return { status: 'readonly', score: score, issues: v.issues, checksumOk };
    // 모르는 envelope 필드 보존
    if (env) {
      const extra = {};
      Object.keys(env).forEach(k => { if (ENV_KEYS.indexOf(k) < 0) extra[k] = env[k]; });
      if (Object.keys(extra).length) v.score['x-envelopeExtra'] = extra;
    }
    const repaired = !checksumOk || v.changed;
    return {
      status: repaired ? 'repaired' : 'ok', score: v.score, issues: v.issues, checksumOk,
      revision: env && typeof env.revision === 'number' ? env.revision : 1,
      envelope: env ? { formatVersion: env.formatVersion, app: env.app, scoreId: env.scoreId } : null
    };
  };

  F.fileName = function (score, compat) {
    return SJ.U.safeFileName(score.meta.title || (SJ.t ? SJ.t('악보') : '악보'), compat ? '.sabojak.json' : '.sabojak');
  };

  // 내용으로 판별 (확장자와 무관)
  F.sniff = function (text) {
    const head = (text || '').slice(0, 400);
    if (/"format"\s*:\s*"sabojak"/.test(text.slice(0, 200000))) return 'sabojak';
    if (/<score-partwise|<score-timewise/.test(head + text.slice(0, 4000))) return 'musicxml';
    if (/^\s*\{/.test(head) && /"measures"/.test(text.slice(0, 200000))) return 'sabojak';
    return null;
  };

  SJ.Format = F;
})(window.SJ = window.SJ || {});
