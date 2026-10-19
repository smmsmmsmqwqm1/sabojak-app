/* 편집 시트 2: 마디 속성 (박자 · 조표 · 템포 · 세로줄 · 도돌이 · 괄호 · 마커 · 리허설 · 못갖춘마디 · 음자리표 변경) · 조옮김 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, Store = SJ.Store, O = SJ.Ops, P = SJ.Pitch, S = SJ.Score;
  const ES = SJ.EditorSheets;
  const E = () => SJ.Editor;
  const MARKERS = [['segno', '세뇨 𝄋'], ['coda', '코다 𝄌'], ['fine', 'Fine'], ['dc', 'D.C.'], ['ds', 'D.S.'], ['toCoda', 'To Coda'],
    ['dcAlFine', 'D.C. al Fine'], ['dcAlCoda', 'D.C. al Coda'], ['dsAlFine', 'D.S. al Fine'], ['dsAlCoda', 'D.S. al Coda']];

  ES.measureSheet = function (mis) {
    if (!mis || !mis.length) return;
    const s = Store.score;
    const mi = mis[0];
    const m = s.measures[mi];
    const a = U.clone(m.attrs);
    const st = { clefs: {} };
    const tkey = v => v ? v.num + '/' + v.den + (v.symbol || '') : '';
    const TIMES = SJ.NewScore.TIMES;

    // 박자
    const curTime = S.timeAt(s, mi);
    const timeChips = UI.chips([{ label: t('이어감'), value: '' }].concat(TIMES.map(x => ({ label: x.label, value: tkey(x.v) }))), a.time ? tkey(a.time) : '',
      v => { a.time = v ? U.clone(TIMES.find(x => tkey(x.v) === v).v) : null; customNum.set(a.time ? a.time.num : curTime.num); });
    let cNum = curTime.num, cDen = curTime.den;
    const customNum = UI.stepper(cNum, 1, 32, v => { cNum = v; a.time = { num: cNum, den: cDen }; timeChips.set(''); }, v => t('{n}박', { n: v }));
    customNum.set = () => {};
    const denSeg = UI.seg([2, 4, 8, 16].map(d => ({ label: '/' + d, value: d })), cDen, v => { cDen = v; a.time = { num: cNum, den: cDen }; timeChips.set(''); });
    // 조표
    const curKey = S.keyAt(s, mi);
    const keyOpts = [{ label: t('이어감'), value: 99 }].concat([0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7].map(f => ({ label: P.keyName({ fifths: f, mode: (a.key || curKey).mode }, SJ.getLang()), value: f })));
    const keyChips = UI.chips(keyOpts, a.key ? a.key.fifths : 99, v => { a.key = v === 99 || v === null ? null : { fifths: v, mode: (a.key || curKey).mode }; });
    const modeSeg = UI.seg([{ label: t('장조'), value: 'major' }, { label: t('단조'), value: 'minor' }], (a.key || curKey).mode, v => { if (a.key) a.key.mode = v; else a.key = { fifths: curKey.fifths, mode: v }; });
    // 템포
    const tp = a.tempo || {};
    const tText = h('input', { class: 'field', value: tp.text || '', placeholder: t('빠르기 글 (예: Allegro)'), style: { flex: 1 } });
    const tBpm = h('input', { class: 'field', type: 'number', inputmode: 'numeric', value: tp.bpm || '', placeholder: 'BPM', style: { width: '86px' } });
    let beatUnit = U.clone(tp.beatUnit || { type: 'quarter', dots: 0 });
    const unitChips = UI.chips([['quarter', 0, '♩'], ['quarter', 1, '♩.'], ['half', 0, '𝅗𝅥'], ['eighth', 0, '♪']].map(x => ({ label: x[2], value: x[0] + x[1] })), beatUnit.type + beatUnit.dots,
      v => { if (v) beatUnit = { type: v.slice(0, -1), dots: Number(v.slice(-1)) }; });
    // 세로줄 · 도돌이 · 괄호
    const barSeg = UI.seg([['single', '보통'], ['double', '겹'], ['final', '끝'], ['dashed', '점선'], ['none', '없음']].map(x => ({ label: t(x[1]), value: x[0] })), a.barlineEnd || 'single', v => { a.barlineEnd = v; });
    const rep = UI.chips([{ label: t('도돌이 시작 𝄆'), value: 'start' }, { label: t('도돌이 끝 𝄇'), value: 'end' }], [a.repeatStart ? 'start' : null, a.repeatEnd ? 'end' : null].filter(Boolean),
      v => { a.repeatStart = v.indexOf('start') >= 0; a.repeatEnd = v.indexOf('end') >= 0; }, { multi: true });
    const vk = a.volta && a.volta.numbers ? a.volta.numbers.join(',') : '';
    const voltaChips = UI.chips([{ label: t('없음'), value: '' }, { label: '1.', value: '1' }, { label: '2.', value: '2' }, { label: '3.', value: '3' }, { label: '1. 2.', value: '1,2' }], vk,
      v => { a.volta = v ? { numbers: v.split(',').map(Number), open: !!(a.volta && a.volta.open) } : null; });
    const openSw = UI.switch(!!(a.volta && a.volta.open), v => { if (a.volta) a.volta.open = v; });
    // 마커 · 리허설
    const markChips = UI.chips(MARKERS.map(x => ({ label: t(x[1]), value: x[0] })), (a.markers || []).map(x => x.type), v => { a.markers = v.map(type => ({ type })); }, { multi: true });
    const reh = h('input', { class: 'field', value: a.rehearsal || '', placeholder: t('예: A'), style: { width: '90px' } });
    const nextReh = () => {
      let last = '';
      s.measures.slice(0, mi).forEach(x => { if (x.attrs.rehearsal) last = x.attrs.rehearsal; });
      if (/^[A-Y]$/.test(last)) return String.fromCharCode(last.charCodeAt(0) + 1);
      if (/^\d+$/.test(last)) return String(Number(last) + 1);
      return 'A';
    };
    // 음자리표 변경 (보표마다)
    const clefRows = s.staves.map(stf => {
      const sel = h('select', { class: 'field', style: { flex: 1 } }, [h('option', { value: '', text: t('바꾸지 않음') })].concat(P.CLEF_IDS.map(c => h('option', { value: c, text: SJ.getLang() === 'en' ? P.CLEFS[c].labelEn : t(P.CLEFS[c].label) }))));
      sel.value = (m.staves[stf.id] && m.staves[stf.id].clefChange) || '';
      sel.addEventListener('change', () => { st.clefs[stf.id] = sel.value; });
      return h('div', { class: 'row', style: { marginTop: '6px' } }, [h('span', { class: 'small', style: { width: '80px' }, text: stf.name || t('보표 {n}', { n: s.staves.indexOf(stf) + 1 }) }), sel]);
    });
    const flags = UI.chips([{ label: t('못갖춘마디'), value: 'pickup' }, { label: t('마디 번호 숨김'), value: 'hideNumber' }, { label: t('여기서 줄바꿈'), value: 'systemBreak' }, { label: t('여기서 쪽바꿈'), value: 'pageBreak' }],
      ['pickup', 'hideNumber', 'systemBreak', 'pageBreak'].filter(k => a[k]), v => { ['pickup', 'hideNumber', 'systemBreak', 'pageBreak'].forEach(k => { a[k] = v.indexOf(k) >= 0; }); }, { multi: true });

    const body = [
      h('p', { class: 'small muted', style: { margin: '0 0 4px' }, text: mis.length > 1 ? t('{a}–{b}마디 ({n}개)에 적용해요', { a: mis[0] + 1, b: mis[mis.length - 1] + 1, n: mis.length }) : t('{n}번째 마디', { n: mi + 1 }) }),
      h('label', { class: 'lab', text: t('박자 (이 마디부터)') }), timeChips, h('div', { class: 'row', style: { marginTop: '8px' } }, [h('span', { class: 'small muted', text: t('직접:') }), customNum, denSeg]),
      h('label', { class: 'lab', text: t('조표 (이 마디부터)') }), modeSeg, h('div', { style: { height: '8px' } }), keyChips,
      h('label', { class: 'lab', text: t('빠르기') }), h('div', { class: 'row' }, [tText, tBpm]), h('div', { style: { height: '6px' } }), unitChips,
      h('label', { class: 'lab', text: t('끝 세로줄') }), barSeg,
      h('label', { class: 'lab', text: t('도돌이표') }), rep,
      h('label', { class: 'lab', text: t('반복 괄호 (1·2번)') }), voltaChips, h('div', { class: 'row', style: { marginTop: '8px' } }, [h('div', { class: 'grow small', text: t('오른쪽 끝 열기 (마지막 괄호)') }), openSw]),
      h('label', { class: 'lab', text: t('표시 (세뇨 · 코다 · D.C. · D.S. · Fine)') }), markChips,
      h('label', { class: 'lab', text: t('리허설 마크') }), h('div', { class: 'row' }, [reh, h('button', { class: 'btn soft', text: t('다음 글자'), onclick: () => { reh.value = nextReh(); } })]),
      h('label', { class: 'lab', text: t('음자리표 바꾸기 (이 마디부터)') })].concat(clefRows, [
      h('label', { class: 'lab', text: t('기타') }), flags
    ]);
    const save = h('button', { class: 'btn primary', text: t('적용') });
    const sh = UI.sheet({ title: t('마디 속성'), body, foot: [save] });
    save.addEventListener('click', () => {
      const tempo = (tText.value.trim() || Number(tBpm.value)) ? { text: U.nfc(tText.value.trim()), bpm: Number(tBpm.value) || undefined, beatUnit } : null;
      E().apply(t('마디 속성을 바꿨어요'), sc => {
        let x = sc;
        x = O.editMeasures(x, mis, (mm, k) => {
          const first = k === mis[0];
          if (first) {
            if (a.time && (mi === 0 || tkey(a.time) !== tkey(S.timeAt(sc, mi - 1)))) mm.attrs.time = a.time; else if (mi > 0) delete mm.attrs.time;
            if (mi === 0 && !mm.attrs.time) mm.attrs.time = S.timeAt(sc, 0);
            if (a.key) mm.attrs.key = a.key; else if (mi > 0) delete mm.attrs.key;
            if (tempo) mm.attrs.tempo = tempo; else delete mm.attrs.tempo;
            if (U.nfc(reh.value.trim())) mm.attrs.rehearsal = U.nfc(reh.value.trim()); else delete mm.attrs.rehearsal;
            mm.attrs.repeatStart = !!a.repeatStart; if (!mm.attrs.repeatStart) delete mm.attrs.repeatStart;
            mm.attrs.markers = (a.markers || []).filter(q => q.type === 'segno' || q.type === 'coda').concat(mis.length === 1 ? (a.markers || []).filter(q => q.type !== 'segno' && q.type !== 'coda') : []);
            Object.keys(st.clefs).forEach(sid => { if (mm.staves[sid]) { if (st.clefs[sid]) mm.staves[sid].clefChange = st.clefs[sid]; else delete mm.staves[sid].clefChange; } });
            ['pickup'].forEach(f => { if (a[f]) mm.attrs[f] = true; else delete mm.attrs[f]; });
          }
          const last = k === mis[mis.length - 1];
          if (last) {
            mm.attrs.barlineEnd = a.barlineEnd || 'single';
            mm.attrs.repeatEnd = !!a.repeatEnd; if (!mm.attrs.repeatEnd) delete mm.attrs.repeatEnd;
            if (mis.length > 1) mm.attrs.markers = (mm.attrs.markers || []).filter(q => q.type === 'segno' || q.type === 'coda').concat((a.markers || []).filter(q => q.type !== 'segno' && q.type !== 'coda'));
            ['systemBreak', 'pageBreak'].forEach(f => { if (a[f]) mm.attrs[f] = true; else delete mm.attrs[f]; });
          }
          if (a.volta) mm.attrs.volta = U.clone(a.volta); else delete mm.attrs.volta;
          if (a.hideNumber) mm.attrs.hideNumber = true; else delete mm.attrs.hideNumber;
        });
        return x;
      });
      sh.close();
    });
  };

  // ── 조옮김 (§7-6) ──
  ES.transposeSheet = function (from, to) {
    const s = Store.score;
    const n = s.measures.length;
    let rng = (from === 0 && to === n - 1) ? 'all' : 'sel';
    let mode = 'semi', semis = 2, target = null;
    const fromKey = S.keyAt(s, from);
    const preview = h('div', { class: 'small', style: { marginTop: '12px', lineHeight: 1.6, padding: '10px 12px', borderRadius: '12px', background: 'var(--surface-2)' } });
    const iv = () => mode === 'semi' ? P.intervalForSemitones(fromKey.fifths, semis) : Object.assign(P.intervalBetweenKeys(fromKey.fifths, target === null ? fromKey.fifths : target, dir), { fifths: target });
    let dir = 'auto';
    const update = () => {
      const a = rng === 'all' ? 0 : from, z = rng === 'all' ? n - 1 : to;
      const r = O.rangeOf(s, a, z);
      const v = iv();
      if (!r.lo) { preview.textContent = t('이 범위에는 음표가 없어요. 조표와 코드만 바뀌어요.'); return; }
      const lo2 = P.transposeHead(r.lo, v.steps, v.semis), hi2 = P.transposeHead(r.hi, v.steps, v.semis);
      const warn = P.midi(hi2) > 96 || P.midi(lo2) < 28;
      preview.innerHTML = U.esc(t('새 조: {k}', { k: P.keyName({ fifths: SJ.Ops._shiftKey(fromKey.fifths, v), mode: fromKey.mode }, SJ.getLang()) })) + '<br>' +
        U.esc(t('가장 낮은 음 {a} → {b}', { a: P.name(r.lo), b: P.name(lo2) })) + '<br>' + U.esc(t('가장 높은 음 {a} → {b}', { a: P.name(r.hi), b: P.name(hi2) })) +
        (warn ? '<br><b style="color:var(--apricot-ink)">' + U.esc(t('⚠ 음역이 많이 벗어나요. 옥타브를 함께 조정해 보세요.')) + '</b>' : '');
    };
    const rngSeg = UI.seg([{ label: t('선택한 마디 ({a}–{b})', { a: from + 1, b: to + 1 }), value: 'sel' }, { label: t('악보 전체'), value: 'all' }], rng, v => { rng = v; update(); });
    const semiStep = UI.stepper(semis, -24, 24, v => { semis = v; update(); }, v => (v > 0 ? '+' : '') + v + t('반음'));
    const keyChips = UI.chips([0, 1, 2, 3, 4, 5, 6, 7, -1, -2, -3, -4, -5, -6, -7].map(f => ({ label: P.keyName({ fifths: f, mode: fromKey.mode }, SJ.getLang()), value: f })), null, v => { target = v; update(); });
    const dirSeg = UI.seg([{ label: t('가까운 쪽'), value: 'auto' }, { label: t('위로'), value: 'up' }, { label: t('아래로'), value: 'down' }], dir, v => { dir = v; update(); });
    const semiBox = h('div', {}, [semiStep]);
    const keyBox = h('div', { style: { display: 'none' } }, [keyChips, h('div', { style: { height: '8px' } }), dirSeg]);
    const modeSeg = UI.seg([{ label: t('반음 단위'), value: 'semi' }, { label: t('조 지정'), value: 'key' }], mode, v => { mode = v; semiBox.style.display = v === 'semi' ? '' : 'none'; keyBox.style.display = v === 'key' ? '' : 'none'; update(); });
    const go = h('button', { class: 'btn primary', text: t('조옮김') });
    const sh = UI.sheet({ title: t('조옮김'), body: [h('label', { class: 'lab', text: t('범위') }), rngSeg, h('label', { class: 'lab', text: t('방식') }), modeSeg, h('div', { style: { height: '10px' } }), semiBox, keyBox, preview], foot: [go] });
    update();
    go.addEventListener('click', () => {
      if (mode === 'key' && target === null) { UI.toast(t('옮길 조를 골라 주세요')); return; }
      const a = rng === 'all' ? 0 : from, z = rng === 'all' ? n - 1 : to;
      const v = iv();
      E().apply(t('조옮김 했어요'), sc => O.transpose(sc, a, z, v));
      sh.close();
    });
  };
})(window.SJ = window.SJ || {});
