/* 편집 시트 1: 정렬 · 악보 정보(제목 모양) · 보표 이름표 · 보표 구성 · 페이지 설정 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store, O = SJ.Ops, P = SJ.Pitch;
  const ES = {};
  const E = () => SJ.Editor;

  // ── ★ 정렬 (§6): 켜기/끄기 · 줄당 마디 수 · 마디 폭 — 바꿀 때마다 한 번의 되돌리기 ──
  ES.alignPopover = function () {
    const s = Store.score;
    const ag = Object.assign({ enabled: false, measuresPerSystem: 4, widthMode: 'equal' }, s.layout.alignGrid);
    const setAg = (patch, label) => {
      E().apply(label, sc => O.setLayout(sc, { alignGrid: Object.assign({}, sc.layout.alignGrid, patch) }));
      E()._reducedShown = false;
    };
    const nChips = UI.chips([{ label: t('자동'), value: 'auto' }].concat([2, 3, 4, 5, 6, 8].map(n => ({ label: String(n), value: n }))), ag.measuresPerSystem,
      v => { if (v !== null) setAg({ measuresPerSystem: v, enabled: true }, v === 'auto' ? t('줄당 마디 수: 자동') : t('줄당 {n}마디로 정렬했어요', { n: v })); });
    const wSeg = UI.seg([{ label: t('모든 마디 같은 폭'), value: 'equal' }, { label: t('내용에 맞춤'), value: 'fit' }], ag.widthMode || 'equal',
      v => setAg({ widthMode: v, enabled: true }, v === 'equal' ? t('마디 폭을 같게') : t('마디 폭을 내용에 맞게')));
    const sw = UI.switch(ag.enabled, v => setAg({ enabled: v }, v ? t('정렬했어요') : t('정렬을 껐어요')));
    const info = E().L && E().L.alignInfo;
    const body = [
      h('div', { class: 'row' }, [h('div', { class: 'grow' }, [h('b', { text: t('세로줄 정렬') }), h('div', { class: 'small muted', text: t('모든 줄의 세로줄을 같은 자리에 맞춰요. 마디를 고쳐도 계속 맞춰져요.') })]), sw]),
      h('label', { class: 'lab', text: t('줄당 마디 수') }), nChips,
      h('label', { class: 'lab', text: t('마디 폭') }), wSeg,
      h('p', { class: 'small muted', style: { marginTop: '10px', lineHeight: 1.5 }, text: t('음표가 많은 마디가 같은 폭에 안 들어가면, 그 열만 넓혀서 세로줄은 계속 맞춰요. 특정 줄만 마디 수를 바꾸려면 마디를 고르고 [여기서 줄바꿈]을 누르세요.') }),
      info && info.reduced ? h('p', { class: 'small', style: { color: 'var(--apricot-ink)' }, text: t('지금은 줄당 {n}마디로 맞춰져 있어요 (빽빽한 마디 때문).', { n: info.n }) }) : null
    ];
    UI.sheet({ title: t('정렬 · 줄당 마디'), body });
  };

  // ── 악보 정보 + 제목 모양 ──
  ES.metaSheet = function (focusField) {
    const s = Store.score, m = s.meta;
    const fields = [['title', '제목'], ['subtitle', '부제'], ['composer', '작곡'], ['lyricist', '작사'], ['arranger', '편곡'], ['copyright', '저작권 표시']];
    const inputs = {};
    const body = [];
    fields.forEach(([k, label]) => {
      const inp = h('input', { class: 'field', value: m[k] || '', placeholder: t(label), style: { width: '100%' }, maxlength: 200 });
      inputs[k] = inp;
      body.push(UI.field(t(label), inp));
    });
    const ts = Object.assign({ size: 7.5, bold: true, italic: false, underline: true }, s.page.titleStyle);
    const cs = Object.assign({ size: 3.4, bold: false, italic: false }, s.page.creditStyle);
    const style = { ts: U.clone(ts), cs: U.clone(cs) };
    body.push(h('label', { class: 'lab', text: t('제목 모양') }));
    body.push(h('div', { class: 'row', style: { flexWrap: 'wrap' } }, [
      UI.chips([{ label: t('굵게'), value: 'bold' }, { label: t('기울임'), value: 'italic' }, { label: t('밑줄 칸'), value: 'underline' }],
        ['bold', 'italic', 'underline'].filter(k => ts[k]), v => { style.ts.bold = v.indexOf('bold') >= 0; style.ts.italic = v.indexOf('italic') >= 0; style.ts.underline = v.indexOf('underline') >= 0; }, { multi: true }),
      UI.stepper(Math.round(ts.size * 2), 6, 30, v => { style.ts.size = v / 2; }, v => t('{n}mm', { n: v / 2 }))
    ]));
    body.push(h('label', { class: 'lab', text: t('작곡·작사 글 모양') }));
    body.push(h('div', { class: 'row', style: { flexWrap: 'wrap' } }, [
      UI.chips([{ label: t('굵게'), value: 'bold' }, { label: t('기울임'), value: 'italic' }], ['bold', 'italic'].filter(k => cs[k]),
        v => { style.cs.bold = v.indexOf('bold') >= 0; style.cs.italic = v.indexOf('italic') >= 0; }, { multi: true }),
      UI.stepper(Math.round(cs.size * 2), 4, 14, v => { style.cs.size = v / 2; }, v => t('{n}mm', { n: v / 2 }))
    ]));
    const save = h('button', { class: 'btn primary', text: t('적용') });
    const sh = UI.sheet({ title: t('악보 정보'), body, foot: [save] });
    save.addEventListener('click', () => {
      const patch = {};
      fields.forEach(([k]) => { patch[k] = U.nfc(inputs[k].value.trim()); });
      E().apply(t('악보 정보를 바꿨어요'), sc => O.setPage(O.setMeta(sc, patch), { titleStyle: style.ts, creditStyle: style.cs }), true);
      sh.close();
    });
    setTimeout(() => { const f = inputs[focusField || 'title']; if (f) { f.focus(); f.select(); } }, 220);
  };

  // ── 보표 이름표 (Pno. 등) ──
  ES.staffNameMenu = function (ref) {
    const s = Store.score;
    const st = s.staves.find(x => x.id === ref.staffId);
    if (!st) return;
    const setShow = (mode, label) => E().apply(label, sc => O.updateStaff(sc, st.id, { nameShow: mode }));
    const cur = st.nameShow || 'auto';
    const mark = m => (cur === m ? '✓ ' : '');
    UI.menu(t('보표 이름표') + (st.name ? ' · ' + st.name : ''), [
      { icon: 'edit', label: t('이름 · 약어 바꾸기'), sub: (st.name || t('(없음)')) + ' / ' + (st.abbr || t('(없음)')), onClick: () => ES.renameStaff(st) },
      { icon: 'layers', label: mark('auto') + t('첫 줄 이름, 다음 줄부터 약어'), onClick: () => setShow('auto', t('첫 줄은 이름, 다음 줄은 약어')) },
      { icon: 'layers', label: mark('first') + t('첫 줄에만 달기'), onClick: () => setShow('first', t('첫 줄에만 이름을 달았어요')) },
      { icon: 'layers', label: mark('always') + t('줄마다 전체 이름'), onClick: () => setShow('always', t('줄마다 이름을 달았어요')) },
      { icon: 'eye', label: mark('hidden') + t('모두 숨기기'), onClick: () => setShow('hidden', t('이름표를 숨겼어요')) },
      ref.mi !== undefined ? { icon: 'text', label: t('이 줄만 다르게 적기'), sub: t('{n}마디로 시작하는 줄', { n: ref.mi + 1 }), onClick: () => ES.lineLabel(st, ref.mi) } : null,
      { icon: 'layers', label: t('모든 보표에 같은 방식 적용'), sub: t('지금 방식: ') + ({ auto: t('첫 줄 이름·다음 약어'), first: t('첫 줄만'), always: t('줄마다'), hidden: t('숨김') }[cur]),
        onClick: () => E().apply(t('모든 보표 이름표를 맞췄어요'), sc => { let x = sc; sc.staves.forEach(q => { x = O.updateStaff(x, q.id, { nameShow: cur }); }); return x; }) }
    ]);
  };
  ES.renameStaff = async function (st) {
    const nm = h('input', { class: 'field', value: st.name || '', placeholder: t('이름 (예: 피아노)'), style: { width: '100%' } });
    const ab = h('input', { class: 'field', value: st.abbr || '', placeholder: t('약어 (예: Pno.)'), style: { width: '100%', marginTop: '8px' } });
    const ok = await UI.confirm(t('보표 이름'), '', { extra: h('div', {}, [nm, ab]), ok: t('적용') });
    if (!ok) return;
    E().apply(t('보표 이름을 바꿨어요'), sc => O.updateStaff(sc, st.id, { name: U.nfc(nm.value.trim()), abbr: U.nfc(ab.value.trim()) }));
  };
  ES.lineLabel = async function (st, mi) {
    const m = Store.score.measures[mi];
    const cur = m.attrs.labels && m.attrs.labels[st.id] !== undefined ? m.attrs.labels[st.id] : '';
    const v = await UI.prompt(t('이 줄만 다르게 적기'), cur, { msg: t('비우고 적용하면 이 줄만 이름표를 숨겨요. [원래대로]는 아래에서.'), placeholder: t('이 줄 이름표') });
    if (v === null) return;
    E().apply(t('이 줄 이름표를 바꿨어요'), sc => O.editMeasure(sc, mi, mm => { mm.attrs.labels = Object.assign({}, mm.attrs.labels, { [st.id]: v }); }));
    UI.toast(t('이 줄 이름표를 바꿨어요'), { action: { label: t('원래대로'), fn: () => E().apply(t('이 줄 이름표를 원래대로'), sc => O.editMeasure(sc, mi, mm => { if (mm.attrs.labels) { delete mm.attrs.labels[st.id]; if (!Object.keys(mm.attrs.labels).length) delete mm.attrs.labels; } })) } });
  };

  // ── 보표 구성 ──
  ES.stavesSheet = function () {
    const listEl = h('div', { class: 'list' });
    const draw = () => {
      listEl.innerHTML = '';
      const s = Store.score;
      s.staves.forEach((st, i) => {
        const clefSel = h('select', { class: 'field', style: { width: '128px' } }, P.CLEF_IDS.map(c => h('option', { value: c, text: SJ.getLang() === 'en' ? P.CLEFS[c].labelEn : t(P.CLEFS[c].label) })));
        clefSel.value = st.clef;
        clefSel.addEventListener('change', () => { E().apply(t('음자리표를 바꿨어요'), sc => O.updateStaff(sc, st.id, { clef: clefSel.value })); draw(); });
        listEl.appendChild(h('div', { class: 'li', style: { cursor: 'default', flexWrap: 'wrap' } }, [
          h('div', { class: 'tx' }, [h('b', { text: (i + 1) + '. ' + (st.name || t('(이름 없음)')) }), h('span', { text: st.groupId ? (st.groupType === 'bracket' ? t('각괄호 묶음') : t('중괄호 묶음')) : '' })]),
          clefSel,
          UI.ibtn('edit', t('이름'), () => ES.renameStaff(st).then(draw), { noLabel: true }),
          UI.ibtn('up', t('위로'), () => { E().apply(t('보표 순서를 바꿨어요'), sc => O.moveStaff(sc, st.id, -1)); draw(); }, { noLabel: true, disabled: i === 0 }),
          UI.ibtn('down', t('아래로'), () => { E().apply(t('보표 순서를 바꿨어요'), sc => O.moveStaff(sc, st.id, 1)); draw(); }, { noLabel: true, disabled: i === s.staves.length - 1 }),
          UI.ibtn('trash', t('빼기'), async () => {
            if (s.staves.length <= 1) { UI.toast(t('보표는 하나 이상 있어야 해요')); return; }
            if (!(await UI.confirm(t('이 보표를 뺄까요?'), t('이 보표의 음표도 함께 지워져요. 되돌리기로 살릴 수 있어요.'), { ok: t('빼기'), danger: true }))) return;
            E().apply(t('보표를 뺐어요'), sc => O.removeStaff(sc, st.id)); draw();
          }, { noLabel: true })
        ]));
      });
    };
    draw();
    const addBtns = h('div', { class: 'chips', style: { marginTop: '12px' } }, [
      h('button', { class: 'chip', text: '+ ' + t('높은음자리표 보표'), onclick: () => { E().apply(t('보표를 더했어요'), sc => O.addStaff(sc, { clef: 'treble' })); draw(); } }),
      h('button', { class: 'chip', text: '+ ' + t('낮은음자리표 보표'), onclick: () => { E().apply(t('보표를 더했어요'), sc => O.addStaff(sc, { clef: 'bass' })); draw(); } }),
      h('button', { class: 'chip', text: '+ ' + t('피아노 대보표'), onclick: () => {
        const g = U.sid();
        E().apply(t('피아노 대보표를 더했어요'), sc => O.addStaff(O.addStaff(sc, { clef: 'treble', name: t('피아노'), abbr: 'Pno.', groupId: g, groupType: 'brace' }), { clef: 'bass', groupId: g, groupType: 'brace' }));
        draw();
      } })
    ]);
    UI.sheet({ title: t('보표 · 악기 구성'), body: [listEl, addBtns] });
  };

  // ── 페이지 설정 ──
  ES.pageSheet = function () {
    const pg = U.clone(Store.score.page);
    const paperSeg = UI.seg([{ label: 'A4', value: 'A4' }, { label: 'Letter', value: 'Letter' }, { label: t('직접'), value: 'custom' }], pg.size, v => {
      pg.size = v;
      if (v !== 'custom') { const d = SJ.Score.defaultPage(v, pg.orientation); pg.width = d.width; pg.height = d.height; wIn.value = pg.width; hIn.value = pg.height; }
      customRow.style.display = v === 'custom' ? '' : 'none';
    });
    const oriSeg = UI.seg([{ label: t('세로'), value: 'portrait' }, { label: t('가로'), value: 'landscape' }], pg.orientation, v => {
      if (v !== pg.orientation) { const w = pg.width; pg.width = pg.height; pg.height = w; wIn.value = pg.width; hIn.value = pg.height; }
      pg.orientation = v;
    });
    const wIn = h('input', { class: 'field', type: 'number', value: pg.width, style: { width: '90px' } });
    const hIn = h('input', { class: 'field', type: 'number', value: pg.height, style: { width: '90px' } });
    const customRow = h('div', { class: 'row', style: { marginTop: '8px', display: pg.size === 'custom' ? '' : 'none' } }, [wIn, h('span', { text: '×' }), hIn, h('span', { class: 'small muted', text: 'mm' })]);
    const mg = U.clone(pg.margins);
    const mStep = k => UI.stepper(mg[k], 5, 40, v => { mg[k] = v; }, v => v + 'mm');
    const staff = UI.stepper(Math.round(pg.staffSize * 2), 8, 20, v => { pg.staffSize = v / 2; }, v => t('보표 {n}mm', { n: v / 2 }));
    const pnSw = UI.switch(pg.pageNumbers, v => { pg.pageNumbers = v; });
    const header = h('input', { class: 'field', value: pg.header || '', placeholder: t('머리글 (2쪽부터 위에)'), style: { width: '100%' } });
    const footer = h('input', { class: 'field', value: pg.footer || '', placeholder: t('바닥글 (아래 왼쪽)'), style: { width: '100%', marginTop: '8px' } });
    const ly = U.clone(Store.score.layout);
    const sd = UI.stepper(Math.round(ly.staffDistance * 2), 6, 24, v => { ly.staffDistance = v / 2; }, v => t('보표 사이 {n}', { n: v / 2 }));
    const yd = UI.stepper(Math.round(ly.systemDistance * 2), 6, 30, v => { ly.systemDistance = v / 2; }, v => t('줄 사이 {n}', { n: v / 2 }));
    const numSeg = UI.seg([{ label: t('줄 첫머리'), value: 'system' }, { label: t('모든 마디'), value: 'all' }, { label: t('끔'), value: 'none' }], ly.measureNumbers || 'system', v => { ly.measureNumbers = v; });
    const beamSeg = UI.seg([{ label: t('4/4 8분음표 4개씩'), value: 'half' }, { label: t('박마다'), value: 'beat' }], ly.beam44 || 'half', v => { ly.beam44 = v; });
    const body = [
      h('label', { class: 'lab', text: t('용지') }), h('div', { class: 'row' }, [paperSeg, oriSeg]), customRow,
      h('label', { class: 'lab', text: t('여백 (위 · 아래 · 왼쪽 · 오른쪽)') }), h('div', { class: 'row', style: { flexWrap: 'wrap' } }, [mStep('top'), mStep('bottom'), mStep('left'), mStep('right')]),
      h('label', { class: 'lab', text: t('보표 크기') }), staff,
      h('label', { class: 'lab', text: t('간격') }), h('div', { class: 'row', style: { flexWrap: 'wrap' } }, [sd, yd]),
      h('label', { class: 'lab', text: t('마디 번호') }), numSeg,
      h('label', { class: 'lab', text: t('빔 묶음 (4/4)') }), beamSeg,
      h('div', { class: 'row', style: { marginTop: '14px' } }, [h('div', { class: 'grow', text: t('쪽 번호 (2쪽부터)') }), pnSw]),
      h('label', { class: 'lab', text: t('머리글 · 바닥글') }), header, footer
    ];
    const save = h('button', { class: 'btn primary', text: t('적용') });
    const sh = UI.sheet({ title: t('페이지 설정'), body, foot: [save] });
    save.addEventListener('click', () => {
      if (pg.size === 'custom') { pg.width = U.clamp(Number(wIn.value) || 210, 80, 600); pg.height = U.clamp(Number(hIn.value) || 297, 80, 900); }
      pg.margins = mg; pg.header = U.nfc(header.value); pg.footer = U.nfc(footer.value);
      E().apply(t('페이지 설정을 바꿨어요'), sc => O.setLayout(O.setPage(sc, pg), { staffDistance: ly.staffDistance, systemDistance: ly.systemDistance, measureNumbers: ly.measureNumbers, beam44: ly.beam44 }));
      sh.close();
    });
  };

  SJ.EditorSheets = ES;
})(window.SJ = window.SJ || {});
