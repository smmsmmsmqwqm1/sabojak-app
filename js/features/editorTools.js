/* 편집 도구 (§7-3, §11): 지금 할 수 있는 것만 보이는 도구 막대 · 탭 처리 · 마디 편집 · 더보기 메뉴 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store, O = SJ.Ops;
  const ET = {};
  const E = () => SJ.Editor;

  // 아래 막대 = 늘 한 줄. 맨 왼쪽(엄지 자리) [음표 넣기] + 덧붙이는 도구 넷. 아무 도구도 안 고른 상태가 곧 '선택'
  // (마디 속성은 마디를 고르면 나오는 막대의 ⋯ 안)
  const TOOLS = [
    { id: 'text', icon: 'text', label: '텍스트' },
    { id: 'chord', icon: 'chord', label: '코드' },
    { id: 'lyrics', icon: 'lyrics', label: '가사' },
    { id: 'expr', icon: 'expr', label: '표현' }
  ];
  const TOOL_HINT = {
    text: '글을 넣을 곳을 톡 · 글을 끌어서 옮기기',
    chord: '코드를 붙일 음표(박)를 톡',
    lyrics: '가사를 시작할 음표를 톡',
    measure: '속성을 바꿀 마디를 톡',
    expr: '아래에서 표현을 고른 뒤 음표를 톡'
  };

  ET.drawToolbar = function () {
    const ed = E();
    const tb = ed.el().toolbar;
    tb.innerHTML = '';
    // 마디 · 음표를 골랐으면 그 막대가 이 자리를 대신한다 (아래 막대는 늘 한 줄)
    const selBar = ed.sel && ed.tool === 'select';
    tb.classList.toggle('hidden', !!selBar || ed.tool === 'expr');
    if (selBar || ed.tool === 'expr') return;
    tb.appendChild(h('button', { class: 'btn primary input-main', html: SJ.icon('edit') + '<span>' + U.esc(t('음표 넣기')) + '</span>', onclick: () => ET.startInput() }));
    TOOLS.forEach(tl => tb.appendChild(UI.ibtn(tl.icon, t(tl.label), () => ET.setTool(tl.id), { on: ed.tool === tl.id })));
  };
  // [음표 넣기]: 고른 마디 → 없으면 처음 나오는 빈 마디(앞에 내용이 있는 마디 다음) → 그래도 없으면 지금 보이는 첫 마디
  ET.startInput = function () {
    const ed = E();
    if (Store.readonly) { UI.toast(t('읽기 전용 악보예요')); return; }
    if (ed.tool !== 'select') ET.setTool('select');
    const s = Store.score;
    let mi = null, staffId = s.staves[0].id;
    if (ed.sel && ed.sel.type === 'measure') { mi = Math.min(ed.sel.mi0, ed.sel.mi1); staffId = ed.sel.staffId || staffId; }
    else if (ed.sel && ed.sel.mi !== undefined) { mi = ed.sel.mi; staffId = ed.sel.staffId || staffId; }
    if (mi === null) {
      const empty = i => Object.keys(s.measures[i].staves).every(sid => s.measures[i].staves[sid].voices.every(v => !v.events.length));
      let last = -1;
      for (let i = 0; i < s.measures.length; i++) if (!empty(i)) last = i;
      mi = Math.min(last + 1, s.measures.length - 1);
    }
    SJ.Focus.open(mi, staffId);
  };
  let unToolBack = null;
  ET.setTool = function (id) {
    const ed = E();
    ed.tool = ed.tool === id && id !== 'select' ? 'select' : id;
    // 도구를 고른 동안 뒤로 = 도구 끝내기
    if (unToolBack) { unToolBack(); unToolBack = null; }
    if (ed.tool !== 'select') unToolBack = UI.pushBack(() => { unToolBack = null; ET.setTool('select'); });
    // 글(텍스트)은 인쇄 쪽 위에 놓이는 것이라 쪽 보기에서 넣는다 — 흘림 보기의 화면 좌표가 인쇄 배치를 망치지 않게
    const wantPage = ed.tool === 'text';
    if (wantPage !== !!ed.forcePage) {
      const keep = ed.currentMeasure();
      ed.forcePage = wantPage;
      ed.relayout();
      ed.showMeasure(keep);
      if (wantPage && ed.L && !ed.L.flow) UI.toast(t('글은 인쇄 모양 위에 넣어요 · 쪽 보기로 바꿨어요'));
    }
    ed.select(null);
    SJ.ExprTool.reset();
    ET.drawToolbar();
    if (TOOL_HINT[ed.tool]) ed.hint(t(TOOL_HINT[ed.tool]), 3500); else ed.hideHint();
    ET.drawCtx();
  };

  // ── 탭 ──
  ET.onTap = function (pt) {
    const ed = E();
    if (!pt) return;
    const ref = ed.hitAt(pt);
    const tool = ed.tool;
    // 어느 도구에서든: 제목·작곡 등은 바로 고치기, 보표 이름은 이름 메뉴
    if (ref && ref.type === 'meta' && tool !== 'text') { SJ.EditorSheets.metaSheet(ref.field); return; }
    if (ref && ref.type === 'staffName') { SJ.EditorSheets.staffNameMenu(ref); return; }
    if (tool === 'text') { if (ref && ref.type === 'text') SJ.TextTool.edit(ref.id); else SJ.TextTool.create(pt); return; }
    if (tool === 'chord') { SJ.ChordTool.atPoint(pt, ref); return; }
    if (tool === 'lyrics') { if (ref && (ref.type === 'note' || ref.type === 'lyric')) SJ.LyricsTool.start(ref.eventId, ref.verse || 1); else UI.toast(t('음표를 톡 눌러 주세요')); return; }
    if (tool === 'expr') { SJ.ExprTool.onTap(pt, ref); return; }
    if (tool === 'measure') {
      const mi = ref && ref.mi !== undefined ? ref.mi : ed.measureAt(pt);
      if (mi === null || mi === undefined) return;
      ed.select({ type: 'measure', mi0: mi, mi1: mi, staffId: ref && ref.staffId });
      SJ.EditorSheets.measureSheet([mi]);
      return;
    }
    // 선택 도구
    if (ref && ref.type === 'text') { SJ.TextTool.edit(ref.id); return; }
    if (ref && ref.type === 'chord') { SJ.ChordTool.edit(ref.mi, ref.tick); return; }
    if (ref && ref.type === 'lyric') { SJ.LyricsTool.start(ref.eventId, ref.verse); return; }
    if (ref && (ref.type === 'note' || ref.type === 'rest')) {
      ed.select({ type: 'note', eventId: ref.eventId, mi: ref.mi, staffId: ref.staffId, vi: ref.vi, head: ref.head });
      return;
    }
    const mi = ref && ref.type === 'measure' ? ref.mi : ed.measureAt(pt);
    if (mi === null || mi === undefined) { ed.select(null); return; }
    const sel = ed.sel;
    if (ed.rangeMode && sel && sel.type === 'measure') { ed.select({ type: 'measure', mi0: sel.mi0, mi1: mi, staffId: sel.staffId }); ed.rangeMode = false; return; }
    if (sel && sel.type === 'measure' && sel.mi0 === mi && sel.mi1 === mi) return;    // 같은 마디 다시 톡 = 그대로 (두 번 톡은 입력)
    ed.select({ type: 'measure', mi0: mi, mi1: mi, staffId: ref && ref.staffId ? ref.staffId : null, single: true });
  };
  ET.onDoubleTap = function (pt) {
    const ed = E();
    if (!pt || ed.tool !== 'select') return;
    const ref = ed.hitAt(pt);
    // 빈 종이(줄 사이 · 여백)를 두 번 톡 = 아무 일 없음. 마디 위일 때만 입력 모드
    const mi = ref && ref.mi !== undefined ? ref.mi : ed.measureAt(pt);
    if (mi === null || mi === undefined) return;
    if (Store.readonly) { UI.toast(t('읽기 전용 악보예요')); return; }
    SJ.Focus.open(mi, (ref && ref.staffId) || Store.score.staves[0].id, { eventId: ref && ref.eventId });
  };

  // ── 상황별 막대 ──
  ET.drawCtx = function () {
    const ed = E();
    const bar = ed.el().ctxbar;
    bar.innerHTML = '';
    const sel = ed.sel;
    ET.drawToolbar();
    if (ed.tool === 'expr') {
      SJ.ExprTool.drawBar(bar);
      // 표현 도구에서 나가는 길 (빈 곳 톡 · 뒤로도 같음)
      bar.insertBefore(h('button', { class: 'btn compact', html: SJ.icon('x') + '<span>' + U.esc(t('끝')) + '</span>', onclick: () => ET.setTool('select') }), bar.firstChild);
      bar.classList.remove('hidden');
      return;
    }
    if (!sel || ed.tool !== 'select') { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const b = (icon, label, fn, opts) => bar.appendChild(UI.ibtn(icon, t(label), fn, opts));
    if (sel.type === 'measure') {
      // 고른 마디 막대: 자주 쓰는 다섯(입력 · 복사 · 붙여넣기 · 지우기 · ⋯) — 나머지는 ⋯ 안. 고르기 해제 = 빈 곳 톡
      const a = Math.min(sel.mi0, sel.mi1), z = Math.max(sel.mi0, sel.mi1);
      bar.appendChild(h('span', { class: 'cap', text: a === z ? t('{n}마디', { n: a + 1 }) : t('{a}–{b}마디', { a: a + 1, b: z + 1 }) }));
      bar.appendChild(h('button', { class: 'btn primary compact', html: SJ.icon('edit') + '<span>' + U.esc(t('입력')) + '</span>', onclick: () => ed.enterFocusFromSel() }));
      b('copy', '복사', () => { ed.clip = O.copyMeasures(Store.score, a, z); UI.toast(t('{n}마디를 복사했어요', { n: z - a + 1 })); ET.drawCtx(); });
      b('paste', '붙여넣기', () => { if (!ed.clip) return; ed.apply(t('붙여넣었어요'), s => O.pasteMeasures(s, a, ed.clip)); }, { disabled: !ed.clip });
      b('erase', '내용 지우기', () => ed.apply(t('마디 내용을 지웠어요'), s => O.clearMeasures(s, a, z)));
      b('more', '더보기', () => ET.measureMenu(a, z));
    } else if (sel.type === 'note') {
      const f = SJ.Score.findEvent(Store.score, sel.eventId);
      if (!f) { ed.select(null); return; }
      bar.appendChild(h('span', { class: 'cap', text: f.ev.kind === 'note' ? f.ev.heads.map(SJ.Pitch.name).join(' · ') : t('쉼표') }));
      // 손글씨로 넣은 '확실하지 않은' 기호(주황): 막대 맨 앞에서 바로 후보 그림으로 고치기(색으로만 보이던 것 · 점검원 ③ 11-02)
      if (f.ev['x-check'] && f.ev['x-cands']) bar.appendChild(h('button', { class: 'btn warn compact', text: t('확인 필요 · 후보 보기'), onclick: e => {
        e.currentTarget.disabled = true;   // 두 번 눌러 화면 · 창이 두 번 열리지 않게
        SJ.Focus.open(f.mi, f.staffId, { eventId: f.ev.id });
        setTimeout(() => { if (SJ.Handwriting && SJ.Focus.st && SJ.Focus.st.mi === f.mi) SJ.Handwriting.fixEvent(f.ev.id); }, 350);
      } }));
      b('edit', '입력', () => SJ.Focus.open(f.mi, f.staffId, { eventId: f.ev.id }));
      if (f.ev.kind === 'note') {
        b('lyrics', '가사', () => SJ.LyricsTool.start(f.ev.id, 1));
        b('chord', '코드', () => SJ.ChordTool.edit(f.mi, SJ.Dur.voiceStarts(Store.score.measures[f.mi].staves[f.staffId].voices[f.vi]).starts[f.ei]));
        b('expr', '표현', () => SJ.ExprTool.quickMenu(f.ev.id));
      }
      b('trash', '지우기', () => {
        ed.select(null);
        ed.apply(t('지웠어요'), s => O.editMeasure(s, f.mi, m => { const v = m.staves[f.staffId].voices[f.vi]; SJ.MeasureEdit.remove(v, f.ei); }));
      });
    }
  };
  function range(a, z) { const r = []; for (let i = a; i <= z; i++) r.push(i); return r; }
  // 고른 마디의 ⋯ : 자주 안 쓰는 마디 일
  ET.measureMenu = function (a, z) {
    const ed = E();
    const m = Store.score.measures[z];
    UI.menu(a === z ? t('{n}마디', { n: a + 1 }) : t('{a}–{b}마디', { a: a + 1, b: z + 1 }), [
      { icon: 'range', label: t('여러 마디 고르기'), sub: t('끝 마디를 톡 하면 범위가 잡혀요'), onClick: () => { ed.rangeMode = true; ed.hint(t('끝 마디를 톡 하면 범위가 잡혀요'), 3000); } },
      { icon: 'measure', label: t('마디 속성'), sub: t('박자 · 조표 · 반복 · 괄호 · 마커'), onClick: () => SJ.EditorSheets.measureSheet(range(a, z)) },
      { icon: 'cut', label: t('잘라내기'), onClick: () => { ed.clip = O.copyMeasures(Store.score, a, z); ed.apply(t('잘라냈어요'), s => O.clearMeasures(s, a, z)); } },
      { icon: 'insert', label: t('앞에 빈 마디 넣기'), onClick: () => ed.apply(t('마디를 넣었어요'), s => O.insertMeasures(s, a, z - a + 1)) },
      { icon: 'plus', label: t('끝에 마디 더하기'), onClick: () => ed.apply(t('끝에 마디를 더했어요'), s => O.appendMeasures(s, 1)) },
      { icon: 'wrap', label: m.attrs.systemBreak ? t('줄바꿈 풀기') : t('이 마디 뒤에서 줄바꿈'), onClick: () => ed.apply(m.attrs.systemBreak ? t('줄바꿈을 풀었어요') : t('다음 마디부터 새 줄'), s => O.setMeasureAttrs(s, [z], { systemBreak: m.attrs.systemBreak ? null : true })) },
      { icon: 'pagebreak', label: m.attrs.pageBreak ? t('쪽바꿈 풀기') : t('이 마디 뒤에서 쪽바꿈'), onClick: () => ed.apply(m.attrs.pageBreak ? t('쪽바꿈을 풀었어요') : t('다음 마디부터 새 쪽'), s => O.setMeasureAttrs(s, [z], { pageBreak: m.attrs.pageBreak ? null : true })) },
      { icon: 'transpose', label: t('조옮김'), onClick: () => SJ.EditorSheets.transposeSheet(a, z) },
      { icon: 'trash', label: t('마디 삭제'), danger: true, onClick: async () => {
        const n = z - a + 1;
        if (n >= Store.score.measures.length && !(await UI.confirm(t('모든 마디를 지울까요?'), t('빈 마디 하나만 남아요.'), { ok: t('지우기'), danger: true }))) return;
        ed.select(null);
        ed.apply(t('{n}마디를 지웠어요', { n }), s => O.deleteMeasures(s, a, z));
      } }
    ]);
  };

  // 쪽 추가 (§7-3): 한 쪽 분량의 빈 마디를 끝에 붙인다
  ET.addPage = function () {
    const ed = E();
    const L = ed.L;
    const perPage = L.pages.length ? Math.max(4, Object.keys(L.measureBox).filter(k => L.measureBox[k].page === 0).length) : 16;
    const n = ed.L.pages.length > 1 ? Object.keys(L.measureBox).filter(k => L.measureBox[k].page === L.pages.length - 2).length || perPage : perPage;
    ed.apply(t('한 쪽을 더했어요'), s => O.appendMeasures(s, n));
    setTimeout(() => ed.goPage(ed.L.pages.length - 1), 50);
  };
  ET.deletePage = async function (pi) {
    const ed = E();
    const mis = Object.keys(ed.L.measureBox).filter(k => ed.L.measureBox[k].page === pi).map(Number);
    if (!mis.length) return;
    if (!(await UI.confirm(t('{p}쪽을 지울까요?', { p: pi + 1 }), t('이 쪽의 {n}마디가 지워져요. 되돌리기로 살릴 수 있어요.', { n: mis.length }), { ok: t('쪽 지우기'), danger: true }))) return;
    ed.select(null);
    ed.apply(t('{p}쪽을 지웠어요', { p: pi + 1 }), s => O.deleteMeasures(s, Math.min(...mis), Math.max(...mis)));
  };

  // ── 더보기 (§7-3): 악보 모드는 편집 도구와 멀리 떨어진 여기에 ──
  ET.moreMenu = function () {
    const ed = E();
    // 자주 쓰는 것부터. (위 막대엔 되돌리기만 — 다시 실행 · 정렬 · 보기 바꾸기도 여기)
    const flow = ed.L && ed.L.flow;
    const ag = Store.score.layout.alignGrid || {};
    UI.menu(t('더보기'), [
      { icon: 'export', label: t('PDF · 인쇄 · 공유'), sub: t('PDF · 이미지 · MusicXML · MIDI'), onClick: () => SJ.ExportSheet.open(Store.score, ed.printPage()) },
      { icon: 'play', label: t('악보 모드로 보기'), sub: t('연주용 전체 화면'), onClick: () => SJ.App.openPerformance(Store.score.id, 'editor') },
      { icon: 'page', label: flow ? t('쪽 보기 (인쇄 모양)') : t('흘림 보기 (크게)'), sub: flow ? t('종이에 찍힐 모양 그대로 봐요') : t('화면 폭에 맞춰 오선을 크게 봐요'), onClick: () => {
        // 보던 마디를 그대로 보여 준다(1쪽으로 튀지 않게). 기기에 맞는 기본값과 같아지면 '자동'으로 되돌림
        const keep = ed.currentMeasure();
        const next = flow ? 'page' : 'flow';
        SJ.Settings.set('editView', next === (ed.autoFlow() ? 'flow' : 'page') ? 'auto' : next);
        ed.relayout(); ed.showMeasure(keep);
      } },
      { icon: 'redo', label: t('다시 실행'), onClick: () => ed.redo() },
      { icon: 'align', label: ag.enabled ? t('세로줄 정렬 · 켜짐') : t('세로줄 정렬 · 꺼짐'), sub: t('줄마다 마디 수 · 같은 폭 (인쇄 모양)'), onClick: () => SJ.EditorSheets.alignPopover(null) },
      { icon: 'send', label: t('이 악보 다른 기기로 보내기'), sub: t('.sabojak 파일 · 카톡 · 메일 · AirDrop'), onClick: () => SJ.ExportSheet.sendSabojak(Store.score) },
      { icon: 'info', label: t('악보 정보'), sub: t('제목 · 부제 · 작곡 · 작사 · 편곡 · 저작권'), onClick: () => SJ.EditorSheets.metaSheet() },
      { icon: 'staves', label: t('보표 · 악기 구성'), sub: t('보표 더하기·빼기 · 음자리표 · 이름'), onClick: () => SJ.EditorSheets.stavesSheet() },
      { icon: 'page', label: t('페이지 설정'), sub: t('용지 · 여백 · 보표 크기 · 쪽 번호 · 머리글'), onClick: () => SJ.EditorSheets.pageSheet() },
      { icon: 'transpose', label: t('조옮김'), onClick: () => SJ.EditorSheets.transposeSheet(0, Store.score.measures.length - 1) },
      { icon: 'template', label: t('템플릿으로 저장'), onClick: () => SJ.Templates.saveFromScore(Store.score) },
      flow ? null : { icon: 'trash', label: t('이 쪽 지우기'), sub: t('{p}쪽', { p: ed.page + 1 }), onClick: () => ET.deletePage(ed.page) },
      { icon: 'help', label: t('사용법'), onClick: () => SJ.Help.open() },
      { icon: 'settings', label: t('설정'), onClick: () => SJ.App.openSettings() }
    ]);
  };

  SJ.EditorTools = ET;
})(window.SJ = window.SJ || {});
