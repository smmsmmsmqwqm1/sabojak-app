/* 마디 준비: 이벤트 → 세로 열(같은 시작 틱), 스템 방향, 임시표·점·화음 배치, 최소/이상 폭.
 * 결과(md)는 위치(x)와 무관한 데이터라 마디 객체 + 문맥이 같으면 캐시해서 재사용한다. */
(function (SJ) {
  'use strict';
  const C = SJ.C, D = SJ.Dur, P = SJ.Pitch, G = SJ.Glyphs, Sp = SJ.Spacing, TW = SJ.TextWidth;
  const MP = {};

  const gw = n => (G[n] ? G[n].w : 1);
  const cache = new WeakMap();

  MP.headGlyph = function (type) { return type === 'whole' ? 'noteheadWhole' : type === 'half' ? 'noteheadHalf' : 'noteheadBlack'; };
  MP.restGlyph = function (type) {
    return { whole: 'restWhole', half: 'restHalf', quarter: 'restQuarter', eighth: 'rest8th', '16th': 'rest16th', '32nd': 'rest32nd', '64th': 'rest64th' }[type];
  };
  MP.accGlyph = function (alter) {
    return { '-2': 'accidentalDoubleFlat', '-1': 'accidentalFlat', 0: 'accidentalNatural', 1: 'accidentalSharp', 2: 'accidentalDoubleSharp' }[alter];
  };

  // 박자표 글리프 폭
  MP.timeSigWidth = function (time) {
    if (time.symbol === 'common' || time.symbol === 'cut') return gw('timeSigCommon');
    const w = s => String(s).split('').reduce((a, ch) => a + gw('timeSig' + ch), 0);
    return Math.max(w(time.num), w(time.den));
  };
  MP.keySigWidth = function (fifths, cancelFrom) {
    const n = Math.abs(fifths);
    let w = n * (fifths > 0 ? 1.0 : 0.95);
    if (cancelFrom) w += MP.cancelCount(cancelFrom, fifths) * 0.85;
    return w;
  };
  // 조표 변경 시 제자리표로 지울 개수
  MP.cancelCount = function (from, to) {
    if (from === 0) return 0;
    if (to === 0) return Math.abs(from);
    if ((from > 0) !== (to > 0)) return Math.abs(from);
    return Math.max(0, Math.abs(from) - Math.abs(to));
  };

  /* ctx: {staves:[{id,k,def}], clefs:{sid:clef}, clefChanged:{sid:bool}, key, keyChanged, prevKey, time, timeChanged, beam44} */
  MP.prepare = function (score, mi, ctx) {
    const m = score.measures[mi];
    const sig = mi + '|' + ctx.staves.map(s => s.id + ':' + ctx.clefs[s.id] + (ctx.clefChanged[s.id] ? '!' : '')).join(',') +
      '|' + ctx.key.fifths + (ctx.keyChanged ? '!' + ctx.prevKey.fifths : '') + '|' + ctx.time.num + '/' + ctx.time.den + (ctx.time.symbol || '') + (ctx.timeChanged ? '!' : '') +
      '|' + ctx.beam44 + '|' + tieSig(score, mi);
    const hit = cache.get(m);
    if (hit && hit.sig === sig) return hit.md;
    const md = build(score, mi, m, ctx);
    cache.set(m, { sig, md });
    return md;
  };

  // 앞 마디에서 붙임줄로 이어져 들어오는 음 (임시표 숨김용)
  function tieSig(score, mi) {
    if (mi === 0) return '';
    const pm = score.measures[mi - 1];
    const keys = [];
    Object.keys(pm.staves).forEach(sid => pm.staves[sid].voices.forEach((v, vi) => {
      const last = v.events[v.events.length - 1];
      if (last && last.kind === 'note') last.heads.forEach(h => { if (h.tieNext) keys.push(sid + vi + h.step + h.octave + h.alter); });
    }));
    return keys.join(',');
  }

  function build(score, mi, m, ctx) {
    const cap = D.measureTicks(ctx.time);
    const md = { mi, id: m.id, measure: m, cap, time: ctx.time, key: ctx.key, staves: [], segments: [], infos: [], measureRests: [] };
    const tiedIn = new Set(tieSig(score, mi).split(',').filter(Boolean));

    ctx.staves.forEach(st => {
      const sm = m.staves[st.id] || { voices: [] };
      const clef = ctx.clefs[st.id];
      const voicesWithContent = sm.voices.filter(v => v.events.length).length;
      const multi = voicesWithContent > 1;
      const sInfo = { staffId: st.id, k: st.k, clef, multi, voices: [] };
      const all = [];
      sm.voices.forEach((v, vi) => {
        const vs = D.voiceStarts(v);
        const infos = v.events.map((ev, ei) => ({
          ev, ei, vi, k: st.k, staffId: st.id, start: vs.starts[ei], ticks: D.eventTicks(ev, vs.tmap),
          grace: ev.kind === 'note' && !!ev.grace, voice: v
        }));
        sInfo.voices.push({ vi, infos, total: vs.total, tmap: vs.tmap, tuplets: v.tuplets });
        infos.forEach(x => all.push(x));
        // 마디 쉼표: 첫 성부가 비었거나, 마디 전체 길이 쉼표 하나
        const single = infos.length === 1 && infos[0].ev.kind === 'rest' && (infos[0].ticks === cap || infos[0].ev.dur.type === 'whole');
        if ((vi === 0 && !infos.length) || single) {
          md.measureRests.push({ k: st.k, staffId: st.id, vi, ev: single ? infos[0].ev : null, multi, info: single ? infos[0] : null });
          if (single) infos[0].measureRest = true;
        }
      });

      // 빔·스템
      sInfo.voices.forEach(vv => {
        vv.beams = SJ.Beams.groups(vv.infos, ctx.time, cap, ctx.beam44);
        vv.infos.forEach(x => { x.beamGroup = -1; });
        vv.beams.forEach((g, gi) => g.forEach(i => { vv.infos[i].beamGroup = gi; }));
        vv.infos.forEach(x => prepNote(x, clef, multi, vv.vi));
        vv.beams.forEach(g => {
          let dir = forcedDir(multi, vv.vi);
          if (!dir) {
            const explicit = g.map(i => vv.infos[i].ev.stem).find(s => s === 'up' || s === 'down');
            if (explicit) dir = explicit === 'up' ? -1 : 1;
          }
          if (!dir) {
            let hi = -1e9, lo = 1e9;
            g.forEach(i => vv.infos[i].heads.forEach(h => { hi = Math.max(hi, h.pos); lo = Math.min(lo, h.pos); }));
            dir = (hi - 4) > (4 - lo) ? 1 : -1;   // 1 = 아래 스템
            if ((hi - 4) === (4 - lo)) dir = 1;
          }
          g.forEach(i => setStem(vv.infos[i], dir));
        });
        vv.infos.forEach(x => { if (x.ev.kind === 'note' && x.beamGroup < 0) setStem(x, x.grace ? -1 : (forcedDir(multi, vv.vi) || explicitOrAuto(x))); });
      });

      // 임시표: 보표 단위로 시간 순서
      const state = new P.AccidentalState(ctx.key.fifths);
      all.slice().sort((a, b) => a.start - b.start || (a.grace === b.grace ? a.vi - b.vi : (a.grace ? -1 : 1)) || a.ei - b.ei)
        .forEach(x => {
          if (x.ev.kind !== 'note') return;
          x.heads.forEach(h => {
            const tied = x.ei === 0 && tiedIn.has(st.id + x.vi + h.h.step + h.h.octave + (h.h.alter || 0));
            const prevTie = prevTieInVoice(x, h.h);
            h.acc = state.visit(h.h, tied || prevTie, tied && !prevTie);
          });
        });
      sInfo.voices.forEach(vv => vv.infos.forEach(x => { if (x.ev.kind === 'note') layoutChord(x); else layoutRest(x, multi, vv.vi); }));
      md.staves.push(sInfo);
      md.infos.push.apply(md.infos, all);
    });

    buildSegments(md, ctx);
    leadAndTail(md, m, ctx);
    widths(md);
    return md;
  }

  function forcedDir(multi, vi) { if (!multi) return 0; return vi % 2 === 0 ? -1 : 1; }
  function explicitOrAuto(x) {
    if (x.ev.stem === 'up') return -1;
    if (x.ev.stem === 'down') return 1;
    let hi = -1e9, lo = 1e9;
    x.heads.forEach(h => { hi = Math.max(hi, h.pos); lo = Math.min(lo, h.pos); });
    return (hi - 4) > (4 - lo) ? 1 : ((hi - 4) === (4 - lo) ? 1 : -1);
  }
  function prevTieInVoice(x, h) {
    if (x.ei === 0) return false;
    const prev = x.voice.events[x.ei - 1];
    return prev && prev.kind === 'note' && prev.heads.some(p => p.tieNext && p.step === h.step && p.octave === h.octave && (p.alter || 0) === (h.alter || 0));
  }

  function prepNote(x, clef, multi, vi) {
    const ev = x.ev;
    x.scale = x.grace ? C.graceScale : 1;
    if (ev.kind !== 'note') return;
    x.heads = ev.heads.map((h, hi) => ({ h, hi, pos: P.pos(h, clef), y: P.posToY(P.pos(h, clef)) }))
      .sort((a, b) => a.pos - b.pos);
    x.glyph = MP.headGlyph(ev.dur.type);
    x.headW = gw(x.glyph) * x.scale;
    x.flags = D.flags(ev.dur.type);
    x.hasStem = ev.dur.type !== 'whole';
    void multi; void vi;
  }
  function setStem(x, dir) { x.stemDir = dir; }

  // 화음: 2도 머리 좌우 분리, 임시표 계단, 점
  function layoutChord(x) {
    const s = x.scale;
    const hw = x.headW;
    const shift = (hw - C.stemW * s);
    const up = x.stemDir < 0;
    const order = up ? x.heads.slice() : x.heads.slice().reverse();
    let prev = null;
    order.forEach(h => {
      h.dx = 0;
      if (prev && Math.abs(h.pos - prev.pos) === 1 && prev.dx === 0 && x.hasStem) h.dx = up ? shift : -shift;
      else if (prev && Math.abs(h.pos - prev.pos) === 1 && prev.dx === 0 && !x.hasStem) h.dx = hw;
      prev = h;
    });
    const minDx = Math.min(0, ...x.heads.map(h => h.dx));
    const maxDx = Math.max(0, ...x.heads.map(h => h.dx));
    x.headLeft = minDx;                 // 음표 기준점(x=0) 기준 머리 왼쪽 끝
    x.headRight = hw + maxDx;
    // 임시표
    const accs = x.heads.filter(h => h.acc !== null && h.acc !== undefined);
    const cols = [];
    const zig = [];
    const desc = accs.slice().sort((a, b) => b.pos - a.pos);
    let i0 = 0, i1 = desc.length - 1, top = true;
    while (i0 <= i1) { zig.push(top ? desc[i0++] : desc[i1--]); top = !top; }
    zig.forEach(h => {
      const g = MP.accGlyph(h.acc);
      const w = gw(g) * s;
      let c = 0;
      while (cols[c] && cols[c].some(o => Math.abs(o.pos - h.pos) < 6)) c++;
      cols[c] = cols[c] || [];
      cols[c].push({ pos: h.pos, w, h, g });
    });
    let xr = x.headLeft - C.accGap * s;
    let leftExt = -x.headLeft;
    cols.forEach(col => {
      const cw = Math.max(...col.map(o => o.w));
      col.forEach(o => { o.h.accX = xr - o.w; o.h.accGlyph = o.g; });
      xr -= cw + 0.12 * s;
      leftExt = -xr;
    });
    x.left = leftExt;
    // 점
    x.dots = [];
    const nd = x.ev.dur.dots || 0;
    let right = x.headRight;
    if (nd) {
      const dx0 = x.headRight + C.dotGap * s;
      const ys = new Set();
      // 머리마다 점 하나: 줄 위 머리는 위 칸, 그 칸이 이미 차 있으면(2도 화음) 아래 칸 — 위 머리부터 차례로(Gould · 점검원 ④ 11-02)
      x.heads.slice().sort((a, b) => b.pos - a.pos).forEach(h => {
        let p = h.pos;
        if (p % 2 === 0) p += 1;
        if (ys.has(p) && h.pos % 2 === 0) p = h.pos - 1;
        ys.add(p);
      });
      Array.from(ys).forEach(p => {
        for (let d = 0; d < nd; d++) x.dots.push({ x: dx0 + d * C.dotSep * s, y: P.posToY(p) });
      });
      right = dx0 + (nd - 1) * C.dotSep * s + gw('augmentationDot') * s;
    }
    // 위로 꼬리(8분 이하, 빔 없음)는 오른쪽 폭 차지
    if (x.flags && x.beamGroup < 0 && x.stemDir < 0) right = Math.max(right, x.headRight + gw('flag8thUp') * s * 0.9);
    x.right = right;
    // 꾸밈음 빗금 여유
    if (x.grace) { x.left += 0.1; }
  }

  function layoutRest(x, multi, vi) {
    const ev = x.ev;
    x.glyph = MP.restGlyph(ev.dur.type);
    const g = G[x.glyph];
    // 기본 위치: 온쉼표는 넷째 줄(y=1)에 매달림, 나머지는 가운데 줄(y=2)
    let y = ev.dur.type === 'whole' ? 1 : 2;
    if (multi) y += (vi % 2 === 0 ? -2 : 2);
    if (ev.dur.type === 'whole' && multi && vi % 2 === 1) y = 3;
    x.restY = y;
    x.left = 0;
    x.headLeft = 0;
    x.headRight = g ? g.w : 1;
    x.headW = x.headRight;
    x.dots = [];
    let right = x.headRight;
    const nd = ev.dur.dots || 0;
    for (let d = 0; d < nd; d++) {
      x.dots.push({ x: x.headRight + C.dotGap + d * C.dotSep, y: y - 0.5 });
      right = x.headRight + C.dotGap + d * C.dotSep + 0.4;
    }
    x.right = right;
  }

  // 세로 열: 같은 시작 틱 = 같은 x
  function buildSegments(md, ctx) {
    const map = new Map();
    md.infos.forEach(x => {
      if (x.measureRest) return;
      if (!map.has(x.start)) map.set(x.start, { tick: x.start, items: [], graces: [] });
      const seg = map.get(x.start);
      (x.grace ? seg.graces : seg.items).push(x);
    });
    const segs = Array.from(map.values()).sort((a, b) => a.tick - b.tick);
    // 꾸밈음만 있고 본음이 없는 열(마디 끝 꾸밈음)도 유지
    segs.forEach(seg => {
      let left = 0, right = 0;
      seg.items.forEach(x => { left = Math.max(left, x.left); right = Math.max(right, x.right); });
      // 꾸밈음 묶음 폭: 성부별로 오른쪽→왼쪽 쌓기
      const gByVoice = {};
      seg.graces.forEach(x => { const key = x.k + ':' + x.vi; (gByVoice[key] = gByVoice[key] || []).push(x); });
      Object.keys(gByVoice).forEach(key => {
        const list = gByVoice[key];
        let off = left + 0.35;
        for (let i = list.length - 1; i >= 0; i--) {
          const g = list[i];
          g.graceOffset = -(off + g.right);          // 본음 기준점에서 왼쪽으로
          off += g.right + g.left + 0.25;
        }
        left = Math.max(left, off);
      });
      seg.left = left; seg.right = right || 1.18;
      // 가사·코드 폭 (결정적 추정)
      let lyricW = 0;
      seg.items.forEach(x => (x.ev.lyrics || []).forEach(l => { lyricW = Math.max(lyricW, TW.width(l.text, C.lyricSize) + (l.syllabic === 'begin' || l.syllabic === 'middle' ? 0.9 : 0.3)); }));
      seg.lyricW = lyricW;
      seg.chordW = 0;
      seg.ticksToNext = 0;
    });
    (md.measure.chords || []).forEach(ch => {
      let best = null;
      segs.forEach(sg => { if (sg.tick <= ch.tick && (!best || sg.tick > best.tick)) best = sg; });
      if (best) best.chordW = Math.max(best.chordW, TW.width(ch.text, C.chordSize, true) + 0.8);
    });
    let end = md.cap;
    md.infos.forEach(x => { end = Math.max(end, x.start + x.ticks); });
    md.endTick = end;
    segs.forEach((sg, i) => { sg.ticksToNext = (i + 1 < segs.length ? segs[i + 1].tick : end) - sg.tick; });
    md.segments = segs;
    void ctx;
  }

  // 마디 앞부분(음자리표·조표·박자표 변경, 도돌이 시작)과 끝 세로줄
  function leadAndTail(md, m, ctx) {
    const lead = { notFirst: 0, first: 0, clefW: 0, keyW: 0, timeW: 0, repW: 0 };
    const anyClef = ctx.staves.some(s => ctx.clefChanged[s.id]);
    if (anyClef) lead.clefW = gw('gClef') * C.cueScale + 0.5;
    if (ctx.keyChanged) lead.keyW = MP.keySigWidth(ctx.key.fifths, ctx.prevKey.fifths) + 0.7;
    if (ctx.timeChanged) lead.timeW = MP.timeSigWidth(ctx.time) + 0.8;
    if (m.attrs.repeatStart) lead.repW = C.thickBarW + C.barSep + C.thinBarW + C.repeatDotSep + 0.44 + 0.4;
    lead.notFirst = lead.clefW + lead.keyW + lead.timeW + lead.repW;
    lead.first = lead.timeW + lead.repW;     // 줄 첫 마디는 음자리표·조표를 머리에서 그림
    md.lead = lead;
    const be = m.attrs.repeatEnd ? 'repeatEnd' : (m.attrs.barlineEnd || 'single');
    md.barline = be;
    md.tailW = { single: C.thinBarW, dashed: C.thinBarW, none: 0, double: C.thinBarW * 2 + C.barSep, final: C.thinBarW + C.barSep + C.thickBarW,
      repeatEnd: 0.44 + C.repeatDotSep + C.thinBarW + C.barSep + C.thickBarW }[be] || C.thinBarW;
  }

  // 간격 목록: gaps[0] = 앞 여백 → 첫 열, gaps[i] = 열 i-1 → 열 i, 마지막 = 끝 열 → 세로줄
  function widths(md) {
    const segs = md.segments;
    const gaps = [];
    if (!segs.length) {
      md.gaps = [];
      md.minContent = 1.13 + 2.4;
      md.idealContent = C.emptyMeasureWidth;
    } else {
      gaps.push({ min: C.measureLeadPad + segs[0].left, ideal: C.measureLeadPad + segs[0].left, fixed: true });
      for (let i = 1; i < segs.length; i++) {
        const a = segs[i - 1], b = segs[i];
        let min = a.right + C.spaceMinGap + b.left;
        if (a.lyricW || b.lyricW) min = Math.max(min, (a.lyricW + b.lyricW) / 2 + 0.4 - 0.0);
        const ideal = Math.max(min, Sp.ideal(a.ticksToNext));
        gaps.push({ min, ideal });
      }
      const last = segs[segs.length - 1];
      let tmin = last.right + C.measureTailMin;
      if (last.lyricW) tmin = Math.max(tmin, last.lyricW / 2 + 0.6);
      gaps.push({ min: tmin, ideal: Math.max(tmin, Sp.ideal(last.ticksToNext)) });
      // 코드 기호: 다음 코드 기호(또는 마디 끝)까지의 거리만 보장 — 사이 음표 간격에 고르게 나눔
      const ci = [];
      segs.forEach((sg, i) => { if (sg.chordW) ci.push(i); });
      ci.forEach((i, q) => {
        const j = q + 1 < ci.length ? ci[q + 1] : segs.length;      // gaps[i+1..j]
        const need = q + 1 < ci.length ? segs[i].chordW : segs[i].chordW * 0.7;
        let have = 0;
        for (let g = i + 1; g <= j; g++) have += gaps[g].min;
        if (have < need) {
          const add = (need - have) / (j - i);
          for (let g = i + 1; g <= j; g++) { gaps[g].min += add; gaps[g].ideal = Math.max(gaps[g].ideal, gaps[g].min); }
        }
      });
      md.gaps = gaps;
      md.minContent = gaps.reduce((a, g) => a + g.min, 0);
      md.idealContent = gaps.reduce((a, g) => a + g.ideal, 0);
    }
    md.minWidth = first => md.minContent + md.tailW + (first ? md.lead.first : md.lead.notFirst);
    md.idealWidth = first => md.idealContent + md.tailW + (first ? md.lead.first : md.lead.notFirst);
  }

  /* 할당된 폭 안에서 열 x 위치 계산 (마디 왼쪽 = 0). 반환 {xs, contentStart, contentEnd} */
  MP.place = function (md, width, first) {
    const lead = first ? md.lead.first : md.lead.notFirst;
    const avail = width - lead - md.tailW;
    if (!md.segments.length) return { xs: [], lead, contentStart: lead, contentEnd: width - md.tailW };
    const free = md.gaps.slice(1);
    const g0 = md.gaps[0].min;
    const dist = Sp.distribute(free, Math.max(0, avail - g0));
    const xs = [];
    let x = lead + g0;
    xs.push(x);
    for (let i = 0; i < dist.length - 1; i++) { x += dist[i]; xs.push(x); }
    return { xs, lead, contentStart: lead, contentEnd: width - md.tailW };
  };

  MP.clearCache = function () { /* WeakMap — 자동 정리 */ };
  SJ.MeasurePrep = MP;
})(window.SJ = window.SJ || {});
