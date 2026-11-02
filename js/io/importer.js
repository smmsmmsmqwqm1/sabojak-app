/* 불러오기: 내용으로 판별(확장자 무관) — .sabojak / .sabojak.json / MusicXML(.musicxml .xml .mxl) / 백업 zip (§12-1 ⑩) */
(function (SJ) {
  'use strict';
  const U = SJ.U, F = SJ.Format, UI = SJ.UI, t = SJ.t;
  const IM = {};

  // files: [{name, bytes}] → 불러온 악보 id 목록
  IM.importFiles = async function (files) {
    const ids = [];
    for (const f of files) {
      try {
        const r = await IM.importOne(f);
        if (r) ids.push(...r);
      } catch (e) {
        await UI.alert(t('열 수 없는 파일이에요'), (f.name || '') + '\n' + (e && e.message ? e.message : ''));
      }
    }
    return ids;
  };

  IM.importOne = async function (f) {
    const b = f.bytes;
    if (b[0] === 0x50 && b[1] === 0x4b) {
      // zip: .mxl 이거나 사보작 백업 묶음
      const entries = SJ.Zip.unzip(b);
      const sab = entries.filter(e => /\.sabojak(\.json)?$/i.test(e.name));
      if (sab.length && !entries.some(e => /container\.xml$/i.test(e.name))) {
        const ids = [];
        for (const e of sab) { const r = await IM.importSabojak(U.fromUtf8(e.data), e.name, true); if (r) ids.push(r); }
        UI.toast(t('백업에서 {n}개를 불러왔어요', { n: ids.length }));
        return ids;
      }
      return [await IM.importMusicXml(b, f.name)].filter(Boolean);
    }
    const text = U.fromUtf8(b);
    const kind = F.sniff(text);
    if (kind === 'sabojak') { const id = await IM.importSabojak(text, f.name); return id ? [id] : []; }
    if (kind === 'musicxml') return [await IM.importMusicXml(b, f.name)].filter(Boolean);
    throw new Error(t('사보작 파일이나 MusicXML 파일이 아니에요'));
  };

  IM.importSabojak = async function (text, name, quiet) {
    const r = F.parse(text);
    if (r.status === 'too-new') {
      await UI.alert(t('앱을 최신 버전으로 업데이트해 주세요'), t('이 파일은 더 새로운 버전의 사보작에서 만들어졌어요. 파일은 그대로 두었어요.'));
      return null;
    }
    if (r.status === 'invalid') throw new Error(t('파일 내용이 손상되었어요'));
    if (r.status === 'readonly') {
      await SJ.Storage.quarantine(name || 'import.sabojak', text);
      await UI.alert(t('일부를 읽을 수 없어요'), t('원본은 안전하게 따로 보관했어요. 읽을 수 있는 부분만 열게요.'));
    }
    let score = r.score;
    const list = await SJ.Storage.list();
    const exist = list.find(x => x.id === score.id);
    if (exist) {
      const lower = (r.revision || 1) < (exist.revision || 1);
      const choice = quiet ? 'copy' : await UI.choose(t('같은 악보가 이미 있어요'),
        t('“{t}” 악보가 이미 있어요.', { t: exist.title || t('제목 없음') }) + (lower ? '\n' + t('⚠ 지금 가진 것보다 예전 판이에요.') : ''),
        [{ label: t('복사본으로 열기 (추천)'), value: 'copy', kind: 'primary' }, { label: t('덮어쓰기'), value: 'over', kind: lower ? 'danger' : '' }, { label: t('취소'), value: null }]);
      if (!choice) return null;
      if (choice === 'over' && lower && !(await UI.confirm(t('예전 판으로 덮어쓸까요?'), t('지금 악보는 기록(최근 5개)에 남아 있어요.'), { ok: t('덮어쓰기'), danger: true }))) return null;
      if (choice === 'copy') score = IM.asCopy(score);
      // 덮어쓰기 전에 지금 악보를 기록에 남긴다(안내문 '지금 악보는 기록에 남아 있어요'가 사실이 되게 — 최근 3분 편집이 사라질 수 있었음 · 점검원 ⑥ 11-02)
      if (choice === 'over') { try { await SJ.Storage.snapshotCurrent(score.id); } catch (e) { /* 기록 실패는 덮어쓰기를 막지 않음 */ } }
    }
    await SJ.Storage.saveScore(score, { snapshot: true });
    if (r.status === 'repaired' && !quiet) UI.toast(t('일부를 복구했어요'));
    return score.id;
  };

  IM.asCopy = function (score) {
    const s = U.clone(score);
    s.origin = { scoreId: score.id, at: U.isoNow() };
    s.id = U.uuid();
    return s;
  };

  IM.importMusicXml = async function (bytes, name) {
    const r = SJ.MusicXmlImport.fromBytes(bytes, name);
    await SJ.Storage.saveScore(r.score, { snapshot: true });
    if (r.unsupported.length) {
      await UI.alert(t('불러왔어요 · 일부 요소는 빠졌어요'), t('지원하지 않는 요소') + ':\n• ' + r.unsupported.slice(0, 12).map(x => t(x)).join('\n• '));
    } else UI.toast(t('MusicXML 악보를 불러왔어요'));
    return r.score.id;
  };

  SJ.Importer = IM;
})(window.SJ = window.SJ || {});
