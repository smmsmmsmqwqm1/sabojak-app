/* 불러오기: 내용으로 판별(확장자 무관) — .sabojak / .sabojak.json / MusicXML(.musicxml .xml .mxl) / 백업 zip (§12-1 ⑩) */
(function (SJ) {
  'use strict';
  const U = SJ.U, F = SJ.Format, UI = SJ.UI, t = SJ.t;
  const IM = {};

  // files: [{name, bytes}] → 불러온 악보 id 목록
  IM.importFiles = async function (files) {
    const ids = [];
    IM.lastFull = false;
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
      const man = entries.find(e => e.name === 'sabojak-backup.json');
      if (man) return IM.restoreFull(entries, man);
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
    // (예전 판 백업 zip을 두 번 열 때) 이미 똑같은 악보가 있으면 복사본을 또 만들지 않는다
    if (exist && quiet) {
      // 저장할 때 판 번호가 붙어 글자가 달라지므로 악보 내용으로 비교
      const cur = await SJ.Storage.readText('scores/' + score.id + '/score.json');
      const cr = cur ? F.parse(cur) : null;
      if (cur === text || (cr && cr.score && JSON.stringify(cr.score) === JSON.stringify(score))) return null;
    }
    if (exist) {
      const lower =(r.revision || 1) < (exist.revision || 1);
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

  /* 전체 백업 되살리기 (Exporter.backup 이 만든 zip).
   * ① 먼저 모든 파일을 검사값으로 확인 — 하나라도 깨졌으면 아무것도 쓰지 않는다
   * ② 지금 기기에 있는 것은 지우거나 덮어쓰지 않는다: 없는 것은 그대로(같은 id · 이전 판 기록 · 쓰다 만 입력 · 휴지통 날짜까지),
   *    같은 id 인데 내용이 다른 악보 · 템플릿은 복사본으로 더한다, 똑같은 것은 건너뛴다
   * ③ 설정은 이 기기에 악보 · 템플릿이 하나도 없을 때(새로 깐 앱)만 백업 것으로 — 기기마다 다른 값(펜 쓴 적 있음)은 이 기기 것 유지
   * ④ 쓴 파일을 다시 읽어 같은지 확인하고 몇 개를 되살렸는지 알린다 */
  IM.DEVICE_KEYS = ['penSeen'];
  IM.restoreFull = async function (entries, manEntry) {
    const St = SJ.Storage, Z = SJ.Zip;
    IM.lastFull = true;
    let man;
    try { man = JSON.parse(U.fromUtf8(manEntry.data)); } catch (e) { throw new Error(t('백업 파일의 목록을 읽을 수 없어요')); }
    if (!man || man.format !== 'sabojak-backup' || !Array.isArray(man.files)) throw new Error(t('사보작 백업 파일이 아니에요'));
    if (man.v > 2) { await UI.alert(t('앱을 최신 버전으로 업데이트해 주세요'), t('더 새로운 버전의 사보작에서 만든 백업이에요. 파일은 그대로 두었어요.')); return []; }
    const byName = {};
    entries.forEach(e => { byName[e.name] = e.data; });
    const files = [], broken = [];
    man.files.forEach(x => {
      const d = byName['data/' + x.p];
      if (!d || d.length !== x.n || Z.crc32(d) !== x.crc || /(^|\/)\.\.(\/|$)/.test(x.p)) broken.push(x.p);
      else files.push({ path: x.p, text: U.fromUtf8(d) });
    });
    // 악보 본문이 깨졌으면 같은 백업 안의 '악보/*.sabojak' 사본(같은 내용)으로 대신한다
    const lost = [];
    if (broken.length) {
      const copiesById = {};
      entries.filter(e => /^악보\/.+\.sabojak$/.test(e.name)).forEach(e => {
        try { const txt = U.fromUtf8(e.data), r = F.parse(txt); if (r && r.score && (r.status === 'ok' || r.status === 'repaired')) copiesById[r.score.id] = txt; } catch (er) { /* 사본도 깨짐 */ }
      });
      broken.slice().forEach(p => {
        const m = /^scores\/([^/]+)\/score\.json$/.exec(p);
        if (m && copiesById[m[1]]) { files.push({ path: p, text: copiesById[m[1]] }); broken.splice(broken.indexOf(p), 1); }
      });
      broken.forEach(p => lost.push(p));
    }
    if (lost.length) {
      const lostScores = lost.filter(p => /\/score\.json$/.test(p)).length;
      const go = await UI.choose(t('백업 파일 일부가 손상됐어요'),
        t('{n}개 파일이 백업을 만들 때와 달라요.', { n: lost.length }) + (lostScores ? ' ' + t('그중 악보 {n}개는 되살릴 수 없어요.', { n: lostScores }) : ' ' + t('악보 본문은 모두 멀쩡해요(미리보기 그림 · 기록 같은 곁 파일만).')) + '\n' + t('다른 백업 파일이 있으면 그것으로 해 주세요.'),
        [{ label: t('손상된 것만 빼고 되살리기'), value: 'go', kind: lostScores ? '' : 'primary' }, { label: t('취소'), value: null }]);
      if (go !== 'go') return [];
    }
    const c = man.counts || SJ.Exporter.backupCounts(files.map(f => f.path));
    const when = man.createdAt ? new Date(man.createdAt).toLocaleString() : '';
    const summary = [t('악보 {n}개', { n: c.scores }), c.templates ? t('템플릿 {n}개', { n: c.templates }) : '', c.trash ? t('휴지통 {n}개', { n: c.trash }) : '', c.settings ? t('설정') : '']
      .filter(Boolean).join(' · ');
    if (!(await UI.confirm(t('백업에서 되살릴까요?'), (when ? t('{w}에 만든 백업', { w: when }) + '\n' : '') + summary + '\n' + t('지금 기기에 있는 것은 지우거나 덮어쓰지 않아요.'), { ok: t('되살리기') }))) return [];

    const list = await St.list();
    const fresh = !list.length && !(await St.listTemplates()).length;
    const sf = files.find(x => x.path === 'settings.json'), hw = files.find(x => x.path === 'handwriting.json');
    // 새로 깐 앱이 아니면(악보를 먼저 만들었거나 다른 기기) 설정 · 손글씨 기록을 백업 것으로 바꿀지 묻는다 — 조용히 빼지 않게
    let takeSettings = fresh;
    if (!fresh && (sf || hw)) {
      takeSettings = (await UI.choose(t('설정도 백업 것으로 바꿀까요?'), t('화면 크기 · 테마 · 언어 · 입력 방식 같은 설정과 손글씨 기록이에요. 악보는 어느 쪽이든 그대로 되살아나요.'),
        [{ label: t('백업 설정으로 바꾸기'), value: true, kind: 'primary' }, { label: t('이 기기 설정 그대로'), value: false }])) === true;
    }
    const have = new Set(list.map(x => x.id));
    const written = [], failed = [];       // 쓴 파일은 나중에 다시 읽어 확인 · 못 쓴 파일은 세어서 알림(중간에 멈추지 않음)
    const write = async (path, text) => { try { await St.writeText(path, text); written.push({ path, text }); } catch (e) { failed.push(path); } };
    const ids = [];
    let copies = 0, same = 0, settingsRestored = false, hwRestored = false;
    const now0 = new Date().toISOString();
    // 목록 캐시(index.json)를 먼저 치운다 — 되살리는 중 앱이 꺼져도 다음 실행 때 폴더를 훑어 목록을 다시 만들게
    try { await St.dropIndexFile(); } catch (e) { /* 무시 */ }
    try {
    // 악보 폴더 단위
    const groups = {};
    files.forEach(f => { const m = /^scores\/([^/]+)\/(.+)$/.exec(f.path); if (m) (groups[m[1]] = groups[m[1]] || []).push({ rel: m[2], f }); });
    for (const id of Object.keys(groups)) {
      const g = groups[id];
      const main = g.find(x => x.rel === 'score.json');
      // 본문(score.json)이 깨지고 사본도 없는 악보는 곁 파일도 쓰지 않는다(목록에 떠도 열리지 않는 빈 껍데기가 생기지 않게)
      if (!main) continue;
      const cur = have.has(id) ? await St.readText('scores/' + id + '/score.json') : null;
      // 기기에 본문이 없거나(새 기기 · 지난번 되살리기가 중간에 끊김) 백업과 똑같으면 → 같은 id 그대로, 기기에 없는 파일만 채운다
      // (본문을 먼저 써서, 중간에 꺼져도 다음 되살리기가 '같은 악보'로 알아보고 이어서 채운다)
      if (cur === null || cur === undefined || cur === main.f.text) {
        const exists = cur === main.f.text;
        if (!exists) await write(main.f.path, main.f.text);
        for (const x of g) if (x !== main && !(await St.exists(x.f.path))) await write(x.f.path, x.f.text);
        if (exists) same++; else ids.push(id);
        continue;
      }
      const r = F.parse(main.f.text);
      if (!r || !r.score) continue;
      const cp = IM.asCopy(r.score);
      try { await St.saveScore(cp, { snapshot: true }); ids.push(cp.id); copies++; } catch (e) { failed.push('scores/' + cp.id + '/score.json'); }
    }
    // 템플릿
    const tpls = await St.listTemplates();
    for (const f of files.filter(x => /^templates\//.test(x.path))) {
      if (!(await St.exists(f.path))) { await write(f.path, f.text); continue; }
      if ((await St.readText(f.path)) === f.text) continue;
      try {
        const tp = JSON.parse(f.text);
        if (tpls.some(x => JSON.stringify(x) === f.text)) continue;
        tp.id = U.uuid();
        await write('templates/' + tp.id + '.json', JSON.stringify(tp));
      } catch (e) { /* 읽을 수 없는 템플릿은 건너뜀 */ }
    }
    // 휴지통: 없는 것만 · 되살린 날부터 다시 7일을 센다(며칠 지난 백업을 되살리자마자 '7일 지남'으로 비워지지 않게)
    for (const f of files.filter(x => /^trash\//.test(x.path))) {
      if (await St.exists(f.path)) continue;
      let text = f.text;
      if (/\/_trash\.json$/.test(f.path)) { try { const j = JSON.parse(text); j.keepFrom = now0; text = JSON.stringify(j); } catch (e) { /* 그대로 */ } }
      await write(f.path, text);
    }
    // 따로 보관한 손상 파일: 없는 것만
    for (const f of files.filter(x => /^quarantine\//.test(x.path))) if (!(await St.exists(f.path))) await write(f.path, f.text);
    // 손글씨 기록: 이 기기에 없거나, 백업 설정으로 바꾸기로 했을 때
    if (hw && (takeSettings || !(await St.exists(hw.path)))) {
      await write(hw.path, hw.text);
      hwRestored = true;
      // 메모리에 든 기록도 다시 읽는다 — 안 그러면 다음 학습 때 옛 기록으로 파일을 덮어씀(점검원 11-02)
      try { if (SJ.Recognizer && SJ.Recognizer.loadUser) await SJ.Recognizer.loadUser(); } catch (e) { /* 다음 실행 때 읽힘 */ }
    }
    // 설정
    if (sf && takeSettings) {
      try {
        const bs = JSON.parse(sf.text), now = SJ.Settings.all();
        IM.DEVICE_KEYS.forEach(k => { bs[k] = now[k]; });
        bs.onboarded = true;
        if (man.createdAt) bs.lastBackupAt = man.createdAt;       // 이 백업을 만든 때 = 마지막 백업
        const langBefore = SJ.Settings.lang();
        await write('settings.json', JSON.stringify(Object.assign({}, now, bs)));
        await SJ.Settings.load();
        if (SJ.Settings.lang() !== langBefore && SJ.App && SJ.App.relabel) SJ.App.relabel();
        settingsRestored = true;
      } catch (e) { /* 설정을 못 읽으면 지금 설정 유지 */ }
    }
    } finally {
      // 중간에 무엇이 실패해도 이미 쓴 악보가 목록에 보이게
      try { St.resetIndex(); await St.rebuildIndex(); } catch (e) { /* 다음 실행 때 다시 만듦 */ }
    }
    // 확인: 쓴 파일을 다시 읽어 같은지
    let bad = failed.length;
    for (const w of written) if ((await St.readText(w.path)) !== w.text) bad++;
    const parts = [t('악보 {n}개', { n: ids.length })];
    if (copies) parts.push(t('이미 있던 악보와 내용이 달라 복사본으로 {n}개', { n: copies }));
    if (same) parts.push(t('똑같아서 건너뜀 {n}개', { n: same }));
    if (sf) parts.push(settingsRestored ? t('설정도 되살림') : t('설정은 이 기기 것을 그대로 둠'));
    if (hw) parts.push(hwRestored ? t('손글씨 기록도 되살림') : t('손글씨 기록은 이 기기 것을 그대로 둠'));
    if (lost.length) parts.push(t('손상돼서 뺀 파일 {n}개', { n: lost.length }));
    if (bad) await UI.alert(t('일부를 저장하지 못했어요'), t('{n}개 파일을 기기에 쓰지 못했어요. 저장 공간을 확인한 뒤 같은 백업으로 다시 되살려 주세요(이미 된 것은 겹치지 않아요).', { n: bad }) + '\n' + parts.join(' · '));
    else await UI.alert(t('되살렸어요'), parts.join('\n'));
    return ids;
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
