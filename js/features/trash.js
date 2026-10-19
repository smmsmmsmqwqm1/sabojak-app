/* 휴지통: 지운 악보·템플릿을 7일 동안 보관. 되살리기 · 영구 삭제 · 고른 것 처리 · 휴지통 비우기 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, St = SJ.Storage;
  const TR = {};

  TR.open = async function () {
    const listEl = h('div', { class: 'list' });
    const picked = new Set();
    let items = [];
    const restoreSel = h('button', { class: 'btn soft', html: SJ.icon('restore') + U.esc(t('되살리기')), disabled: true });
    const purgeSel = h('button', { class: 'btn danger', html: SJ.icon('trash') + U.esc(t('영구 삭제')), disabled: true });
    const emptyAll = h('button', { class: 'btn ghost block small', text: t('휴지통 비우기'), style: { marginTop: '12px' } });
    const sheet = UI.sheet({ title: t('휴지통'), body: [h('p', { class: 'small muted', style: { margin: '0 0 10px' }, text: t('지운 악보와 템플릿은 7일 동안 여기 있다가 자동으로 지워져요.') }), listEl, emptyAll], foot: [restoreSel, purgeSel] });
    const refreshBtns = () => { restoreSel.disabled = purgeSel.disabled = picked.size === 0; };
    async function draw() {
      items = await St.listTrash();
      listEl.innerHTML = '';
      picked.clear(); refreshBtns();
      emptyAll.style.display = items.length ? '' : 'none';
      if (!items.length) { listEl.appendChild(h('div', { class: 'li' }, [h('div', { class: 'tx muted', text: t('휴지통이 비어 있어요') })])); return; }
      items.forEach(it => {
        const box = h('span', { class: 'ic', html: SJ.icon('dot') });
        const row = h('div', { class: 'li', role: 'checkbox', 'aria-checked': 'false', tabindex: 0 }, [
          box,
          h('div', { class: 'tx' }, [h('b', { text: (it.kind === 'template' ? '📄 ' : '🎵 ') + (it.title || t('제목 없음')) }),
            h('span', { text: (it.kind === 'template' ? t('템플릿') : t('악보')) + ' · ' + U.fmtDate(it.deletedAt, SJ.getLang()) + ' ' + t('지움') + ' · ' + (it.daysLeft <= 1 ? t('곧 자동 삭제') : t('{n}일 뒤 자동 삭제', { n: it.daysLeft })) })]),
          h('button', { class: 'btn soft', style: { minHeight: '38px', padding: '0 12px' }, text: t('되살리기'), onclick: async e => { e.stopPropagation(); await St.restoreTrash(it); UI.toast(t('되살렸어요')); await after(); } })
        ]);
        row.addEventListener('click', () => {
          if (picked.has(it)) picked.delete(it); else picked.add(it);
          const on = picked.has(it);
          row.setAttribute('aria-checked', on ? 'true' : 'false');
          box.innerHTML = SJ.icon(on ? 'check' : 'dot');
          box.style.color = on ? 'var(--accent)' : '';
          refreshBtns();
        });
        listEl.appendChild(row);
      });
    }
    async function after() { await draw(); if (SJ.Library) SJ.Library.refresh(); }
    restoreSel.addEventListener('click', async () => {
      for (const it of Array.from(picked)) await St.restoreTrash(it);
      UI.toast(t('{n}개를 되살렸어요', { n: picked.size })); await after();
    });
    purgeSel.addEventListener('click', async () => {
      const n = picked.size;
      if (!(await UI.confirm(t('영구 삭제할까요?'), t('고른 {n}개는 다시 되살릴 수 없어요.', { n }), { ok: t('영구 삭제'), danger: true }))) return;
      for (const it of Array.from(picked)) await St.purgeTrash(it);
      UI.toast(t('영구 삭제했어요')); await after();
    });
    emptyAll.addEventListener('click', async () => {
      if (!(await UI.confirm(t('휴지통을 비울까요?'), t('휴지통의 {n}개를 모두 영구 삭제해요. 되살릴 수 없어요.', { n: items.length }), { ok: t('모두 영구 삭제'), danger: true }))) return;
      for (const it of items) await St.purgeTrash(it);
      UI.toast(t('휴지통을 비웠어요')); await after();
    });
    await draw();
    return sheet;
  };

  SJ.Trash = TR;
})(window.SJ = window.SJ || {});
