/* 악보 전체 단위의 불변 연산. 바뀐 마디만 새 객체로, 나머지는 같은 객체를 공유(레이아웃 캐시용). */
(function (SJ) {
  'use strict';
  const U = SJ.U, S = SJ.Score, P = SJ.Pitch;
  const O = {};

  function shallow(score) { return Object.assign({}, score, { measures: score.measures.slice() }); }
  function cloneMeasure(m) { return U.clone(m); }

  // 마디 하나 고치기 (fn 이 복제본을 직접 바꿈)
  O.editMeasure = function (score, mi, fn) {
    const s = shallow(score);
    const m = cloneMeasure(s.measures[mi]);
    fn(m);
    s.measures[mi] = m;
    return s;
  };
  O.editMeasures = function (score, list, fn) {
    const s = shallow(score);
    list.forEach(mi => { if (s.measures[mi]) { const m = cloneMeasure(s.measures[mi]); fn(m, mi); s.measures[mi] = m; } });
    return s;
  };
  O.replaceMeasure = function (score, mi, measure) {
    const s = shallow(score);
    s.measures[mi] = measure;
    return s;
  };

  O.setMeta = function (score, patch) {
    const s = shallow(score);
    s.meta = Object.assign({}, s.meta);
    Object.keys(patch).forEach(k => { s.meta[k] = typeof patch[k] === 'string' ? U.nfc(patch[k]) : patch[k]; });
    return s;
  };
  O.setPage = function (score, patch) {
    const s = shallow(score);
    s.page = Object.assign({}, s.page, patch);
    if (patch.margins) s.page.margins = Object.assign({}, score.page.margins, patch.margins);
    return s;
  };
  O.setLayout = function (score, patch) {
    const s = shallow(score);
    s.layout = Object.assign({}, s.layout, patch);
    if (patch.alignGrid) s.layout.alignGrid = Object.assign({}, score.layout.alignGrid, patch.alignGrid);
    return s;
  };

  // patch 값이 null 이면 그 속성을 지운다
  O.setMeasureAttrs = function (score, indices, patch) {
    return O.editMeasures(score, indices, m => {
      Object.keys(patch).forEach(k => {
        if (patch[k] === null || patch[k] === undefined) delete m.attrs[k];
        else m.attrs[k] = U.clone(patch[k]);
      });
    });
  };
  O.setClefChange = function (score, mi, staffId, clef) {
    return O.editMeasure(score, mi, m => {
      if (!m.staves[staffId]) return;
      if (clef) m.staves[staffId].clefChange = clef; else delete m.staves[staffId].clefChange;
    });
  };

  // 새 id 부여 (붙여넣기·복제)
  O.reId = function (measure) {
    const m = U.clone(measure);
    m.id = U.sid();
    const tmap = {};
    Object.keys(m.staves).forEach(sid => m.staves[sid].voices.forEach(v => {
      v.tuplets.forEach(t => { const n = U.sid(); tmap[t.id] = n; t.id = n; });
      v.events.forEach(ev => { ev.id = U.sid(); if (ev.dur.tuplet) ev.dur.tuplet = tmap[ev.dur.tuplet]; });
    }));
    m.chords.forEach(c => { c.id = U.sid(); });
    return m;
  };

  O.insertMeasures = function (score, at, count) {
    const s = shallow(score);
    const add = [];
    for (let i = 0; i < count; i++) add.push(S.newMeasure(s.staves));
    at = U.clamp(at, 0, s.measures.length);
    // 끝에 붙이면 끝세로줄을 새 마지막 마디로 옮김
    if (at === s.measures.length && s.measures.length) {
      const last = cloneMeasure(s.measures[at - 1]);
      if (last.attrs.barlineEnd === 'final') { last.attrs.barlineEnd = 'single'; add[add.length - 1].attrs.barlineEnd = 'final'; }
      s.measures[at - 1] = last;
    }
    // 맨 앞에 넣으면 박자·조표를 새 첫 마디로 옮김
    if (at === 0 && s.measures.length) {
      const first = cloneMeasure(s.measures[0]);
      ['time', 'key', 'tempo'].forEach(k => { if (first.attrs[k]) { add[0].attrs[k] = first.attrs[k]; delete first.attrs[k]; } });
      s.measures[0] = first;
    }
    s.measures.splice(at, 0, ...add);
    return s;
  };
  O.appendMeasures = function (score, count) { return O.insertMeasures(score, score.measures.length, count); };

  function eventIdsOf(measures) {
    const ids = new Set();
    measures.forEach(m => Object.keys(m.staves).forEach(sid => m.staves[sid].voices.forEach(v => v.events.forEach(e => ids.add(e.id)))));
    return ids;
  }

  O.deleteMeasures = function (score, from, to) {
    const n = score.measures.length;
    from = U.clamp(from, 0, n - 1); to = U.clamp(to, from, n - 1);
    if (to - from + 1 >= n) {
      // 전부 지우면 빈 마디 하나만 남김(박자·조표 유지)
      const s = O.clearMeasures(score, 0, n - 1);
      const keep = cloneMeasure(s.measures[0]);
      keep.attrs.barlineEnd = 'final';
      s.measures = [keep];
      s.spanners = []; s.texts = s.texts.filter(t => t.anchor.type === 'page');
      return s;
    }
    const s = shallow(score);
    const removed = s.measures.splice(from, to - from + 1);
    // 지운 첫 마디의 박자·조표·템포가 효력을 이어가도록 다음 마디로 옮김
    const carry = {};
    ['time', 'key'].forEach(k => {
      for (let i = removed.length - 1; i >= 0; i--) if (removed[i].attrs[k]) { carry[k] = removed[i].attrs[k]; break; }
    });
    if (from < s.measures.length) {
      const nx = cloneMeasure(s.measures[from]);
      Object.keys(carry).forEach(k => { if (!nx.attrs[k]) nx.attrs[k] = carry[k]; });
      if (from === 0 && removed[0].attrs.tempo && !nx.attrs.tempo) nx.attrs.tempo = removed[0].attrs.tempo;
      s.measures[from] = nx;
    }
    if (removed.some(m => m.attrs.barlineEnd === 'final') && from >= s.measures.length) {
      const last = cloneMeasure(s.measures[s.measures.length - 1]);
      last.attrs.barlineEnd = 'final';
      s.measures[s.measures.length - 1] = last;
    }
    const gone = eventIdsOf(removed);
    s.spanners = (s.spanners || []).filter(sp => !gone.has(sp.startId) && !gone.has(sp.endId));
    const goneM = new Set(removed.map(m => m.id));
    const target = s.measures[Math.min(from, s.measures.length - 1)];
    s.texts = (s.texts || []).map(t => (t.anchor.type === 'measure' && goneM.has(t.anchor.measureId)) ?
      Object.assign({}, t, { anchor: Object.assign({}, t.anchor, { measureId: target.id }) }) : t);
    return s;
  };

  O.clearMeasures = function (score, from, to) {
    const list = [];
    for (let i = from; i <= to; i++) list.push(i);
    const gone = eventIdsOf(list.map(i => score.measures[i]));
    const s = O.editMeasures(score, list, m => {
      Object.keys(m.staves).forEach(sid => { m.staves[sid].voices = [S.newVoice()]; });
      m.chords = [];
    });
    s.spanners = (s.spanners || []).filter(sp => !gone.has(sp.startId) && !gone.has(sp.endId));
    return s;
  };

  // 클립보드: 보표 순서 기준으로 내용 저장
  O.copyMeasures = function (score, from, to) {
    const staffOrder = score.staves.map(st => st.id);
    const items = [];
    for (let i = from; i <= to; i++) {
      const m = score.measures[i];
      items.push({ staves: staffOrder.map(id => U.clone(m.staves[id] || S.newStaffMeasure())), chords: U.clone(m.chords) });
    }
    return { kind: 'measures', items };
  };
  O.pasteMeasures = function (score, at, clip) {
    let s = score;
    const need = at + clip.items.length - s.measures.length;
    if (need > 0) s = O.appendMeasures(s, need);
    const order = s.staves.map(st => st.id);
    const list = clip.items.map((_, i) => at + i);
    const gone = eventIdsOf(list.map(i => s.measures[i]));
    s = O.editMeasures(s, list, (m, mi) => {
      const item = clip.items[mi - at];
      const fresh = O.reId({ id: '', attrs: {}, staves: Object.fromEntries(item.staves.map((sm, k) => ['k' + k, sm])), chords: item.chords });
      order.forEach((sid, k) => { m.staves[sid] = fresh.staves['k' + k] ? fresh.staves['k' + k] : S.newStaffMeasure(); });
      m.chords = fresh.chords;
    });
    s.spanners = (s.spanners || []).filter(sp => !gone.has(sp.startId) && !gone.has(sp.endId));
    return s;
  };

  // ── 조옮김 (§7-6) ─────────────────────
  // range: {from, to} (마디 번호 0부터, 포함). iv: {steps, semis}, newFifths: 새 조표(없으면 반음으로 계산)
  O.transpose = function (score, from, to, iv) {
    const list = [];
    for (let i = from; i <= to; i++) list.push(i);
    const oldKeyStart = S.keyAt(score, from);
    const oldKeyAfter = to + 1 < score.measures.length ? S.keyAt(score, to + 1) : null;
    let s = O.editMeasures(score, list, (m, mi) => {
      Object.keys(m.staves).forEach(sid => m.staves[sid].voices.forEach(v => v.events.forEach(ev => {
        if (ev.kind === 'note') ev.heads = ev.heads.map(h => P.transposeHead(h, iv.steps, iv.semis));
      })));
      m.chords.forEach(c => { c.text = SJ.Chord.transpose(c.text, iv.steps, iv.semis); });
      if (m.attrs.key) m.attrs.key = { fifths: shiftKey(m.attrs.key.fifths, iv), mode: m.attrs.key.mode };
      else if (mi === from) m.attrs.key = { fifths: shiftKey(oldKeyStart.fifths, iv), mode: oldKeyStart.mode };
    });
    // 범위 뒤 원래 조로 되돌리기
    if (oldKeyAfter && !score.measures[to + 1].attrs.key) {
      s = O.setMeasureAttrs(s, [to + 1], { key: oldKeyAfter });
    }
    return s;
  };
  function shiftKey(fifths, iv) {
    let nf = fifths + 7 * iv.semis - 12 * iv.steps;   // 온음계 이동을 반영한 조표 변화 (= 음정의 5도권 이동)
    // 음정의 5도권 값: semis*7 - steps*12 (예: 장2도 = 2*7-1*12 = 2)
    if (nf > 7) nf -= 12; if (nf < -7) nf += 12;
    return nf;
  }
  O._shiftKey = shiftKey;

  // 음역 미리보기: 범위 안 가장 낮은/높은 음 (전/후)
  O.rangeOf = function (score, from, to) {
    let lo = null, hi = null;
    for (let i = from; i <= to; i++) {
      const m = score.measures[i];
      Object.keys(m.staves).forEach(sid => m.staves[sid].voices.forEach(v => v.events.forEach(ev => {
        if (ev.kind !== 'note') return;
        ev.heads.forEach(h => { const k = P.midi(h); if (!lo || k < P.midi(lo)) lo = h; if (!hi || k > P.midi(hi)) hi = h; });
      })));
    }
    return { lo, hi };
  };

  // ── 코드·가사·표현 ────────────────────
  O.setChord = function (score, mi, tick, text) {
    return O.editMeasure(score, mi, m => {
      const i = m.chords.findIndex(c => c.tick === tick);
      if (!text) { if (i >= 0) m.chords.splice(i, 1); return; }
      const c = { id: i >= 0 ? m.chords[i].id : U.sid(), tick, text: SJ.Chord.pretty(text) };
      if (i >= 0) m.chords[i] = c; else m.chords.push(c);
      m.chords.sort((a, b) => a.tick - b.tick);
    });
  };

  function editEvent(score, eventId, fn) {
    const f = S.findEvent(score, eventId);
    if (!f) return score;
    return O.editMeasure(score, f.mi, m => fn(m.staves[f.staffId].voices[f.vi].events[f.ei], m));
  }
  O.editEvent = editEvent;

  O.setLyric = function (score, eventId, verse, lyric) {
    return editEvent(score, eventId, ev => {
      if (ev.kind !== 'note') return;
      ev.lyrics = (ev.lyrics || []).filter(l => l.verse !== verse);
      if (lyric && lyric.text) ev.lyrics.push(Object.assign({ verse }, lyric, { text: U.nfc(lyric.text) }));
      ev.lyrics.sort((a, b) => a.verse - b.verse);
      if (!ev.lyrics.length) delete ev.lyrics;
    });
  };
  O.toggleArticulation = function (score, eventId, art) {
    return editEvent(score, eventId, ev => {
      ev.articulations = ev.articulations || [];
      const i = ev.articulations.indexOf(art);
      if (i >= 0) ev.articulations.splice(i, 1); else ev.articulations.push(art);
    });
  };
  O.setDynamic = function (score, eventId, dyn) {
    return editEvent(score, eventId, ev => { if (dyn) ev.dynamic = dyn; else delete ev.dynamic; });
  };

  O.addSpanner = function (score, sp) {
    const s = shallow(score);
    s.spanners = (s.spanners || []).concat([Object.assign({ id: U.sid() }, sp)]);
    return s;
  };
  O.removeSpanner = function (score, id) {
    const s = shallow(score);
    s.spanners = (s.spanners || []).filter(x => x.id !== id);
    return s;
  };
  O.updateSpanner = function (score, id, patch) {
    const s = shallow(score);
    s.spanners = (s.spanners || []).map(x => x.id === id ? Object.assign({}, x, patch) : x);
    return s;
  };

  O.addText = function (score, t) {
    const s = shallow(score);
    s.texts = (s.texts || []).concat([Object.assign({ id: U.sid(), size: 12, bold: false, italic: false }, t, { text: U.nfc(t.text || '') })]);
    return s;
  };
  O.updateText = function (score, id, patch) {
    const s = shallow(score);
    s.texts = (s.texts || []).map(t => t.id === id ? Object.assign({}, t, patch, patch.text !== undefined ? { text: U.nfc(patch.text) } : {}) : t);
    return s;
  };
  O.removeText = function (score, id) {
    const s = shallow(score);
    s.texts = (s.texts || []).filter(t => t.id !== id);
    return s;
  };

  // ── 보표 구성 ─────────────────────────
  O.addStaff = function (score, def, at) {
    const s = shallow(score);
    const st = Object.assign({ id: U.sid(), kind: 'standard', name: '', abbr: '', clef: 'treble', lines: 5, visible: true }, def);
    s.staves = s.staves.slice();
    s.staves.splice(at === undefined ? s.staves.length : at, 0, st);
    s.measures = s.measures.map(m => { const c = Object.assign({}, m, { staves: Object.assign({}, m.staves) }); c.staves[st.id] = S.newStaffMeasure(); return c; });
    return s;
  };
  O.removeStaff = function (score, staffId) {
    if (score.staves.length <= 1) return score;
    const s = shallow(score);
    s.staves = s.staves.filter(st => st.id !== staffId);
    const gone = new Set();
    s.measures = s.measures.map(m => {
      const c = Object.assign({}, m, { staves: Object.assign({}, m.staves) });
      const sm = c.staves[staffId];
      if (sm) sm.voices.forEach(v => v.events.forEach(e => gone.add(e.id)));
      delete c.staves[staffId];
      return c;
    });
    s.spanners = (s.spanners || []).filter(sp => !gone.has(sp.startId) && !gone.has(sp.endId));
    return s;
  };
  O.updateStaff = function (score, staffId, patch) {
    const s = shallow(score);
    s.staves = s.staves.map(st => st.id === staffId ? Object.assign({}, st, patch) : st);
    return s;
  };
  O.moveStaff = function (score, staffId, dir) {
    const s = shallow(score);
    const i = s.staves.findIndex(st => st.id === staffId), j = i + dir;
    if (i < 0 || j < 0 || j >= s.staves.length) return score;
    s.staves = s.staves.slice();
    const t = s.staves[i]; s.staves[i] = s.staves[j]; s.staves[j] = t;
    return s;
  };

  SJ.Ops = O;
})(window.SJ = window.SJ || {});
