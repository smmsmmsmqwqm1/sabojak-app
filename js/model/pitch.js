/* 음높이·음자리표·조표·임시표 규칙·조옮김 */
(function (SJ) {
  'use strict';
  const P = {};
  P.STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  P.SEMI = SEMI;

  // 음자리표: bottomDn = 아래 첫 줄의 온음계 번호, refPos = 글리프 기준 줄의 위치(아래 줄=0, 칸 단위 반칸=1)
  P.CLEFS = {
    treble: { bottomDn: 30, glyph: 'gClef', refPos: 2, label: '높은음자리표', labelEn: 'Treble' },
    bass: { bottomDn: 18, glyph: 'fClef', refPos: 6, label: '낮은음자리표', labelEn: 'Bass' },
    alto: { bottomDn: 24, glyph: 'cClef', refPos: 4, label: '가온음자리표(알토)', labelEn: 'Alto' },
    tenor: { bottomDn: 22, glyph: 'cClef', refPos: 6, label: '가온음자리표(테너)', labelEn: 'Tenor' },
    treble8vb: { bottomDn: 23, glyph: 'gClef8vb', refPos: 2, label: '옥타브 낮은 높은음자리표', labelEn: 'Treble 8vb' }
  };
  P.CLEF_IDS = ['treble', 'bass', 'alto', 'tenor', 'treble8vb'];

  P.dn = function (h) { return h.octave * 7 + P.STEPS.indexOf(h.step); };
  P.fromDn = function (dn) { const o = Math.floor(dn / 7); return { step: P.STEPS[dn - o * 7], octave: o }; };
  P.midi = function (h) { return (h.octave + 1) * 12 + SEMI[h.step] + (h.alter || 0); };
  // 보표 위치 (아래 첫 줄 = 0, 한 칸 위 = 1, 둘째 줄 = 2 ...)
  P.pos = function (h, clef) { return P.dn(h) - (P.CLEFS[clef] || P.CLEFS.treble).bottomDn; };
  // 위치 → y (sp, 위 첫 줄 = 0, 아래로 증가)
  P.posToY = function (pos) { return (8 - pos) / 2; };
  P.yToPos = function (y) { return 8 - y * 2; };

  // 조표: fifths -7..7
  const SHARP_ORDER = ['F', 'C', 'G', 'D', 'A', 'E', 'B'];
  const FLAT_ORDER = ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
  P.keyAlter = function (step, fifths) {
    if (fifths > 0 && SHARP_ORDER.indexOf(step) < fifths) return 1;
    if (fifths < 0 && FLAT_ORDER.indexOf(step) < -fifths) return -1;
    return 0;
  };
  // 높은음자리표 기준 조표 위치 + 음자리표별 이동
  const SHARP_POS_TREBLE = [8, 5, 9, 6, 3, 7, 4];
  const FLAT_POS_TREBLE = [4, 7, 3, 6, 2, 5, 1];
  const SHARP_POS_TENOR = [2, 6, 3, 7, 4, 8, 5];
  P.keySigPositions = function (fifths, clef) {
    const n = Math.abs(fifths);
    let base, shift = 0;
    if (fifths > 0) {
      if (clef === 'tenor') return SHARP_POS_TENOR.slice(0, n);
      base = SHARP_POS_TREBLE;
    } else base = FLAT_POS_TREBLE;
    if (clef === 'bass') shift = -2;
    else if (clef === 'alto') shift = -1;
    else if (clef === 'tenor') shift = 1;
    return base.slice(0, n).map(p => p + shift);
  };

  // 조 이름
  const MAJOR = { '-7': 'C♭', '-6': 'G♭', '-5': 'D♭', '-4': 'A♭', '-3': 'E♭', '-2': 'B♭', '-1': 'F', 0: 'C', 1: 'G', 2: 'D', 3: 'A', 4: 'E', 5: 'B', 6: 'F♯', 7: 'C♯' };
  const MINOR = { '-7': 'A♭', '-6': 'E♭', '-5': 'B♭', '-4': 'F', '-3': 'C', '-2': 'G', '-1': 'D', 0: 'A', 1: 'E', 2: 'B', 3: 'F♯', 4: 'C♯', 5: 'G♯', 6: 'D♯', 7: 'A♯' };
  P.keyName = function (key, lang) {
    if (!key) key = { fifths: 0, mode: 'major' };
    const minor = key.mode === 'minor';
    const n = (minor ? MINOR : MAJOR)[key.fifths];
    if (lang === 'en') return n + (minor ? ' minor' : ' major');
    return n + (minor ? ' 단조' : ' 장조');
  };

  P.accSymbol = function (alter) { return { '-2': '𝄫', '-1': '♭', 0: '♮', 1: '♯', 2: '𝄪' }[alter] || ''; };
  P.name = function (h) { return h.step + (h.alter ? P.accSymbol(h.alter) : '') + h.octave; };

  // 위치 + 음자리표 + 조표 → 음 (임시표 없음 = 조표대로)
  P.headFromPos = function (pos, clef, fifths) {
    const dn = pos + (P.CLEFS[clef] || P.CLEFS.treble).bottomDn;
    const s = P.fromDn(dn);
    return { step: s.step, octave: s.octave, alter: P.keyAlter(s.step, fifths || 0) };
  };

  /* 마디 안 임시표 표시 계산 (§5): 한 보표·한 마디 안에서 왼쪽→오른쪽 순으로 부르면
   * 각 머리에 표시할 임시표(alter 값) 또는 null 을 돌려준다. 다음 마디로 넘어가면 상태 초기화. */
  P.AccidentalState = function (fifths) {
    this.fifths = fifths || 0;
    this.cur = {};   // key: step+octave → alter
  };
  P.AccidentalState.prototype.current = function (step, octave) {
    const k = step + octave;
    if (Object.prototype.hasOwnProperty.call(this.cur, k)) return this.cur[k];
    return P.keyAlter(step, this.fifths);
  };
  // tiedFrom: 앞 음에서 붙임줄로 이어진 음이면 표시하지 않음
  // crossBar: 앞 마디에서 붙임줄로 넘어온 음 — 표시하지 않고 이 마디의 상태에도 남기지 않는다
  //   (그 뒤 같은 음에는 임시표를 다시 붙이는 것이 맞는 표기 · Gould · 점검원 ④ 11-02)
  P.AccidentalState.prototype.visit = function (head, tiedFrom, crossBar) {
    if (crossBar && head.accidental !== 'show') return null;
    const alter = head.alter || 0;
    const cur = this.current(head.step, head.octave);
    let show = alter !== cur;
    if (tiedFrom) show = false;
    if (head.accidental === 'show') show = true;
    if (head.accidental === 'hide') show = false;
    this.cur[head.step + head.octave] = alter;
    return show ? alter : null;
  };

  /* 조옮김: 온음계 이동량 + 반음 이동량으로 철자 유지 */
  P.transposeHead = function (h, steps, semis) {
    const dn = P.dn(h) + steps;
    const s = P.fromDn(dn);
    const targetMidi = P.midi(h) + semis;
    const natural = (s.octave + 1) * 12 + SEMI[s.step];
    let alter = targetMidi - natural;
    const out = Object.assign({}, h, { step: s.step, octave: s.octave, alter });
    if (alter > 2 || alter < -2) return P.respell(out);
    return out;
  };
  // 이명동음으로 다시 쓰기 (가장 가까운 철자)
  P.respell = function (h) {
    const m = P.midi(h);
    let best = null;
    for (let d = -2; d <= 2; d++) {
      const s = P.fromDn(P.dn(h) + d);
      const natural = (s.octave + 1) * 12 + SEMI[s.step];
      const alter = m - natural;
      if (alter >= -2 && alter <= 2) {
        const score = Math.abs(alter) * 10 + Math.abs(d);
        if (!best || score < best.score) best = { score, step: s.step, octave: s.octave, alter };
      }
    }
    return Object.assign({}, h, { step: best.step, octave: best.octave, alter: best.alter });
  };
  // 이명동음 전환 (♯↔♭ 순환)
  P.enharmonic = function (h) {
    const m = P.midi(h);
    const opts = [];
    for (let d = -2; d <= 2; d++) {
      if (d === 0) continue;
      const s = P.fromDn(P.dn(h) + d);
      const natural = (s.octave + 1) * 12 + SEMI[s.step];
      const alter = m - natural;
      if (alter >= -2 && alter <= 2) opts.push({ step: s.step, octave: s.octave, alter, cost: Math.abs(alter) });
    }
    opts.sort((a, b) => a.cost - b.cost || P.dn(a) - P.dn(b));
    if (!opts.length) return h;
    return Object.assign({}, h, { step: opts[0].step, octave: opts[0].octave, alter: opts[0].alter });
  };

  // 조 → 으뜸음 (장조 기준)
  const TONIC_MAJOR = { '-7': ['C', -1], '-6': ['G', -1], '-5': ['D', -1], '-4': ['A', -1], '-3': ['E', -1], '-2': ['B', -1], '-1': ['F', 0], 0: ['C', 0], 1: ['G', 0], 2: ['D', 0], 3: ['A', 0], 4: ['E', 0], 5: ['B', 0], 6: ['F', 1], 7: ['C', 1] };
  P.tonic = function (fifths) { const t = TONIC_MAJOR[fifths]; return { step: t[0], alter: t[1] }; };

  // 조 A → 조 B 의 음정 (온음계 steps, 반음 semis). 반음은 -6..+6 가까운 쪽
  P.intervalBetweenKeys = function (fromFifths, toFifths, direction) {
    const a = P.tonic(fromFifths), b = P.tonic(toFifths);
    let steps = P.STEPS.indexOf(b.step) - P.STEPS.indexOf(a.step);
    let semis = (SEMI[b.step] + b.alter) - (SEMI[a.step] + a.alter);
    semis = ((semis % 12) + 12) % 12;
    steps = ((steps % 7) + 7) % 7;
    if (direction === 'down' || (direction !== 'up' && semis > 6)) { semis -= 12; steps -= 7; }
    if (steps === -7 && semis === -12) { /* 옥타브 */ }
    return { steps, semis };
  };
  // 반음 이동 → 새 조(조표 개수가 적은 쪽) + 음정
  P.keyForSemitones = function (fifths, semis) {
    let nf = fifths + 7 * semis;
    nf = ((nf % 12) + 12) % 12;      // 0..11
    if (nf > 6) nf -= 12;            // -5..6
    // 같은 소리 조 중 조표 적은 쪽 (F♯=6 / G♭=-6 는 F♯ 선택)
    return nf;
  };
  P.intervalForSemitones = function (fifths, semis) {
    const nf = P.keyForSemitones(fifths, semis);
    const iv = P.intervalBetweenKeys(fifths, nf, semis >= 0 ? 'up' : 'down');
    // 옥타브 이상 이동 반영
    const oct = Math.trunc(semis / 12);
    let steps = iv.steps + oct * 7, s = iv.semis + oct * 12;
    if (s !== semis) { const diff = semis - s; steps += Math.round(diff / 12) * 7; s = semis; }
    if (semis === 0) steps = 0;
    return { steps, semis: s, fifths: nf };
  };

  SJ.Pitch = P;
})(window.SJ = window.SJ || {});
