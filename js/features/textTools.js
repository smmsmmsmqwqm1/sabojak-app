/* 글자 도구: 자유 텍스트 (§7-3) · 코드 기호 (§7-4) */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store, O = SJ.Ops;
  const E = () => SJ.Editor;

  // ── 자유 텍스트 ──
  const TT = {};
  TT.create = function (pt) {
    const ed = E();
    let anchor;
    const mi = ed.measureNear(pt);
    if (mi !== null && mi !== undefined) {
      const b = ed.L.measureBox[mi];
      anchor = { type: 'measure', measureId: Store.score.measures[mi].id, x: U.r2(pt.x - b.x0), y: U.r2(pt.y - b.y0) };
    } else anchor = { type: 'page', page: pt.page, x: U.r2(pt.x), y: U.r2(pt.y) };
    TT.sheet(null, anchor);
  };
  TT.edit = function (id) {
    const tx = (Store.score.texts || []).find(x => x.id === id);
    if (tx) TT.sheet(tx);
  };
  TT.sheet = function (tx, anchor) {
    const st = tx ? { size: tx.size || 12, bold: !!tx.bold, italic: !!tx.italic } : { size: 12, bold: false, italic: false };
    const ta = h('textarea', { class: 'field', rows: 3, placeholder: t('글을 입력하세요'), style: { width: '100%' } });
    ta.value = tx ? tx.text : '';
    const styleChips = UI.chips([{ label: t('굵게'), value: 'bold' }, { label: t('기울임'), value: 'italic' }], ['bold', 'italic'].filter(k => st[k]),
      v => { st.bold = v.indexOf('bold') >= 0; st.italic = v.indexOf('italic') >= 0; }, { multi: true });
    const size = UI.stepper(st.size, 6, 48, v => { st.size = v; }, v => v + 'pt');
    const save = h('button', { class: 'btn primary', text: tx ? t('적용') : t('넣기') });
    const foot = [save];
    if (tx) foot.unshift(h('button', { class: 'btn danger', text: t('지우기'), onclick: () => { sh.close(); E().apply(t('글을 지웠어요'), s => O.removeText(s, tx.id)); } }));
    const sh = UI.sheet({ title: tx ? t('글 고치기') : t('글 넣기'), body: [ta, h('div', { class: 'row', style: { marginTop: '12px', flexWrap: 'wrap' } }, [styleChips, size]),
      h('p', { class: 'small muted', text: t('텍스트 도구에서 글을 끌면 자리를 옮길 수 있어요.') })], foot });
    setTimeout(() => ta.focus(), 220);
    save.addEventListener('click', () => {
      const text = U.nfc(ta.value.replace(/\s+$/, ''));
      sh.close();
      if (!text) { if (tx) E().apply(t('글을 지웠어요'), s => O.removeText(s, tx.id)); return; }
      if (tx) E().apply(t('글을 고쳤어요'), s => O.updateText(s, tx.id, { text, size: st.size, bold: st.bold, italic: st.italic }), true);
      else E().apply(t('글을 넣었어요'), s => O.addText(s, { text, size: st.size, bold: st.bold, italic: st.italic, anchor }), true);
    });
  };
  // 끌어 옮기기: 덮개에 미리보기 → 손 떼면 반영
  TT.dragPreview = function (id, dx, dy) {
    const ed = E();
    const hit = ed.L.pages[ed.page].hits.find(x => x.ref && x.ref.type === 'text' && x.ref.id === id);
    if (!hit) return;
    const paper = ed.paperOf(ed.page); if (!paper) return;
    const ov = paper.querySelector('svg.overlay');
    let g = ov.querySelector('#drag-ghost');
    if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); g.id = 'drag-ghost'; g.setAttribute('class', 'sel-range'); ov.appendChild(g); }
    g.setAttribute('x', hit.x0 + dx); g.setAttribute('y', hit.y0 + dy); g.setAttribute('width', hit.x1 - hit.x0); g.setAttribute('height', hit.y1 - hit.y0);
  };
  TT.commitDrag = function (id, dx, dy) {
    const tx = (Store.score.texts || []).find(x => x.id === id);
    if (!tx) return;
    E().apply(t('글을 옮겼어요'), s => O.updateText(s, id, { anchor: Object.assign({}, tx.anchor, { x: U.r2(tx.anchor.x + dx), y: U.r2(tx.anchor.y + dy) }) }), true);
  };
  SJ.TextTool = TT;

  // ── 코드 기호 ──
  const CT = {};
  CT.atPoint = function (pt, ref) {
    const ed = E();
    if (ref && (ref.type === 'note' || ref.type === 'rest') && ref.eventId) {
      const f = SJ.Score.findEvent(Store.score, ref.eventId);
      if (f) { CT.edit(f.mi, SJ.Dur.voiceStarts(Store.score.measures[f.mi].staves[f.staffId].voices[f.vi]).starts[f.ei]); return; }
    }
    if (ref && ref.type === 'chord') { CT.edit(ref.mi, ref.tick); return; }
    const mi = ed.measureNear(pt);
    if (mi === null || mi === undefined) return;
    CT.edit(mi, ed.tickAt(mi, pt.x));
  };
  CT.edit = function (mi, tick) {
    const s = Store.score;
    const cur = (s.measures[mi].chords || []).find(c => c.tick === tick);
    const st = cur ? SJ.Chord.parse(cur.text) : { root: null, alter: 0, quality: '' };
    if (st.raw) { st.root = null; }
    const big = h('div', { style: { fontSize: '30px', fontWeight: 800, textAlign: 'center', padding: '6px', minHeight: '48px', fontFamily: SJ.SvgRender.FONTS.chord } });
    const free = h('input', { class: 'field', placeholder: t('직접 입력 (예: F#m7b5, Cmaj7/E)'), style: { width: '100%' }, value: cur ? cur.text : '' });
    const compose = () => st.root ? SJ.Chord.format({ root: st.root, alter: st.alter, quality: st.quality, bass: st.bass }) : '';
    const sync = (fromFree) => {
      if (!fromFree) free.value = compose();
      big.textContent = SJ.Chord.pretty(free.value) || '—';
    };
    const roots = UI.chips('CDEFGAB'.split('').map(r => ({ label: r, value: r })), st.root, v => { st.root = v; sync(); });
    const acc = UI.seg([{ label: t('없음'), value: 0 }, { label: '♯', value: 1 }, { label: '♭', value: -1 }], st.alter || 0, v => { st.alter = v; sync(); });
    const quals = UI.chips(SJ.Chord.QUALITIES.map(q => ({ label: q || t('장3화음'), value: q })), st.quality || '', v => { st.quality = v || ''; sync(); }, { toggle: true });
    const bass = UI.chips([{ label: t('없음'), value: '' }].concat('CDEFGAB'.split('').map(r => ({ label: '/' + r, value: r }))), st.bass ? st.bass.step : '', v => { st.bass = v ? { step: v, alter: 0 } : null; sync(); });
    free.addEventListener('input', () => sync(true));
    sync(!!cur);
    const apply = (andNext) => {
      const text = SJ.Chord.pretty(free.value.trim());
      E().apply(text ? t('코드 {c}', { c: text }) : t('코드를 지웠어요'), sc => O.setChord(sc, mi, tick, text), true);
      sh.close();
      if (andNext) {
        // 다음 박(열)으로
        const b = E().L.measureBox[mi];
        const ticks = (b ? b.segX.map(x => x.tick) : []).filter(x => x > tick);
        const beat = SJ.Dur.beatTicks(SJ.Score.timeAt(Store.score, mi));
        let nt = ticks.length ? ticks[0] : tick + beat;
        let nmi = mi;
        if (nt >= SJ.Score.capacity(Store.score, mi)) { nmi = mi + 1; nt = 0; }
        if (nmi < Store.score.measures.length) setTimeout(() => CT.edit(nmi, nt), 230);
      }
    };
    const foot = [
      h('button', { class: 'btn', text: t('적용'), onclick: () => apply(false) }),
      h('button', { class: 'btn primary', html: U.esc(t('적용 · 다음 박')) + SJ.icon('right'), onclick: () => apply(true) })
    ];
    if (cur) foot.unshift(h('button', { class: 'btn danger', text: t('지우기'), onclick: () => { free.value = ''; apply(false); } }));
    const sh = UI.sheet({ title: t('코드 · {n}마디', { n: mi + 1 }), body: [big, h('label', { class: 'lab', text: t('근음') }), roots, h('div', { style: { height: '8px' } }), acc,
      h('label', { class: 'lab', text: t('종류') }), quals, h('label', { class: 'lab', text: t('베이스 (슬래시)') }), bass, h('label', { class: 'lab', text: t('직접 입력') }), free], foot });
  };
  SJ.ChordTool = CT;
})(window.SJ = window.SJ || {});
