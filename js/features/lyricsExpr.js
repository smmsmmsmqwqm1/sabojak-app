/* 가사 도구 (§7-5) · 표현 도구 (셈여림 · 아티큘레이션 · 장식 · 헤어핀 · 이음줄 · 8va) */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store, O = SJ.Ops, S = SJ.Score;
  const E = () => SJ.Editor;

  // ── 가사: 음표를 고르고 입력 → [다음](띄어쓰기·하이픈 키도 같음) ──
  const LT = {};
  let bar = null;
  // 같은 보표·성부의 다음 음표 (쉼표·꾸밈음·붙임줄 이어진 음은 건너뜀)
  LT.nextNote = function (score, eventId) {
    const f = S.findEvent(score, eventId);
    if (!f) return null;
    let mi = f.mi, ei = f.ei + 1;
    let prev = f.ev;
    while (mi < score.measures.length) {
      const sm = score.measures[mi].staves[f.staffId];
      const v = sm && sm.voices[f.vi];
      if (v) {
        for (; ei < v.events.length; ei++) {
          const ev = v.events[ei];
          const tiedIn = prev && prev.kind === 'note' && ev.kind === 'note' && prev.heads.some(p => p.tieNext);
          prev = ev;
          if (ev.kind === 'note' && !ev.grace && !tiedIn) return ev.id;
        }
      }
      mi++; ei = 0;
    }
    return null;
  };
  LT.start = function (eventId, verse) {
    LT.stop();
    let cur = eventId, cont = false;
    verse = verse || 1;
    const ed = E();
    const f0 = S.findEvent(Store.score, eventId);
    if (!f0 || f0.ev.kind !== 'note') { UI.toast(t('음표를 톡 눌러 주세요')); return; }
    const info = h('span', { class: 'cap' });
    const inp = h('input', { class: 'field', style: { flex: 1, minWidth: '80px', fontSize: '17px' }, placeholder: t('가사'), enterkeyhint: 'next', autocapitalize: 'off', autocomplete: 'off' });
    const verseBtn = h('button', { class: 'chip on' });
    bar = h('div', { class: 'ctxbar', style: { gap: '6px', padding: '8px' } }, [info, verseBtn, inp,
      h('button', { class: 'btn soft', text: '−', title: t('음절 잇기(하이픈)'), onclick: () => commit('hyphen') }),
      h('button', { class: 'btn soft', text: '__', title: t('늘임줄'), onclick: () => commit('extend') }),
      h('button', { class: 'btn primary', html: U.esc(t('다음')) + SJ.icon('right'), onclick: () => commit('space') }),
      h('button', { class: 'btn', text: t('완료'), onclick: () => { commit('stay'); LT.stop(); } })]);
    ed.el().ctxbar.after(bar);
    ed.el().ctxbar.classList.add('hidden');
    const show = () => {
      const f = S.findEvent(Store.score, cur);
      if (!f) { LT.stop(); return; }
      ed.select({ type: 'note', eventId: cur, mi: f.mi, staffId: f.staffId, vi: f.vi });
      ed.el().ctxbar.classList.add('hidden');
      const pos = ed.L.eventPos[cur];
      if (pos) ed.reveal(pos);                     // 쪽 보기는 그 쪽으로 · 흘림 보기는 그 음이 보이게 스크롤
      info.textContent = t('{n}번 마디', { n: f.mi + 1 }) + ' · ' + f.ev.heads.map(SJ.Pitch.name).join(' ');
      const l = (f.ev.lyrics || []).find(x => x.verse === verse);
      inp.value = l ? l.text : '';
      verseBtn.textContent = t('{n}절', { n: verse });
      setTimeout(() => { inp.focus(); inp.select(); }, 30);
    };
    verseBtn.addEventListener('click', () => {
      commit('stay');
      const max = maxVerse();
      verse = verse >= max + 1 || verse >= 8 ? 1 : verse + 1;
      show();
    });
    function maxVerse() { let m = 1; S.forEachEvent(Store.score, ev => (ev.lyrics || []).forEach(l => { m = Math.max(m, l.verse); })); return m; }
    function commit(kind) {
      const text = U.nfc(inp.value.replace(/[\s\-]+$/, '').trim());
      const hyphen = kind === 'hyphen';
      const syl = cont ? (hyphen ? 'middle' : 'end') : (hyphen ? 'begin' : 'single');
      const f = S.findEvent(Store.score, cur);
      const old = f && (f.ev.lyrics || []).find(x => x.verse === verse);
      if (text !== (old ? old.text : '') || (old && old.syllabic !== syl && text) || kind === 'extend') {
        Store.apply(t('가사'), sc => O.setLyric(sc, cur, verse, text ? { text, syllabic: syl, extend: kind === 'extend' } : null));
      }
      if (kind === 'stay') return;
      cont = hyphen;
      const nx = LT.nextNote(Store.score, cur);
      if (!nx) { UI.toast(t('마지막 음표예요')); LT.stop(); return; }
      cur = nx; show();
    }
    inp.addEventListener('keydown', e => {
      if (e.isComposing) return;
      if (e.key === 'Enter') { e.preventDefault(); commit('space'); }
      else if (e.key === 'Backspace' && !inp.value) {
        // 빈 칸에서 지우기 = 앞 음표로
        const prevId = prevNote(cur);
        if (prevId) { e.preventDefault(); cur = prevId; cont = false; show(); }
      }
    });
    // 띄어쓰기·하이픈은 글자 조합이 끝난 뒤 판단 (한글 입력기 대응)
    const check = () => {
      const v = inp.value;
      if (/\s$/.test(v) && v.trim()) { inp.value = v.trim(); commit('space'); }
      else if (/-$/.test(v) && v.length > 1) { inp.value = v.slice(0, -1); commit('hyphen'); }
    };
    inp.addEventListener('input', e => { if (!e.isComposing) check(); });
    inp.addEventListener('compositionend', () => setTimeout(check, 0));
    function prevNote(id) {
      let prev = null;
      const f = S.findEvent(Store.score, id);
      if (!f) return null;
      S.forEachEvent(Store.score, (ev, c) => { if (c.staffId === f.staffId && c.vi === f.vi && ev.kind === 'note' && !ev.grace && (c.mi < f.mi || (c.mi === f.mi && c.ei < f.ei))) prev = ev.id; });
      return prev;
    }
    LT.unBack = UI.pushBack(() => LT.stop(true));
    show();
  };
  LT.stop = function (fromBack) {
    if (!bar) return;
    bar.remove(); bar = null;
    if (!fromBack && LT.unBack) LT.unBack();
    LT.unBack = null;
    E().select(null);
  };
  SJ.LyricsTool = LT;

  // ── 표현 ──
  const XT = {};
  const ITEMS = [
    { g: 'dyn', v: 'pp' }, { g: 'dyn', v: 'p' }, { g: 'dyn', v: 'mp' }, { g: 'dyn', v: 'mf' }, { g: 'dyn', v: 'f' }, { g: 'dyn', v: 'ff' }, { g: 'dyn', v: 'sfz' }, { g: 'dyn', v: 'fp' },
    { g: 'art', v: 'staccato', glyph: 'articStaccatoAbove', label: '스타카토' }, { g: 'art', v: 'accent', glyph: 'articAccentAbove', label: '악센트' },
    { g: 'art', v: 'tenuto', glyph: 'articTenutoAbove', label: '테누토' }, { g: 'art', v: 'marcato', glyph: 'articMarcatoAbove', label: '마르카토' },
    { g: 'art', v: 'fermata', glyph: 'fermataAbove', label: '페르마타' }, { g: 'art', v: 'trill', glyph: 'ornamentTrill', label: '트릴' }, { g: 'art', v: 'mordent', glyph: 'ornamentMordent', label: '모르덴트' },
    { g: 'span', v: 'cresc', label: '크레셴도', text: '<' }, { g: 'span', v: 'dim', label: '디크레셴도', text: '>' }, { g: 'span', v: 'slur', label: '이음줄', text: '⌒' },
    { g: 'span', v: '8va', glyph: 'ottavaAlta', label: '8va' }, { g: 'span', v: '8vb', glyph: 'ottavaBassaVb', label: '8vb' }
  ];
  XT.ITEMS = ITEMS;
  let pick = null, pendingStart = null;
  XT.reset = function () { pick = null; pendingStart = null; };
  const icon = it => it.g === 'dyn' ? UI.glyphSvg(SJ.Decor.dynGlyph(it.v), 22) : it.glyph ? UI.glyphSvg(it.glyph, 20) : '<b style="font-size:20px">' + it.text + '</b>';
  XT.drawBar = function (barEl) {
    ITEMS.forEach(it => {
      const b = UI.ibtn(null, t(it.label || it.v), () => { pick = pick === it ? null : it; pendingStart = null; SJ.EditorTools.drawCtx(); E().hint(pick ? (pick.g === 'span' ? t('시작 음표를 톡') : t('붙일 음표를 톡 (다시 톡 하면 빼기)')) : t('표현을 골라 주세요'), 3000); },
        { html: icon(it), on: pick === it });
      barEl.appendChild(b);
    });
  };
  XT.onTap = function (pt, ref) {
    if (!pick) { UI.toast(t('아래에서 표현을 먼저 골라 주세요')); return; }
    if (!ref || (ref.type !== 'note' && ref.type !== 'rest')) { UI.toast(t('음표를 톡 눌러 주세요')); return; }
    const id = ref.eventId;
    if (pick.g === 'dyn') { const f = S.findEvent(Store.score, id); E().apply(t('셈여림 {d}', { d: pick.v }), s => O.setDynamic(s, id, f && f.ev.dynamic === pick.v ? null : pick.v), true); return; }
    if (pick.g === 'art') { E().apply(t(pick.label), s => O.toggleArticulation(s, id, pick.v), true); return; }
    if (!pendingStart) { pendingStart = id; E().select({ type: 'note', eventId: id, mi: ref.mi, staffId: ref.staffId, vi: ref.vi }); E().hint(t('끝 음표를 톡'), 4000); return; }
    const a = pendingStart; pendingStart = null;
    const fa = S.findEvent(Store.score, a), fb = S.findEvent(Store.score, id);
    if (!fa || !fb) return;
    const before = fb.mi < fa.mi || (fb.mi === fa.mi && SJ.Dur.voiceStarts(Store.score.measures[fb.mi].staves[fb.staffId].voices[fb.vi]).starts[fb.ei] < SJ.Dur.voiceStarts(Store.score.measures[fa.mi].staves[fa.staffId].voices[fa.vi]).starts[fa.ei]);
    const [s0, s1] = before ? [id, a] : [a, id];
    E().apply(t(pick.label), s => O.addSpanner(s, { type: pick.v, startId: s0, endId: s1, staffId: fa.staffId }));
    E().select(null);
  };
  // 음표 하나에 빠르게 (선택 막대의 [표현])
  XT.quickMenu = function (eventId) {
    const f = S.findEvent(Store.score, eventId);
    if (!f) return;
    const body = h('div', {});
    const dyn = UI.chips(ITEMS.filter(i => i.g === 'dyn').map(i => ({ label: i.v, value: i.v })), f.ev.dynamic || null, v => E().apply(t('셈여림'), s => O.setDynamic(s, eventId, v), true), { toggle: true });
    const arts = UI.chips(ITEMS.filter(i => i.g === 'art').map(i => ({ label: t(i.label), value: i.v })), f.ev.articulations || [], v => {
      const cur = (S.findEvent(Store.score, eventId).ev.articulations || []);
      const add = v.filter(x => cur.indexOf(x) < 0), rem = cur.filter(x => v.indexOf(x) < 0);
      add.concat(rem).forEach(a => E().apply(t('표현'), s => O.toggleArticulation(s, eventId, a), true));
    }, { multi: true });
    body.append(h('label', { class: 'lab', text: t('셈여림') }), dyn, h('label', { class: 'lab', text: t('아티큘레이션 · 장식') }), arts);
    const sps = (Store.score.spanners || []).filter(sp => sp.startId === eventId || sp.endId === eventId);
    if (sps.length) {
      body.append(h('label', { class: 'lab', text: t('이 음표의 선') }));
      sps.forEach(sp => {
        const it = ITEMS.find(i => i.v === sp.type) || { label: sp.type };
        const row = h('div', { class: 'row', style: { marginBottom: '6px' } }, [h('div', { class: 'grow', text: t(it.label) }),
          sp.type === 'slur' ? h('button', { class: 'btn soft', text: t('더 둥글게'), onclick: () => E().apply(t('이음줄 높이'), s => O.updateSpanner(s, sp.id, { curve: (sp.curve || 0) + 0.6 }), true) }) : null,
          sp.type === 'slur' ? h('button', { class: 'btn soft', text: t('뒤집기'), onclick: () => E().apply(t('이음줄 방향'), s => O.updateSpanner(s, sp.id, { placement: sp.placement === 'below' ? 'above' : 'below' }), true) }) : null,
          h('button', { class: 'btn danger', text: t('지우기'), onclick: () => { E().apply(t('선을 지웠어요'), s => O.removeSpanner(s, sp.id)); row.remove(); } })]);
        body.append(row);
      });
    }
    body.append(h('p', { class: 'small muted', text: t('크레셴도 · 이음줄 · 8va 는 아래 [표현] 도구에서 시작·끝 음표를 차례로 톡 하세요.') }));
    UI.sheet({ title: t('표현 · {n}', { n: f.ev.kind === 'note' ? f.ev.heads.map(SJ.Pitch.name).join(' ') : t('쉼표') }), body: [body] });
  };
  SJ.ExprTool = XT;
})(window.SJ = window.SJ || {});
