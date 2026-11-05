/* 저장소 (§12): scores/{id}/score.json · meta.json · thumb.svg · draft.json · history/ (최근 5개)
 * index.json 은 목록 캐시 — 손상되면 폴더를 훑어 다시 만든다. 읽을 수 없는 파일은 지우지 않고 quarantine/ 로 옮긴다.
 * 쓰기는 모두 원자적(임시 파일 → 확인 → 교체, 네이티브가 수행). */
(function (SJ) {
  'use strict';
  const U = SJ.U, PF = SJ.Platform, F = SJ.Format;
  const St = {};
  const HISTORY_KEEP = 5;
  const HISTORY_EVERY_MS = 3 * 60 * 1000;
  let index = null;
  const lastSnap = {}, quarantined = {};

  const dir = id => 'scores/' + id + '/';

  async function readJson(path) {
    const t = await PF.read(path);
    if (t === null || t === undefined || t === '') return null;
    try { return JSON.parse(t); } catch (e) { return undefined; }   // undefined = 손상
  }

  St.loadIndex = async function () {
    const j = await readJson('index.json');
    if (j && Array.isArray(j.items)) { index = j.items; return index; }
    return St.rebuildIndex();
  };
  St.rebuildIndex = async function () {
    const files = await PF.list('scores');
    const ids = new Set();
    files.forEach(p => { const m = /^scores\/([^/]+)\//.exec(p); if (m) ids.add(m[1]); });
    const items = [];
    for (const id of ids) {
      let meta = await readJson(dir(id) + 'meta.json');
      if (!meta) {
        const t = await PF.read(dir(id) + 'score.json');
        const r = t ? F.parse(t) : null;
        if (r && r.score) meta = St.metaOf(r.score, r.revision || 1);
      }
      if (meta) items.push(meta);
    }
    index = items;
    await PF.write('index.json', JSON.stringify({ v: 1, items }));
    return index;
  };
  async function writeIndex() { await PF.write('index.json', JSON.stringify({ v: 1, items: index })); }

  St.metaOf = function (score, revision, extra) {
    return Object.assign({
      id: score.id, title: score.meta.title || '', composer: score.meta.composer || '',
      createdAt: score.meta.createdAt, updatedAt: score.meta.updatedAt, measures: score.measures.length, revision: revision || 1
    }, extra || {});
  };

  St.list = async function () {
    if (!index) await St.loadIndex();
    return index.slice();
  };

  /* 악보 열기 → {score, meta, status('ok'|'repaired'|'readonly'|'recovered'), issues} | null */
  St.loadScore = async function (id) {
    const text = await PF.read(dir(id) + 'score.json');
    let r = text ? F.parse(text) : { status: 'invalid' };
    let status = r.status;
    // 새 판 앱이 만든 악보: 손상이 아니라 앱 업데이트가 필요 — 따로 알린다(점검원 11-02)
    if (r.status === 'too-new') return { tooNew: true };
    if (r.status === 'invalid' || r.status === 'readonly' || !r.score) {
      // 같은 손상 파일은 한 번만 따로 보관(열 때마다 쌓여 백업이 커지지 않게)
      if (text && !quarantined[id + ':' + text.length]) { quarantined[id + ':' + text.length] = true; await St.quarantine(id + '_score.json', text); }
      // 최근 기록에서 되살리기
      const hist = (await PF.list(dir(id) + 'history')).sort().reverse();
      for (const h of hist) {
        const ht = await PF.read(h);
        const hr = ht ? F.parse(ht) : null;
        if (hr && hr.score && (hr.status === 'ok' || hr.status === 'repaired')) {
          r = hr; status = 'recovered';
          // 되살린 판을 본문으로 다시 써 둔다(다음에 열 때 또 손상으로 시작하지 않게 · 손상 원본은 위에서 따로 보관함)
          try { await PF.write(dir(id) + 'score.json', ht); } catch (e) { /* 다음에 다시 시도 */ }
          break;
        }
      }
      if (!r.score) return null;
    }
    const meta = (await readJson(dir(id) + 'meta.json')) || St.metaOf(r.score, r.revision);
    return { score: r.score, meta, status, issues: r.issues || [] };
  };

  /* 저장 → meta. score.meta.updatedAt 은 부르는 쪽(스토어)이 갱신 */
  St.saveScore = async function (score, opts) {
    opts = opts || {};
    if (!index) await St.loadIndex();
    const old = index.find(x => x.id === score.id);
    const revision = (old ? old.revision || 1 : 0) + 1;
    const v = SJ.Validate.validate(score);
    const toSave = v.score || score;
    const text = F.serialize(toSave, { revision });
    await PF.write(dir(score.id) + 'score.json', text);
    const meta = St.metaOf(toSave, revision, opts.metaExtra || (old ? { pages: old.pages } : {}));
    if (opts.pages) meta.pages = opts.pages;
    await PF.write(dir(score.id) + 'meta.json', JSON.stringify(meta));
    const now = Date.now();
    if (opts.snapshot || !lastSnap[score.id] || now - lastSnap[score.id] > HISTORY_EVERY_MS) {
      lastSnap[score.id] = now;
      await St.snapshot(score.id, text);
    }
    const i = index.findIndex(x => x.id === score.id);
    if (i >= 0) index[i] = meta; else index.push(meta);
    await writeIndex();
    return meta;
  };

  St.snapshot = async function (id, text) {
    const name = dir(id) + 'history/' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    await PF.write(name, text);
    const hist = (await PF.list(dir(id) + 'history')).sort();
    while (hist.length > HISTORY_KEEP) await PF.remove(hist.shift());
  };
  // 지금 저장된 악보 파일 그대로를 기록에 남기기(덮어쓰기 전 등)
  St.snapshotCurrent = async function (id) {
    const text = await PF.read(dir(id) + 'score.json');
    if (text) await St.snapshot(id, text);
  };
  St.history = async function (id) {
    return (await PF.list(dir(id) + 'history')).sort().reverse();
  };

  St.saveThumb = function (id, svg) { return PF.write(dir(id) + 'thumb.svg', svg).catch(() => {}); };
  St.loadThumb = function (id) { return PF.read(dir(id) + 'thumb.svg').catch(() => null); };

  // ── 휴지통: trash/{시각}_{종류}_{id}/ + _trash.json (7일 뒤 자동 비움) ──
  St.TRASH_DAYS = 7;
  St.deleteScore = async function (id) {
    if (!index) await St.loadIndex();
    const meta = index.find(x => x.id === id) || { id, title: '' };
    const files = await PF.list(dir(id));
    const stamp = Date.now();
    const tdir = 'trash/' + stamp + '_score_' + id + '/';
    for (const f of files) {
      const t = await PF.read(f);
      if (t !== null) await PF.write(tdir + f.slice(dir(id).length), t);
    }
    await PF.write(tdir + '_trash.json', JSON.stringify({ kind: 'score', id, title: meta.title || '', deletedAt: new Date(stamp).toISOString(), measures: meta.measures }));
    for (const f of files) await PF.remove(f);     // 휴지통에 다 쓴 뒤에만 원본 정리
    index = index.filter(x => x.id !== id);
    await writeIndex();
    return tdir;
  };
  St.trashTemplate = async function (tp) {
    const stamp = Date.now();
    const tdir = 'trash/' + stamp + '_template_' + tp.id + '/';
    await PF.write(tdir + 'template.json', JSON.stringify(tp));
    await PF.write(tdir + '_trash.json', JSON.stringify({ kind: 'template', id: tp.id, title: tp.name || '', deletedAt: new Date(stamp).toISOString() }));
    await PF.remove('templates/' + tp.id + '.json');
    return tdir;
  };
  St.listTrash = async function () {
    const files = await PF.list('trash');
    const dirs = new Set();
    files.forEach(f => { const m = /^trash\/([^/]+)\//.exec(f); if (m) dirs.add('trash/' + m[1] + '/'); });
    const out = [];
    for (const d of dirs) {
      const j = await readJson(d + '_trash.json');
      const m = /^trash\/(\d+)_(?:(score|template)_)?(.+)\/$/.exec(d);
      const info = j || { kind: (m && m[2]) || 'score', id: m ? m[3] : '', title: '', deletedAt: m ? new Date(Number(m[1])).toISOString() : null };
      info.dir = d;
      // 백업에서 되살린 휴지통은 되살린 날(keepFrom)부터 센다
      const from = Math.max(new Date(info.deletedAt || 0).getTime() || 0, info.keepFrom ? new Date(info.keepFrom).getTime() || 0 : 0);
      const age = (Date.now() - from) / 86400000;
      info.daysLeft = Math.max(0, Math.ceil(St.TRASH_DAYS - age));
      out.push(info);
    }
    return out.sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
  };
  St.restoreTrash = async function (item) {
    const files = await PF.list(item.dir);
    if (item.kind === 'template') {
      const t = await PF.read(item.dir + 'template.json');
      if (t) await PF.write('templates/' + item.id + '.json', t);
    } else {
      // 같은 id 악보가 다시 생겼으면 새 id 로 되살림 (덮어쓰지 않음)
      if (!index) await St.loadIndex();
      let id = item.id;
      if (index.some(x => x.id === id)) {
        const st = await PF.read(item.dir + 'score.json');
        const r = st ? F.parse(st) : null;
        if (r && r.score) { r.score.id = U.uuid(); await St.saveScore(r.score, { snapshot: true }); id = null; }
      }
      if (id) for (const f of files) {
        const rel = f.slice(item.dir.length);
        if (rel === '_trash.json') continue;
        const t = await PF.read(f);
        if (t !== null) await PF.write(dir(id) + rel, t);
      }
    }
    for (const f of files) await PF.remove(f);
    await St.rebuildIndex();
  };
  St.restoreDeleted = async function (trashDir) {
    const items = await St.listTrash();
    const it = items.find(x => x.dir === trashDir);
    if (it) await St.restoreTrash(it);
  };
  St.purgeTrash = async function (item) {
    const files = await PF.list(item.dir);
    for (const f of files) await PF.remove(f);
  };
  St.autoPurgeTrash = async function () {
    try {
      const items = await St.listTrash();
      for (const it of items) if (it.daysLeft <= 0) await St.purgeTrash(it);
    } catch (e) { /* 무시 */ }
  };

  St.quarantine = async function (name, text) {
    try { await PF.write('quarantine/' + Date.now() + '_' + name.replace(/[\\/:*?"<>|]/g, '_'), text); } catch (e) { /* 무시 */ }
  };

  // ── 집중 모드 임시 저장 (§8-3) ──
  St.saveDraft = function (scoreId, draft) { return PF.write(dir(scoreId) + 'draft.json', JSON.stringify(draft)); };
  St.loadDraft = async function (scoreId) { const j = await readJson(dir(scoreId) + 'draft.json'); return j || null; };
  St.clearDraft = function (scoreId) { return PF.remove(dir(scoreId) + 'draft.json').catch(() => {}); };
  St.anyDraft = async function () {
    const files = await PF.list('scores');
    const d = files.find(f => /\/draft\.json$/.test(f));
    if (!d) return null;
    const j = await readJson(d);
    return j || null;
  };

  // ── 템플릿 ──
  St.listTemplates = async function () {
    const files = await PF.list('templates');
    const out = [];
    for (const f of files) { const j = await readJson(f); if (j && j.id) out.push(j); }
    return out.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  };
  St.saveTemplate = function (t) { return PF.write('templates/' + t.id + '.json', JSON.stringify(t)); };
  St.deleteTemplate = function (id) { return PF.remove('templates/' + id + '.json'); };

  // ── 설정 · 필기 학습 ──
  St.loadJson = async function (name, dflt) { const j = await readJson(name); return j === null || j === undefined ? dflt : j; };
  St.saveJson = function (name, obj) { return PF.write(name, JSON.stringify(obj)); };

  // 모든 악보를 .sabojak 파일 묶음으로 (백업)
  St.exportAll = async function () {
    const list = await St.list();
    const files = [];
    const used = new Set();
    for (const it of list) {
      const t = await PF.read(dir(it.id) + 'score.json');
      if (!t) continue;
      let name = U.safeFileName(it.title || SJ.t('악보'), '');
      let n = name, k = 2;
      while (used.has(n)) n = name + ' (' + (k++) + ')';
      used.add(n);
      files.push({ name: n + '.sabojak', data: U.utf8(t) });
    }
    return files;
  };

  /* ── 전체 백업 (앱을 지웠다 깔거나 다른 기기로 옮길 때) ──
   * 앱 저장 공간의 사용자 파일을 '하나도 빼지 않고' 그대로: 악보 폴더 전부(악보 · 목록 정보 · 이전 판 기록 5개 · 쓰다 만 입력 · 미리보기 그림) ·
   * 템플릿 · 휴지통(지운 날짜 그대로) · 설정 · 손글씨 기록 · 따로 보관한 손상 파일. index.json 은 목록 캐시라 되살린 뒤 다시 만든다.
   * 새 저장 파일이 생기면 여기(BACKUP_TOP · BACKUP_DIRS)에 더해야 한다 — tests 의 백업 시험이 저장 경로를 훑어 빠진 곳을 잡는다 */
  St.BACKUP_TOP = ['settings.json', 'handwriting.json'];
  St.BACKUP_DIRS = ['scores', 'templates', 'trash', 'quarantine'];
  St.backupFiles = async function () {
    const out = [];
    for (const p of St.BACKUP_TOP) { const t = await PF.read(p); if (t !== null && t !== undefined) out.push({ path: p, text: t }); }
    for (const d of St.BACKUP_DIRS) {
      const files = (await PF.list(d)).sort();
      for (const p of files) { const t = await PF.read(p); if (t !== null && t !== undefined) out.push({ path: p, text: t }); }
    }
    return out;
  };
  St.exists = async function (path) { const t = await PF.read(path); return t !== null && t !== undefined; };
  St.readText = path => PF.read(path);
  St.writeText = (path, text) => PF.write(path, text);
  St.resetIndex = () => { index = null; };
  St.dropIndexFile = () => PF.remove('index.json');

  SJ.Storage = St;
})(window.SJ = window.SJ || {});
