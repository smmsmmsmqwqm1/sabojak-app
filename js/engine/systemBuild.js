/* 시스템(줄) 조립: 머리 + 마디들 + 장식 → 보표 간격 결정 → 시스템 좌표(sp) 항목 */
(function (SJ) {
  'use strict';
  const C = SJ.C, G = SJ.Glyphs, P = SJ.Pitch, MR = SJ.MeasureRender, DC = SJ.Decor, LS = SJ.LayoutSystem, TW = SJ.TextWidth;
  const SB = {};
  const gw = n => (G[n] ? G[n].w : 1);

  /* state: {incomingTies:[{targetId, heads:[{step,octave,alter}]}], openSpanners:{id: {...}}, eventSys:{}} */
  SB.build = function (score, sys, si, mds, ctxs, state, opts) {
    const staves = ctxs.staves;
    const nS = staves.length;
    sys.index = si;
    state.open = state.open || {};
    const items = [];
    const deferred = [];
    const hits = [];
    const events = {};
    items.hits = hits;
    const ctx0 = ctxs.ctxs[sys.mis[0]];
    const left = sys.indent;
    const lastX = sys.xs[sys.xs.length - 1];
    const right = lastX.x0 + lastX.w;
    sys.left = left; sys.right = right;

    // ── 머리: 음자리표 · 조표 ──
    let clefW = 0;
    staves.forEach(s => { clefW = Math.max(clefW, gw(P.CLEFS[ctx0.clefs[s.id]].glyph)); });
    staves.forEach(s => {
      const cl = P.CLEFS[ctx0.clefs[s.id]];
      items.push({ t: 'g', k: s.k, n: cl.glyph, x: left + 0.6, y: P.posToY(cl.refPos) });
      MR.keySig(it => items.push(it), s.k, left + 0.6 + clefW + 0.7, ctx0.key.fifths, ctx0.clefs[s.id]);
    });
    sys.headerEnd = left + sys.headerW;

    // ── 마디 ──
    const mpos = [];
    sys.mis.forEach((mi, j) => {
      const r = MR.render(mds[mi], sys.xs[j].x0, sys.xs[j].w, j === 0, { ctx: ctxs.ctxs[mi] });
      r.items.forEach(it => items.push(it));
      r.deferred.forEach(d => deferred.push(d));
      r.hits.forEach(h => hits.push(h));
      Object.keys(r.events).forEach(id => { events[id] = r.events[id]; state.eventSys[id] = si; });
      mpos.push({ mi, x0: sys.xs[j].x0, x1: sys.xs[j].x0 + sys.xs[j].w, repeatStartX: r.repeatStartX, barline: mds[mi].barline, segX: r.segX, place: r.place });
      staves.forEach(s => hits.push({ x0: sys.xs[j].x0, y0: -1.5, x1: sys.xs[j].x0 + sys.xs[j].w, y1: 5.5, k: s.k, ref: { type: 'measure', mi, staffId: s.id }, low: true }));
    });
    sys.mpos = mpos;
    sys.events = events;

    // ── 붙임줄 ──
    ties(score, sys, mds, items, events, state, right);
    // ── 이음줄·헤어핀·8va ──
    spanners(score, sys, items, deferred, events, state, right);

    // ── 보표 위아래 끝 → 장식 배치 ──
    let ext = DC.extents(items, nS);
    DC.resolve(items, deferred, nS, ext);
    const chordTop = DC.chords(items, deferred, ext);
    ext = DC.extents(items, nS);
    aboveStaff(score, sys, items, ext, chordTop, mds, ctxs);
    ext = DC.extents(items, nS);

    // ── 보표 세로 간격 ──
    const staffTop = [0];
    for (let k = 1; k < nS; k++) {
      const below = Math.max(0, ext.bot[k - 1] - 4), above = Math.max(0, -ext.top[k]);
      const sameGroup = staves[k].def.groupId && staves[k].def.groupId === staves[k - 1].def.groupId;
      const base = score.layout.staffDistance || C.staffDistance;
      staffTop.push(staffTop[k - 1] + 4 + Math.max(sameGroup ? base : base + 1, below + above + 1.2));
    }
    sys.staffTop = staffTop;
    sys.top = Math.min(ext.top[0], -1);
    sys.bottom = staffTop[nS - 1] + Math.max(ext.bot[nS - 1], 5);

    // ── 시스템 좌표로 ──
    const out = [];
    items.forEach(it => out.push(toSys(it, staffTop)));
    // 보표 줄
    staves.forEach(s => {
      for (let l = 0; l < 5; l++) out.push({ t: 'l', x1: left, y1: staffTop[s.k] + l, x2: right, y2: staffTop[s.k] + l, w: C.staffLineW, staffLine: true });
    });
    // 세로줄 · 중괄호 · 이름 · 마디 번호
    barlines(score, sys, out, staffTop, staves);
    sys.items = out;
    sys.hits = hits.map(h => Object.assign({}, h, { y0: h.y0 + staffTop[h.k], y1: h.y1 + staffTop[h.k] })).concat(sys.extraHits || []);
    return sys;
  };

  function toSys(it, staffTop) {
    if (it.k === undefined || it.k === null || it.k < 0) return it;
    const dy = staffTop[it.k];
    const c = Object.assign({}, it);
    delete c.k;
    if (c.t === 'g' || c.t === 'tx' || c.t === 'r' || c.t === 'box') c.y += dy;
    else if (c.t === 'l') { c.y1 += dy; c.y2 += dy; }
    else if (c.t === 'poly') c.pts = c.pts.map(p => [p[0], p[1] + dy]);
    else if (c.t === 'path') c.d = c.d.map(seg => seg.map((v, i) => (i > 0 && i % 2 === 0) ? v + dy : v));
    return c;
  }

  // 다음 이벤트 (같은 보표·성부, 다음 마디로 넘어감)
  function nextEvent(score, ev, pos) {
    const m = score.measures[pos.mi];
    const v = m.staves[pos.staffId] && m.staves[pos.staffId].voices[pos.vi];
    if (!v) return null;
    const i = v.events.findIndex(e => e.id === ev);
    if (i >= 0 && i + 1 < v.events.length) return v.events[i + 1];
    const nm = score.measures[pos.mi + 1];
    if (!nm) return null;
    const nv = nm.staves[pos.staffId] && nm.staves[pos.staffId].voices[pos.vi];
    return nv && nv.events.length ? nv.events[0] : null;
  }

  function ties(score, sys, mds, items, events, state, right) {
    // 앞 줄에서 넘어온 붙임줄
    const incoming = state.incomingTies;
    state.incomingTies = [];
    incoming.forEach(t => {
      const b = events[t.targetId];
      if (!b || !b.headYs) return;
      t.heads.forEach(h => {
        const hb = b.headYs.find(x => x.h.step === h.step && x.h.octave === h.octave);
        if (!hb) return;
        const dir = b.stemDir < 0 ? 1 : -1;
        const y = hb.y + (dir > 0 ? 0.45 : -0.45);
        const x1 = sys.headerEnd - 0.6, x2 = b.x + hb.dx - 0.15;
        if (x2 - x1 > 0.4) items.push(DC.arc(b.k, x1, y, x2, y, dir, 0.6, C.tieMidW));
      });
    });
    Object.keys(events).forEach(id => {
      const a = events[id];
      if (!a.headYs) return;
      const tied = a.headYs.filter(h => h.h.tieNext);
      if (!tied.length) return;
      const nx = nextEvent(score, id, a);
      if (!nx || nx.kind !== 'note') return;
      const b = events[nx.id];
      tied.forEach(ha => {
        const idx = a.headYs.indexOf(ha);
        if (b && b.headYs) {
          const hb = b.headYs.find(x => x.h.step === ha.h.step && x.h.octave === ha.h.octave);
          if (!hb) return;
          DC.tie(items, a.k, { x1: a.x + ha.dx + a.w }, { x0: b.x + hb.dx }, ha, a.stemDir, a.headYs.length, idx);
        } else {
          // 줄 끝까지 반쪽
          const dir = a.headYs.length > 1 ? (idx >= a.headYs.length / 2 ? -1 : 1) : (a.stemDir < 0 ? 1 : -1);
          const y = ha.y + (dir > 0 ? 0.45 : -0.45);
          const x1 = a.x + ha.dx + a.w + 0.12;
          if (right + 0.5 - x1 > 0.4) items.push(DC.arc(a.k, x1, y, right + 0.5, y, dir, 0.6, C.tieMidW));
          let t = state.incomingTies.find(q => q.targetId === nx.id);
          if (!t) { t = { targetId: nx.id, heads: [] }; state.incomingTies.push(t); }
          t.heads.push(ha.h);
        }
      });
    });
  }

  function spanners(score, sys, items, deferred, events, state, right) {
    const left = sys.headerEnd - 0.3;
    (score.spanners || []).forEach(sp => {
      const a = events[sp.startId], b = events[sp.endId];
      const open = state.open[sp.id];
      if (!a && !open) return;                                   // 시작 전이거나 이미 끝남
      if (a && !b && state.eventSys[sp.endId] !== undefined) return;   // 끝이 앞 줄에 있음(잘못된 순서)
      if (a && b && b.x < a.x) return;
      const k = a ? a.k : (b ? b.k : open.k);
      const x1 = a ? a.x : left;
      const x2 = b ? b.x + (b.w || 1.18) : right;
      const contStart = !a, contEnd = !b;
      if (!b) state.open[sp.id] = { k }; else delete state.open[sp.id];
      if (sp.type === 'slur') {
        const above = sp.placement === 'above' || (sp.placement !== 'below' && (a ? a.stemDir > 0 : (b ? b.stemDir > 0 : true)));
        const dir = above ? -1 : 1;
        const yA = a ? (above ? a.top : a.bottom) + dir * 0.7 : (above ? -0.5 : 4.5);
        const yB = b ? (above ? b.top : b.bottom) + dir * 0.7 : yA;
        // 사이 음표를 넘어가도록 높이
        let h = Math.max(0.8, Math.min(2.6, (x2 - x1) * 0.07));
        Object.keys(events).forEach(id => {
          const e = events[id];
          if (e.k !== k || e.x <= x1 + 0.5 || e.x >= x2 - 0.5) return;
          const t = (e.x - x1) / Math.max(1, x2 - x1);
          const lineY = yA + (yB - yA) * t;
          const need = above ? lineY - (e.top - 0.6) : (e.bottom + 0.6) - lineY;
          if (need > h * 0.75) h = need / 0.75;
        });
        h = Math.min(h, 5) + (sp.curve || 0);
        items.push(DC.arc(k, x1 + 0.2, yA, x2 - 0.2, yB, dir, h, C.slurMidW));
      } else if (sp.type === 'cresc' || sp.type === 'dim') {
        const dynShift = a && score && a.dynW ? a.dynW : 0;
        deferred.push({ t: 'hairpin', k, x1: x1 + dynShift + (a && hasDynamic(score, sp.startId) ? 2.4 : 0), x2: x2, kind: sp.type, contStart, contEnd });
      } else if (sp.type === '8va' || sp.type === '8vb') {
        const up = sp.type === '8va';
        let y = up ? -2.6 : 7.0;
        Object.keys(events).forEach(id => { const e = events[id]; if (e.k === k && e.x >= x1 - 0.1 && e.x <= x2) y = up ? Math.min(y, e.top - 1.8) : Math.max(y, e.bottom + 2.2); });
        const gn = up ? 'ottavaAlta' : 'ottavaBassaVb';
        const g = G[gn];
        let lx = x1;
        if (!contStart && g) { items.push({ t: 'g', k, n: gn, x: x1, y: up ? y + 0.6 : y }); lx = x1 + g.w + 0.3; }
        if (x2 - lx > 0.5) items.push({ t: 'l', k, x1: lx, y1: y, x2, y2: y, w: C.octaveLineW, dash: [0.6, 0.45] });
        if (!contEnd) items.push({ t: 'l', k, x1: x2, y1: y, x2, y2: up ? y + 1.0 : y - 1.0, w: C.octaveLineW });
      }
    });
  }
  function hasDynamic(score, id) { const f = SJ.Score.findEvent(score, id); return f && f.ev.dynamic; }

  // 맨 위 보표 위: 볼타 · 리허설 · 템포 · 세뇨/코다 · D.C. 등
  function aboveStaff(score, sys, items, ext, chordTop, mds, ctxs) {
    let y = Math.min(ext.top[0] - 0.8, -2.2);
    if (chordTop !== null && chordTop !== undefined) y = Math.min(y, chordTop - 0.6);
    // 볼타
    const voltaY = y - 1.6;
    let hasVolta = false;
    let i = 0;
    const mp = sys.mpos;
    while (i < mp.length) {
      const v = score.measures[mp[i].mi].attrs.volta;
      if (!v || !v.numbers || !v.numbers.length) { i++; continue; }
      let j = i;
      const key = v.numbers.join(',');
      while (j + 1 < mp.length) {
        const w = score.measures[mp[j + 1].mi].attrs.volta;
        if (w && w.numbers && w.numbers.join(',') === key) j++; else break;
      }
      const x1 = mp[i].x0 + 0.3, x2 = mp[j].x1 - 0.4;
      items.push({ t: 'l', k: 0, x1, y1: voltaY + 1.6, x2: x1, y2: voltaY, w: C.voltaLineW });
      items.push({ t: 'l', k: 0, x1, y1: voltaY, x2, y2: voltaY, w: C.voltaLineW });
      const lastOfVolta = score.measures[mp[j].mi + 1] ? !(score.measures[mp[j].mi + 1].attrs.volta && score.measures[mp[j].mi + 1].attrs.volta.numbers.join(',') === key) : true;
      if (!v.open && lastOfVolta) items.push({ t: 'l', k: 0, x1: x2, y1: voltaY, x2, y2: voltaY + 1.6, w: C.voltaLineW });
      items.push({ t: 'tx', k: 0, x: x1 + 0.5, y: voltaY + 1.4, text: v.numbers.join(', ') + '.', size: 1.6, font: 'serif', b: true, a: 'start' });
      hasVolta = true;
      i = j + 1;
    }
    const markY = (hasVolta ? voltaY : y + 1.0) - 1.4;
    mp.forEach((p, j) => {
      const m = score.measures[p.mi];
      let x = p.x0 + (j === 0 ? 0 : 0.2);
      const firstNoteX = p.segX && p.segX.length ? p.segX[0].x : p.x0 + 1;
      if (m.attrs.rehearsal) {
        const t = m.attrs.rehearsal, w = TW.width(t, 2.0, true) + 0.9;
        items.push({ t: 'box', k: 0, x: x - 0.2, y: markY - 2.2, w, h: 2.8, sw: 0.16 });
        items.push({ t: 'tx', k: 0, x: x - 0.2 + w / 2, y: markY, text: t, size: 2.0, font: 'text', b: true, a: 'middle', ref: { type: 'measureAttr', mi: p.mi } });
        x += w + 0.8;
      }
      (m.attrs.markers || []).forEach(mk => {
        if (mk.type === 'segno' || mk.type === 'coda') {
          const g = G[mk.type];
          if (g) { items.push({ t: 'g', k: 0, n: mk.type, x, y: markY + 0.4 - g.y1 }); x += g.w + 0.6; }
        }
      });
      const tp = m.attrs.tempo;
      if (tp && (tp.text || tp.bpm)) {
        let tx = Math.max(x, firstNoteX - 0.6);
        if (tp.text) { items.push({ t: 'tx', k: 0, x: tx, y: markY, text: tp.text, size: C.tempoSize, font: 'serif', b: true, a: 'start', ref: { type: 'measureAttr', mi: p.mi } }); tx += TW.width(tp.text, C.tempoSize, true) + 0.6; }
        if (tp.bpm) {
          const bu = tp.beatUnit || { type: 'quarter', dots: 0 };
          const gn = bu.type === 'half' ? 'metNoteHalfUp' : bu.type === 'eighth' ? 'metNote8thUp' : 'metNoteQuarterUp';
          const s = 0.75;
          if (G[gn]) { items.push({ t: 'g', k: 0, n: gn, x: tx, y: markY, s }); tx += G[gn].w * s + 0.15; }
          if (bu.dots && G.metAugmentationDot) { items.push({ t: 'g', k: 0, n: 'metAugmentationDot', x: tx, y: markY - 0.15, s }); tx += 0.5; }
          items.push({ t: 'tx', k: 0, x: tx + 0.2, y: markY, text: '= ' + tp.bpm, size: C.tempoSize, font: 'text', a: 'start' });
        }
      }
      // 끝에 붙는 글 (D.C. 등)
      const endTexts = (m.attrs.markers || []).filter(mk => mk.type !== 'segno' && mk.type !== 'coda');
      let ex = p.x1 - 0.4;
      endTexts.forEach(mk => {
        const label = SB.markerText(mk.type);
        items.push({ t: 'tx', k: 0, x: ex, y: markY, text: label, size: 1.8, font: 'serif', b: true, i: true, a: 'end' });
        ex -= TW.width(label, 1.8, true) + 0.8;
      });
    });
    void mds; void ctxs;
  }

  SB.markerText = function (t) {
    return { dc: 'D.C.', ds: 'D.S.', fine: 'Fine', toCoda: 'To Coda', dcAlFine: 'D.C. al Fine', dcAlCoda: 'D.C. al Coda', dsAlFine: 'D.S. al Fine', dsAlCoda: 'D.S. al Coda' }[t] || t;
  };

  // 묶음(같은 groupId 연속) 범위
  SB.spans = function (staves) {
    const spans = [];
    let k = 0;
    while (k < staves.length) {
      const g = staves[k].def.groupId;
      let e = k;
      if (g) while (e + 1 < staves.length && staves[e + 1].def.groupId === g) e++;
      spans.push({ k0: k, k1: e, group: g ? staves[k].def.groupType || 'brace' : null });
      k = e + 1;
    }
    return spans;
  };

  function barlines(score, sys, out, staffTop, staves) {
    const spans = SB.spans(staves);
    // 세로줄: 중괄호(피아노) 묶음은 보표 사이도 잇고, 각괄호(합창) 묶음은 보표마다 따로 (성악 관례)
    const barSpans = [];
    spans.forEach(sp => { if (sp.group === 'bracket') for (let k = sp.k0; k <= sp.k1; k++) barSpans.push({ k0: k, k1: k }); else barSpans.push(sp); });
    const nS = staves.length;
    const W = C.thinBarW, TB = C.thickBarW, SEP = C.barSep;
    const vline = (x, w, y0, y1) => out.push({ t: 'r', x: x, y: y0, w, h: y1 - y0, bar: true });
    const forSpans = fn => barSpans.forEach(sp => fn(staffTop[sp.k0], staffTop[sp.k1] + 4, sp));
    // 각괄호
    spans.forEach(sp => {
      if (sp.group !== 'bracket') return;
      const y0 = staffTop[sp.k0] - 0.5, y1 = staffTop[sp.k1] + 4.5, x = sys.left - 1.1;
      out.push({ t: 'r', x, y: y0, w: C.bracketW, h: y1 - y0 });
      if (G.bracketTop) out.push({ t: 'g', n: 'bracketTop', x, y: y0 });
      if (G.bracketBottom) out.push({ t: 'g', n: 'bracketBottom', x, y: y1 });
    });
    const dots = (x) => staves.forEach(s => { out.push({ t: 'g', n: 'repeatDot', x, y: staffTop[s.k] + 1.5 }); out.push({ t: 'g', n: 'repeatDot', x, y: staffTop[s.k] + 2.5 }); });
    // 줄 시작 세로줄 (보표 둘 이상)
    if (nS > 1) vline(sys.left, W, 0, staffTop[nS - 1] + 4);
    // 중괄호
    spans.forEach(sp => {
      if (!sp.group || sp.group === 'bracket' || sp.k1 === sp.k0) return;
      const y0 = staffTop[sp.k0], y1 = staffTop[sp.k1] + 4, h = y1 - y0;
      if (G.braceScale && G.brace && G.brace.d) {
        const sc = G.braceScale(h);
        out.push({ t: 'g', n: 'brace', x: sys.left - 0.35 - G.brace.w * sc.sx, y: y1, sx: sc.sx, sy: sc.sy });
      } else if (G.braceProc) {
        out.push({ t: 'pathRaw', d: G.braceProc(h), x: sys.left - 1.5, y: y0 });
      }
    });
    // 보표 이름 (각괄호 묶음은 보표마다 이름)
    const first = sys.index === 0;
    sys.extraHits = [];
    barSpans.forEach(sp => {
      const def = staves[sp.k0].def;
      const name = LS.label(score, def, sys.mis[0], first);
      const y = (staffTop[sp.k0] + staffTop[sp.k1] + 4) / 2 + 0.65;
      const xr = sys.left - (def.groupId ? 1.7 : 0.6);
      const ref = { type: 'staffName', staffId: def.id, mi: sys.mis[0], first };
      if (name) out.push({ t: 'tx', x: xr, y, text: name, size: LS.NAME_SIZE, font: 'text', a: 'end', ref });
      const w = name ? TW.width(name, LS.NAME_SIZE) : 2.5;
      sys.extraHits.push({ x0: xr - w - 0.5, y0: y - 2.2, x1: xr + 0.4, y1: y + 1.0, ref });
    });
    // 마디 끝 세로줄
    sys.mpos.forEach((p, j) => {
      const x = p.x1;
      const type = p.barline;
      forSpans((y0, y1) => {
        if (type === 'none') return;
        if (type === 'single') vline(x - W, W, y0, y1);
        else if (type === 'dashed') out.push({ t: 'l', x1: x - W / 2, y1: y0, x2: x - W / 2, y2: y1, w: W, dash: [0.5, 0.4] });
        else if (type === 'double') { vline(x - W, W, y0, y1); vline(x - W * 2 - SEP, W, y0, y1); }
        else if (type === 'final' || type === 'repeatEnd') { vline(x - TB, TB, y0, y1); vline(x - TB - SEP - W, W, y0, y1); }
      });
      if (type === 'repeatEnd') dots(x - TB - SEP - W - C.repeatDotSep - 0.44);
      if (p.repeatStartX !== undefined) {
        const xs = p.repeatStartX;
        forSpans((y0, y1) => { vline(xs, TB, y0, y1); vline(xs + TB + SEP, W, y0, y1); });
        dots(xs + TB + SEP + W + C.repeatDotSep);
      }
      // 마디 번호
      const mode = score.layout.measureNumbers || 'system';
      const show = mode === 'all' ? true : mode === 'system' ? (j === 0 && p.mi > 0) : false;
      if (show && !score.measures[p.mi].attrs.hideNumber) {
        out.push({ t: 'tx', x: (j === 0 ? sys.left + 0.2 : p.x0 + 0.2), y: -1.8 + (j === 0 ? -1.6 : 0), text: String(p.mi + 1), size: C.numberSize, font: 'serif', i: true, a: 'start' });
      }
    });
    void score; void LS; void TW;
  }

  SJ.SystemBuild = SB;
})(window.SJ = window.SJ || {});
