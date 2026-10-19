/* validate(score): 저장 전·불러온 뒤 검사. 고칠 수 있는 것은 고치고, 아니면 경고만 — 데이터는 버리지 않는다. */
(function (SJ) {
  'use strict';
  const U = SJ.U, D = SJ.Dur;
  const V = {};
  const BARLINES = ['single', 'double', 'final', 'dashed', 'none'];
  const ARTIC = ['staccato', 'accent', 'tenuto', 'marcato', 'fermata', 'trill', 'mordent', 'staccatissimo'];

  V.validate = function (input) {
    const issues = [];
    const fix = (msg) => issues.push({ level: 'fixed', msg });
    const warn = (msg) => issues.push({ level: 'warn', msg });
    if (!input || typeof input !== 'object') return { score: null, issues: [{ level: 'fatal', msg: 'not-an-object' }], ok: false };
    const s = U.clone(input);

    if (typeof s.schema !== 'number') { s.schema = SJ.APP.schema; fix('schema'); }
    if (!s.id || typeof s.id !== 'string') { s.id = U.uuid(); fix('id'); }
    s.meta = Object.assign({ title: '', subtitle: '', composer: '', lyricist: '', arranger: '', copyright: '' }, s.meta || {});
    ['title', 'subtitle', 'composer', 'lyricist', 'arranger', 'copyright'].forEach(k => { if (typeof s.meta[k] !== 'string') { s.meta[k] = String(s.meta[k] || ''); } });
    if (!s.meta.createdAt) { s.meta.createdAt = U.isoNow(); fix('createdAt'); }
    if (!s.meta.updatedAt) s.meta.updatedAt = s.meta.createdAt;
    if (!s.page || typeof s.page !== 'object') { s.page = SJ.Score.defaultPage('A4'); fix('page'); }
    else {
      const dp = SJ.Score.defaultPage(s.page.size || 'A4', s.page.orientation);
      for (const k of Object.keys(dp)) if (s.page[k] === undefined) s.page[k] = dp[k];
      if (!(s.page.width > 50) || !(s.page.height > 50)) { s.page.width = dp.width; s.page.height = dp.height; fix('page-size'); }
      if (!(s.page.staffSize >= 3 && s.page.staffSize <= 15)) { s.page.staffSize = 7; fix('staff-size'); }
      s.page.margins = Object.assign({ top: 15, bottom: 15, left: 15, right: 15 }, s.page.margins || {});
    }
    const dl = SJ.Score.defaultLayout();
    s.layout = Object.assign(dl, s.layout || {});
    s.layout.alignGrid = Object.assign({ enabled: false, measuresPerSystem: 'auto', widthMode: 'equal' }, s.layout.alignGrid || {});

    // 보표
    if (!Array.isArray(s.staves) || !s.staves.length) {
      s.staves = SJ.Score.PRESETS.single.make(); fix('staves');
    }
    const staffIds = new Set();
    s.staves.forEach(st => {
      if (!st.id || staffIds.has(st.id)) { st.id = U.sid(); fix('staff-id'); }
      staffIds.add(st.id);
      if (st.kind !== 'standard') {
        // 이번 버전은 standard 만 허용. 다른 값은 알 수 없는 확장으로 보존(x-kind)하고 standard로 연다
        st['x-kind'] = st.kind; st.kind = 'standard'; warn('staff-kind');
      }
      if (!SJ.Pitch.CLEFS[st.clef]) { st.clef = 'treble'; fix('clef'); }
      if (st.lines !== 5) st.lines = 5;
      if (st.visible === undefined) st.visible = true;
      if (typeof st.name !== 'string') st.name = '';
      if (typeof st.abbr !== 'string') st.abbr = '';
    });

    // 마디
    if (!Array.isArray(s.measures) || !s.measures.length) { s.measures = [SJ.Score.newMeasure(s.staves)]; fix('measures'); }
    const eventIds = new Set();
    const measureIds = new Set();
    s.measures.forEach((m, mi) => {
      if (!m.id || measureIds.has(m.id)) { m.id = U.sid(); fix('measure-id'); }
      measureIds.add(m.id);
      m.attrs = Object.assign({ barlineEnd: 'single', markers: [] }, m.attrs || {});
      if (BARLINES.indexOf(m.attrs.barlineEnd) < 0) { m.attrs.barlineEnd = 'single'; fix('barline'); }
      if (!Array.isArray(m.attrs.markers)) m.attrs.markers = [];
      if (m.attrs.time) {
        const t = m.attrs.time;
        if (!(t.num >= 1 && t.num <= 32) || [1, 2, 4, 8, 16, 32].indexOf(t.den) < 0) { m.attrs.time = { num: 4, den: 4 }; fix('time'); }
      }
      if (m.attrs.key && !(m.attrs.key.fifths >= -7 && m.attrs.key.fifths <= 7)) { m.attrs.key = { fifths: 0, mode: 'major' }; fix('key'); }
      if (!m.staves || typeof m.staves !== 'object') m.staves = {};
      // 없는 보표 채우기
      s.staves.forEach(st => { if (!m.staves[st.id]) { m.staves[st.id] = SJ.Score.newStaffMeasure(); if (mi >= 0) fix('missing-staff-measure'); } });
      // 보표 정의에 없는 데이터는 버리지 않고 x- 로 보존
      Object.keys(m.staves).forEach(sid => {
        if (!staffIds.has(sid)) { m['x-orphanStaves'] = m['x-orphanStaves'] || {}; m['x-orphanStaves'][sid] = m.staves[sid]; delete m.staves[sid]; warn('orphan-staff'); }
      });
      if (!Array.isArray(m.chords)) m.chords = [];
      Object.keys(m.staves).forEach(sid => {
        const sm = m.staves[sid];
        if (sm.clefChange && !SJ.Pitch.CLEFS[sm.clefChange]) { delete sm.clefChange; fix('clef-change'); }
        if (!Array.isArray(sm.voices) || !sm.voices.length) { sm.voices = [SJ.Score.newVoice()]; fix('voices'); }
        if (sm.voices.length > 4) { sm['x-extraVoices'] = sm.voices.slice(4); sm.voices = sm.voices.slice(0, 4); warn('too-many-voices'); }
        sm.voices.forEach(v => {
          if (!Array.isArray(v.events)) { v.events = []; fix('events'); }
          if (!Array.isArray(v.tuplets)) v.tuplets = [];
          const tids = new Set();
          v.tuplets = v.tuplets.filter(t => {
            const ok = t && t.id && t.actual >= 2 && t.normal >= 1 && t.actual <= 32 && t.normal <= 32;
            if (!ok) fix('tuplet'); else tids.add(t.id);
            return ok;
          });
          v.events.forEach(ev => {
            if (!ev.id || eventIds.has(ev.id)) { ev.id = U.sid(); fix('event-id'); }
            eventIds.add(ev.id);
            if (ev.kind !== 'note' && ev.kind !== 'rest') { ev.kind = 'rest'; fix('event-kind'); }
            if (!ev.dur || !D.isValidType(ev.dur.type)) { ev.dur = { type: 'quarter', dots: 0 }; fix('duration'); }
            if (![0, 1, 2].includes(ev.dur.dots || 0)) { ev.dur.dots = 0; fix('dots'); }
            ev.dur.dots = ev.dur.dots || 0;
            if (ev.dur.tuplet && !tids.has(ev.dur.tuplet)) { delete ev.dur.tuplet; fix('tuplet-ref'); }
            if (!Array.isArray(ev.articulations)) ev.articulations = [];
            ev.articulations = ev.articulations.filter(a => ARTIC.indexOf(a) >= 0 || (typeof a === 'string' && a.startsWith('x-')));
            if (ev.kind === 'note') {
              if (!Array.isArray(ev.heads) || !ev.heads.length) { ev.kind = 'rest'; delete ev.heads; fix('empty-chord'); return; }
              ev.heads = ev.heads.filter(h => h && SJ.Pitch.STEPS.indexOf(h.step) >= 0 && Number.isInteger(h.octave) && h.octave >= 0 && h.octave <= 9);
              if (!ev.heads.length) { ev.kind = 'rest'; delete ev.heads; fix('bad-heads'); return; }
              ev.heads.forEach(h => { if (![-2, -1, 0, 1, 2].includes(h.alter || 0)) h.alter = 0; h.alter = h.alter || 0; });
              if (Array.isArray(ev.lyrics)) ev.lyrics = ev.lyrics.filter(l => l && typeof l.text === 'string');
            }
          });
        });
      });
      // 박 합계 검사 (경고만)
      Object.keys(m.staves).forEach(sid => m.staves[sid].voices.forEach(v => {
        if (!v.events.length) return;
        const tot = D.voiceStarts(v).total;
        const cap = SJ.Score.capacity(s, mi);
        if (tot > cap) warn('overfull:' + (mi + 1));
      }));
    });

    // 스패너: 없는 이벤트를 가리키면 정리
    if (!Array.isArray(s.spanners)) s.spanners = [];
    s.spanners = s.spanners.filter(sp => {
      const ok = sp && sp.id && sp.startId && sp.endId && eventIds.has(sp.startId) && eventIds.has(sp.endId);
      if (!ok) fix('spanner-ref');
      return ok;
    });
    if (!Array.isArray(s.texts)) s.texts = [];
    s.texts = s.texts.filter(t => {
      if (!t || typeof t.text !== 'string') { fix('text'); return false; }
      if (!t.id) t.id = U.sid();
      if (!t.anchor) t.anchor = { type: 'page', page: 0, x: 20, y: 20 };
      if (t.anchor.type === 'measure' && !measureIds.has(t.anchor.measureId)) { t.anchor = { type: 'page', page: 0, x: 20, y: 30 }; fix('text-anchor'); }
      return true;
    });

    U.nfcDeep(s.meta); U.nfcDeep(s.texts);
    s.measures.forEach(m => { U.nfcDeep(m.chords); if (m.attrs.rehearsal) m.attrs.rehearsal = U.nfc(m.attrs.rehearsal); if (m.attrs.tempo && m.attrs.tempo.text) m.attrs.tempo.text = U.nfc(m.attrs.tempo.text); });
    SJ.Score.forEachEvent(s, ev => { if (ev.lyrics) U.nfcDeep(ev.lyrics); });
    s.staves.forEach(st => { st.name = U.nfc(st.name); st.abbr = U.nfc(st.abbr); });

    const fatal = issues.some(i => i.level === 'fatal');
    return { score: s, issues, ok: !fatal, changed: issues.some(i => i.level === 'fixed') };
  };

  SJ.Validate = V;
})(window.SJ = window.SJ || {});
