/* 표준 MIDI 파일(.mid, SMF 형식 1) 쓰기 — 음높이 · 길이 · 템포 · 박자 (§13) */
(function (SJ) {
  'use strict';
  const D = SJ.Dur, S = SJ.Score, P = SJ.Pitch, PPQ = SJ.C.PPQ;
  const M = {};
  const VEL = { ppp: 30, pp: 42, p: 56, mp: 68, mf: 80, f: 96, ff: 110, fff: 124, sfz: 112, sf: 108, fp: 96 };
  function gcd(a, b) { while (b) { const t = b; b = a % b; a = t; } return a; }
  function vlq(n) { const out = [n & 0x7F]; n >>= 7; while (n) { out.unshift((n & 0x7F) | 0x80); n >>= 7; } return out; }
  function track(events) {
    events.sort((a, b) => a.t - b.t || a.o - b.o);
    const bytes = [];
    let last = 0;
    events.forEach(e => { bytes.push(...vlq(e.t - last), ...e.d); last = e.t; });
    bytes.push(0, 0xFF, 0x2F, 0);
    const len = bytes.length;
    return [0x4D, 0x54, 0x72, 0x6B, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255].concat(bytes);
  }

  M.export = function (score) {
    let g = PPQ;
    S.forEachEvent(score, (ev, c) => { const t = D.eventTicks(ev, D.tupletMap(c.voice)); if (t) g = gcd(g, t); });
    const div = PPQ / g, T = t => Math.round(t / g);
    // 마디 시작 틱
    const starts = [];
    let acc = 0;
    score.measures.forEach((m, mi) => { starts.push(acc); acc += S.capacity(score, mi); });
    const meta = [];
    let lastTime = null, tempoSet = false;
    score.measures.forEach((m, mi) => {
      const t = S.timeAt(score, mi);
      if (!lastTime || lastTime.num !== t.num || lastTime.den !== t.den) {
        meta.push({ t: T(starts[mi]), o: 0, d: [0xFF, 0x58, 4, t.num, Math.round(Math.log2(t.den)), 24, 8] });
        lastTime = t;
      }
      if (m.attrs.tempo && m.attrs.tempo.bpm) {
        const bu = m.attrs.tempo.beatUnit || { type: 'quarter', dots: 0 };
        const qpm = m.attrs.tempo.bpm * D.notated(bu) / PPQ;
        const us = Math.round(60000000 / qpm);
        meta.push({ t: T(starts[mi]), o: 0, d: [0xFF, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] });
        tempoSet = true;
      }
      if (mi === 0) {
        const k = S.keyAt(score, 0);
        meta.push({ t: 0, o: 0, d: [0xFF, 0x59, 2, k.fifths & 255, k.mode === 'minor' ? 1 : 0] });
      }
    });
    if (!tempoSet) meta.push({ t: 0, o: 0, d: [0xFF, 0x51, 3, 0x07, 0xA1, 0x20] });
    const title = SJ.U.utf8(score.meta.title || 'SaboJak');
    meta.push({ t: 0, o: 0, d: [0xFF, 0x03, ...vlq(title.length), ...title] });
    const tracks = [track(meta)];

    score.staves.forEach((st, si) => {
      const ch = si >= 9 ? si + 1 : si;
      const evs = [];
      const nm = SJ.U.utf8(st.name || ('Staff ' + (si + 1)));
      evs.push({ t: 0, o: 0, d: [0xFF, 0x03, ...vlq(nm.length), ...nm] });
      evs.push({ t: 0, o: 0, d: [0xC0 | (ch & 15), 0] });
      let vel = 80;
      const open = {};   // 붙임줄로 이어지는 음: midi → 시작 틱
      score.measures.forEach((m, mi) => {
        const sm = m.staves[st.id]; if (!sm) return;
        sm.voices.forEach(v => {
          const vs = D.voiceStarts(v);
          v.events.forEach((ev, ei) => {
            if (ev.kind !== 'note' || ev.grace) return;
            if (ev.dynamic && VEL[ev.dynamic]) vel = VEL[ev.dynamic];
            const t0 = starts[mi] + vs.starts[ei], t1 = t0 + D.eventTicks(ev, vs.tmap);
            ev.heads.forEach(h => {
              const k = P.midi(h);
              if (k < 0 || k > 127) return;
              const key = k + ':' + vs.tmap;
              void key;
              if (open[k] === undefined) open[k] = t0;
              if (h.tieNext) return;
              evs.push({ t: T(open[k]), o: 2, d: [0x90 | (ch & 15), k, vel] });
              evs.push({ t: T(t1), o: 1, d: [0x80 | (ch & 15), k, 0] });
              delete open[k];
            });
          });
        });
      });
      tracks.push(track(evs));
    });
    const head = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (div >> 8) & 255, div & 255];
    const all = head.concat(...tracks);
    return new Uint8Array(all);
  };

  SJ.Midi = M;
})(window.SJ = window.SJ || {});
