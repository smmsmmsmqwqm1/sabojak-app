/* 내보내기 화면 (§13): 형식(PDF·인쇄/PNG/MusicXML/MIDI/.sabojak) · 범위 · 흑백 · 미리보기 · 공유/저장 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, PF = SJ.Platform, X = SJ.Exporter;
  const XS = {};

  XS.open = function (score, currentPage) {
    const L = SJ.Layout.layout(score);
    const st = { fmt: 'pdf', range: 'all', gray: false, from: 1, to: L.pages.length };
    const prev = h('div', { class: 'exp-prev' });
    const drawPrev = () => {
      prev.innerHTML = '';
      const pages = st.range === 'current' ? [L.pages[currentPage || 0]] : st.range === 'custom' ? L.pages.slice(st.from - 1, st.to) : L.pages;
      pages.slice(0, 6).forEach(p => prev.appendChild(h('div', { class: 'pp', html: SJ.SvgRender.page(p, { gray: st.gray }) })));
      if (pages.length > 6) prev.appendChild(h('div', { class: 'small muted', style: { alignSelf: 'center', padding: '0 8px' }, text: '+' + (pages.length - 6) }));
    };
    const fmtChips = UI.chips([
      { label: t('PDF · 인쇄'), value: 'pdf' }, { label: t('이미지 PNG'), value: 'png' }, { label: 'MusicXML', value: 'xml' }, { label: 'MIDI', value: 'mid' }, { label: t('사보작 파일'), value: 'sabojak' }
    ], st.fmt, v => { st.fmt = v || 'pdf'; refresh(); });
    const rangeSeg = UI.seg([{ label: t('전체 ({n}쪽)', { n: L.pages.length }), value: 'all' }, { label: t('지금 쪽'), value: 'current' }, { label: t('쪽 고르기'), value: 'custom' }], st.range, v => { st.range = v; customRow.style.display = v === 'custom' ? '' : 'none'; drawPrev(); });
    const fromS = UI.stepper(1, 1, L.pages.length, v => { st.from = v; if (st.to < v) st.to = v; drawPrev(); }, v => t('{n}쪽부터', { n: v }));
    const toS = UI.stepper(L.pages.length, 1, L.pages.length, v => { st.to = Math.max(v, st.from); drawPrev(); }, v => t('{n}쪽까지', { n: v }));
    const customRow = h('div', { class: 'row', style: { display: 'none', marginTop: '8px', flexWrap: 'wrap' } }, [fromS, toS]);
    const graySw = UI.switch(false, v => { st.gray = v; drawPrev(); });
    const guide = h('p', { class: 'small muted', style: { lineHeight: 1.5 } });
    const pageOpts = h('div', {}, [h('label', { class: 'lab', text: t('범위') }), rangeSeg, customRow,
      h('div', { class: 'row', style: { marginTop: '12px' } }, [h('div', { class: 'grow', text: t('흑백(회색조)') }), graySw]),
      h('label', { class: 'lab', text: t('미리보기') }), prev]);
    const compatBtn = h('button', { class: 'btn ghost block small', text: t('호환 모드로 보내기 (.sabojak.json)'), onclick: () => run('share', true) });
    function refresh() {
      const paged = st.fmt === 'pdf' || st.fmt === 'png';
      pageOpts.style.display = paged ? '' : 'none';
      compatBtn.style.display = st.fmt === 'sabojak' ? '' : 'none';
      guide.textContent = {
        pdf: t('인쇄 화면이 열려요. 프린터로 바로 인쇄하거나 [PDF로 저장]을 고르세요. 화면과 똑같이 나와요.'),
        png: t('쪽마다 300dpi 이미지로 만들어요. 여러 쪽이면 zip 하나로 묶어요.'),
        xml: t('다른 사보 프로그램(MuseScore · Finale · Sibelius 등)과 주고받을 때 쓰는 표준 형식이에요.'),
        mid: t('음높이 · 길이 · 빠르기를 담은 MIDI 파일이에요.'),
        sabojak: t('사보작끼리 주고받는 파일이에요. 아이폰 · 갤럭시 · 아이패드 어디서나 그대로 열려요. 메신저가 파일을 막으면 아래 [호환 모드]를 쓰세요.')
      }[st.fmt];
      shareBtn.innerHTML = st.fmt === 'pdf' ? SJ.icon('print') + U.esc(t('인쇄 · PDF')) : SJ.icon('share') + U.esc(t('보내기 · 공유'));
      saveBtn.style.display = st.fmt === 'pdf' ? 'none' : '';
      drawPrev();
    }
    const shareBtn = h('button', { class: 'btn primary' });
    const saveBtn = h('button', { class: 'btn', html: SJ.icon('import') + U.esc(t('기기에 저장')) });
    const sh = UI.sheet({ title: t('내보내기 · 인쇄'), body: [fmtChips, guide, pageOpts, compatBtn,
      h('p', { class: 'tiny muted', text: t('사보작끼리는 .sabojak · 다른 사보 프로그램과는 MusicXML · 인쇄·공유용은 PDF/PNG') })], foot: [saveBtn, shareBtn] });
    refresh();
    shareBtn.addEventListener('click', () => run('share'));
    saveBtn.addEventListener('click', () => run('save'));

    async function run(how, compat) {
      const range = st.range === 'custom' ? [st.from - 1, st.to - 1] : st.range;
      try {
        if (st.fmt === 'pdf') { await X.print(score, L, range, currentPage, { gray: st.gray }); return; }
        let f;
        if (st.fmt === 'png') {
          UI.toast(t('이미지를 만드는 중…'));
          f = await X.png(score, L, range, currentPage, { gray: st.gray }, (i, n) => UI.toast(t('이미지 {i}/{n}', { i: i + 1, n })));
        } else if (st.fmt === 'xml') f = X.musicxml(score);
        else if (st.fmt === 'mid') f = X.midi(score);
        else f = await X.sabojak(score, compat);
        if (how === 'save') { if (await PF.saveFile(f.name, f.mime, f.data)) UI.toast(t('저장했어요')); }
        else await PF.shareFile(f.name, f.mime, f.data, score.meta.title || SJ.APP.name);
        sh.close();
      } catch (e) {
        UI.alert(t('내보내지 못했어요'), String(e && e.message || e));
      }
    }
  };

  // 다른 기기로 보내기 (.sabojak 바로 공유)
  XS.sendSabojak = async function (score) {
    const choice = await UI.choose(t('다른 기기로 보내기'), t('카카오톡 · 메일 · AirDrop · Nearby Share 등으로 보내요. 받은 쪽 사보작에서 [불러오기]로 열면 그대로 이어서 고칠 수 있어요.'), [
      { label: t('보내기 (.sabojak)'), value: 'normal', kind: 'primary' },
      { label: t('호환 모드로 보내기 (.sabojak.json)'), value: 'compat' },
      { label: t('취소'), value: null }
    ]);
    if (!choice) return;
    try {
      await SJ.Store.flush();
      const f = await X.sabojak(score, choice === 'compat');
      await PF.shareFile(f.name, f.mime, f.data, score.meta.title || SJ.APP.name);
    } catch (e) { UI.alert(t('보내지 못했어요'), String(e && e.message || e)); }
  };

  XS.backupAll = async function () {
    try {
      const b = await X.backup();
      if (!b.count) { UI.toast(t('백업할 악보가 없어요')); return; }
      const how = await UI.choose(t('전체 백업 ({n}개)', { n: b.count }), t('모든 악보를 zip 파일 하나로 만들어요. [백업에서 되살리기]로 다시 불러올 수 있어요.'), [
        { label: t('기기에 저장'), value: 'save', kind: 'primary' }, { label: t('보내기 · 공유'), value: 'share' }, { label: t('취소'), value: null }]);
      if (!how) return;
      if (how === 'save') { if (await PF.saveFile(b.name, b.mime, b.data)) UI.toast(t('백업을 저장했어요')); }
      else await PF.shareFile(b.name, b.mime, b.data, b.name);
    } catch (e) { UI.alert(t('백업하지 못했어요'), String(e && e.message || e)); }
  };

  SJ.ExportSheet = XS;
})(window.SJ = window.SJ || {});
