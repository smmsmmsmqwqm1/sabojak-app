/* 악보 목록 (§7-1): 썸네일 카드 · 정렬 · 검색 · 새 악보 · 불러오기 · 길게 누르기 메뉴 · ▶ 악보 모드 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, St = SJ.Storage;
  const Lib = {};
  let root = null, gridEl = null, query = '', sort = 'recent', items = [];
  let observer = null, fabEl = null, toolsEl = null;

  Lib.mount = function (container) {
    root = h('div', { class: 'view', id: 'library' });
    sort = SJ.Settings.get('libSort') || 'recent';
    const head = h('div', { class: 'lib-head' }, [
      h('h1', { html: SJ.Art.logo(32) + '<span>' + U.esc(t(SJ.APP.name)) + '</span>' }),
      h('div', { class: 'grow' }),
      UI.ibtn('import', t('불러오기'), () => Lib.importFlow()),
      UI.ibtn('more', t('더보기'), () => UI.menu(t('더보기'), [
        { icon: 'trash', label: t('휴지통'), sub: t('지운 악보·템플릿 (7일 보관)'), onClick: () => SJ.Trash.open() },
        { icon: 'folder', label: t('전체 백업 내보내기'), sub: t('모든 악보를 파일 하나로'), onClick: () => SJ.ExportSheet.backupAll() },
        { icon: 'restore', label: t('백업에서 되살리기'), sub: t('백업 zip · .sabojak 파일 고르기'), onClick: () => Lib.importFlow() },
        { icon: 'help', label: t('사용법'), onClick: () => SJ.Help.open() },
        { icon: 'settings', label: t('설정'), onClick: () => SJ.App.openSettings() }
      ]), { noLabel: false })
    ]);
    const search = h('input', { type: 'search', placeholder: t('악보 찾기'), 'aria-label': t('악보 찾기'), enterkeyhint: 'search' });
    search.addEventListener('input', () => { query = U.nfc(search.value.trim()).toLowerCase(); Lib.draw(); });
    const sortBtn = UI.ibtn('sort', sort === 'recent' ? t('최근') : t('이름'), () => {
      sort = sort === 'recent' ? 'name' : 'recent';
      SJ.Settings.set('libSort', sort);
      sortBtn.querySelector('.lbl').textContent = sort === 'recent' ? t('최근') : t('이름');
      Lib.draw();
    });
    const tools = h('div', { class: 'lib-tools' }, [h('div', { class: 'search' }, [h('span', { html: SJ.icon('search'), style: { width: '20px', color: 'var(--ink-3)' } }), search]), sortBtn]);
    gridEl = h('div', { class: 'grid grow' });
    fabEl = h('button', { class: 'fab', html: SJ.icon('plus') + '<span>' + U.esc(t('새 악보')) + '</span>', onclick: () => SJ.NewScore.open() });
    toolsEl = tools;
    root.append(head, tools, gridEl, fabEl);
    container.appendChild(root);
    observer = 'IntersectionObserver' in window ? new IntersectionObserver(onSeen, { root: gridEl, rootMargin: '200px' }) : null;
    return root;
  };

  Lib.show = async function () {
    if (window.__sjUpdate) { location.reload(); return; }    // 홈 화면 앱: 받아 둔 새 판 적용
    root.classList.remove('hidden');
    items = await St.list();
    Lib.draw();
  };
  Lib.hide = function () { root.classList.add('hidden'); };

  Lib.draw = function () {
    gridEl.innerHTML = '';
    let list = items.slice();
    if (query) list = list.filter(it => ((it.title || '') + ' ' + (it.composer || '')).toLowerCase().indexOf(query) >= 0);
    if (sort === 'name') list.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ko'));
    else list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    // 빈 목록: 가운데 [새 악보]·[불러오기] 만 (떠 있는 버튼·검색은 숨겨 겹치지 않게)
    fabEl.classList.toggle('hidden', !items.length);
    toolsEl.classList.toggle('hidden', !items.length);
    if (!items.length) {
      gridEl.style.display = 'flex';
      gridEl.appendChild(h('div', { class: 'empty' }, [
        h('div', { html: SJ.Art.empty() }),
        h('h2', { text: t('첫 악보를 만들어 볼까요?') }),
        h('p', { text: t('빈 오선지에서 시작하거나, 가지고 있는 악보 파일(.sabojak · MusicXML)을 불러올 수 있어요.') }),
        h('div', { class: 'col' }, [
          h('button', { class: 'btn primary block', html: SJ.icon('plus') + U.esc(t('새 악보')), onclick: () => SJ.NewScore.open() }),
          h('button', { class: 'btn block', html: SJ.icon('import') + U.esc(t('불러오기')), onclick: () => Lib.importFlow() })
        ])
      ]));
      return;
    }
    gridEl.style.display = '';
    if (!list.length) { gridEl.appendChild(h('div', { class: 'empty' }, [h('p', { text: t('찾는 악보가 없어요') })])); return; }
    list.forEach(it => gridEl.appendChild(card(it)));
  };

  function card(it) {
    const thumb = h('div', { class: 'thumb' });
    thumb.dataset.id = it.id;
    const play = h('button', { class: 'play', 'aria-label': t('악보 모드로 보기'), html: SJ.icon('play'),
      onclick: e => { e.stopPropagation(); SJ.App.openPerformance(it.id, 'library'); } });
    const meta = U.fmtDate(it.updatedAt, SJ.getLang()) + (it.pages ? ' · ' + t('{n}쪽', { n: it.pages }) : '') + ' · ' + t('{n}마디', { n: it.measures });
    const c = h('div', { class: 'card', role: 'button', tabindex: 0, 'aria-label': it.title || t('제목 없음'), onclick: () => SJ.App.openEditor(it.id) }, [
      thumb, play, h('div', { class: 'info' }, [h('div', { class: 't', text: it.title || t('제목 없음') }), h('div', { class: 'm', text: meta })])
    ]);
    UI.longPress(c, () => cardMenu(it));
    c.addEventListener('contextmenu', e => { e.preventDefault(); cardMenu(it); });
    if (observer) observer.observe(thumb); else loadThumb(thumb);
    return c;
  }
  function onSeen(entries) {
    entries.forEach(e => { if (e.isIntersecting) { observer.unobserve(e.target); loadThumb(e.target); } });
  }
  async function loadThumb(el) {
    const svg = await St.loadThumb(el.dataset.id);
    if (svg && /^<svg[\s>]/.test(svg)) el.innerHTML = svg;
  }

  function cardMenu(it) {
    UI.menu(it.title || t('제목 없음'), [
      { icon: 'edit', label: t('열기'), onClick: () => SJ.App.openEditor(it.id) },
      { icon: 'play', label: t('악보 모드로 보기'), onClick: () => SJ.App.openPerformance(it.id, 'library') },
      { icon: 'text', label: t('이름 바꾸기'), onClick: () => Lib.rename(it) },
      { icon: 'copy', label: t('복제'), onClick: () => Lib.duplicate(it) },
      { icon: 'share', label: t('내보내기 · 보내기'), onClick: async () => { const r = await St.loadScore(it.id); if (r) SJ.ExportSheet.open(r.score); } },
      { icon: 'template', label: t('템플릿으로 저장'), onClick: async () => { const r = await St.loadScore(it.id); if (r) SJ.Templates.saveFromScore(r.score); } },
      { icon: 'trash', label: t('지우기'), danger: true, onClick: () => Lib.remove(it) }
    ]);
  }

  Lib.rename = async function (it) {
    const name = await UI.prompt(t('이름 바꾸기'), it.title, { placeholder: t('제목') });
    if (name === null) return;
    const r = await St.loadScore(it.id);
    if (!r) return;
    const s = SJ.Ops.setMeta(r.score, { title: name, updatedAt: U.isoNow() });
    await St.saveScore(s);
    items = await St.list(); Lib.draw();
  };
  Lib.duplicate = async function (it) {
    const r = await St.loadScore(it.id);
    if (!r) return;
    const s = U.clone(r.score);
    s.id = U.uuid();
    s.meta.title = (s.meta.title || t('제목 없음')) + ' ' + t('(사본)');
    s.meta.createdAt = s.meta.updatedAt = U.isoNow();
    await St.saveScore(s, { snapshot: true });
    try { const L = SJ.Layout.layout(s); await St.saveThumb(s.id, SJ.SvgRender.page(L.pages[0])); } catch (e) { /* 무시 */ }
    items = await St.list(); Lib.draw();
    UI.toast(t('복제했어요'));
  };
  Lib.remove = async function (it) {
    const ok = await UI.confirm(t('휴지통으로 옮길까요?'), t('“{t}”', { t: it.title || t('제목 없음') }) + '\n' + t('휴지통에서 7일 동안 되살릴 수 있어요.'), { ok: t('휴지통으로'), danger: true });
    if (!ok) return;
    const trash = await St.deleteScore(it.id);
    items = await St.list(); Lib.draw();
    UI.toast(t('휴지통으로 옮겼어요'), { action: { label: t('되돌리기'), fn: async () => { await St.restoreDeleted(trash); items = await St.list(); Lib.draw(); } } });
  };

  Lib.importFlow = async function () {
    const files = await SJ.Platform.pickFiles(true);
    if (!files || !files.length) return;
    const ids = await SJ.Importer.importFiles(files);
    items = await St.list(); Lib.draw();
    if (ids.length === 1) SJ.App.openEditor(ids[0]);
  };

  Lib.refresh = async function () { items = await St.list(); Lib.draw(); };
  SJ.Library = Lib;
})(window.SJ = window.SJ || {});
