/* 데이터 모델: 악보 만들기, 보표 구성 프리셋, 현재 박자·조표·음자리표 찾기 */
(function (SJ) {
  'use strict';
  const U = SJ.U, D = SJ.Dur;
  const S = {};

  S.PAPER = {
    A4: { width: 210, height: 297 },
    Letter: { width: 215.9, height: 279.4 }
  };

  S.defaultPage = function (size, orientation) {
    const p = S.PAPER[size] || S.PAPER.A4;
    const land = orientation === 'landscape';
    return {
      size: S.PAPER[size] ? size : 'A4', orientation: land ? 'landscape' : 'portrait',
      width: land ? p.height : p.width, height: land ? p.width : p.height,
      margins: { top: 15, bottom: 15, left: 15, right: 15 },
      staffSize: 7,                 // 보표 높이(mm) → sp = 1.75mm
      pageNumbers: true, header: '', footer: '',
      // 제목 모양: 크기(mm) · 굵게 · 기울임 · 밑줄(제목을 손으로 쓸 칸) — 제목을 누르면 바로 바꿀 수 있다
      titleStyle: { size: 7.5, bold: true, italic: false, underline: true },
      creditStyle: { size: 3.4, bold: false, italic: false }
    };
  };

  S.defaultLayout = function () {
    return {
      // 사용자 요청: 기본은 '세로줄 정렬 + 줄당 4마디 + 같은 폭' (설정에서 기본값 변경 가능)
      alignGrid: { enabled: true, measuresPerSystem: 4, widthMode: 'equal' },
      measuresPerSystem: 'auto',
      staffDistance: SJ.C.staffDistance,
      systemDistance: SJ.C.systemDistance,
      measureNumbers: 'system',
      beam44: 'half'
    };
  };

  function staff(name, abbr, clef, extra) {
    return Object.assign({ id: U.sid(), kind: 'standard', name: name || '', abbr: abbr || '', clef: clef || 'treble', lines: 5, visible: true }, extra || {});
  }

  // 보표 구성 프리셋 (§5)
  // 사람들이 가장 많이 찾는 구성 순서 (새 악보 화면에서 넘겨 보며 고른다)
  S.PRESET_ORDER = ['single', 'grand', 'leadsheet', 'vocalPiano', 'choir', 'bassStaff', 'guitar', 'duet'];
  // 보표 이름은 악보에 저장되어 인쇄되므로 만들 때의 앱 언어로 (영어 사용자는 Piano · Soprano …)
  const nm = (ko, en) => (SJ.getLang && SJ.getLang() === 'en' ? en : ko);
  S.PRESETS = {
    single: { label: '멜로디 (높은음자리표 한 줄)', labelEn: 'Melody (treble)', desc: '노래·관악기·바이올린 등 한 줄 악보', make: () => [staff('', '', 'treble')] },
    choir: {
      label: '합창 (소프라노·알토·테너·베이스)', labelEn: 'Choir SATB', desc: '4성부 합창', make: () => {
        const g = U.sid();
        return [staff(nm('소프라노', 'Soprano'), 'S.', 'treble', { groupId: g, groupType: 'bracket' }), staff(nm('알토', 'Alto'), 'A.', 'treble', { groupId: g, groupType: 'bracket' }),
          staff(nm('테너', 'Tenor'), 'T.', 'treble8vb', { groupId: g, groupType: 'bracket' }), staff(nm('베이스', 'Bass'), 'B.', 'bass', { groupId: g, groupType: 'bracket' })];
      }
    },
    bassStaff: { label: '낮은음자리표 한 줄', labelEn: 'Bass clef', desc: '베이스·첼로·트롬본 등', make: () => [staff('', '', 'bass')] },
    guitar: { label: '기타 (옥타브 낮은 높은음자리표)', labelEn: 'Guitar (treble 8vb)', desc: '기타 오선 악보', make: () => [staff(nm('기타', 'Guitar'), 'Gtr.', 'treble8vb')] },
    duet: { label: '이중주 (높은음자리표 두 줄)', labelEn: 'Duet', desc: '두 악기·두 성부', make: () => [staff('1', '1', 'treble'), staff('2', '2', 'treble')] },
    grand: {
      label: '피아노 (높은음+낮은음 대보표)', labelEn: 'Piano (grand staff)', desc: '피아노·키보드', make: () => {
        const g = U.sid();
        return [staff(nm('피아노', 'Piano'), 'Pno.', 'treble', { groupId: g, groupType: 'brace' }), staff('', '', 'bass', { groupId: g, groupType: 'brace' })];
      }
    },
    leadsheet: { label: '리드시트 (멜로디·코드·가사)', labelEn: 'Lead sheet', desc: '밴드·반주용 코드 악보', make: () => [staff('', '', 'treble')], leadsheet: true },
    vocalPiano: {
      label: '보컬 + 피아노', labelEn: 'Voice + Piano', desc: '노래 + 반주 3단 악보', make: () => {
        const g = U.sid();
        return [staff(nm('보컬', 'Voice'), 'Vo.', 'treble'), staff(nm('피아노', 'Piano'), 'Pno.', 'treble', { groupId: g, groupType: 'brace' }), staff('', '', 'bass', { groupId: g, groupType: 'brace' })];
      }
    }
  };

  S.newVoice = function () { return { events: [], tuplets: [] }; };
  S.newStaffMeasure = function () { return { voices: [S.newVoice()] }; };
  S.newMeasure = function (staves) {
    const m = { id: U.sid(), attrs: { barlineEnd: 'single', markers: [] }, staves: {}, chords: [] };
    staves.forEach(st => { m.staves[st.id] = S.newStaffMeasure(); });
    return m;
  };

  /* opts: {title, composer, preset, staves(사용자 정의), time:{num,den,symbol?}, key:{fifths,mode}, tempo:{bpm,text},
   *        measures, paper, orientation} */
  S.create = function (opts) {
    opts = opts || {};
    const now = U.isoNow();
    const preset = S.PRESETS[opts.preset] || S.PRESETS.single;
    const staves = opts.staves ? U.clone(opts.staves) : preset.make();
    const n = Math.max(1, Math.min(999, opts.measures || 16));
    const measures = [];
    for (let i = 0; i < n; i++) measures.push(S.newMeasure(staves));
    measures[0].attrs.time = opts.time ? U.clone(opts.time) : { num: 4, den: 4 };
    measures[0].attrs.key = opts.key ? U.clone(opts.key) : { fifths: 0, mode: 'major' };
    if (opts.tempo && (opts.tempo.bpm || opts.tempo.text)) {
      measures[0].attrs.tempo = { text: opts.tempo.text || '', bpm: opts.tempo.bpm || undefined, beatUnit: { type: 'quarter', dots: 0 } };
    }
    measures[n - 1].attrs.barlineEnd = 'final';
    return {
      schema: SJ.APP.schema,
      id: U.uuid(),
      meta: {
        title: U.nfc(opts.title || ''), subtitle: '', composer: U.nfc(opts.composer || ''), lyricist: '', arranger: '', copyright: '',
        createdAt: now, updatedAt: now
      },
      page: S.defaultPage(opts.paper, opts.orientation),
      layout: S.defaultLayout(),
      staves,
      measures,
      texts: [],
      spanners: []
    };
  };

  // ── 현재 속성 찾기 ──────────────────────
  S.timeAt = function (score, mi) {
    for (let i = Math.min(mi, score.measures.length - 1); i >= 0; i--) {
      const t = score.measures[i].attrs.time;
      if (t) return t;
    }
    return { num: 4, den: 4 };
  };
  S.keyAt = function (score, mi) {
    for (let i = Math.min(mi, score.measures.length - 1); i >= 0; i--) {
      const k = score.measures[i].attrs.key;
      if (k) return k;
    }
    return { fifths: 0, mode: 'major' };
  };
  // 마디 시작 시점의 음자리표 (그 마디의 clefChange 포함)
  S.clefAt = function (score, mi, staffId) {
    for (let i = Math.min(mi, score.measures.length - 1); i >= 0; i--) {
      const sm = score.measures[i].staves[staffId];
      if (sm && sm.clefChange) return sm.clefChange;
    }
    const st = score.staves.find(s => s.id === staffId);
    return st ? st.clef : 'treble';
  };
  S.capacity = function (score, mi) { return D.measureTicks(S.timeAt(score, mi)); };

  S.staffIndex = function (score, staffId) { return score.staves.findIndex(s => s.id === staffId); };
  S.visibleStaves = function (score) { return score.staves.filter(s => s.visible !== false); };

  // 마디가 비었는지 (모든 보표·성부에 이벤트 없음)
  S.measureEmpty = function (m) {
    return Object.keys(m.staves).every(k => m.staves[k].voices.every(v => v.events.length === 0));
  };

  // 마디 길이 상태: 보표·성부별 합계와 부족/초과
  S.measureFill = function (score, mi) {
    const m = score.measures[mi];
    const cap = S.capacity(score, mi);
    let worst = 0;   // -1 부족, 1 초과
    const per = [];
    Object.keys(m.staves).forEach(sid => {
      m.staves[sid].voices.forEach((v, vi) => {
        if (!v.events.length) return;
        const tot = D.voiceStarts(v).total;
        per.push({ staffId: sid, voice: vi, total: tot, cap });
        if (tot > cap) worst = 1;
        else if (tot < cap && !m.attrs.pickup && worst === 0) worst = -1;
      });
    });
    return { cap, per, status: worst };
  };

  // 이벤트 찾기 (점수 전체)
  S.findEvent = function (score, eventId) {
    for (let mi = 0; mi < score.measures.length; mi++) {
      const m = score.measures[mi];
      for (const sid of Object.keys(m.staves)) {
        const vs = m.staves[sid].voices;
        for (let vi = 0; vi < vs.length; vi++) {
          const ei = vs[vi].events.findIndex(e => e.id === eventId);
          if (ei >= 0) return { mi, staffId: sid, vi, ei, ev: vs[vi].events[ei] };
        }
      }
    }
    return null;
  };

  // 모든 이벤트 순회
  S.forEachEvent = function (score, fn) {
    score.measures.forEach((m, mi) => {
      Object.keys(m.staves).forEach(sid => {
        m.staves[sid].voices.forEach((v, vi) => v.events.forEach((ev, ei) => fn(ev, { m, mi, staffId: sid, vi, ei, voice: v })));
      });
    });
  };

  S.newNote = function (dur, heads) {
    return { kind: 'note', id: U.sid(), dur: Object.assign({ dots: 0 }, dur), heads: heads.map(h => Object.assign({ alter: 0 }, h)), articulations: [] };
  };
  S.newRest = function (dur) {
    return { kind: 'rest', id: U.sid(), dur: Object.assign({ dots: 0 }, dur), articulations: [] };
  };

  // 박자표 문자열
  S.timeLabel = function (t) {
    if (!t) return '4/4';
    if (t.symbol === 'common') return 'C';
    if (t.symbol === 'cut') return '¢';
    return t.num + '/' + t.den;
  };

  // 페이지 수 등 메타(목록용)
  S.summary = function (score) {
    return {
      id: score.id, title: score.meta.title, composer: score.meta.composer,
      updatedAt: score.meta.updatedAt, createdAt: score.meta.createdAt, measures: score.measures.length
    };
  };

  SJ.Score = S;
})(window.SJ = window.SJ || {});
