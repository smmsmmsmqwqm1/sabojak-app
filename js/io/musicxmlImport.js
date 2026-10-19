/* MusicXML 불러오기 (.musicxml / .xml / .mxl). 지원하지 않는 요소는 목록으로 돌려준다. */
(function (SJ) {
  'use strict';
  const U = SJ.U, D = SJ.Dur, S = SJ.Score, PPQ = SJ.C.PPQ;
  const I = {};
  const TYPES = { breve: 'whole', whole: 'whole', half: 'half', quarter: 'quarter', eighth: 'eighth', '16th': '16th', '32nd': '32nd', '64th': '64th', '128th': '64th' };
  const ART = { staccato: 'staccato', accent: 'accent', tenuto: 'tenuto', 'strong-accent': 'marcato', staccatissimo: 'staccatissimo' };
  const DYN = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz', 'sf', 'fp'];
  const KNOWN = new Set(['work', 'work-title', 'work-number', 'movement-title', 'movement-number', 'identification', 'creator', 'rights', 'encoding', 'software', 'encoding-date', 'supports',
    'encoder', 'source', 'defaults', 'scaling', 'millimeters', 'tenths', 'page-layout', 'system-layout', 'staff-layout', 'appearance', 'music-font', 'word-font', 'lyric-font', 'credit', 'credit-type', 'credit-words',
    'part-list', 'score-part', 'part-name', 'part-abbreviation', 'part-name-display', 'part-abbreviation-display', 'score-instrument', 'instrument-name', 'midi-instrument', 'midi-channel', 'midi-program', 'volume', 'pan', 'midi-device',
    'part-group', 'group-symbol', 'group-barline', 'group-name', 'part', 'measure', 'print', 'attributes', 'divisions', 'key', 'fifths', 'mode', 'cancel', 'time', 'beats', 'beat-type', 'staves', 'clef', 'sign', 'line', 'clef-octave-change',
    'note', 'grace', 'chord', 'pitch', 'step', 'alter', 'octave', 'rest', 'duration', 'tie', 'voice', 'type', 'dot', 'accidental', 'time-modification', 'actual-notes', 'normal-notes', 'normal-type', 'stem', 'staff', 'beam', 'notations',
    'tied', 'slur', 'tuplet', 'articulations', 'staccato', 'accent', 'tenuto', 'strong-accent', 'staccatissimo', 'fermata', 'ornaments', 'trill-mark', 'mordent', 'inverted-mordent', 'wavy-line', 'lyric', 'syllabic', 'text', 'extend', 'elision',
    'backup', 'forward', 'direction', 'direction-type', 'dynamics', 'words', 'wedge', 'metronome', 'beat-unit', 'beat-unit-dot', 'per-minute', 'rehearsal', 'segno', 'coda', 'octave-shift', 'sound', 'offset', 'harmony', 'root', 'root-step', 'root-alter',
    'kind', 'bass', 'bass-step', 'bass-alter', 'degree', 'degree-value', 'degree-alter', 'degree-type', 'barline', 'bar-style', 'repeat', 'ending', 'system-margins', 'left-margin', 'right-margin', 'top-system-distance', 'system-distance', 'staff-distance',
    'page-height', 'page-width', 'page-margins', 'top-margin', 'bottom-margin', 'measure-numbering', 'instrument', 'unpitched', 'display-step', 'display-octave', 'notehead', 'transpose', 'diatonic', 'chromatic', 'octave-change',
    'score-partwise', 'other-direction', 'pedal', 'technical', 'fingering', 'p', 'pp', 'ppp', 'mp', 'mf', 'f', 'ff', 'fff', 'sfz', 'sf', 'fp', 'rf', 'rfz', 'fz', 'sfp', 'other-dynamics', 'staff-details', 'staff-lines', 'measure-style',
    'multiple-rest', 'footnote', 'level', 'cue', 'type', 'virtual-instrument', 'player', 'player-name', 'instrument-sound', 'ensemble', 'solo', 'midi-name', 'midi-bank', 'midi-unpitched', 'elevation', 'feature', 'miscellaneous', 'miscellaneous-field', 'relation', 'encoding-description', 'line-width', 'note-size', 'distance', 'glyph', 'other-appearance', 'bracket', 'dashes', 'print-object']);
  const UNSUPPORTED_LABEL = { pedal: '페달 표시', fingering: '운지 번호', technical: '연주 기법 기호', unpitched: '타악기 음(일반 음표로 변환)', 'multiple-rest': '여러 마디 쉼표', 'figured-bass': '숫자 저음', 'staff-lines(≠5)': 'TAB·특수 오선(5선으로 변환)', 'percussion': '타악기 음자리표(높은음자리표로 변환)', transpose: '이조 악기 표기(실음 그대로)', 'other-dynamics': '기타 셈여림', 'inverted-mordent': '역모르덴트(모르덴트로)', 'wavy-line': '트릴 물결선', cue: '작은 음표(일반 크기로)' };

  const kids = (el, name) => Array.from(el.children).filter(c => c.tagName === name);
  const kid = (el, name) => Array.from(el.children).find(c => c.tagName === name) || null;
  const txt = (el, name) => { const k = name ? kid(el, name) : el; return k ? k.textContent.trim() : null; };
  const num = (el, name, d) => { const t = txt(el, name); const v = t === null ? NaN : Number(t); return isFinite(v) ? v : d; };

  // 바이트 → {score, unsupported:[...]} (실패 시 throw)
  I.fromBytes = function (bytes, name) {
    let xml;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      const files = SJ.Zip.unzip(bytes);
      const container = files.find(f => /META-INF\/container\.xml$/i.test(f.name));
      let root = null;
      if (container) {
        const m = /full-path="([^"]+)"/.exec(U.fromUtf8(container.data));
        if (m) root = files.find(f => f.name === m[1]);
      }
      if (!root) root = files.find(f => /\.(musicxml|xml)$/i.test(f.name) && !/META-INF/i.test(f.name));
      if (!root) throw new Error(SJ.t('mxl 안에서 악보를 못 찾았어요'));
      xml = U.fromUtf8(root.data);
    } else {
      xml = (bytes[0] === 0xFF && bytes[1] === 0xFE) ? new TextDecoder('utf-16le').decode(bytes) : U.fromUtf8(bytes);
    }
    return I.fromXml(xml, name);
  };

  I.fromXml = function (xml, fileName) {
    const doc = new DOMParser().parseFromString(xml.replace(/<!DOCTYPE[^>]*>/i, ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error(SJ.t('XML 을 읽지 못했어요'));
    const root = doc.documentElement;
    if (root.tagName === 'score-timewise') throw new Error(SJ.t('timewise 형식은 지원하지 않아요 (partwise로 저장해 주세요)'));
    if (root.tagName !== 'score-partwise') throw new Error(SJ.t('MusicXML 이 아니에요'));
    const unsupported = new Set();
    root.querySelectorAll('*').forEach(e => { if (!KNOWN.has(e.tagName)) unsupported.add(e.tagName); });

    const title = root.querySelector('work > work-title') || root.querySelector('movement-title');
    const meta = {
      title: title ? title.textContent.trim() : (fileName || '').replace(/\.(musicxml|xml|mxl)$/i, ''),
      subtitle: '', composer: '', lyricist: '', arranger: '', copyright: ''
    };
    root.querySelectorAll('identification > creator').forEach(c => {
      const t = c.getAttribute('type');
      if (t === 'composer') meta.composer = c.textContent.trim();
      else if (t === 'lyricist' || t === 'poet') meta.lyricist = c.textContent.trim();
      else if (t === 'arranger') meta.arranger = c.textContent.trim();
    });
    const rights = root.querySelector('identification > rights');
    if (rights) meta.copyright = rights.textContent.trim();
    root.querySelectorAll('credit').forEach(c => { if (txt(c, 'credit-type') === 'subtitle') meta.subtitle = txt(c, 'credit-words') || ''; });

    const partNames = {};
    root.querySelectorAll('part-list > score-part').forEach(sp => { partNames[sp.getAttribute('id')] = { name: txt(sp, 'part-name') || '', abbr: txt(sp, 'part-abbreviation') || '' }; });
    const parts = kids(root, 'part');
    if (!parts.length) throw new Error(SJ.t('파트가 없어요'));

    // 보표 정의
    const staves = [], partStaves = [];
    parts.forEach(p => {
      let n = 1;
      p.querySelectorAll('attributes > staves').forEach(e => { n = Math.max(n, Number(e.textContent) || 1); });
      const pn = partNames[p.getAttribute('id')] || { name: '', abbr: '' };
      const gid = n > 1 ? U.sid() : null;
      const list = [];
      for (let i = 0; i < n; i++) {
        const st = { id: U.sid(), kind: 'standard', name: i === 0 ? (pn.name === 'MusicXML Part' ? '' : pn.name) : '', abbr: i === 0 ? pn.abbr : '', clef: 'treble', lines: 5, visible: true };
        if (gid) { st.groupId = gid; st.groupType = 'brace'; }
        list.push(st); staves.push(st);
      }
      partStaves.push(list);
    });
    const nMeasures = Math.max(...parts.map(p => kids(p, 'measure').length));
    const measures = [];
    for (let i = 0; i < nMeasures; i++) measures.push(S.newMeasure(staves));
    const spanners = [];

    parts.forEach((p, pi) => {
      const sts = partStaves[pi];
      let div = 1;
      const voiceMap = sts.map(() => ({}));     // 보표별 MusicXML voice → 0..3
      const openSlurs = {}, openWedge = {}, openOct = {};
      let pendingWedgeStart = null, pendingOctStart = null;
      let lastNoteId = null;
      const tieOpen = {};
      kids(p, 'measure').forEach((mx, mi) => {
        const meas = measures[mi];
        if (mx.getAttribute('implicit') === 'yes' && mi === 0) meas.attrs.pickup = true;
        let cur = 0, maxT = 0;
        let lastStart = 0;
        const pendDyn = {}, pendTie = {};
        const tupletOpen = {};    // key staff:voice → {id, actual, normal}
        const lines = sts.map(() => []);   // 보표별 [{voice, start, ev}]
        Array.from(mx.children).forEach(el => {
          const tag = el.tagName;
          if (tag === 'attributes') {
            const dv = num(el, 'divisions', 0); if (dv) div = dv;
            const key = kid(el, 'key');
            if (key && pi === 0) meas.attrs.key = { fifths: U.clamp(num(key, 'fifths', 0), -7, 7), mode: txt(key, 'mode') === 'minor' ? 'minor' : 'major' };
            const time = kid(el, 'time');
            if (time && pi === 0) {
              const beats = String(txt(time, 'beats') || '4');
              const bsum = beats.split('+').reduce((a, b) => a + (Number(b) || 0), 0) || 4;
              const t = { num: bsum, den: num(time, 'beat-type', 4) };
              const sym = time.getAttribute('symbol');
              if (sym === 'common' && t.num === 4 && t.den === 4) t.symbol = 'common';
              if (sym === 'cut' && t.num === 2 && t.den === 2) t.symbol = 'cut';
              meas.attrs.time = t;
            }
            kids(el, 'clef').forEach(c => {
              const n = Number(c.getAttribute('number') || 1) - 1;
              const st = sts[n]; if (!st) return;
              const sign = txt(c, 'sign'), line = num(c, 'line', 0), oc = num(c, 'clef-octave-change', 0);
              let cl = 'treble';
              if (sign === 'F') cl = 'bass';
              else if (sign === 'C') cl = line === 4 ? 'tenor' : 'alto';
              else if (sign === 'G') cl = oc === -1 ? 'treble8vb' : 'treble';
              else { unsupported.add('percussion'); }
              if (mi === 0 && cur === 0) st.clef = cl; else meas.staves[st.id].clefChange = cl;
            });
            kids(el, 'staff-details').forEach(sd => { const sl = num(sd, 'staff-lines', 5); if (sl !== 5) unsupported.add('staff-lines(≠5)'); });
            if (kid(el, 'transpose')) unsupported.add('transpose');
          } else if (tag === 'backup') { cur -= num(el, 'duration', 0); if (cur < 0) cur = 0; }
          else if (tag === 'forward') { cur += num(el, 'duration', 0); maxT = Math.max(maxT, cur); }
          else if (tag === 'print') { if (el.getAttribute('new-system') === 'yes' && mi > 0) measures[mi - 1].attrs.systemBreak = true; if (el.getAttribute('new-page') === 'yes' && mi > 0) measures[mi - 1].attrs.pageBreak = true; }
          else if (tag === 'barline') {
            const loc = el.getAttribute('location') || 'right';
            const rep = kid(el, 'repeat'), style = txt(el, 'bar-style'), end = kid(el, 'ending');
            if (pi === 0) {
              if (rep && rep.getAttribute('direction') === 'forward') meas.attrs.repeatStart = true;
              if (rep && rep.getAttribute('direction') === 'backward') meas.attrs.repeatEnd = true;
              if (loc === 'right' && style) meas.attrs.barlineEnd = style === 'light-heavy' ? 'final' : style === 'light-light' ? 'double' : style === 'dashed' ? 'dashed' : style === 'none' ? 'none' : 'single';
              if (end) {
                const nums = String(end.getAttribute('number') || '1').split(/[,\s]+/).map(Number).filter(n => n > 0);
                const type = end.getAttribute('type');
                if (type === 'start') meas.attrs.volta = { numbers: nums, open: false };
                else if (type === 'discontinue') { meas.attrs.volta = meas.attrs.volta || { numbers: nums, open: true }; meas.attrs.volta.open = true; }
                else if (!meas.attrs.volta) meas.attrs.volta = { numbers: nums, open: false };
                openWedge.volta = type === 'start' ? nums : null;
              } else if (openWedge.volta && loc === 'left') meas.attrs.volta = { numbers: openWedge.volta, open: false };
            }
          } else if (tag === 'direction') {
            const off = num(el, 'offset', 0);
            const stIdx = Math.max(0, num(el, 'staff', 1) - 1);
            el.querySelectorAll('direction-type').forEach(dt => {
              Array.from(dt.children).forEach(d => {
                if (d.tagName === 'dynamics') { const k = d.children[0] && d.children[0].tagName; if (DYN.indexOf(k) >= 0) pendDyn[stIdx] = k; else unsupported.add('other-dynamics'); }
                else if (d.tagName === 'wedge') {
                  const t = d.getAttribute('type');
                  if (t === 'crescendo' || t === 'diminuendo') pendingWedgeStart = { type: t === 'crescendo' ? 'cresc' : 'dim', staff: stIdx };
                  else if (t === 'stop' && openWedge.cur && lastNoteId) { spanners.push({ id: U.sid(), type: openWedge.cur.type, startId: openWedge.cur.startId, endId: lastNoteId }); openWedge.cur = null; }
                } else if (d.tagName === 'octave-shift') {
                  const t = d.getAttribute('type');
                  if (t === 'down' || t === 'up') pendingOctStart = { type: t === 'down' ? '8va' : '8vb' };
                  else if (t === 'stop' && openOct.cur && lastNoteId) { spanners.push({ id: U.sid(), type: openOct.cur.type, startId: openOct.cur.startId, endId: lastNoteId }); openOct.cur = null; }
                } else if (d.tagName === 'metronome' && pi === 0) {
                  const bu = TYPES[txt(d, 'beat-unit')] || 'quarter';
                  meas.attrs.tempo = Object.assign(meas.attrs.tempo || {}, { bpm: num(d, 'per-minute', 0) || undefined, beatUnit: { type: bu, dots: kid(d, 'beat-unit-dot') ? 1 : 0 } });
                } else if (d.tagName === 'words' && pi === 0) {
                  const w = d.textContent.trim();
                  const map = { 'D.C.': 'dc', 'D.S.': 'ds', 'Fine': 'fine', 'To Coda': 'toCoda', 'D.C. al Fine': 'dcAlFine', 'D.C. al Coda': 'dcAlCoda', 'D.S. al Fine': 'dsAlFine', 'D.S. al Coda': 'dsAlCoda' };
                  if (map[w]) meas.attrs.markers.push({ type: map[w] });
                  else if (w && cur + off === 0 && !meas.attrs.tempo) meas.attrs.tempo = { text: w };
                  else if (w && meas.attrs.tempo && !meas.attrs.tempo.text && cur === 0) meas.attrs.tempo.text = w;
                  else if (w) meas['x-words'] = (meas['x-words'] || []).concat([w]);
                } else if (d.tagName === 'rehearsal' && pi === 0) meas.attrs.rehearsal = d.textContent.trim();
                else if (d.tagName === 'segno' && pi === 0) meas.attrs.markers.push({ type: 'segno' });
                else if (d.tagName === 'coda' && pi === 0) meas.attrs.markers.push({ type: 'coda' });
                else if (d.tagName === 'pedal') unsupported.add('pedal');
              });
            });
            const snd = kid(el, 'sound');
            if (snd && snd.getAttribute('tempo') && pi === 0 && !(meas.attrs.tempo && meas.attrs.tempo.bpm)) {
              meas.attrs.tempo = Object.assign(meas.attrs.tempo || {}, { bpm: Math.round(Number(snd.getAttribute('tempo'))) });
            }
          } else if (tag === 'harmony' && pi === 0) {
            const r = kid(el, 'root');
            if (!r) return;
            const step = txt(r, 'root-step'), alter = num(r, 'root-alter', 0);
            const k = kid(el, 'kind');
            let q = k ? (k.getAttribute('text') !== null ? k.getAttribute('text') : kindText(k.textContent.trim())) : '';
            let text = step + (alter > 0 ? '#'.repeat(alter) : alter < 0 ? 'b'.repeat(-alter) : '') + q;
            const b = kid(el, 'bass');
            if (b) { const ba = num(b, 'bass-alter', 0); text += '/' + txt(b, 'bass-step') + (ba > 0 ? '#' : ba < 0 ? 'b' : ''); }
            const tick = Math.round((cur + num(el, 'offset', 0)) * PPQ / div);
            meas.chords.push({ id: U.sid(), tick, text: SJ.Chord.pretty(text) });
          } else if (tag === 'note') {
            const isChord = !!kid(el, 'chord');
            const grace = kid(el, 'grace');
            const dd = grace ? 0 : num(el, 'duration', 0);
            const stIdx = Math.max(0, num(el, 'staff', 1) - 1);
            const st = sts[stIdx] || sts[0];
            const vx = txt(el, 'voice') || '1';
            const vm = voiceMap[stIdx] || voiceMap[0];
            if (vm[vx] === undefined) { const n = Object.keys(vm).length; vm[vx] = n < 4 ? n : 3; if (n >= 4) unsupported.add('voice>4'); }
            const vi = vm[vx];
            const start = isChord ? lastStart : cur;
            if (!isChord) { lastStart = cur; cur += dd; maxT = Math.max(maxT, cur); }
            const line = lines[stIdx] || lines[0];
            if (isChord) {
              const prev = line.length ? line[line.length - 1].ev : null;
              const pitch = kid(el, 'pitch');
              if (prev && prev.kind === 'note' && pitch) {
                const h = headOf(pitch, el);
                prev.heads.push(h);
                if (h.tieNext) pendTie[prev.id] = true;
              }
              return;
            }
            const typ = TYPES[txt(el, 'type')] || null;
            const dots = kids(el, 'dot').length;
            const tm = kid(el, 'time-modification');
            let durObj;
            if (typ) durObj = { type: typ, dots: Math.min(2, dots) };
            else { const dec = D.decompose(Math.round(dd * PPQ / div)); durObj = dec.durs[0] || { type: 'quarter', dots: 0 }; }
            let ev;
            const pitch = kid(el, 'pitch'), unp = kid(el, 'unpitched');
            if (kid(el, 'rest') || (!pitch && !unp)) {
              ev = S.newRest(durObj);
              const r = kid(el, 'rest');
              if (r && r.getAttribute('measure') === 'yes') ev['x-measureRest'] = true;
            } else {
              const h = pitch ? headOf(pitch, el) : (unp ? { step: txt(unp, 'display-step') || 'B', octave: num(unp, 'display-octave', 4), alter: 0 } : null);
              if (unp) unsupported.add('unpitched');
              ev = S.newNote(durObj, [h]);
              if (grace) ev.grace = grace.getAttribute('slash') === 'yes' ? 'acciaccatura' : 'appoggiatura';
              const stem = txt(el, 'stem'); if (stem === 'up' || stem === 'down') ev.stem = stem;
              if (pendDyn[stIdx]) { ev.dynamic = pendDyn[stIdx]; delete pendDyn[stIdx]; }
              if (pendingWedgeStart) { openWedge.cur = { type: pendingWedgeStart.type, startId: ev.id }; pendingWedgeStart = null; }
              if (pendingOctStart) { openOct.cur = { type: pendingOctStart.type, startId: ev.id }; pendingOctStart = null; }
              lastNoteId = ev.id;
            }
            // 잇단음
            const tkey = stIdx + ':' + vi;
            if (tm) {
              const actual = num(tm, 'actual-notes', 3), normal = num(tm, 'normal-notes', 2);
              let open = tupletOpen[tkey];
              const tupStart = el.querySelector('notations > tuplet[type="start"]');
              if (!open || tupStart || open.actual !== actual || open.normal !== normal || open.full) {
                open = { id: U.sid(), actual, normal, notated: 0, unit: D.base(durObj.type) };
                tupletOpen[tkey] = open;
                open.isNew = true;
              }
              ev.dur.tuplet = open.id;
              open.notated += D.notated(durObj);
              if (el.querySelector('notations > tuplet[type="stop"]') || open.notated >= open.actual * open.unit) open.full = true;
            } else if (tupletOpen[tkey]) tupletOpen[tkey].full = true;
            // 표기
            const nots = kid(el, 'notations');
            if (nots && ev.kind === 'note') {
              nots.querySelectorAll('slur').forEach(s => {
                const n = s.getAttribute('number') || '1', t = s.getAttribute('type');
                if (t === 'start') openSlurs[n] = ev.id;
                else if (t === 'stop' && openSlurs[n]) { spanners.push({ id: U.sid(), type: 'slur', startId: openSlurs[n], endId: ev.id }); delete openSlurs[n]; }
              });
              const arts = nots.querySelector('articulations');
              if (arts) Array.from(arts.children).forEach(a => { if (ART[a.tagName]) ev.articulations.push(ART[a.tagName]); });
              if (nots.querySelector('fermata')) ev.articulations.push('fermata');
              if (nots.querySelector('ornaments > trill-mark')) ev.articulations.push('trill');
              if (nots.querySelector('ornaments > mordent, ornaments > inverted-mordent')) ev.articulations.push('mordent');
            } else if (nots && ev.kind === 'rest' && nots.querySelector('fermata')) ev.articulations.push('fermata');
            // 가사
            kids(el, 'lyric').forEach(l => {
              if (ev.kind !== 'note') return;
              const t = kids(l, 'text').map(x => x.textContent).join('');
              if (!t) return;
              ev.lyrics = ev.lyrics || [];
              ev.lyrics.push({ verse: Number(l.getAttribute('number')) || (ev.lyrics.length + 1), text: U.nfc(t), syllabic: txt(l, 'syllabic') || 'single', extend: !!kid(l, 'extend') });
            });
            line.push({ vi, start: Math.round(start * PPQ / div), ev, tupletOpen: tupletOpen[tkey] });
            void tieOpen;
          }
        });
        // 보표·성부별 이벤트 넣기 (틈은 쉼표로)
        lines.forEach((line, si) => {
          const st = sts[si];
          const sm = meas.staves[st.id];
          const byV = {};
          line.forEach(it => { (byV[it.vi] = byV[it.vi] || []).push(it); });
          Object.keys(byV).map(Number).sort().forEach(vi => {
            while (sm.voices.length <= vi) sm.voices.push(S.newVoice());
            const v = sm.voices[vi];
            const tset = new Map();
            let t = 0;
            byV[vi].sort((a, b) => a.start - b.start).forEach(it => {
              if (it.start > t && !it.ev.grace) D.fillRests(t, it.start, D.beatTicks(S.timeAt({ measures }, mi))).forEach(d => { v.events.push(S.newRest(d)); t += D.notated(d); });
              if (it.ev.dur.tuplet && it.tupletOpen && !tset.has(it.ev.dur.tuplet)) { tset.set(it.ev.dur.tuplet, true); v.tuplets.push({ id: it.tupletOpen.id, actual: it.tupletOpen.actual, normal: it.tupletOpen.normal }); }
              if (it.ev['x-measureRest']) { delete it.ev['x-measureRest']; if (byV[vi].length === 1 && vi === 0) return; }
              v.events.push(it.ev);
              t = Math.max(t, it.start + D.eventTicks(it.ev, D.tupletMap(v)));
            });
            // 성부 2 이상이 쉼표뿐이면 비움
            if (vi > 0 && v.events.every(e => e.kind === 'rest')) { v.events = []; v.tuplets = []; }
          });
        });
        void maxT;
      });
    });
    // 첫 마디 박자·조표 기본값
    if (!measures[0].attrs.time) measures[0].attrs.time = { num: 4, den: 4 };
    if (!measures[0].attrs.key) measures[0].attrs.key = { fifths: 0, mode: 'major' };
    if (measures.length && !measures.some(m => m.attrs.barlineEnd === 'final')) measures[measures.length - 1].attrs.barlineEnd = 'final';

    const now = U.isoNow();
    meta.createdAt = now; meta.updatedAt = now;
    const score = { schema: SJ.APP.schema, id: U.uuid(), meta, page: S.defaultPage('A4'), layout: S.defaultLayout(), staves, measures, texts: [], spanners };
    // 불러온 악보는 원래 줄바꿈을 살리도록 정렬 끔(사용자가 [정렬]로 켤 수 있음)
    score.layout.alignGrid.enabled = false;
    const v = SJ.Validate.validate(score);
    const list = Array.from(unsupported).filter(u => UNSUPPORTED_LABEL[u] || !KNOWN.has(u)).map(u => UNSUPPORTED_LABEL[u] || u);
    return { score: v.score, unsupported: list, issues: v.issues };
  };

  function headOf(pitch, noteEl) {
    const h = { step: txt(pitch, 'step') || 'C', octave: num(pitch, 'octave', 4), alter: Math.round(num(pitch, 'alter', 0)) };
    if (h.alter > 2 || h.alter < -2) h.alter = 0;
    const ties = kids(noteEl, 'tie');
    if (ties.some(t => t.getAttribute('type') === 'start')) h.tieNext = true;
    const acc = kid(noteEl, 'accidental');
    if (acc && (acc.getAttribute('cautionary') === 'yes' || acc.getAttribute('parentheses') === 'yes')) h.accidental = 'show';
    return h;
  }
  function kindText(k) {
    return { major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7', 'major-seventh': 'M7', 'minor-seventh': 'm7', 'diminished-seventh': 'dim7',
      'augmented-seventh': 'aug7', 'half-diminished': 'm7b5', 'major-minor': 'mM7', 'major-sixth': '6', 'minor-sixth': 'm6', 'dominant-ninth': '9', 'major-ninth': 'M9', 'minor-ninth': 'm9',
      'dominant-11th': '11', 'dominant-13th': '13', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4', power: '5', none: '' }[k] || '';
  }

  SJ.MusicXmlImport = I;
})(window.SJ = window.SJ || {});
