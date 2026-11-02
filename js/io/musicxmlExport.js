/* MusicXML 3.1 partwise 내보내기 — 다른 사보 프로그램과의 표준 교환 형식 */
(function (SJ) {
  'use strict';
  const U = SJ.U, D = SJ.Dur, S = SJ.Score, PPQ = SJ.C.PPQ;
  const X = {};
  const esc = s => U.esc(String(s === undefined || s === null ? '' : s));
  const TYPE = { whole: 'whole', half: 'half', quarter: 'quarter', eighth: 'eighth', '16th': '16th', '32nd': '32nd', '64th': '64th' };
  const CLEF = { treble: ['G', 2, 0], bass: ['F', 4, 0], alto: ['C', 3, 0], tenor: ['C', 4, 0], treble8vb: ['G', 2, -1] };
  const ART = { staccato: 'staccato', accent: 'accent', tenuto: 'tenuto', marcato: 'strong-accent', staccatissimo: 'staccatissimo' };
  const MARK = { dc: 'D.C.', ds: 'D.S.', fine: 'Fine', toCoda: 'To Coda', dcAlFine: 'D.C. al Fine', dcAlCoda: 'D.C. al Coda', dsAlFine: 'D.S. al Fine', dsAlCoda: 'D.S. al Coda' };
  const ACC = { '-2': 'flat-flat', '-1': 'flat', 0: 'natural', 1: 'sharp', 2: 'double-sharp' };

  function gcd(a, b) { while (b) { const t = b; b = a % b; a = t; } return a; }

  // 보표 → 파트 묶기 (중괄호 묶음 = 한 파트 여러 보표)
  X.parts = function (score) {
    const parts = [];
    let i = 0;
    while (i < score.staves.length) {
      const st = score.staves[i];
      const grp = [st];
      // 한 파트로 묶는 것은 중괄호(피아노 등 한 악기)만 — 대괄호(합창 SATB)는 보표마다 따로 파트(이름이 빠지던 것 · 점검원 ⑥ 11-02)
      if (st.groupId && (st.groupType || 'brace') === 'brace') while (i + grp.length < score.staves.length && score.staves[i + grp.length].groupId === st.groupId) grp.push(score.staves[i + grp.length]);
      parts.push(grp);
      i += grp.length;
    }
    return parts;
  };

  X.export = function (score) {
    // 가장 작은 divisions
    let g = PPQ;
    S.forEachEvent(score, (ev, c) => { const t = D.eventTicks(ev, D.tupletMap(c.voice)); if (t) g = gcd(g, t); });
    score.measures.forEach((m, mi) => { g = gcd(g, S.capacity(score, mi)); (m.chords || []).forEach(ch => { if (ch.tick) g = gcd(g, ch.tick); }); });
    const div = PPQ / g;
    const dur = t => Math.round(t / g);
    const parts = X.parts(score);
    const evIndex = {};
    S.forEachEvent(score, (ev, c) => { evIndex[ev.id] = c; });
    const slurNum = {};
    (score.spanners || []).filter(sp => sp.type === 'slur').forEach((sp, i) => { slurNum[sp.id] = (i % 6) + 1; });

    let x = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n' +
      '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n' +
      '<score-partwise version="3.1">\n';
    const m = score.meta;
    if (m.title) x += '  <work><work-title>' + esc(m.title) + '</work-title></work>\n';
    x += '  <identification>\n';
    if (m.composer) x += '    <creator type="composer">' + esc(m.composer) + '</creator>\n';
    if (m.lyricist) x += '    <creator type="lyricist">' + esc(m.lyricist) + '</creator>\n';
    if (m.arranger) x += '    <creator type="arranger">' + esc(m.arranger) + '</creator>\n';
    if (m.copyright) x += '    <rights>' + esc(m.copyright) + '</rights>\n';
    x += '    <encoding><software>' + esc(SJ.APP.nameEn + ' ' + SJ.APP.version) + '</software><encoding-date>' + new Date().toISOString().slice(0, 10) + '</encoding-date></encoding>\n  </identification>\n';
    if (m.subtitle) x += '  <credit page="1"><credit-type>subtitle</credit-type><credit-words>' + esc(m.subtitle) + '</credit-words></credit>\n';
    x += '  <part-list>\n';
    parts.forEach((grp, pi) => {
      x += '    <score-part id="P' + (pi + 1) + '"><part-name>' + esc(grp[0].name || '') + '</part-name>' +
        (grp[0].abbr ? '<part-abbreviation>' + esc(grp[0].abbr) + '</part-abbreviation>' : '') + '</score-part>\n';
    });
    x += '  </part-list>\n';

    parts.forEach((grp, pi) => {
      x += '  <part id="P' + (pi + 1) + '">\n';
      let prevKey = null, prevTime = null;
      const prevClef = {};
      score.measures.forEach((meas, mi) => {
        const a = meas.attrs;
        x += '    <measure number="' + (mi + 1) + '"' + (a.pickup ? ' implicit="yes"' : '') + '>\n';
        if (mi > 0) {
          const pa = score.measures[mi - 1].attrs;
          if (pa.pageBreak) x += '      <print new-page="yes"/>\n';
          else if (pa.systemBreak) x += '      <print new-system="yes"/>\n';
        }
        // 왼쪽 세로줄 (도돌이 시작 · 볼타 시작)
        const volta = a.volta && a.volta.numbers && a.volta.numbers.length ? a.volta : null;
        const pv = mi > 0 ? score.measures[mi - 1].attrs.volta : null;
        const nv = mi + 1 < score.measures.length ? score.measures[mi + 1].attrs.volta : null;
        const vkey = v => v && v.numbers ? v.numbers.join(',') : '';
        const voltaStart = volta && vkey(pv) !== vkey(volta), voltaStop = volta && vkey(nv) !== vkey(volta);
        if (a.repeatStart || voltaStart) {
          x += '      <barline location="left">' + (a.repeatStart ? '<bar-style>heavy-light</bar-style>' : '') +
            (voltaStart ? '<ending number="' + vkey(volta) + '" type="start">' + vkey(volta) + '.</ending>' : '') +
            (a.repeatStart ? '<repeat direction="forward"/>' : '') + '</barline>\n';
        }
        // 속성
        const key = S.keyAt(score, mi), time = S.timeAt(score, mi);
        let attr = '';
        if (mi === 0) attr += '<divisions>' + div + '</divisions>';
        if (!prevKey || prevKey.fifths !== key.fifths || prevKey.mode !== key.mode) attr += '<key><fifths>' + key.fifths + '</fifths><mode>' + (key.mode || 'major') + '</mode></key>';
        if (!prevTime || prevTime.num !== time.num || prevTime.den !== time.den || prevTime.symbol !== time.symbol) {
          attr += '<time' + (time.symbol === 'common' ? ' symbol="common"' : time.symbol === 'cut' ? ' symbol="cut"' : '') + '><beats>' + time.num + '</beats><beat-type>' + time.den + '</beat-type></time>';
        }
        if (mi === 0 && grp.length > 1) attr += '<staves>' + grp.length + '</staves>';
        grp.forEach((st, si) => {
          const c = S.clefAt(score, mi, st.id);
          if (prevClef[st.id] !== c) {
            const cd = CLEF[c] || CLEF.treble;
            attr += '<clef' + (grp.length > 1 ? ' number="' + (si + 1) + '"' : '') + '><sign>' + cd[0] + '</sign><line>' + cd[1] + '</line>' + (cd[2] ? '<clef-octave-change>' + cd[2] + '</clef-octave-change>' : '') + '</clef>';
            prevClef[st.id] = c;
          }
        });
        if (attr) x += '      <attributes>' + attr + '</attributes>\n';
        prevKey = key; prevTime = time;
        // 마디 머리 지시어 (첫 파트만)
        if (pi === 0) {
          if (a.rehearsal) x += '      <direction placement="above"><direction-type><rehearsal>' + esc(a.rehearsal) + '</rehearsal></direction-type></direction>\n';
          (a.markers || []).forEach(mk => {
            if (mk.type === 'segno') x += '      <direction placement="above"><direction-type><segno/></direction-type><sound segno="segno"/></direction>\n';
            else if (mk.type === 'coda') x += '      <direction placement="above"><direction-type><coda/></direction-type><sound coda="coda"/></direction>\n';
          });
          if (a.tempo && (a.tempo.text || a.tempo.bpm)) {
            x += '      <direction placement="above"><direction-type>' + (a.tempo.text ? '<words font-weight="bold">' + esc(a.tempo.text) + '</words>' : '') + '</direction-type>' +
              (a.tempo.bpm ? '<direction-type><metronome><beat-unit>' + (TYPE[(a.tempo.beatUnit || {}).type] || 'quarter') + '</beat-unit>' + ((a.tempo.beatUnit || {}).dots ? '<beat-unit-dot/>' : '') + '<per-minute>' + a.tempo.bpm + '</per-minute></metronome></direction-type><sound tempo="' + a.tempo.bpm + '"/>' : '') + '</direction>\n';
          }
        }
        // 음표: 보표 × 성부, 사이에 backup
        const cap = S.capacity(score, mi);
        let first = true;
        grp.forEach((st, si) => {
          const sm = meas.staves[st.id];
          sm.voices.forEach((v, vi) => {
            if (!v.events.length && vi > 0) return;
            if (!first) x += '      <backup><duration>' + dur(lastLen) + '</duration></backup>\n';
            first = false;
            const voiceNo = si * 4 + vi + 1;
            const tm = D.tupletMap(v);
            let t = 0;
            if (!v.events.length) {
              if (si === 0 && vi === 0 && pi === 0) (meas.chords || []).forEach(ch => { x += harmony(ch, ch.tick, dur); });
              x += '      <note><rest measure="yes"/><duration>' + dur(cap) + '</duration><voice>' + voiceNo + '</voice>' + (grp.length > 1 ? '<staff>' + (si + 1) + '</staff>' : '') + '</note>\n';
              t = cap;
            }
            const tupFirst = {}, tupLast = {};
            v.events.forEach((ev, ei) => { if (ev.dur.tuplet) { if (tupFirst[ev.dur.tuplet] === undefined) tupFirst[ev.dur.tuplet] = ei; tupLast[ev.dur.tuplet] = ei; } });
            v.events.forEach((ev, ei) => {
              const tk = D.eventTicks(ev, tm);
              // 코드 기호 (첫 보표 첫 성부)
              if (si === 0 && vi === 0 && pi === 0) (meas.chords || []).forEach(ch => { if (ch.tick >= t && ch.tick < t + Math.max(tk, 1)) x += harmony(ch, ch.tick - t, dur); });
              if (ev.kind === 'note') {
                if (ev.dynamic) x += '      <direction placement="below"><direction-type><dynamics><' + esc(ev.dynamic) + '/></dynamics></direction-type>' + (grp.length > 1 ? '<staff>' + (si + 1) + '</staff>' : '') + '</direction>\n';
                (score.spanners || []).forEach(sp => {
                  if ((sp.type === 'cresc' || sp.type === 'dim') && sp.startId === ev.id) x += '      <direction placement="below"><direction-type><wedge type="' + (sp.type === 'cresc' ? 'crescendo' : 'diminuendo') + '" number="1"/></direction-type></direction>\n';
                  if ((sp.type === '8va' || sp.type === '8vb') && sp.startId === ev.id) x += '      <direction placement="' + (sp.type === '8va' ? 'above' : 'below') + '"><direction-type><octave-shift type="' + (sp.type === '8va' ? 'down' : 'up') + '" size="8" number="1"/></direction-type></direction>\n';
                });
              }
              x += noteXml(ev, ei, tk, tm, voiceNo, grp.length > 1 ? si + 1 : 0, dur, tupFirst, tupLast, slurNum, score);
              if (ev.kind === 'note') (score.spanners || []).forEach(sp => {
                if ((sp.type === 'cresc' || sp.type === 'dim') && sp.endId === ev.id) x += '      <direction><direction-type><wedge type="stop" number="1"/></direction-type></direction>\n';
                if ((sp.type === '8va' || sp.type === '8vb') && sp.endId === ev.id) x += '      <direction><direction-type><octave-shift type="stop" size="8" number="1"/></direction-type></direction>\n';
              });
              t += tk;
            });
            lastLen = t;
          });
        });
        // 끝 지시어 (D.C. 등)
        if (pi === 0) (a.markers || []).forEach(mk => {
          if (MARK[mk.type]) x += '      <direction placement="above"><direction-type><words font-style="italic">' + MARK[mk.type] + '</words></direction-type>' +
            (mk.type === 'fine' ? '<sound fine="yes"/>' : mk.type.startsWith('dc') ? '<sound dacapo="yes"/>' : mk.type.startsWith('ds') ? '<sound dalsegno="segno"/>' : mk.type === 'toCoda' ? '<sound tocoda="coda"/>' : '') + '</direction>\n';
        });
        // 오른쪽 세로줄
        const be = a.barlineEnd;
        if (a.repeatEnd || be !== 'single' || voltaStop) {
          const style = a.repeatEnd || be === 'final' ? 'light-heavy' : be === 'double' ? 'light-light' : be === 'dashed' ? 'dashed' : be === 'none' ? 'none' : 'regular';
          x += '      <barline location="right"><bar-style>' + style + '</bar-style>' +
            (voltaStop ? '<ending number="' + vkey(volta) + '" type="' + (volta.open ? 'discontinue' : 'stop') + '"/>' : '') +
            (a.repeatEnd ? '<repeat direction="backward"/>' : '') + '</barline>\n';
        }
        x += '    </measure>\n';
      });
      x += '  </part>\n';
    });
    x += '</score-partwise>\n';
    return x;
  };
  let lastLen = 0;

  function harmony(ch, offset, dur) {
    const c = SJ.Chord.parse(ch.text);
    if (c.raw) return '      <harmony><root><root-step>C</root-step></root><kind text="' + esc(ch.text) + '">none</kind>' + (offset ? '<offset>' + dur(offset) + '</offset>' : '') + '</harmony>\n';
    const q = c.quality || '';
    const kind = /^m(?!aj)/.test(q) ? (q.indexOf('7') >= 0 ? 'minor-seventh' : 'minor') : /dim/.test(q) ? 'diminished' : /aug|\+/.test(q) ? 'augmented' :
      /maj7|M7/.test(q) ? 'major-seventh' : /^7/.test(q) ? 'dominant' : /sus4/.test(q) ? 'suspended-fourth' : /^6/.test(q) ? 'major-sixth' : 'major';
    return '      <harmony><root><root-step>' + c.root + '</root-step>' + (c.alter ? '<root-alter>' + c.alter + '</root-alter>' : '') + '</root>' +
      '<kind text="' + esc(q.replace(/♯/g, '#').replace(/♭/g, 'b')) + '">' + kind + '</kind>' +
      (c.bass ? '<bass><bass-step>' + c.bass.step + '</bass-step>' + (c.bass.alter ? '<bass-alter>' + c.bass.alter + '</bass-alter>' : '') + '</bass>' : '') +
      (offset ? '<offset>' + dur(offset) + '</offset>' : '') + '</harmony>\n';
  }

  function noteXml(ev, ei, tk, tm, voiceNo, staffNo, dur, tupFirst, tupLast, slurNum, score) {
    let out = '';
    const tp = ev.dur.tuplet ? tm[ev.dur.tuplet] : null;
    const common = (tk ? '<duration>' + dur(tk) + '</duration>' : '');
    const tail = '<voice>' + voiceNo + '</voice><type>' + TYPE[ev.dur.type] + '</type>' + '<dot/>'.repeat(ev.dur.dots || 0);
    const tmod = tp ? '<time-modification><actual-notes>' + tp.actual + '</actual-notes><normal-notes>' + tp.normal + '</normal-notes></time-modification>' : '';
    const staff = staffNo ? '<staff>' + staffNo + '</staff>' : '';
    if (ev.kind === 'rest') {
      let n = '';
      if (ev.articulations && ev.articulations.indexOf('fermata') >= 0) n += '<fermata type="upright"/>';
      return '      <note><rest/>' + common + tail + tmod + staff + (n ? '<notations>' + n + '</notations>' : '') + '</note>\n';
    }
    ev.heads.forEach((h, hi) => {
      let notations = '';
      if (h.tieNext) notations += '<tied type="start"/>';
      // 앞 음에서 이어진 붙임줄
      if (ev._tiedFrom && ev._tiedFrom.indexOf(hi) >= 0) notations += '<tied type="stop"/>';
      if (hi === 0) {
        (score.spanners || []).forEach(sp => {
          if (sp.type !== 'slur') return;
          if (sp.startId === ev.id) notations += '<slur type="start" number="' + slurNum[sp.id] + '"/>';
          if (sp.endId === ev.id) notations += '<slur type="stop" number="' + slurNum[sp.id] + '"/>';
        });
        if (tp && tupFirst[ev.dur.tuplet] === ei) notations += '<tuplet type="start" bracket="yes"/>';
        if (tp && tupLast[ev.dur.tuplet] === ei) notations += '<tuplet type="stop"/>';
        const arts = (ev.articulations || []).filter(a => ART[a]).map(a => '<' + ART[a] + '/>').join('');
        if (arts) notations += '<articulations>' + arts + '</articulations>';
        if ((ev.articulations || []).indexOf('fermata') >= 0) notations += '<fermata type="upright"/>';
        const orn = (ev.articulations || []).filter(a => a === 'trill' || a === 'mordent').map(a => a === 'trill' ? '<trill-mark/>' : '<mordent/>').join('');
        if (orn) notations += '<ornaments>' + orn + '</ornaments>';
      }
      let lyr = '';
      if (hi === 0) (ev.lyrics || []).forEach(l => {
        lyr += '<lyric number="' + (l.verse || 1) + '"><syllabic>' + (l.syllabic || 'single') + '</syllabic><text>' + esc(l.text) + '</text>' + (l.extend ? '<extend/>' : '') + '</lyric>';
      });
      out += '      <note>' + (ev.grace ? '<grace' + (ev.grace === 'acciaccatura' ? ' slash="yes"' : '') + '/>' : '') + (hi > 0 ? '<chord/>' : '') +
        '<pitch><step>' + h.step + '</step>' + (h.alter ? '<alter>' + h.alter + '</alter>' : '') + '<octave>' + h.octave + '</octave></pitch>' +
        (ev.grace ? '' : common) + (h.tieNext ? '<tie type="start"/>' : '') + (ev._tiedFrom && ev._tiedFrom.indexOf(hi) >= 0 ? '<tie type="stop"/>' : '') +
        tail + (h.accidental === 'show' ? '<accidental>' + ACC[h.alter || 0] + '</accidental>' : '') + tmod +
        (ev.stem === 'up' || ev.stem === 'down' ? '<stem>' + ev.stem + '</stem>' : '') + staff +
        (notations ? '<notations>' + notations + '</notations>' : '') + lyr + '</note>\n';
    });
    return out;
  }

  // 붙임줄 끝 표시를 위해 미리 계산 (내보내기 전에 복사본에 _tiedFrom 넣기)
  X.exportScore = function (score) {
    const s = U.clone(score);
    s.measures.forEach((m, mi) => Object.keys(m.staves).forEach(sid => m.staves[sid].voices.forEach((v, vi) => v.events.forEach((ev, ei) => {
      let prev = ei > 0 ? v.events[ei - 1] : null;
      if (!prev && mi > 0) { const pv = s.measures[mi - 1].staves[sid] && s.measures[mi - 1].staves[sid].voices[vi]; prev = pv && pv.events.length ? pv.events[pv.events.length - 1] : null; }
      if (ev.kind === 'note' && prev && prev.kind === 'note') {
        const tf = [];
        ev.heads.forEach((h, hi) => { if (prev.heads.some(p => p.tieNext && p.step === h.step && p.octave === h.octave)) tf.push(hi); });
        if (tf.length) ev._tiedFrom = tf;
      }
    }))));
    return X.export(s);
  };

  SJ.MusicXmlExport = X;
})(window.SJ = window.SJ || {});
