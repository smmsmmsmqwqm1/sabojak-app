/* 마디 그리기: 준비된 md + x 위치 → 렌더 항목(sp 좌표, 보표 기준). 세로줄은 시스템 단계에서 그린다. */
(function (SJ) {
  'use strict';
  const C = SJ.C, G = SJ.Glyphs, P = SJ.Pitch, D = SJ.Dur, MP = SJ.MeasurePrep;
  const MR = {};
  const gw = n => (G[n] ? G[n].w : 1);
  const anc = (n, a, dflt) => (G[n] && G[n].anchors && G[n].anchors[a]) ? G[n].anchors[a] : dflt;

  /* opts: {mi, clefs, ctx(prepare ctx), noteColor?} 반환 {items, deferred, events, hits, segX} */
  MR.render = function (md, x0, width, first, opts) {
    const out = { items: [], deferred: [], events: {}, hits: [], segX: [], x0, width };
    const pl = MP.place(md, width, first);
    out.place = pl;
    md.segments.forEach((sg, i) => { out.segX.push({ tick: sg.tick, x: x0 + pl.xs[i] }); });
    const ctx = opts.ctx;
    const push = it => out.items.push(it);

    // ── 마디 앞부분 ──
    let lx = x0 + 0.5;
    if (!first) {
      if (md.lead.clefW) {
        ctx.staves.forEach(st => {
          if (!ctx.clefChanged[st.id]) return;
          const cl = P.CLEFS[ctx.clefs[st.id]];
          push({ t: 'g', k: st.k, n: cl.glyph, x: lx, y: P.posToY(cl.refPos) , s: C.cueScale });
        });
        lx += md.lead.clefW;
      }
      if (md.lead.keyW) {
        ctx.staves.forEach(st => MR.keySig(push, st.k, lx, ctx.key.fifths, ctx.clefs[st.id], ctx.prevKey.fifths));
        lx += md.lead.keyW;
      }
    }
    if (md.lead.timeW) {
      ctx.staves.forEach(st => MR.timeSig(push, st.k, lx + 0.1, md.time));
      lx += md.lead.timeW;
    }
    if (md.lead.repW) out.repeatStartX = lx;

    // ── 음표·쉼표 ──
    const segIndex = new Map();
    md.segments.forEach((sg, i) => segIndex.set(sg.tick, i));
    md.staves.forEach(st => {
      st.voices.forEach(vv => {
        vv.infos.forEach(x => {
          if (x.measureRest) return;
          const si = segIndex.get(x.start);
          let nx = x0 + (si !== undefined ? pl.xs[si] : pl.contentStart);
          if (x.grace) nx += x.graceOffset || -1.5;
          // 손으로 옮긴 가로 위치 (ev.xShift = 마디 폭에 대한 비율, 없으면 자동). 마디 안에서만
          if (x.ev.xShift) nx = Math.max(x0 + pl.contentStart - 0.4, Math.min(x0 + pl.contentEnd - 1.2, nx + x.ev.xShift * width));
          x.nx = nx;
        });
        vv.infos.forEach(x => {
          if (x.measureRest) return;
          if (x.ev.kind === 'note') drawNote(out, x, md, st);
          else drawRest(out, x, md, st);
        });
        vv.beams.forEach(g => drawBeam(out, g.map(i => vv.infos[i]), md, st));
        vv.infos.forEach(x => { if (x.ev.kind === 'note' && x.hasStem) finishStem(out, x, md, st); });
        drawTuplets(out, vv, md, st);
        vv.infos.forEach(x => { if (!x.measureRest) drawArtic(out, x, md, st); });
      });
    });

    // ── 마디 쉼표 ──
    md.measureRests.forEach(r => {
      // 손글씨를 그리는 동안의 화면용 사본: 빈 마디 자리표는 그리지만 않는다(배치 계산은 그대로 — 그리는 중에 오선이 움직이지 않게)
      if (!r.ev && md.measure['x-noPlaceholder']) return;
      const gx = x0 + (pl.contentStart + pl.contentEnd) / 2 - gw('restWhole') / 2;
      let y = 1;
      if (r.multi) y = r.vi % 2 === 0 ? -1 : 3;
      push({ t: 'g', k: r.k, n: 'restWhole', x: gx, y, ref: r.ev ? refOf(md, r.staffId, r.vi, r.ev) : null });
      const box = { x0: gx - 0.3, y0: y - 0.6, x1: gx + 1.5, y1: y + 1.1, k: r.k, ref: r.ev ? refOf(md, r.staffId, r.vi, r.ev, 'rest') : { type: 'measure', mi: md.mi, staffId: r.staffId } };
      out.hits.push(box);
      if (r.ev) {
        out.events[r.ev.id] = { k: r.k, x: gx, w: gw('restWhole'), top: y, bottom: y + 0.5, mi: md.mi, staffId: r.staffId, vi: r.vi, rest: true };
        if ((r.ev.articulations || []).indexOf('fermata') >= 0) out.deferred.push({ t: 'above', k: r.k, x: gx + gw('restWhole') / 2, n: 'fermataAbove', top: y - 0.5 });
      }
    });

    // ── 코드 기호 (맨 위 보표) ──
    (md.measure.chords || []).forEach(ch => {
      let x = null;
      md.segments.forEach((sg, i) => { if (sg.tick <= ch.tick) x = x0 + pl.xs[i]; });
      if (x === null) x = x0 + pl.contentStart + 1;
      out.deferred.push({ t: 'chord', k: 0, x, text: ch.text, ref: { type: 'chord', mi: md.mi, chordId: ch.id, tick: ch.tick } });
    });
    return out;
  };

  function refOf(md, staffId, vi, ev, type) {
    return { type: type || (ev.kind === 'note' ? 'note' : 'rest'), mi: md.mi, staffId, vi, eventId: ev.id };
  }

  // 조표 (cancelFrom 있으면 제자리표 먼저)
  MR.keySig = function (push, k, x, fifths, clef, cancelFrom) {
    let cx = x;
    if (cancelFrom !== undefined && cancelFrom !== null && cancelFrom !== fifths) {
      const nCancel = MP.cancelCount(cancelFrom, fifths);
      if (nCancel) {
        const all = P.keySigPositions(cancelFrom, clef);
        // 남는 것 이후의 표들을 제자리표로 (부호가 바뀌면 전부)
        const sameSign = (cancelFrom > 0) === (fifths > 0) && fifths !== 0;
        const list = sameSign ? all.slice(Math.abs(fifths)) : all;
        list.forEach(p => { push({ t: 'g', k, n: 'accidentalNatural', x: cx, y: P.posToY(p) }); cx += 0.85; });
        cx += 0.3;
      }
    }
    const ps = P.keySigPositions(fifths, clef);
    const n = fifths > 0 ? 'accidentalSharp' : 'accidentalFlat';
    ps.forEach(p => { push({ t: 'g', k, n, x: cx, y: P.posToY(p) }); cx += fifths > 0 ? 1.0 : 0.95; });
    return cx;
  };

  MR.timeSig = function (push, k, x, time) {
    if (time.symbol === 'common' || time.symbol === 'cut') {
      push({ t: 'g', k, n: time.symbol === 'common' ? 'timeSigCommon' : 'timeSigCutCommon', x, y: 2 });
      return;
    }
    const w = MP.timeSigWidth(time);
    const row = (str, y) => {
      const s = String(str);
      const tw = s.split('').reduce((a, ch) => a + gw('timeSig' + ch), 0);
      let cx = x + (w - tw) / 2;
      s.split('').forEach(ch => { push({ t: 'g', k, n: 'timeSig' + ch, x: cx, y }); cx += gw('timeSig' + ch); });
    };
    row(time.num, 1);
    row(time.den, 3);
  };

  function ledgers(out, x, xl, xr, s) {
    const lo = Math.min(...x.heads.map(h => h.pos)), hi = Math.max(...x.heads.map(h => h.pos));
    const ext = C.ledgerExt * s;
    for (let p = -2; p >= lo; p -= 2) out.items.push({ t: 'l', k: x.k, x1: xl - ext, y1: P.posToY(p), x2: xr + ext, y2: P.posToY(p), w: C.ledgerW });
    for (let p = 10; p <= hi; p += 2) out.items.push({ t: 'l', k: x.k, x1: xl - ext, y1: P.posToY(p), x2: xr + ext, y2: P.posToY(p), w: C.ledgerW });
  }

  // 화면 전용 표시: 필기 미리보기(흐린 파랑) · 확인 필요(주황). 인쇄·내보내기 SVG 에는 CSS 가 없어 검정으로 나온다
  const clsOf = ev => (ev['x-pending'] ? 'pending' : ev['x-check'] ? 'check' : null);

  function drawNote(out, x, md, st) {
    const s = x.scale, nx = x.nx;
    const ref = refOf(md, st.staffId, x.vi, x.ev);
    const cls = clsOf(x.ev);
    x.heads.forEach(h => {
      out.items.push({ t: 'g', k: x.k, n: x.glyph, x: nx + h.dx, y: h.y, s: s !== 1 ? s : undefined, ref: Object.assign({ head: h.hi }, ref), cls });
      if (h.accGlyph) out.items.push({ t: 'g', k: x.k, n: h.accGlyph, x: nx + h.accX, y: h.y, s: s !== 1 ? s : undefined, cls });
      out.hits.push({ x0: nx + h.dx - 0.35, y0: h.y - 0.75, x1: nx + h.dx + x.headW + 0.35, y1: h.y + 0.75, k: x.k, ref: Object.assign({ head: h.hi }, ref) });
    });
    ledgers(out, x, nx + x.headLeft, nx + x.headRight, s);
    x.dots.forEach(d => out.items.push({ t: 'g', k: x.k, n: 'augmentationDot', x: nx + d.x, y: d.y, s: s !== 1 ? s : undefined, cls }));
    const ys = x.heads.map(h => h.y);
    out.events[x.ev.id] = { k: x.k, x: nx, w: x.headW, headYs: x.heads.map(h => ({ y: h.y, hi: h.hi, h: h.h, dx: h.dx })), top: Math.min(...ys), bottom: Math.max(...ys),
      stemDir: x.stemDir, mi: md.mi, staffId: st.staffId, vi: x.vi, grace: x.grace, scale: s };
    // 스템 기본 끝 (빔이면 drawBeam이 덮어씀)
    if (x.hasStem) {
      const up = x.stemDir < 0;
      const top = Math.min(...ys), bot = Math.max(...ys);
      let len = C.stemLen * s;
      if (!x.grace && x.beamGroup < 0) len += x.flags >= 3 ? (x.flags - 2) * 0.6 : 0;
      let end = up ? top - len : bot + len;
      if (!x.grace) { if (up && end > 2) end = 2; if (!up && end < 2) end = 2; }
      x.stemEnd = end;
    }
    // 셈여림 (보표 아래로 미룸)
    if (x.ev.dynamic) out.deferred.push({ t: 'dyn', k: x.k, x: nx, text: x.ev.dynamic, bottom: Math.max(...ys) });
    // 가사
    (x.ev.lyrics || []).forEach(l => out.deferred.push({ t: 'lyric', k: x.k, x: nx + x.headW / 2, verse: l.verse || 1, text: l.text, syllabic: l.syllabic || 'single', extend: !!l.extend,
      eventId: x.ev.id, ref: { type: 'lyric', mi: md.mi, staffId: st.staffId, vi: x.vi, eventId: x.ev.id, verse: l.verse || 1 } }));
  }

  function finishStem(out, x, md, st) {
    const s = x.scale, nx = x.nx, up = x.stemDir < 0;
    const ys = x.heads.map(h => h.y);
    const top = Math.min(...ys), bot = Math.max(...ys);
    const sw = C.stemW * s;
    const g = x.glyph;
    const aUp = anc(g, 'stemUpSE', [1.18, -0.168]), aDn = anc(g, 'stemDownNW', [0, 0.168]);
    let sx, y1, y2;
    if (up) { sx = nx + aUp[0] * s - sw; y1 = bot + aUp[1] * s; y2 = x.stemEnd; }
    else { sx = nx + aDn[0] * s; y1 = top + aDn[1] * s; y2 = x.stemEnd; }
    out.items.push({ t: 'r', k: x.k, x: sx, y: Math.min(y1, y2), w: sw, h: Math.abs(y2 - y1), cls: clsOf(x.ev) });
    x.stemX = sx;
    const e = out.events[x.ev.id];
    if (e) { e.stemX = sx; e.stemEnd = x.stemEnd; e.top = Math.min(e.top, x.stemEnd); e.bottom = Math.max(e.bottom, x.stemEnd); }
    if (x.flags && x.beamGroup < 0) {
      const names = ['', '8th', '16th', '32nd', '64th'];
      const fn = 'flag' + names[x.flags] + (up ? 'Up' : 'Down');
      const a = up ? anc(fn, 'stemUpNW', [0, 0]) : anc(fn, 'stemDownSW', [0, 0]);
      out.items.push({ t: 'g', k: x.k, n: fn, x: sx - a[0] * s, y: x.stemEnd - a[1] * s, s: s !== 1 ? s : undefined, cls: clsOf(x.ev) });
    }
    if (x.grace && x.ev.grace === 'acciaccatura') {
      // 빗금
      const yA = x.stemEnd + (up ? 1.7 : -1.7) * s, yB = x.stemEnd + (up ? 0.5 : -0.5) * s;
      out.items.push({ t: 'l', k: x.k, x1: sx - 0.55 * s, y1: yA, x2: sx + 1.0 * s, y2: yB, w: 0.13 });
    }
  }

  function drawRest(out, x, md, st) {
    const ref = refOf(md, st.staffId, x.vi, x.ev, 'rest');
    out.items.push({ t: 'g', k: x.k, n: x.glyph, x: x.nx, y: x.restY, ref, cls: clsOf(x.ev) });
    x.dots.forEach(d => out.items.push({ t: 'g', k: x.k, n: 'augmentationDot', x: x.nx + d.x, y: d.y }));
    const g = G[x.glyph];
    const y0 = x.restY + (g ? g.y0 : -1), y1 = x.restY + (g ? g.y1 : 1);
    out.hits.push({ x0: x.nx - 0.3, y0: Math.min(y0, x.restY - 0.8) , x1: x.nx + x.headW + 0.3, y1: Math.max(y1, x.restY + 0.8), k: x.k, ref });
    out.events[x.ev.id] = { k: x.k, x: x.nx, w: x.headW, top: y0, bottom: y1, mi: md.mi, staffId: st.staffId, vi: x.vi, rest: true };
  }

  // 빔: 기울기 제한, 최소 스템 길이 보장, 2차 빔·짧은 빔
  function drawBeam(out, notes, md, st) {
    if (notes.length < 2) return;
    const up = notes[0].stemDir < 0;
    const sw = C.stemW;
    const stemXs = notes.map(x => {
      const aUp = anc(x.glyph, 'stemUpSE', [1.18, -0.168]);
      return up ? x.nx + aUp[0] - sw : x.nx;
    });
    const ext = notes.map(x => { const ys = x.heads.map(h => h.y); return up ? Math.min(...ys) : Math.max(...ys); });
    const maxFlags = Math.max(...notes.map(x => x.flags));
    const minLen = 3.0 + Math.max(0, maxFlags - 2) * 0.75;
    const natural = ext.map(y => up ? y - C.stemLen : y + C.stemLen);
    const xa = stemXs[0], xb = stemXs[stemXs.length - 1] + sw;
    let slope = 0;
    const firstY = ext[0], lastY = ext[ext.length - 1];
    const inner = ext.slice(1, -1);
    const innerExtreme = inner.length && (up ? Math.min(...inner) < Math.min(firstY, lastY) : Math.max(...inner) > Math.max(firstY, lastY));
    if (firstY !== lastY && !innerExtreme) {
      // 기울기 제한: 전체 높이차 최대 1sp, 그리고 길이에 비해 너무 가파르지 않게
      const dy = U_clamp(lastY - firstY, -Math.min(1.0, (xb - xa) * 0.18), Math.min(1.0, (xb - xa) * 0.18));
      slope = dy / Math.max(1, xb - xa);
    }
    // 기준선 높이: 모든 스템이 최소 길이 이상이 되게
    let base = up ? Math.min(...natural.map((y, i) => y - slope * (stemXs[i] - xa))) : Math.max(...natural.map((y, i) => y - slope * (stemXs[i] - xa)));
    notes.forEach((x, i) => {
      const yAt = base + slope * (stemXs[i] - xa);
      const len = up ? ext[i] - yAt : yAt - ext[i];
      if (len < minLen) base += up ? -(minLen - len) : (minLen - len);
    });
    // 아주 높거나 낮은 음: 빔이 가운데 줄을 넘어가도록 (보표 밖 빔 방지)
    const midY = 2;
    const yMid = base + slope * ((xa + xb) / 2 - xa);
    if (up && yMid > midY) base -= (yMid - midY);
    if (!up && yMid < midY) base += (midY - yMid);
    const yAtX = xx => base + slope * (xx - xa);
    notes.forEach((x, i) => { x.stemEnd = yAtX(stemXs[i] + (up ? sw / 2 : sw / 2)); });
    const bw = C.beamW, step = C.beamW + C.beamGap;
    const k = notes[0].k;
    const poly = (x1, x2, lvl) => {
      const off = (lvl - 1) * step * (up ? 1 : -1);
      const y1 = yAtX(x1) + off, y2 = yAtX(x2) + off;
      const t = up ? bw : -bw;
      out.items.push({ t: 'poly', k, pts: [[x1, y1], [x2, y2], [x2, y2 + t], [x1, y1 + t]] });
    };
    poly(xa, xb, 1);
    for (let lvl = 2; lvl <= maxFlags; lvl++) {
      let i = 0;
      while (i < notes.length) {
        if (notes[i].flags < lvl) { i++; continue; }
        let j = i;
        while (j + 1 < notes.length && notes[j + 1].flags >= lvl) j++;
        if (j > i) poly(stemXs[i], stemXs[j] + sw, lvl);
        else {
          // 짧은 빔: 첫 음이면 오른쪽 · 앞이 점음표면 그 점음표 쪽(왼쪽) · 뒤가 점음표면 오른쪽 · 그 밖은 왼쪽
          // (예전엔 '앞이 점음표면 오른쪽'으로 거꾸로였음 — 6/8 점8분 · 16분 · 8분에서 16분 빔이 반대 · Gould · 점검원 ④ 11-02)
          const prevDot = !!(notes[i - 1] && notes[i - 1].ev.dur.dots), nextDot = !!(notes[i + 1] && notes[i + 1].ev.dur.dots);
          const right = i === 0 || (i < notes.length - 1 && nextDot && !prevDot);
          const L = 1.1;
          if (right) poly(stemXs[i], stemXs[i] + L, lvl); else poly(stemXs[i] - L + sw, stemXs[i] + sw, lvl);
        }
        i = j + 1;
      }
    }
    notes.forEach(x => { x.beamed = true; });
    void md; void st;
  }
  function U_clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function drawTuplets(out, vv, md, st) {
    (vv.tuplets || []).forEach(tp => {
      const mem = vv.infos.filter(x => x.ev.dur.tuplet === tp.id && !x.grace);
      if (!mem.length) return;
      const first = mem[0], last = mem[mem.length - 1];
      const notes = mem.filter(x => x.ev.kind === 'note');
      const up = notes.length ? notes.filter(x => x.stemDir < 0).length >= notes.length / 2 : true;
      const xa = first.nx, xb = last.nx + last.headW;
      const ext = mem.map(x => {
        if (x.ev.kind !== 'note') return up ? x.restY - 1.5 : x.restY + 1.5;
        const ys = x.heads.map(h => h.y).concat(x.hasStem ? [x.stemEnd] : []);
        return up ? Math.min(...ys) : Math.max(...ys);
      });
      let y = up ? Math.min(...ext, 0) - 1.2 : Math.max(...ext, 4) + 1.2;
      const sameBeam = notes.length === mem.length && mem.every(x => x.beamGroup >= 0 && x.beamGroup === first.beamGroup);
      const label = String(tp.actual);
      const nw = label.split('').reduce((a, ch) => a + gw('tuplet' + ch), 0);
      const cx = (xa + xb) / 2;
      if (!sameBeam) {
        const h = up ? 0.6 : -0.6;
        const gap = nw / 2 + 0.35;
        out.items.push({ t: 'l', k: st.k, x1: xa, y1: y + h, x2: xa, y2: y, w: C.tupletBracketW });
        out.items.push({ t: 'l', k: st.k, x1: xa, y1: y, x2: cx - gap, y2: y, w: C.tupletBracketW });
        out.items.push({ t: 'l', k: st.k, x1: cx + gap, y1: y, x2: xb, y2: y, w: C.tupletBracketW });
        out.items.push({ t: 'l', k: st.k, x1: xb, y1: y, x2: xb, y2: y + h, w: C.tupletBracketW });
      }
      let tx = cx - nw / 2;
      label.split('').forEach(ch => { out.items.push({ t: 'g', k: st.k, n: 'tuplet' + ch, x: tx, y: y + 0.75 }); tx += gw('tuplet' + ch); });
      if (tp.normal && tp.showRatio) { /* a:b 표시는 'x-' 확장 자리 */ }
    });
    void md;
  }

  // 아티큘레이션·장식
  function drawArtic(out, x, md, st) {
    const arts = x.ev.articulations || [];
    if (!arts.length || x.grace) return;
    const isNote = x.ev.kind === 'note';
    const cx = x.nx + (x.headW || 1.18) / 2;
    const near = arts.filter(a => a === 'staccato' || a === 'tenuto' || a === 'accent' || a === 'staccatissimo');
    const far = arts.filter(a => a === 'marcato' || a === 'fermata' || a === 'trill' || a === 'mordent');
    if (isNote && near.length) {
      const below = st.multi ? x.vi % 2 === 1 : x.stemDir < 0;
      const ys = x.heads.map(h => h.y);
      let y = below ? Math.max(...ys) + 1.0 : Math.min(...ys) - 1.0;
      if (st.multi && x.hasStem && x.stemEnd !== undefined) y = below ? Math.max(y, x.stemEnd + 0.9) : Math.min(y, x.stemEnd - 0.9);
      near.forEach(a => {
        // 보표 안이면 칸 가운데로
        if (y > -0.1 && y < 4.1 && Math.abs(y * 2 - Math.round(y * 2)) < 0.01 && Math.round(y * 2) % 2 === 0) y += below ? 0.5 : -0.5;
        const n = { staccato: 'articStaccato', tenuto: 'articTenuto', accent: 'articAccent', staccatissimo: 'articStaccato' }[a] + (below ? 'Below' : 'Above');
        const g = G[n];
        const gy = g ? (below ? y - g.y0 : y - g.y1) : y;
        out.items.push({ t: 'g', k: x.k, n, x: cx - (g ? g.w / 2 : 0.5), y: gy });
        y += below ? 0.85 : -0.85;
      });
    }
    let top = x.ev.kind === 'note' ? Math.min(...x.heads.map(h => h.y), x.stemEnd !== undefined ? x.stemEnd : 99) : (x.restY - 1);
    far.forEach(a => {
      const n = { marcato: 'articMarcatoAbove', fermata: 'fermataAbove', trill: 'ornamentTrill', mordent: 'ornamentMordent' }[a];
      out.deferred.push({ t: 'above', k: x.k, x: cx, n, top });
    });
  }

  SJ.MeasureRender = MR;
})(window.SJ = window.SJ || {});
