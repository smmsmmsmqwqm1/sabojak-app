/* 편집 도구 (§7-3, §11): 지금 할 수 있는 것만 보이는 도구 막대 · 탭 처리 · 마디 편집 · 더보기 메뉴 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store, O = SJ.Ops;
  const ET = {};
  const E = () => SJ.Editor;

  const TOOLS = [
    { id: 'select', icon: 'tap', label: '선택' },
    { id: 'text', icon: 'text', label: '텍스트' },
    { id: 'chord', icon: 'chord', label: '코드' },
    { id: 'lyrics', icon: 'lyrics', label: '가사' },
    { id: 'measure', icon: 'measure', label: '마디 속성' },
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
    const tb = E().el().toolbar;
    tb.innerHTML = '';
    TOOLS.forEach(tl => tb.appendChild(UI.ibtn(tl.icon, t(tl.label), () => ET.setTool(tl.id), { on: E().tool === tl.id })));
  };
  ET.setTool = function (id) {
    const ed = E();
    ed.tool = ed.tool === id && id !== 'select' ? 'select' : id;
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
      const mi = ref && ref.mi !== undefined ? ref.mi : ed.measureNear(pt);
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
    const mi = ref && ref.type === 'measure' ? ref.mi : ed.measureNear(pt);
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
    const mi = ref && ref.mi !== undefined ? ref.mi : ed.measureNear(pt);
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
    if (ed.tool === 'expr') { SJ.ExprTool.drawBar(bar); bar.classList.remove('hidden'); return; }
    if (!sel) { bar.classList.add('hidden'); return; }
    bar.classList.remove('hidden');
    const b = (icon, label, fn, opts) => bar.appendChild(UI.ibtn(icon, t(label), fn, opts));
    if (sel.type === 'measure') {
      const a = Math.min(sel.mi0, sel.mi1), z = Math.max(sel.mi0, sel.mi1);
      bar.appendChild(h('span', { class: 'cap', text: a === z ? t('{n}번 마디', { n: a + 1 }) : t('{a}–{b}마디', { a: a + 1, b: z + 1 }) }));
      b('edit', '입력', () => ed.enterFocusFromSel());
      b('range', '범위', () => { ed.rangeMode = !ed.rangeMode; ed.hint(ed.rangeMode ? t('끝 마디를 톡 하면 범위가 잡혀요') : '', ed.rangeMode ? 3000 : 1); ET.drawCtx(); }, { on: !!ed.rangeMode });
      bar.appendChild(h('span', { class: 'sep' }));
      b('copy', '복사', () => { ed.clip = O.copyMeasures(Store.score, a, z); UI.toast(t('{n}마디를 복사했어요', { n: z - a + 1 })); ET.drawCtx(); });
      b('cut', '잘라내기', () => { ed.clip = O.copyMeasures(Store.score, a, z); ed.apply(t('잘라냈어요'), s => O.clearMeasures(s, a, z)); });
      b('paste', '붙여넣기', () => { if (!ed.clip) return; ed.apply(t('붙여넣었어요'), s => O.pasteMeasures(s, a, ed.clip)); }, { disabled: !ed.clip });
      b('erase', '내용 지우기', () => ed.apply(t('마디 내용을 지웠어요'), s => O.clearMeasures(s, a, z)));
      bar.appendChild(h('span', { class: 'sep' }));
      b('insert', '앞에 삽입', () => { ed.apply(t('마디를 넣었어요'), s => O.insertMeasures(s, a, z - a + 1)); });
      b('plus', '끝에 추가', () => { ed.apply(t('끝에 마디를 더했어요'), s => O.appendMeasures(s, 1)); });
      b('trash', '마디 삭제', async () => {
        const n = z - a + 1;
        if (n >= Store.score.measures.length && !(await UI.confirm(t('모든 마디를 지울까요?'), t('빈 마디 하나만 남아요.'), { ok: t('지우기'), danger: true }))) return;
        ed.select(null);
        ed.apply(t('{n}마디를 지웠어요', { n }), s => O.deleteMeasures(s, a, z));
      });
      bar.appendChild(h('span', { class: 'sep' }));
      const m = Store.score.measures[z];
      b('wrap', m.attrs.systemBreak ? '줄바꿈 해제' : '여기서 줄바꿈', () => ed.apply(m.attrs.systemBreak ? t('줄바꿈을 풀었어요') : t('다음 마디부터 새 줄'), s => O.setMeasureAttrs(s, [z], { systemBreak: m.attrs.systemBreak ? null : true })), { on: !!m.attrs.systemBreak });
      b('pagebreak', m.attrs.pageBreak ? '쪽바꿈 해제' : '여기서 쪽바꿈', () => ed.apply(m.attrs.pageBreak ? t('쪽바꿈을 풀었어요') : t('다음 마디부터 새 쪽'), s => O.setMeasureAttrs(s, [z], { pageBreak: m.attrs.pageBreak ? null : true })), { on: !!m.attrs.pageBreak });
      b('measure', '마디 속성', () => SJ.EditorSheets.measureSheet(range(a, z)));
      b('transpose', '조옮김', () => SJ.EditorSheets.transposeSheet(a, z));
      b('x', '선택 해제', () => ed.select(null));
    } else if (sel.type === 'note') {
      const f = SJ.Score.findEvent(Store.score, sel.eventId);
      if (!f) { ed.select(null); return; }
      bar.appendChild(h('span', { class: 'cap', text: f.ev.kind === 'note' ? f.ev.heads.map(SJ.Pitch.name).join(' · ') : t('쉼표') }));
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
      b('x', '선택 해제', () => ed.select(null));
    }
  };
  function range(a, z) { const r = []; for (let i = a; i <= z; i++) r.push(i); return r; }

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
    // 자주 쓰는 것부터. 위 막대·아래 도구 막대에 이미 있는 것(정렬·마디 속성)은 넣지 않는다
    UI.menu(t('더보기'), [
      { icon: 'play', label: t('악보 모드로 보기'), sub: t('연주용 전체 화면'), onClick: () => SJ.App.openPerformance(Store.score.id, 'editor') },
      { icon: 'export', label: t('내보내기 · 인쇄'), sub: t('PDF · 이미지 · MusicXML · MIDI'), onClick: () => SJ.ExportSheet.open(Store.score, ed.page) },
      { icon: 'send', label: t('이 악보 다른 기기로 보내기'), sub: t('.sabojak 파일 · 카톡 · 메일 · AirDrop'), onClick: () => SJ.ExportSheet.sendSabojak(Store.score) },
      { icon: 'info', label: t('악보 정보'), sub: t('제목 · 부제 · 작곡 · 작사 · 편곡 · 저작권'), onClick: () => SJ.EditorSheets.metaSheet() },
      { icon: 'staves', label: t('보표 · 악기 구성'), sub: t('보표 더하기·빼기 · 음자리표 · 이름'), onClick: () => SJ.EditorSheets.stavesSheet() },
      { icon: 'page', label: t('페이지 설정'), sub: t('용지 · 여백 · 보표 크기 · 쪽 번호 · 머리글'), onClick: () => SJ.EditorSheets.pageSheet() },
      { icon: 'transpose', label: t('조옮김'), onClick: () => SJ.EditorSheets.transposeSheet(0, Store.score.measures.length - 1) },
      { icon: 'template', label: t('템플릿으로 저장'), onClick: () => SJ.Templates.saveFromScore(Store.score) },
      { icon: 'trash', label: t('이 쪽 지우기'), sub: t('{p}쪽', { p: ed.page + 1 }), onClick: () => ET.deletePage(ed.page) },
      { icon: 'help', label: t('사용법'), onClick: () => SJ.Help.open() },
      { icon: 'settings', label: t('설정'), onClick: () => SJ.App.openSettings() }
    ]);
  };

  SJ.EditorTools = ET;
})(window.SJ = window.SJ || {});
