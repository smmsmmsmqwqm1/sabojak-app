/* 내보내기: PDF/인쇄(HTML → 기기 인쇄 · 'PDF로 저장') · PNG(300dpi) · MusicXML · MIDI · .sabojak (§13)
 * 화면과 같은 렌더 IR → 같은 SVG 를 쓰므로 화면 = PDF = 이미지 (§1-5) */
(function (SJ) {
  'use strict';
  const U = SJ.U, PF = SJ.Platform, R = SJ.SvgRender;
  const E = {};

  // 범위: 'all' | 'current' | [시작쪽, 끝쪽] (0부터)
  E.pagesOf = function (L, range, current) {
    if (range === 'current') return [L.pages[current || 0]];
    if (Array.isArray(range)) return L.pages.slice(range[0], range[1] + 1);
    return L.pages;
  };

  // 인쇄용 HTML (페이지마다 SVG 하나, @page 크기 = 용지)
  E.printHtml = function (score, pages, opts) {
    opts = opts || {};
    const w = pages[0].w, h = pages[0].h;
    const svgs = pages.map(p => '<div class="pg">' + R.page(p, { mmUnits: true, gray: opts.gray }) + '</div>').join('');
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + U.esc(score.meta.title || SJ.APP.name) + '</title><style>' +
      '@page{size:' + w + 'mm ' + h + 'mm;margin:0}html,body{margin:0;padding:0;background:#fff}' +
      '.pg{width:' + w + 'mm;height:' + h + 'mm;overflow:hidden;page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}' +
      '.pg svg{display:block;width:' + w + 'mm;height:' + h + 'mm}' + (opts.gray ? 'svg{filter:grayscale(1)}' : '') +
      '</style></head><body>' + svgs + '</body></html>';
  };

  E.print = function (score, L, range, current, opts) {
    const pages = E.pagesOf(L, range, current);
    const html = E.printHtml(score, pages, opts);
    return PF.print(html, U.safeFileName(score.meta.title || SJ.APP.name, ''), pages[0].w, pages[0].h);
  };

  // SVG → PNG 바이트 (dpi 기본 300). 메모리 보호: 한 쪽씩
  E.pagePng = function (page, dpi, opts) {
    dpi = dpi || 300;
    return new Promise((resolve, reject) => {
      const pxW = Math.round(page.w / 25.4 * dpi), pxH = Math.round(page.h / 25.4 * dpi);
      const svg = R.page(page, { width: pxW, height: pxH, gray: opts && opts.gray });
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = pxW; c.height = pxH;
          const g = c.getContext('2d');
          g.fillStyle = '#fff'; g.fillRect(0, 0, pxW, pxH);
          g.drawImage(img, 0, 0, pxW, pxH);
          if (opts && opts.gray) {
            const d = g.getImageData(0, 0, pxW, pxH), a = d.data;
            for (let i = 0; i < a.length; i += 4) { const v = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11; a[i] = a[i + 1] = a[i + 2] = v; }
            g.putImageData(d, 0, 0);
          }
          c.toBlob(b => {
            if (!b) { reject(new Error('png')); return; }
            b.arrayBuffer().then(ab => { c.width = c.height = 0; resolve(new Uint8Array(ab)); });
          }, 'image/png');
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('svg-image'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  };

  // 여러 쪽 PNG: 한 쪽이면 바로, 여러 쪽이면 zip 하나로 묶어 공유
  E.png = async function (score, L, range, current, opts, onProgress) {
    const pages = E.pagesOf(L, range, current);
    const base = U.safeFileName(score.meta.title || SJ.APP.name, '');
    if (pages.length === 1) {
      const bytes = await E.pagePng(pages[0], opts && opts.dpi, opts);
      return { name: base + (range === 'current' ? '_' + ((current || 0) + 1) : '') + '.png', mime: 'image/png', data: bytes };
    }
    const files = [];
    for (let i = 0; i < pages.length; i++) {
      if (onProgress) onProgress(i, pages.length);
      const bytes = await E.pagePng(pages[i], opts && opts.dpi, opts);
      files.push({ name: base + '_' + String(L.pages.indexOf(pages[i]) + 1).padStart(2, '0') + '.png', data: bytes });
      await new Promise(r => setTimeout(r, 0));
    }
    return { name: base + '_PNG.zip', mime: 'application/zip', data: SJ.Zip.zip(files) };
  };

  E.musicxml = function (score) {
    const xml = SJ.MusicXmlExport.exportScore(score);
    return { name: U.safeFileName(score.meta.title || SJ.APP.name, '.musicxml'), mime: 'application/vnd.recordare.musicxml+xml', data: xml };
  };
  E.midi = function (score) {
    return { name: U.safeFileName(score.meta.title || SJ.APP.name, '.mid'), mime: 'audio/midi', data: SJ.Midi.export(score) };
  };
  E.sabojak = async function (score, compat) {
    const list = await SJ.Storage.list();
    const it = list.find(x => x.id === score.id);
    const text = SJ.Format.serialize(score, { revision: it ? it.revision : 1 });
    return { name: SJ.Format.fileName(score, compat), mime: compat ? 'application/json' : SJ.APP.mime, data: text };
  };
  /* 전체 백업 zip: sabojak-backup.json(목록 · 크기 · 검사값) + data/(저장 공간 그대로 — Storage.backupFiles) +
   * 악보/*.sabojak(예전 판 앱의 [백업에서 되살리기]로도 악보는 열리게). 만든 뒤 zip 을 다시 풀어 한 글자도 다르지 않은지 확인한다 */
  E.backupCounts = function (paths) {
    const c = { scores: 0, history: 0, drafts: 0, templates: 0, trash: 0, settings: false, handwriting: false };
    const trashDirs = new Set();
    paths.forEach(p => {
      if (/^scores\/[^/]+\/score\.json$/.test(p)) c.scores++;
      else if (/^scores\/[^/]+\/history\//.test(p)) c.history++;
      else if (/^scores\/[^/]+\/draft\.json$/.test(p)) c.drafts++;
      else if (/^templates\//.test(p)) c.templates++;
      else if (/^trash\/[^/]+\//.test(p)) trashDirs.add(p.split('/')[1]);
      else if (p === 'settings.json') c.settings = true;
      else if (p === 'handwriting.json') c.handwriting = true;
    });
    c.trash = trashDirs.size;
    return c;
  };
  E.backup = async function () {
    const files = await SJ.Storage.backupFiles();
    const Z = SJ.Zip;
    const entries = [], list = [];
    files.forEach(f => {
      const data = U.utf8(f.text);
      entries.push({ name: 'data/' + f.path, data });
      list.push({ p: f.path, n: data.length, crc: Z.crc32(data) });
    });
    // 악보마다 .sabojak 한 장씩(사람이 열어 볼 수 있게 · 예전 판 호환)
    const used = new Set();
    files.forEach(f => {
      if (!/^scores\/[^/]+\/score\.json$/.test(f.path)) return;
      let title = '';
      try { const r = SJ.Format.parse(f.text); title = (r && r.score && r.score.meta.title) || ''; } catch (e) { /* 이름만 못 얻음 */ }
      const base = U.safeFileName(title || SJ.t('악보'), '');
      let n = base, k = 2;
      while (used.has(n)) n = base + ' (' + (k++) + ')';
      used.add(n);
      entries.push({ name: '악보/' + n + '.sabojak', data: U.utf8(f.text) });
    });
    const counts = E.backupCounts(files.map(f => f.path));
    const manifest = { format: 'sabojak-backup', v: 2, app: window.APP_VERSION || '', createdAt: U.isoNow(), platform: SJ.Platform.kind, counts, files: list };
    entries.unshift({ name: 'sabojak-backup.json', data: U.utf8(JSON.stringify(manifest)) });
    const zip = Z.zip(entries);
    // 확인: 다시 풀어서 모든 파일의 크기 · 검사값이 같은지
    const back = Z.unzip(zip), byName = {};
    back.forEach(e => { byName[e.name] = e.data; });
    const bad = list.filter(x => { const d = byName['data/' + x.p]; return !d || d.length !== x.n || Z.crc32(d) !== x.crc; });
    if (bad.length || back.length !== entries.length) throw new Error(SJ.t('백업 파일을 확인하다 문제가 생겼어요. 다시 해 주세요.'));
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '_' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    return { name: (SJ.getLang() === 'en' ? SJ.APP.nameEn + '_backup_' : SJ.APP.name + '_백업_') + stamp + '.zip', mime: 'application/zip', data: zip, count: counts.scores, counts, files: list.length };
  };

  SJ.Exporter = E;
})(window.SJ = window.SJ || {});
