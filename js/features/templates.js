/* 템플릿 (§12): 기본 프리셋 + 내 템플릿(보표 구성·조표·박자·페이지·머리글, 음표 포함 선택) + 새 악보 기본값 */
(function (SJ) {
  'use strict';
  const U = SJ.U, t = SJ.t, UI = SJ.UI, h = U.h;
  const T = {};

  // 악보 → 템플릿 데이터
  T.fromScore = function (score, name, withNotes) {
    const first = score.measures[0];
    const d = {
      id: U.uuid(), name: U.nfc(name || score.meta.title || t('내 템플릿')), createdAt: U.isoNow(),
      staves: U.clone(score.staves), page: U.clone(score.page), layout: U.clone(score.layout),
      time: U.clone(SJ.Score.timeAt(score, 0)), key: U.clone(SJ.Score.keyAt(score, 0)), tempo: first.attrs.tempo ? U.clone(first.attrs.tempo) : null,
      meta: { composer: score.meta.composer, lyricist: score.meta.lyricist, arranger: score.meta.arranger, copyright: score.meta.copyright, subtitle: score.meta.subtitle },
      measureCount: score.measures.length, withNotes: !!withNotes
    };
    if (withNotes) { d.measures = U.clone(score.measures); d.texts = U.clone(score.texts); d.spanners = U.clone(score.spanners); d.title = score.meta.title; }
    return d;
  };

  // 템플릿 → 새 악보
  T.toScore = function (tp, opts) {
    opts = opts || {};
    const s = SJ.Score.create({ title: opts.title || '', composer: opts.composer || tp.meta.composer || '', staves: tp.staves, time: opts.time || tp.time, key: opts.key || tp.key,
      tempo: opts.tempo || tp.tempo, measures: opts.measures || tp.measureCount || 16 });
    s.page = Object.assign(SJ.Score.defaultPage('A4'), U.clone(tp.page));
    if (opts.paper) {
      const p = SJ.Score.defaultPage(opts.paper, opts.orientation);
      Object.assign(s.page, { size: p.size, orientation: p.orientation, width: p.width, height: p.height });
    }
    s.layout = U.clone(tp.layout);
    ['lyricist', 'arranger', 'copyright', 'subtitle'].forEach(k => { if (tp.meta[k]) s.meta[k] = tp.meta[k]; });
    if (tp.withNotes && tp.measures) {
      // 새 id 로 바꾼 사본 (스패너 id 연결 유지)
      const map = {};
      s.measures = tp.measures.map(m => {
        const c = U.clone(m); c.id = U.sid();
        Object.keys(c.staves).forEach(sid => c.staves[sid].voices.forEach(v => {
          const tm = {};
          v.tuplets.forEach(tu => { const n = U.sid(); tm[tu.id] = n; tu.id = n; });
          v.events.forEach(ev => { const n = U.sid(); map[ev.id] = n; ev.id = n; if (ev.dur.tuplet) ev.dur.tuplet = tm[ev.dur.tuplet]; });
        }));
        return c;
      });
      s.spanners = (tp.spanners || []).filter(sp => map[sp.startId] && map[sp.endId]).map(sp => Object.assign({}, sp, { id: U.sid(), startId: map[sp.startId], endId: map[sp.endId] }));
      s.texts = (tp.texts || []).map(x => Object.assign(U.clone(x), { id: U.sid() }));
      if (!opts.title && tp.title) s.meta.title = tp.title;
    }
    return s;
  };

  T.saveFromScore = async function (score) {
    const name = U.h('input', { class: 'field', value: score.meta.title ? score.meta.title + ' ' + t('템플릿') : t('내 템플릿') });
    name.style.width = '100%';
    let withNotes = false;
    const sw = UI.switch(false, v => { withNotes = v; });
    const extra = h('div', {}, [name, h('div', { class: 'row', style: { marginTop: '12px' } }, [h('div', { class: 'grow', text: t('음표까지 포함') }), sw])]);
    const ok = await UI.confirm(t('템플릿으로 저장'), t('보표 구성 · 조표 · 박자 · 페이지 설정 · 머리글을 저장해요.'), { extra, ok: t('저장') });
    if (!ok) return null;
    const tp = T.fromScore(score, name.value, withNotes);
    await SJ.Storage.saveTemplate(tp);
    UI.toast(t('템플릿을 저장했어요'), { action: { label: t('새 악보 기본으로'), fn: () => { SJ.Settings.set('defaultTemplate', 'user:' + tp.id); UI.toast(t('새 악보 기본값으로 정했어요')); } } });
    return tp;
  };

  T.list = () => SJ.Storage.listTemplates();
  T.rename = async function (tp) {
    const n = await UI.prompt(t('템플릿 이름'), tp.name);
    if (n === null) return;
    tp.name = n; await SJ.Storage.saveTemplate(tp);
  };
  T.remove = async function (tp) {
    if (!(await UI.confirm(t('템플릿을 휴지통으로 옮길까요?'), tp.name + '\n' + t('휴지통에서 7일 동안 되살릴 수 있어요.'), { ok: t('휴지통으로'), danger: true }))) return false;
    const tdir = await SJ.Storage.trashTemplate(tp);
    const wasDefault = SJ.Settings.get('defaultTemplate') === 'user:' + tp.id;
    if (wasDefault) SJ.Settings.set('defaultTemplate', null);
    UI.toast(t('휴지통으로 옮겼어요'), { action: { label: t('되돌리기'), fn: async () => {
      await SJ.Storage.restoreDeleted(tdir);
      if (wasDefault) SJ.Settings.set('defaultTemplate', 'user:' + tp.id);
      UI.toast(t('되살렸어요 · 새 악보 화면을 다시 열면 보여요'));
    } } });
    return true;
  };

  SJ.Templates = T;
})(window.SJ = window.SJ || {});
