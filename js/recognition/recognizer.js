/* ★ 필기 인식기 (§9) — 순수 JS 규칙 + $P 템플릿. 교체 가능한 인터페이스: recognize(strokes, ctx, opts) → RecognizedSymbol[]
 * 음높이는 인식기가 아니라 기하 계산(머리 가운데 y → 줄/칸)으로 정한다. 틀리면 후보 칩 1탭으로 고친다. */
(function (SJ) {
  'use strict';
  const Gm = SJ.RecGeom, PD = SJ.PDollar, RT = SJ.RecTemplates;
  const R = {};
  const NOTE_TYPES = ['whole', 'half', 'quarter', 'eighth', '16th', '32nd', '64th'];
  const FLAG_TYPE = ['quarter', 'eighth', '16th', '32nd', '64th'];
  const ACC = ['sharp', 'flat', 'natural', 'dsharp', 'dflat'];
  const ACC_ALTER = { sharp: 1, flat: -1, natural: 0, dsharp: 2, dflat: -2 };
  const OTHER = ['r:quarter', 'r:eighth', 'r:16th', 'r:bar', 'tie', 'accent', 'tenuto', 'fermata', 'dyn:p', 'dyn:f', 'dyn:m', 'dyn:z', 'dyn:s'].concat(ACC);
  let templates = null;
  let user = { templates: [], fillInner: 0.34, dotMax: 0.42 };

  R.templates = function () { if (!templates) templates = RT.base(); return templates.concat(user.templates); };
  R.loadUser = async function () { const j = await SJ.Storage.loadJson('handwriting.json', null); if (j) user = Object.assign(user, j); };
  R.saveUser = function () { return SJ.Storage.saveJson('handwriting.json', user); };
  R.resetUser = async function () { user = { templates: [], fillInner: 0.34, dotMax: 0.42 }; await R.saveUser(); };
  R.user = () => user;

  // 사용자 템플릿 더하기 (고친 기록 · 등록 마법사)
  R.learn = function (label, strokes) {
    if (!strokes || !strokes.length) return;
    user.templates.push({ label, pts: PD.normalize(strokes), at: Date.now() });
    const same = user.templates.filter(t => t.label === label);
    if (same.length > 8) user.templates.splice(user.templates.indexOf(same[0]), 1);
    R.saveUser();
  };
  // 머리 채움 기준 맞추기 (빈 머리라고 고쳤으면 기준 올림, 찬 머리라고 고쳤으면 내림)
  R.learnFill = function (inner, filled) {
    if (!isFinite(inner)) return;
    if (filled && inner < user.fillInner) user.fillInner = Math.max(0.12, inner * 0.9);
    if (!filled && inner >= user.fillInner) user.fillInner = Math.min(0.8, inner * 1.1 + 0.02);
    R.saveUser();
  };

  /* strokes: [{pts:[{x,y,t}]}] (화면 px), ctx: {sp, staffTop, defaultDur:{type,dots}, scratch:true}
   * 반환: [{kind, x, y, conf, cands:[{label, value}], strokes:[i...], ...}] (x 순) */
  R.recognize = function (input, ctx) {
    const sp = ctx.sp;
    // 이어 그린 획(머리→기둥→꼬리 한 번에)은 조각으로 나눠서 본다. orig[조각] = 원래 획 번호
    const strokes = [], orig = [];
    input.forEach((s, i) => {
      const f0 = Gm.features(s, sp);
      const c0 = classify(f0, s, sp);
      let parts = (c0 === 'other' || c0 === 'head') && f0.h >= 1.8 ? Gm.splitJoined(s, sp) : null;
      if (parts) {
        // 나눈 조각에 머리(고리·빗금)가 있거나, 기둥 구간이 충분히 길 때만 (휘어진 꼬리 끝을 기둥으로 오해하지 않게)
        const runH = Gm.features(parts.find(p => p.run), sp).h;
        let need = 2.4;
        parts.forEach(p => {
          if (p.run) return;
          const f = Gm.features(p, sp);
          if (classify(f, p, sp) === 'head') need = Math.min(need, 1.5);
          else if (f.slash && (f.end.x - f.start.x) * (f.end.y - f.start.y) < 0) need = Math.min(need, 2.1);   // '/' 빗금 머리
        });
        if (runH < need) parts = null;
      }
      (parts || [s]).forEach(p => { strokes.push(p); orig.push(i); });
    });
    const out = recognizeParts(strokes, ctx, orig);
    out.forEach(s => { s.strokes = Array.from(new Set((s.strokes || []).map(i => orig[i]))); });
    return out;
  };

  function recognizeParts(strokes, ctx, orig) {
    const sp = ctx.sp;
    const feats = strokes.map(s => Gm.features(s, sp));
    feats.forEach((f, i) => { f.orig = orig[i]; f.joined = orig.filter(o => o === orig[i]).length > 1; });
    const prim = feats.map((f, i) => classify(f, strokes[i], sp));
    // 큰 머리 오른쪽의 작은 '머리'는 점음표의 점 (크게 찍은 점 · 멀리 찍은 점)
    prim.forEach((p, i) => {
      if (p !== 'head' || Math.max(feats[i].w, feats[i].h) >= 0.66) return;
      const f = feats[i];
      const host = prim.findIndex((q, j) => j !== i && q === 'head' && Math.max(feats[j].w, feats[j].h) >= 0.8 &&
        f.b.cx - feats[j].b.cx > 0.6 * sp && f.b.cx - feats[j].b.cx < 2.8 * sp && Math.abs(f.b.cy - feats[j].b.cy) < 0.9 * sp);
      if (host >= 0) prim[i] = 'dot';
    });
    prim.forEach((p, i) => { feats[i].prim = p; });
    const out = [];
    // 긁어 지우기
    prim.forEach((p, i) => {
      if (p === 'scratch' && ctx.scratch !== false) out.push({ kind: 'erase', x: feats[i].b.x0, x1: feats[i].b.x1, y0: feats[i].b.y0, y1: feats[i].b.y1, conf: 0.9, strokes: [i], cands: [] });
    });
    // 묶기: 가까운 획끼리 (지우기 획 제외)
    const idx = prim.map((p, i) => i).filter(i => prim[i] !== 'scratch');
    const groups = pairDetached(cluster(idx, feats, sp), prim, feats, sp);
    groups.forEach(g => {
      // 헷갈리는 획은 해석을 몇 갈래로 나눠 끝까지 맞춰 보고, 획 전체를 가장 자연스럽게 설명하는 해석을 고른다
      const hyps = hypotheses(g, prim, feats);
      const fillSave = g.map(i => feats[i].fill);
      let best = null, second = null;
      hyps.forEach(h => {
        const pr = prim.slice();
        h.forEach(([i, lab]) => { pr[i] = lab; if (lab === 'head' && feats[i].fill === undefined) feats[i].fill = feats[i].inner >= user.fillInner; });
        g.forEach(i => { feats[i].prim = pr[i]; });
        const tmp = [];
        runGroup(g, pr, feats, strokes, ctx, tmp);
        const r = { sc: scoreHyp(tmp, h.length), tmp, pr };
        if (!best || r.sc > best.sc) { second = best; best = r; } else if (!second || r.sc > second.sc) second = r;
        g.forEach((i, k) => { feats[i].fill = fillSave[k]; });
      });
      // 두 번째 해석도 거의 비슷하게 그럴듯하면 그 답을 후보로 함께 보여 준다
      const main = best.tmp.find(s => s.kind === 'note' || s.kind === 'rest');
      const alt = second && second.sc > best.sc - 0.45 ? second.tmp.find(s => s.kind === 'note' || s.kind === 'rest') : null;
      if (main && alt && alt.cands[0] && !main.cands.some(c => sameVal(c.value, alt.cands[0].value))) {
        main.cands.splice(Math.min(1, main.cands.length), 0, alt.cands[0]);
        main.cands = main.cands.slice(0, 5);
        main.conf = Math.min(main.conf, 0.55 + (best.sc - second.sc) * 0.5);
      }
      g.forEach(i => { prim[i] = best.pr[i]; });
      best.tmp.forEach(s => out.push(s));
    });
    attachLoose(out, ctx);
    out.sort((a, b) => a.x - b.x);
    R._last = { prim: prim.slice(), feats: feats.map(f => ({ w: +f.w.toFixed(2), h: +f.h.toFixed(2), inner: +f.inner.toFixed(2), closed: +f.closed.toFixed(2), wind: +f.wind.toFixed(2), dens: +f.density.toFixed(2), str: +f.straight.toFixed(2), tx: f.turnsX })) };
    return out;
  }

  // 떨어져 그린 임시표(왼쪽)·점(오른쪽)·스타카토(위아래)를 가까운 음표에 붙인다
  function attachLoose(out, ctx) {
    const sp = ctx.sp;
    const notes = out.filter(s => s.kind === 'note');
    if (!notes.length) return;
    const headInfo = n => n.value.heads.map((hd, k) => ({ hd, k, y: ctx.staffTop + (8 - hd.pos) / 2 * sp }));
    for (let i = out.length - 1; i >= 0; i--) {
      const s = out[i];
      if (s.kind === 'accidental') {
        let best = null, bd = 1e9;
        notes.forEach(n => headInfo(n).forEach(hi => {
          const dx = (n.x - (s.x1 || s.x)) / sp, dy = Math.abs(hi.y - s.y) / sp;
          if (dx > -0.3 && dx < 3.4 && dy < 1.6 && dx + dy < bd) { bd = dx + dy; best = { n, k: hi.k }; }
        }));
        if (best) {
          const alter = s.value.acc;
          best.n.cands.forEach(c => { if (c.value.heads) c.value = Object.assign({}, c.value, { heads: c.value.heads.map((h, k) => k === best.k ? Object.assign({}, h, { acc: alter }) : h) }); });
          best.n.value = best.n.cands[0].value;
          best.n.conf = Math.min(best.n.conf, Math.max(0.3, s.conf + 0.2));
          out.splice(i, 1);
        }
      } else if (s.kind === 'artic' && s.value.art === 'staccato') {
        // 머리 오른쪽 가까이 = 점음표의 점, 위·아래 = 스타카토
        let best = null, bd = 1e9;
        notes.forEach(n => headInfo(n).forEach(hi => {
          const right = n.x + 1.1 * sp;
          const dx = (s.x - right) / sp, dy = Math.abs(s.y - hi.y) / sp;
          if (dx > -0.4 && dx < 2.2 && dy < 0.9 && dx + dy < bd) { bd = dx + dy; best = n; }
        }));
        if (best) {
          const cur = best.cands[0].value.dots || 0;
          if (cur < 2) {
            const nd = cur + 1;
            best.cands.forEach(c => { if (!c.value.type) return; if ((c.value.dots || 0) === cur) c.value = Object.assign({}, c.value, { dots: nd }); else if ((c.value.dots || 0) === nd) c.value = Object.assign({}, c.value, { dots: cur }); });
            best.cands.forEach(c => { c.label = relabel(c.value) || c.label; });
            best.value = best.cands[0].value;
          }
          out.splice(i, 1);
        }
      }
    }
  }
  // '점4분음표' / 'Dotted quarter note' (영어는 이름을 소문자로 붙임)
  function dotted(base, d) {
    if (!d) return base;
    const b = SJ.getLang && SJ.getLang() === 'en' ? base.charAt(0).toLowerCase() + base.slice(1) : base;
    return SJ.t(d === 1 ? '점{x}' : '겹점{x}', { x: b });
  }
  function relabel(v) {
    if (!v || !v.type) return null;
    const base = SJ.t({ whole: '온음표', half: '2분음표', quarter: '4분음표', eighth: '8분음표', '16th': '16분음표', '32nd': '32분음표', '64th': '64분음표' }[v.type]);
    return dotted(base, v.dots);
  }

  function classify(f, s, sp) {
    const big = Math.max(f.w, f.h);
    // 긁어 지우기: 넓고(머리보다 훨씬) 좌우로 여러 번 왕복
    if (f.turnsX >= 6 && f.w >= 2.2 && f.len > f.w * 3 && f.h < f.w * 1.1) return 'scratch';
    if (f.diag <= user.dotMax && f.len < 1.6) return 'dot';
    // 크게 찍은 점(작은 동그라미) — 머리보다 확실히 작음
    if ((big < 0.55 && (f.len < 0.8 || (f.len < 2.0 && f.h <= 2 * f.w + 0.1))) || (big < 0.7 && f.len < 0.9)) return 'dot';
    if (f.h >= 1.6 && f.straight >= 0.84 && f.w <= Math.max(0.55, 0.34 * f.h)) return 'stem';
    if (f.w >= 1.4 && f.straight >= 0.82 && f.h <= 0.55 * f.w && f.turnsX === 0) return 'beam';
    // 머리는 옆으로 넓적하거나 둥글다 — 세로로 길쭉하면(한 획 ♭·♮·쉼표 갈고리) 머리가 아니다
    // (잉크를 촘촘히 뭉갠 작은 덩어리는 조금 길쭉해도 머리)
    const headSize = big >= 0.42 && big <= 2.3 && f.h <= 1.8 && f.w >= 0.3 && f.h <= (f.density >= 1.3 ? 2.2 : 1.5) * f.w + 0.1 &&
      f.vrun < 0.95;     // 길게 곧은 세로 부분이 있으면 ♭(세로줄+고리)이지 머리가 아님
    // 얇게 오가며 그은 빗금·덩어리(짧은 축이 아주 짧음)는 칠한 머리
    const scrawl = f.thin < 0.35 && f.turnsX + f.turnsY >= 1 && f.straight < 0.5;
    const filled = f.inner >= user.fillInner || scrawl;
    if (headSize && scrawl) { f.fill = true; return 'head'; }
    // 칠한 머리: 가운데가 실제로 칠해짐 (지그재그·나선·문지르기 모두)
    // (빈 고리에 선 하나가 가운데를 지나가는 정도로는 '칠함'이 아님 — 잉크 양(밀도)도 함께 본다)
    if (headSize && filled && f.w <= 2.0 && (f.density >= 1.0 || f.wind >= 1.35 || (f.turnsX >= 3 && f.density >= 0.8))) { f.fill = true; return 'head'; }
    // 고리 머리: 거의 닫힘 또는 한 바퀴 가까이 돎, 또는 덜 닫힌 C 모양으로 크게 휜 획
    if (headSize && (f.closed <= 0.55 || f.wind >= 0.6 || (f.straight < 0.45 && f.wind >= 0.45))) {
      f.fill = filled && f.density >= 0.95;
      return 'head';
    }
    if (big < 0.42) return 'dot';
    // 짧고 곧은 사선: 옛 자필의 빗금 머리일 수도 있다 (기둥 끝에 붙어 있을 때만 머리로 — assembleNotes)
    if (f.straight >= 0.7 && f.len >= 0.5 && f.len <= 1.8 && big <= 1.5) f.slash = true;
    return 'other';
  }

  function cluster(idx, feats, sp, th) {
    const parent = {};
    idx.forEach(i => { parent[i] = i; });
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
      const i = idx[a], j = idx[b];
      if (Gm.gap(feats[i].b, feats[j].b) <= sp * (th || 0.85)) parent[find(i)] = find(j);
    }
    const map = {};
    idx.forEach(i => { const r = find(i); (map[r] = map[r] || []).push(i); });
    return Object.values(map);
  }

  function runGroup(g, prim, feats, strokes, ctx, out) {
    const sp = ctx.sp;
    // 머리가 하나라도 있어야 음표 묶음 (머리 없는 세로획 묶음은 ♯♭♮ 같은 기호로 본다)
    const hasNote = g.some(i => prim[i] === 'head') || g.some(i => prim[i] === 'stem' && feats[i].h >= 2.2 && slashHeadFor(i, g, prim, feats, sp));
    if (hasNote) assembleNotes(g, prim, feats, strokes, ctx, out);
    else symbolGroup(g, feats, strokes, ctx, out);
  }

  // 헷갈리는 획의 다른 해석 (가장 헷갈리는 3개까지 → 최대 8갈래)
  function hypotheses(g, prim, feats) {
    const amb = [];
    g.forEach(i => {
      const f = feats[i], p = prim[i], big = Math.max(f.w, f.h);
      if (p === 'head' && big < 0.7) amb.push({ i, lab: 'dot', w: 0.6 });                  // 크게 찍은 점일 수도
      else if (p === 'head' && big < 1.15) amb.push({ i, lab: 'other', w: 0.5 });          // ♭ 고리 · 쉼표 머리일 수도
      else if (p === 'stem' && f.h < 2.6) amb.push({ i, lab: 'other', w: 0.5 });           // 곧은 꼬리 · 임시표 줄일 수도
      else if (p === 'other' && big >= 0.42 && big <= 2.0 && f.straight < 0.6 && f.vrun < 0.95 && f.h <= 2.2 * f.w + 0.1) amb.push({ i, lab: 'head', w: 0.6 });   // 덜 닫힌 머리일 수도
      else if (p === 'dot' && big >= 0.5) amb.push({ i, lab: 'head', w: 0.4 });
    });
    amb.sort((a, b) => b.w - a.w);
    const pick = amb.slice(0, 3);
    const out = [];
    for (let m = 0; m < (1 << pick.length); m++) out.push(pick.filter((a, k) => m & (1 << k)).map(a => [a.i, a.lab]));
    return out;
  }

  // 해석 점수: 음표·쉼표 확신 평균 − 바꾼 획 수 − (한 묶음에 음표가 여럿) − 설명 못 한 군더더기 기호
  function scoreHyp(tmp, flips) {
    let s = -0.3 * flips;
    const mains = tmp.filter(x => x.kind === 'note' || x.kind === 'rest');
    const base = mains.length ? mains : tmp;      // 음표가 없는 묶음(점 하나·임시표 하나)도 그 기호의 확신으로 견준다
    if (base.length) s += base.reduce((a, x) => a + x.conf, 0) / base.length;
    if (mains.length > 1) s -= 0.5 * (mains.length - 1);
    tmp.forEach(x => {
      if (mains.length && (x.kind === 'dyn' || x.kind === 'unknown' || x.kind === 'tie')) s -= 0.45;
      if (x.kind === 'artic' && mains.length) s -= 0.1;
    });
    return s;
  }
  const sameVal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /* 임시표 순위: 모양 비교($P) + 구조(세로줄 수 · 가로줄 수 · 고리 · X자 · 세로줄 어긋남)를 반씩.
   * 악필이면 모양 비교만으로는 ♯·♮ 이 쉽게 뒤바뀌어서, 사람이 보는 방식(줄 몇 개, 어떻게 놓였나)을 함께 본다. */
  function rankAcc(idx, feats, strokes, sp) {
    const pr = PD.rank(idx.map(i => strokes[i]), R.templates(), ACC);
    const fs = idx.map(i => feats[i]);
    // 세로줄의 x = 맨 위 점과 맨 아래 점의 x 평균 (♮ 한 획 'ㄴ' 모양의 가로 부분에 끌려가지 않게)
    fs.forEach((f, k) => {
      const pts = strokes[idx[k]].pts;
      let t = pts[0], u = pts[0];
      pts.forEach(p => { if (p.y < t.y) t = p; if (p.y > u.y) u = p; });
      f.vx = (t.x + u.x) / 2;
    });
    const V = fs.filter(f => f.h >= 1.2 && f.w <= 0.55 * f.h);
    const H = fs.filter(f => f.w >= 0.45 && f.h <= 0.6 * f.w && f.h < 0.9);
    const loops = fs.filter(f => f.wind >= 0.5 && f.straight < 0.6).length;
    const diag = fs.filter(f => f.straight >= 0.8 && f.w >= 0.35 && f.h >= 0.35 && f.w / f.h > 0.45 && f.w / f.h < 2.2 && f.len < 2).length;
    const b = fs.map(f => f.b).reduce((a, c) => Gm.merge(a, c));
    const W = (b.x1 - b.x0) / sp, Hh = (b.y1 - b.y0) / sp;
    const s = { sharp: 0, natural: 0, flat: 0, dsharp: 0, dflat: 0 };
    if (V.length >= 2) {
      const vs = V.slice().sort((a, c) => a.vx - c.vx);
      const L = vs[0].b, Rr = vs[vs.length - 1].b;
      const off = ((Rr.y0 - L.y0) + (Rr.y1 - L.y1)) / 2 / sp;          // 오른쪽 세로줄이 아래로 내려감 = ♮
      s.natural += 0.35 + (off > 0.45 ? 0.35 : off > 0.25 ? 0.1 : -0.2);
      s.sharp += 0.35 + (off < 0.3 ? 0.3 : -0.15);
      // ♯ 가로줄은 두 세로줄 밖으로 삐져나옴
      const outside = H.filter(h => h.b.x0 < vs[0].vx - 0.05 * sp && h.b.x1 > vs[vs.length - 1].vx + 0.05 * sp).length;
      s.sharp += outside * 0.15;
      s.dflat += loops >= 2 ? 0.8 : loops === 1 && W > 1.3 ? 0.4 : 0;
    } else if (V.length === 1) {
      s.flat += loops >= 1 ? 0.7 : 0.25;
      s.natural += loops ? 0 : 0.2;
    }
    if (H.length >= 2) s.sharp += 0.15;
    if (loops >= 1) { s.flat += 0.2; s.sharp -= 0.4; s.natural -= 0.4; }
    if (!V.length && diag >= 2 && W < 1.8 && Hh < 1.8) s.dsharp += 0.8;
    if (!V.length && fs.length === 1 && fs[0].turnsX + fs[0].turnsY >= 2 && W < 1.5 && Hh < 1.5) s.dsharp += 0.3;
    const pScore = {};
    pr.forEach(r => { if (pScore[r.label] === undefined) pScore[r.label] = r.score; });
    return ACC.map(l => ({ label: l, score: 0.5 * (pScore[l] || 0) + 0.5 * Math.max(0, Math.min(1, s[l])) })).sort((a, c) => c.score - a.score);
  }

  // 기둥 끝에 붙은 빗금(/) = 옛 자필의 칠한 머리. 위 기둥이면 아래 끝 왼쪽, 아래 기둥이면 위 끝 오른쪽
  function slashHeadFor(si, g, prim, feats, sp, used) {
    const f = feats[si], up = f.start.y < f.end.y;
    const top = up ? f.start : f.end, bot = up ? f.end : f.start;
    let best = null, bd = 1e9;
    g.forEach(j => {
      if (j === si || prim[j] !== 'other' || !feats[j].slash || (used && used.has(j))) return;
      const b = feats[j].b;
      const lx = (bot.x - b.cx) / sp, ly = (b.cy - bot.y) / sp;
      if (lx > 0.1 && lx < 1.5 && ly > -0.6 && ly < 0.8) { const d = Math.abs(lx - 0.6) + Math.abs(ly); if (d < bd) { bd = d; best = { j, dir: -1 }; } }
      const rx = (b.cx - top.x) / sp, ry = (top.y - b.cy) / sp;
      if (rx > 0.1 && rx < 1.5 && ry > -0.6 && ry < 0.8) { const d = Math.abs(rx - 0.6) + Math.abs(ry) + 0.01; if (d < bd) { bd = d; best = { j, dir: 1 }; } }
    });
    return best;
  }

  // 기둥을 머리에서 멀리 떼어 그려 다른 묶음이 된 경우: 머리만 있는 묶음 + 기둥(꼬리)만 있는 묶음을 짝지운다
  function pairDetached(groups, prim, feats, sp) {
    const kind = g => ({ head: g.some(i => prim[i] === 'head'), stem: g.some(i => prim[i] === 'stem' && feats[i].h >= 2.2) });
    let merged = true;
    while (merged) {
      merged = false;
      for (let a = 0; a < groups.length && !merged; a++) {
        const ka = kind(groups[a]);
        if (!ka.stem || ka.head) continue;
        let best = -1, bd = 1e9;
        groups.forEach((g, b) => {
          if (b === a) return;
          const kb = kind(g);
          if (!kb.head || kb.stem) return;
          groups[a].filter(i => prim[i] === 'stem').forEach(si => {
            const s = feats[si].b;
            g.filter(i => prim[i] === 'head').forEach(hi => {
              const h = feats[hi].b;
              const dx = Math.abs(h.cx - s.cx) / sp;
              const dy = Math.min(Math.abs(h.cy - s.y0), Math.abs(h.cy - s.y1)) / sp;
              const along = h.cy > s.y0 && h.cy < s.y1 ? 0 : dy;
              const d = dx + along;
              if (dx < 2.4 && along < 1.6 && d < bd) { bd = d; best = b; }
            });
          });
        });
        if (best >= 0) {
          groups[a] = groups[a].concat(groups[best]);
          groups.splice(best, 1);
          merged = true;
        }
      }
    }
    return groups;
  }

  // 위치(반칸) 계산 + 애매하면 이웃 후보
  function posOf(y, ctx) {
    const p = 8 - 2 * (y - ctx.staffTop) / ctx.sp;
    const pos = Math.round(p);
    const frac = p - pos;
    return { pos: Math.max(-8, Math.min(16, pos)), alt: Math.abs(frac) > 0.28 ? pos + Math.sign(frac) : null, amb: Math.abs(frac), raw: p };
  }

  /* 화음 머리 높이를 함께 맞춘다: 사람은 화음을 '같은 간격'(대개 3도)으로 쌓는다.
   * 따로 반올림한 결과와 '고른 간격' 맞춤을 견줘, 간격 맞춤이 거의 비슷하게 맞으면 그쪽을 쓴다. 반환: 같은 순서의 pos 배열 또는 null */
  function chordFit(ps) {
    if (ps.length < 3) return null;
    const order = ps.map((p, k) => k).sort((a, b) => ps[a].raw - ps[b].raw);
    const raw = order.map(k => ps[k].raw);
    const gaps = raw.slice(1).map((r, i) => r - raw[i]);
    if (Math.max(...gaps) - Math.min(...gaps) > 0.9) return null;          // 간격이 원래 다름 (예: 3도+4도)
    const G = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
    if (G < 1) return null;
    const near = order.map(k => ps[k].pos);
    if (near.slice(1).every((p, i) => p - near[i] === G)) return null;      // 이미 고름
    const errNear = raw.reduce((a, r, i) => a + Math.abs(r - near[i]), 0);
    let best = null, be = 1e9;
    const mean = raw.reduce((a, b) => a + b, 0) / raw.length;
    const s0 = Math.round(mean - G * (raw.length - 1) / 2);
    [s0 - 1, s0, s0 + 1].forEach(s => {
      const e = raw.reduce((a, r, i) => a + Math.abs(r - (s + i * G)), 0);
      if (e < be) { be = e; best = s; }
    });
    if (be > errNear + 0.5) return null;
    const out = new Array(ps.length);
    order.forEach((k, i) => { out[k] = best + i * G; });
    return out;
  }

  function assembleNotes(g, prim, feats, strokes, ctx, out) {
    const sp = ctx.sp;
    const used = new Set();
    const size = i => Math.max(feats[i].w, feats[i].h);
    // 작은 동그라미 + 갈고리 (머리 없는 기둥) → 먼저 쉼표 모양과 견줘 본다 (8·16분쉼표)
    const hs0 = g.filter(i => prim[i] === 'head');
    if (hs0.length && hs0.every(i => size(i) < 0.8) &&!g.some(i => prim[i] === 'stem' && feats[i].h > 2.6)) {
      const r = PD.rank(g.map(i => strokes[i]), R.templates(), ['r:eighth', 'r:16th', 'r:quarter', 'flat', 'natural', 'sharp']);
      if (r.length && r[0].label.startsWith('r:') && r[0].score > 0.45) { symbolGroup(g, feats, strokes, ctx, out); return; }
    }
    // ♭ 모양: 빈 고리 + 그 왼쪽에서 위로 솟은 세로획 → 머리가 아니라 내림표
    // (악필이면 ♭ 고리를 뭉개 칠하기도 하므로 빈 머리만 보지 않는다 — 작은 고리면 됨)
    g.filter(i => prim[i] === 'head' && Math.max(feats[i].w, feats[i].h) < 1.15).forEach(i => {
      const b = feats[i].b;
      const v = g.find(j => (prim[j] === 'stem' || prim[j] === 'other') && feats[j].h >= 1.3 && feats[j].w <= 0.6 * feats[j].h &&
        Math.abs(feats[j].b.cx - b.x0) < 0.5 * sp && feats[j].b.y1 > b.cy - 0.3 * sp && feats[j].b.y1 < b.y1 + 0.5 * sp && feats[j].b.y0 < b.y0 - 0.6 * sp);
      if (v === undefined) return;
      // 같은 세로줄 아래 끝 왼쪽에 다른 머리가 있으면 ♭ 이 아니라 2도 화음(위 기둥)
      const vb = feats[v].b;
      const owner = g.some(k => k !== i && prim[k] === 'head' && feats[k].b.cx < vb.cx && Math.abs(feats[k].b.cy - vb.y1) < 0.7 * sp);
      if (!owner) { prim[i] = 'other'; prim[v] = 'other'; }
    });
    const heads = g.filter(i => prim[i] === 'head').map(i => ({ i, f: feats[i], cx: feats[i].b.cx, cy: feats[i].b.cy, fill: feats[i].fill }));
    const stems = g.filter(i => prim[i] === 'stem').map(i => {
      const f = feats[i], up = f.start.y < f.end.y;
      // 기울어진 기둥: 머리가 붙는 끝의 x 는 가운데 x 와 다르다
      return { i, f, x: f.b.cx, topX: (up ? f.start : f.end).x, botX: (up ? f.end : f.start).x, top: f.b.y0, bot: f.b.y1, heads: [], flags: 0, beams: 0 };
    });
    // 한 획에 이어 그린 머리+기둥은 서로 짝 (가까운 끝 쪽이 머리)
    heads.forEach(hd => {
      if (!hd.f.joined) return;
      const st = stems.find(s => s.f.orig === hd.f.orig && !s.heads.length);
      if (!st) return;
      st.heads.push(hd); st.dir = Math.abs(hd.cy - st.bot) < Math.abs(hd.cy - st.top) ? -1 : 1;
      hd.stem = st; used.add(hd.i); used.add(st.i);
    });
    // 기둥 ↔ 머리 (사보 규칙: 위 기둥은 머리 오른쪽 끝, 아래 기둥은 머리 왼쪽 끝)
    heads.forEach(hd => {
      if (hd.stem) return;
      let best = null, bd = 1e9;
      const hw = Math.max(0.5 * sp, hd.f.b.w / 2);
      stems.forEach(st => {
        const dxUp = st.botX - hd.cx, dyUp = Math.abs(hd.cy - st.bot);
        const dxDn = hd.cx - st.topX, dyDn = Math.abs(hd.cy - st.top);
        // 기둥을 머리에서 띄어 그려도(옆으로 ~1칸, 위아래 ~1.2칸) 그 머리의 기둥으로 본다
        const sideOk = dx => dx > hw * 0.35 && dx < hw + 1.2 * sp;
        const along = (hd.cy > st.top + 1.2 * sp && hd.cy < st.bot - 1.2 * sp);
        const up = sideOk(dxUp) && (dyUp < 1.25 * sp || (along && hd.cy > (st.top + st.bot) / 2));
        const dn = sideOk(dxDn) && (dyDn < 1.25 * sp || (along && hd.cy < (st.top + st.bot) / 2));
        const d = up ? Math.abs(dxUp - hw) + dyUp : dn ? Math.abs(dxDn - hw) + dyDn + 0.01 : 1e9;
        if (d < bd) { bd = d; best = { st, dir: up ? -1 : 1 }; }
      });
      if (best) { best.st.heads.push(hd); best.st.dir = best.dir; hd.stem = best.st; used.add(hd.i); used.add(best.st.i); }
    });
    // 2도 화음: 기둥 반대편으로 비킨 머리 → 바로 옆(위아래 반칸~한칸) 머리의 기둥에
    heads.filter(hd => !hd.stem).forEach(hd => {
      const mate = heads.find(o => o.stem && Math.abs(o.cy - hd.cy) <= 0.85 * sp && Math.abs(o.cx - hd.cx) > 0.6 * sp && Math.abs(o.cx - hd.cx) < 1.7 * sp);
      if (mate) { mate.stem.heads.push(hd); hd.stem = mate.stem; used.add(hd.i); }
    });
    // 머리 없는 기둥 끝의 빗금 → 칠한 머리
    stems.forEach(st => {
      if (st.heads.length || st.f.h < 2.2) return;
      const s = slashHeadFor(st.i, g, prim, feats, sp, used);
      if (!s) return;
      prim[s.j] = 'head'; feats[s.j].fill = true;
      const hd = { i: s.j, f: feats[s.j], cx: feats[s.j].b.cx, cy: feats[s.j].b.cy, fill: true, stem: st };
      heads.push(hd); st.heads.push(hd); st.dir = s.dir; used.add(s.j); used.add(st.i);
    });
    // 머리와 짝이 없는 곧은 사선: 다른 기둥의 꼬리 쪽 끝에서 오른쪽으로 뻗었으면 (직선) 꼬리
    stems.filter(st => st.heads.length).forEach(st => { st.free = st.dir < 0 ? st.top : st.bot; });
    stems.slice().forEach(st => {
      if (st.heads.length || st.f.w < 0.22 * st.f.h) return;
      const f = st.f;
      const host = stems.find(o => o.heads.length && [f.start, f.end].some(p => Math.abs(p.x - o.x) < 0.75 * sp &&
        (o.dir < 0 ? p.y > o.top - 0.6 * sp && p.y < o.top + (o.bot - o.top) * 0.75 : p.y < o.bot + 0.6 * sp && p.y > o.bot - (o.bot - o.top) * 0.75)) && f.b.cx > o.x);
      if (host) { prim[st.i] = 'other'; stems.splice(stems.indexOf(st), 1); }
    });
    // 머리와 짝이 없는 세로획: 머리 왼쪽 가까이 있으면 임시표(♯♭♮)의 획으로 돌린다
    stems.slice().forEach(st => {
      if (st.heads.length) return;
      const accLike = heads.some(hd => hd.cx - st.x > 0.4 * sp && hd.cx - st.x < 3.6 * sp && hd.cy > st.top - 0.6 * sp && hd.cy < st.bot + 0.6 * sp && (st.bot - st.top) < 3.6 * sp);
      if (accLike || !heads.length) { prim[st.i] = 'other'; stems.splice(stems.indexOf(st), 1); }
    });
    stems.forEach(st => {
      if (!st.dir) st.dir = -1;
      st.free = st.dir < 0 ? st.top : st.bot;     // 꼬리·빔이 붙는 끝
    });
    // 빔: 기둥 끝 둘 이상에 걸친 가로선
    g.filter(i => prim[i] === 'beam').forEach(i => {
      const b = feats[i].b;
      const hit = stems.filter(st => st.x >= b.x0 - 0.5 * sp && st.x <= b.x1 + 0.5 * sp && Math.abs(st.free - (b.cy)) < 1.6 * sp);
      if (hit.length >= 2) { hit.forEach(st => { st.beams++; st.beamed = true; }); used.add(i); }
    });
    // 꼬리: 기둥 자유 끝에 붙은 다른 획
    g.filter(i => !used.has(i) && (prim[i] === 'other' || prim[i] === 'beam')).forEach(i => {
      const f = feats[i];
      let best = null, bd = 1e9;
      stems.forEach(st => {
        // 꼬리는 기둥의 꼬리 쪽 절반 어딘가에서 오른쪽으로 뻗는다 (여러 꼬리는 아래로 겹쳐 내려감)
        const half = (st.bot - st.top) * 0.75;
        const zone = st.dir < 0 ? [st.top - 0.6 * sp, st.top + half] : [st.bot - half, st.bot + 0.6 * sp];
        const ends = [f.start, f.end].map(p => ({ dx: Math.abs(p.x - st.x) / sp, inZone: p.y >= zone[0] && p.y <= zone[1] }));
        const touch = ends.filter(e => e.inZone && e.dx < 0.75);
        const d = touch.length ? Math.min(...touch.map(e => e.dx)) : 1e9;
        const rightSide = f.b.cx > st.x - 0.1 * sp;
        if (d < bd && rightSide && f.h < 3.6 && f.w < 2.6) { bd = d; best = st; }
      });
      if (best) { best.flags++; best.flagStrokes = (best.flagStrokes || []).concat(i); used.add(i); }
    });
    // 기둥 없는 머리끼리 세로로 쌓였으면 화음
    const loose = heads.filter(hd => !hd.stem);
    const chords = [];
    loose.sort((a, b) => a.cx - b.cx).forEach(hd => {
      const c = chords.find(ch => Math.abs(ch.cx - hd.cx) < 0.9 * sp);
      if (c) { c.heads.push(hd); c.cx = (c.cx * (c.heads.length - 1) + hd.cx) / c.heads.length; } else chords.push({ cx: hd.cx, heads: [hd], stem: null });
    });
    const notes = stems.filter(st => st.heads.length).map(st => ({ heads: st.heads, stem: st, cx: Math.min(...st.heads.map(x => x.cx)) })).concat(chords);
    // 기둥만 있고 머리가 없음 → 머리 찾기 실패 (낮은 신뢰도 4분음표 후보)
    stems.filter(st => !st.heads.length).forEach(st => {
      const y = st.dir < 0 ? st.bot : st.top;
      notes.push({ heads: [{ cx: st.x - 0.6 * sp, cy: y, fill: true, guess: true }], stem: st, cx: st.x - 0.6 * sp });
    });
    // 점·임시표·기타
    const dots = g.filter(i => prim[i] === 'dot' && !used.has(i));
    const others = g.filter(i => prim[i] === 'other' && !used.has(i));
    notes.forEach(n => {
      const right = Math.max(...n.heads.map(hd => hd.f ? hd.f.b.x1 : hd.cx + 0.6 * sp));
      n.dots = 0; n.staccato = false;
      dots.forEach(i => {
        if (used.has(i)) return;
        const b = feats[i].b;
        const nearY = n.heads.some(hd => Math.abs(b.cy - hd.cy) < 0.8 * sp);
        if (b.cx > right - 0.1 * sp && b.cx < right + 1.7 * sp && nearY && n.dots < 2) { n.dots++; used.add(i); }
        else if (Math.abs(b.cx - n.cx) < 0.9 * sp && !nearY) { n.staccato = true; used.add(i); }
      });
      // 임시표: 머리 왼쪽
      n.heads.forEach(hd => {
        const near = others.filter(i => !used.has(i) && feats[i].b.x1 < hd.cx + 0.1 * sp && feats[i].b.x1 > hd.cx - 3.2 * sp && Math.abs(feats[i].b.cy - hd.cy) < 1.4 * sp);
        if (!near.length) return;
        const r = rankAcc(near, feats, strokes, sp);
        if (r.length && r[0].score > 0.15) { hd.acc = r[0].label; hd.accAlt = r.slice(1, 3).map(x => x.label); hd.accScore = r[0].score; near.forEach(i => used.add(i)); }
      });
    });
    notes.forEach(n => out.push(noteSymbol(n, ctx, feats, strokes, g)));
    // 남은 획은 따로 기호로
    const rest = g.filter(i => !used.has(i) && prim[i] !== 'head' && prim[i] !== 'stem');
    if (rest.length) {
      const sub = cluster(rest, feats, sp, 0.3);
      sub.forEach(s => symbolGroup(s, feats, strokes, ctx, out, notes));
    }
  }

  function noteSymbol(n, ctx, feats, strokes, g) {
    const sp = ctx.sp;
    const st = n.stem;
    const fill = n.heads.every(hd => hd.fill);
    const hollow = n.heads.every(hd => !hd.fill);
    let type, conf = 0.92;
    const fl = st ? Math.max(st.flags, st.beams) : 0;
    if (!st) type = hollow ? 'whole' : (ctx.defaultDur ? ctx.defaultDur.type : 'quarter');
    else if (hollow) type = 'half';
    else type = FLAG_TYPE[Math.min(4, fl)];
    if (!fill && !hollow) conf -= 0.25;               // 화음 머리 채움이 섞임
    n.heads.forEach(hd => { if (hd.f && Math.abs(hd.f.inner - user.fillInner) < 0.12) conf -= 0.15; if (hd.guess) conf -= 0.4; });
    const dots = n.dots || 0;
    const ps = n.heads.map(hd => posOf(hd.cy, ctx));
    ps.forEach(p => { if (p.alt !== null) conf -= 0.12; });
    if (!st && !hollow && ctx.defaultDur) conf = Math.min(conf, 0.85);
    const accOf = k => (n.heads[k].acc ? ACC_ALTER[n.heads[k].acc] : null);
    const fit = chordFit(ps);
    const nearHeads = ps.map((p, k) => ({ pos: p.pos, acc: accOf(k) }));
    const heads = fit ? fit.map((pos, k) => ({ pos, acc: accOf(k) })) : nearHeads;
    const val = (tp, d, hs) => ({ type: tp, dots: d, heads: hs || heads, staccato: n.staccato, beamed: !!(st && st.beamed) });
    const lbl = (tp, d) => dotted(SJ.t({ whole: '온음표', half: '2분음표', quarter: '4분음표', eighth: '8분음표', '16th': '16분음표', '32nd': '32분음표', '64th': '64분음표' }[tp]), d);
    const cands = [{ label: lbl(type, dots), value: val(type, dots) }];
    const push = (tp, d, hs, l) => { if (cands.length < 5 && !cands.some(c => c.value.type === tp && c.value.dots === d && (!hs || c.value.heads === hs))) cands.push({ label: l || lbl(tp, d), value: val(tp, d, hs) }); };
    // 화음 높이: 고른 간격으로 맞췄으면, 그린 그대로의 높이도 바로 다음 후보로
    if (fit) push(type, dots, nearHeads, SJ.t('그린 높이 그대로'));
    // 점 개수 대안
    if (dots) push(type, dots - 1); else push(type, 1);
    // 꼬리 개수 ±1 · 채움 대안
    const ti = NOTE_TYPES.indexOf(type);
    if (ti + 1 < NOTE_TYPES.length) push(NOTE_TYPES[ti + 1], dots);
    if (ti - 1 >= 0) push(NOTE_TYPES[ti - 1], dots);
    // 음높이 대안 (한 칸 위/아래)
    if (ps.length === 1 && ps[0].alt !== null) {
      const alt = [{ pos: ps[0].alt, acc: heads[0].acc }];
      push(type, dots, alt, SJ.t(ps[0].alt > ps[0].pos ? '한 칸 위' : '한 칸 아래'));
    }
    if (dots === 0 && type !== 'whole') push(type, 2);
    const idxs = [];
    n.heads.forEach(hd => { if (hd.f) idxs.push(feats.indexOf(hd.f)); });
    if (st) idxs.push(st.i);
    return {
      kind: 'note', x: n.cx, y: n.heads[0].cy, conf: Math.max(0.05, Math.min(1, conf)), cands, value: cands[0].value,
      strokes: g.slice(), headInner: n.heads[0].f ? n.heads[0].f.inner : null, fill
    };
  }

  // 음표가 아닌 묶음: 쉼표 · 붙임줄 · 아티큘레이션 · 셈여림 · (외톨이) 임시표
  function symbolGroup(g, feats, strokes, ctx, out, notes) {
    const sp = ctx.sp;
    const b = g.map(i => feats[i].b).reduce((a, c) => Gm.merge(a, c));
    const bw = (b.x1 - b.x0) / sp, bh = (b.y1 - b.y0) / sp;
    if (g.length === 1 && (feats[g[0]].diag <= user.dotMax || feats[g[0]].prim === 'dot')) {
      out.push({ kind: 'artic', x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, conf: 0.6, value: { art: 'staccato' }, cands: [{ label: SJ.t('스타카토'), value: { art: 'staccato' } }], strokes: g });
      return;
    }
    let ranked = PD.rank(g.map(i => strokes[i]), R.templates(), OTHER);
    // 모양 힌트로 다시 가중: 아주 넓고 낮으면 붙임줄
    if (bw > 2.2 && bh < 1.4) ranked = [{ label: 'tie', score: 0.9 }].concat(ranked.filter(r => r.label !== 'tie'));
    if (!ranked.length) return;
    if (ACC.indexOf(ranked[0].label) >= 0) ranked = rankAcc(g, feats, strokes, sp).concat(ranked.filter(r => ACC.indexOf(r.label) < 0));
    const top = ranked[0];
    const mk = r => {
      const l = r.label;
      if (l === 'r:bar') {
        // 온쉼표(넷째 줄에 매달림) vs 2분쉼표(가운데 줄 위) — 위치로
        const cy = ((b.y0 + b.y1) / 2 - ctx.staffTop) / sp;
        const whole = cy < 1.5;
        return [{ label: SJ.t(whole ? '온쉼표' : '2분쉼표'), value: { rest: whole ? 'whole' : 'half' } }, { label: SJ.t(whole ? '2분쉼표' : '온쉼표'), value: { rest: whole ? 'half' : 'whole' } }];
      }
      if (l.startsWith('r:')) return [{ label: SJ.t(RT.LABEL[l]), value: { rest: { 'r:quarter': 'quarter', 'r:eighth': 'eighth', 'r:16th': '16th' }[l] } }];
      if (ACC.indexOf(l) >= 0) return [{ label: SJ.t(RT.LABEL[l]), value: { acc: ACC_ALTER[l] } }];
      if (l === 'tie') return [{ label: SJ.t('붙임줄'), value: { tie: true } }];
      if (l === 'accent' || l === 'tenuto' || l === 'fermata') return [{ label: SJ.t(RT.LABEL[l]), value: { art: l } }];
      if (l.startsWith('dyn:')) return [{ label: l.slice(4), value: { dynLetter: l.slice(4) } }];
      return [];
    };
    let cands = [];
    ranked.slice(0, 4).forEach(r => mk(r).forEach(c => { if (!cands.some(x => x.label === c.label)) cands.push(c); }));
    cands = cands.slice(0, 5);
    const v = cands[0] ? cands[0].value : null;
    if (!v) return;
    const kind = v.rest ? 'rest' : v.acc !== undefined ? 'accidental' : v.tie ? 'tie' : v.art ? 'artic' : v.dynLetter ? 'dyn' : 'unknown';
    const second = ranked[1] ? ranked[1].score : 0;
    const conf = Math.max(0.05, Math.min(1, top.score * 1.4 - Math.max(0, second - top.score + 0.25) * 0.2 - (top.score - second < 0.06 ? 0.2 : 0)));
    out.push({ kind, x: b.x0, x1: b.x1, y: (b.y0 + b.y1) / 2, y0: b.y0, y1: b.y1, conf, value: v, cands, strokes: g, label: top.label });
    void notes;
  }

  SJ.Recognizer = R;
})(window.SJ = window.SJ || {});
