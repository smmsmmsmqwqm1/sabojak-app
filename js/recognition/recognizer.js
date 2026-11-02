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
    const out = recognizeParts(strokes, Object.assign({}, ctx, { _in: input, _orig: orig }), orig);
    out.forEach(s => { s.strokes = Array.from(new Set((s.strokes || []).map(i => orig[i]))); });
    return out;
  };

  function recognizeParts(strokes, ctx, orig) {
    const sp = ctx.sp;
    const feats = strokes.map(s => Gm.features(s, sp));
    feats.forEach((f, i) => { f.orig = orig[i]; f.joined = orig.filter(o => o === orig[i]).length > 1; });
    const prim = feats.map((f, i) => classify(f, strokes[i], sp));
    // 긁기는 그 밑에 지울 것(다른 잉크 · 이미 넣은 음표 ctx.eraseTargets)이 있을 때만 지우기. 빈 자리를 긁듯 칠한 것은 그린 기호(칠한 온 · 2분쉼표 등)로 읽는다
    const meet = (a, b, m) => a.x1 >= b.x0 - m && a.x0 <= b.x1 + m && a.y1 >= b.y0 - m && a.y0 <= b.y1 + m;
    const prim0 = prim.slice();   // (그은 순서와 무관하게 — 바뀌기 전 분류로 판단 · 점검원 ② 11-02)
    prim.forEach((p, i) => {
      if (p !== 'scratch') return;
      const b = feats[i].b;
      const over = feats.some((f, j) => j !== i && prim0[j] !== 'scratch' && meet(f.b, b, 0.2 * sp)) || (ctx.eraseTargets || []).some(t => meet(t, b, 0.3 * sp));
      if (!over) prim[i] = classify(feats[i], strokes[i], sp, true);
    });
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
    const groups = netMerge(pairDetached(cluster(idx, feats, sp), prim, feats, sp), strokes, feats, sp);
    groups.forEach(g => {
      // 헷갈리는 획은 해석을 몇 갈래로 나눠 끝까지 맞춰 보고, 획 전체를 가장 자연스럽게 설명하는 해석을 고른다
      const hyps = hypotheses(g, prim, feats);
      const fillSave = g.map(i => feats[i].fill), tinySave = g.map(i => feats[i].tiny);   // (갈래마다 처음 상태로 — tiny도 · 점검원 ② 11-02)
      let best = null, second = null;
      hyps.forEach(h => {
        const pr = prim.slice();
        h.forEach(([i, lab]) => { pr[i] = lab; if (lab === 'head' && feats[i].fill === undefined) feats[i].fill = feats[i].inner >= user.fillInner; });
        g.forEach(i => { feats[i].prim = pr[i]; });
        const tmp = [];
        runGroup(g, pr, feats, strokes, ctx, tmp);
        const r = { sc: scoreHyp(tmp, h.length), tmp, pr };
        if (!best || r.sc > best.sc) { second = best; best = r; } else if (!second || r.sc > second.sc) second = r;
        g.forEach((i, k) => { feats[i].fill = fillSave[k]; feats[i].tiny = tinySave[k]; });
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
      // ★ 묶음 전체를 놓고 '음표로 읽기'와 '다른 기호로 읽기(구조로 확인한 쉼표 · 임시표 · 점 …)'를 겨뤄 확률로 고른다
      decide(g, best.tmp, feats, strokes, ctx).forEach(s => out.push(s));
    });
    attachLoose(out, ctx);
    out.sort((a, b) => a.x - b.x);
    R._last = { prim: prim.slice(), feats: feats.map(f => ({ w: +f.w.toFixed(2), h: +f.h.toFixed(2), inner: +f.inner.toFixed(2), closed: +f.closed.toFixed(2), wind: +f.wind.toFixed(2), dens: +f.density.toFixed(2), str: +f.straight.toFixed(2), tx: f.turnsX })) };
    return out;
  }

  /* 떨어져 그린 꼬리 · 머리를 한 기호로 다시 묶기 (11-02): 바짝 붙은(0.6칸 안) 이웃 두 묶음을
   * '하나로 본 확률' ≥ '따로 본 두 확률의 곱'이면 합친다(신경망 확률로 두 나눔을 겨룸). 각자 자신 있는 두 기호(임시표 + 음표 등)는 곱이 커서 그대로. */
  function netMerge(groups, strokes, feats, sp) {
    if (!SJ.ShapeNet || !SJ.ShapeNet.ready() || groups.length < 2) return groups;
    const box = g => { let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; g.forEach(i => { const b = feats[i].b; x0 = Math.min(x0, b.x0); x1 = Math.max(x1, b.x1); y0 = Math.min(y0, b.y0); y1 = Math.max(y1, b.y1); }); return { x0, x1, y0, y1 }; };
    // (같은 묶음은 한 번만 셈 — 합칠 때마다 모든 쌍을 다시 세면 펜 뗄 때마다 느려짐 · 점검원 ② 11-02)
    const memo = {};
    const top = g => { const key = g.slice().sort((a, b) => a - b).join(','); if (memo[key]) return memo[key]; const p = SJ.ShapeNet.probs(g.map(i => strokes[i]), sp); let k = null; Object.keys(p).forEach(c => { if (!k || p[c] > p[k]) k = c; }); return (memo[key] = { k, p: p[k] }); };
    let gs = groups.slice();
    for (let guard = 0; guard < 20; guard++) {
      gs.sort((a, b) => box(a).x0 - box(b).x0);
      let merged = false;
      for (let i = 0; i + 1 < gs.length && !merged; i++) {
        for (let j = i + 1; j < gs.length && !merged; j++) {
          const A = box(gs[i]), Bx = box(gs[j]);
          if (Bx.x0 - A.x1 > 0.6 * sp) break;
          if (Math.min(A.y1, Bx.y1) - Math.max(A.y0, Bx.y0) < -0.5 * sp) continue;
          if (Math.max(A.x1, Bx.x1) - Math.min(A.x0, Bx.x0) > 2.6 * sp) continue;
          const M = gs[i].concat(gs[j]), tM = top(M);
          if (!/Note|Rest/.test(tM.k) || tM.p < 0.4) continue;
          // 악보에서 따로 쓴 두 기호는 같은 세로 줄에 겹쳐 놓이지 않는다(화음 머리는 이미 한 묶음 · 점/스타카토는 작아서 뺌).
          // 가로로 절반 넘게 겹치면 조각 · 아니면 '하나 확률 ≥ 따로 확률 곱'으로 겨룸(신경망은 조각에도 과하게 자신 있어 겹친 조각엔 곱 비교를 안 씀)
          const ov = Math.min(A.x1, Bx.x1) - Math.max(A.x0, Bx.x0), narrow = Math.min(A.x1 - A.x0, Bx.x1 - Bx.x0);
          const small = g => { const b = box(g); return Math.max(b.x1 - b.x0, b.y1 - b.y0) < 0.6 * sp; };
          // (위아래로 거의 닿을 때만 — 머리 위아래에 떼어 쓴 테누토 · 악센트 · 페르마타를 삼키지 않게 · 조수 검토 11-02)
          const vgap = Math.max(A.y0, Bx.y0) - Math.min(A.y1, Bx.y1);
          const stacked = ov >= 0.5 * narrow && vgap <= 0.3 * sp && !small(gs[i]) && !small(gs[j]);
          const tA = stacked ? null : top(gs[i]), tB = stacked ? null : top(gs[j]);
          // 따로 쓴 두 기호가 가로로 맞닿는(0.3칸 안) 일은 드물다 — 그만큼 '따로' 쪽을 sepPrior 배로 (작성자 1~50 · 기호 하나/마디 시험으로 맞춤)
          const touch = Bx.x0 - A.x1 <= 0.3 * sp;
          if (stacked || tM.p >= (touch ? R.netCfg.sepPrior : 1) * tA.p * tB.p) { gs = gs.filter((g, k) => k !== i && k !== j).concat([M]); merged = true; }
        }
      }
      if (!merged) break;
    }
    return gs;
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
          // 붙인 임시표 획도 그 음표 몫으로(안 그러면 화면이 그 획을 따로 '?'로 띄움 · 점검원 ② 해소 확인)
          best.n.strokes = Array.from(new Set((best.n.strokes || []).concat(s.strokes || [])));
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
          best.strokes = Array.from(new Set((best.strokes || []).concat(s.strokes || [])));   // (붙인 점 획도 그 음표 몫으로)
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

  function classify(f, s, sp, noScratch) {
    const big = Math.max(f.w, f.h);
    // 긁어 지우기: 넓고(머리보다 훨씬) 좌우로 여러 번 왕복
    if (!noScratch && f.turnsX >= 6 && f.w >= 2.2 && f.len > f.w * 3 && f.h < f.w * 1.1) return 'scratch';
    if (f.diag <= user.dotMax && f.len < 1.6) return 'dot';
    // 크게 찍은 점(작은 동그라미) — 머리보다 확실히 작음
    if ((big < 0.55 && (f.len < 0.8 || (f.len < 2.0 && f.h <= 2 * f.w + 0.1))) || (big < 0.7 && f.len < 0.9)) return 'dot';
    // 기둥: 길고 세로. 손으로 그은 줄은 끝이 살짝 휘거나 떨리므로 '양 끝 거리 ÷ 길이'만 보지 않고,
    // 주축 방향으로 얇은가(짧은 축 / 긴 축)도 본다
    // (사람은 기둥을 20°쯤 기울여 긋기도 한다 — 폭 ≤ 높이의 0.45 ≈ 24°까지)
    if (f.h >= 1.6 && f.w <= Math.max(0.55, 0.45 * f.h) && (f.straight >= 0.84 || (f.thin <= 0.16 && f.h >= 1.8))) return 'stem';
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
    const hasNote = g.some(i => prim[i] === 'head') || g.some(i => prim[i] === 'stem' && feats[i].h >= 2.2 && slashHeadFor(i, g, prim, feats, sp)) ||
      g.some(i => prim[i] === 'stem' && feats[i].h >= 1.8 && g.some(j => prim[j] === 'dot'));
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
    // 음표는 구조 점수(q: 머리다움 × 기둥다움 × 설명 못 한 잉크)로 견준다 — 확신도 숫자는 구조를 모른다
    if (base.length) s += base.reduce((a, x) => a + (x.q !== undefined ? x.q : x.conf), 0) / base.length;
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
    // 머리 묶음 = 머리가 있거나, 작은 점 하나뿐(아주 작게 찍은 머리일 수 있음 — 기둥 끝 가까이일 때만 아래에서 짝지움)
    const isHeadish = i => prim[i] === 'head' || prim[i] === 'dot';
    const kind = g => ({ head: g.some(i => prim[i] === 'head') || (g.length === 1 && prim[g[0]] === 'dot'), stem: g.some(i => prim[i] === 'stem' && feats[i].h >= 2.2) });
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
            g.filter(isHeadish).forEach(hi => {
              const h = feats[hi].b;
              const dx = Math.abs(h.cx - s.cx) / sp;
              const dy = Math.min(Math.abs(h.cy - s.y0), Math.abs(h.cy - s.y1)) / sp;
              const along = h.cy > s.y0 && h.cy < s.y1 ? 0 : dy;
              const d = dx + along;
              const lim = prim[hi] === 'dot' ? 1.3 : 2.4;     // 점은 기둥 끝 바로 옆일 때만
              if (dx < lim && along < (prim[hi] === 'dot' ? 1.2 : 1.6) && (prim[hi] !== 'dot' || along > 0 || dy < 1.2) && d < bd) { bd = d; best = b; }
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
  R.posAt = (y, ctx) => posOf(y, ctx).pos;   // 손글씨 화면의 '다른 기호' 기호판이 음표 높이를 정할 때
  function posOf(y, ctx) {
    const p = 8 - 2 * (y - ctx.staffTop) / ctx.sp;
    const pos = Math.round(p);
    const frac = p - pos;
    const cl = x => Math.max(-8, Math.min(16, x));   // (대안 높이도 같은 범위로 · 점검원 ② 11-02)
    return { pos: cl(pos), alt: Math.abs(frac) > 0.28 && cl(pos + Math.sign(frac)) !== cl(pos) ? cl(pos + Math.sign(frac)) : null, amb: Math.abs(frac), raw: p };
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
    // 아주 작게 찍은 머리: 머리가 없는 기둥의 끝(옆 1칸 · 위아래 1칸 안)에 있는 '점'은 점음표의 점이 아니라 머리다
    // (점음표의 점은 머리 오른쪽에 찍히지 기둥 끝에 붙지 않는다)
    g.filter(i => prim[i] === 'stem').forEach(si => {
      const sf = feats[si];
      const ends = [sf.b.y0, sf.b.y1];
      const nearEnd = j => ends.some(y => Math.abs(feats[j].b.cy - y) < 1.0 * sp) && Math.abs(feats[j].b.cx - sf.b.cx) < 1.2 * sp;
      if (g.some(j => prim[j] === 'head' && nearEnd(j))) return;
      const d = g.filter(j => prim[j] === 'dot' && nearEnd(j)).sort((a, b) => Math.max(feats[b].w, feats[b].h) - Math.max(feats[a].w, feats[a].h))[0];
      if (d !== undefined) { prim[d] = 'head'; feats[d].fill = true; feats[d].tiny = true; }
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
      // side = 음표에 딸린 점 · 스타카토 · 임시표 조각(모양 판정 신경망이 '딸린 것인가 · 음표의 일부인가'를 겨룰 때 씀)
      n.dots = 0; n.staccato = false; n.side = [];
      dots.forEach(i => {
        if (used.has(i)) return;
        const b = feats[i].b;
        const nearY = n.heads.some(hd => Math.abs(b.cy - hd.cy) < 0.8 * sp);
        if (b.cx > right - 0.1 * sp && b.cx < right + 1.7 * sp && nearY && n.dots < 2) { n.dots++; used.add(i); n.side.push({ cls: 'Dot', idx: [i] }); }
        else if (Math.abs(b.cx - n.cx) < 0.9 * sp && !nearY) { n.staccato = true; used.add(i); n.side.push({ cls: 'Dot', idx: [i] }); }
      });
      // 임시표: 머리 왼쪽
      n.heads.forEach(hd => {
        const near = others.filter(i => !used.has(i) && feats[i].b.x1 < hd.cx + 0.1 * sp && feats[i].b.x1 > hd.cx - 3.2 * sp && Math.abs(feats[i].b.cy - hd.cy) < 1.4 * sp);
        if (!near.length) return;
        const r = rankAcc(near, feats, strokes, sp);
        if (r.length && r[0].score > 0.15) { hd.acc = r[0].label; hd.accAlt = r.slice(1, 3).map(x => x.label); hd.accScore = r[0].score; near.forEach(i => used.add(i)); n.side.push({ cls: ACC_CLS[ACC_ALTER[r[0].label]] || null, idx: near.slice() }); }
      });
    });
    // 음표들로 설명 못 한 잉크 길이(칸): 쓰지 않은 기둥 · 줄 · 덩어리
    const unexpl = g.filter(i => !used.has(i) && prim[i] !== 'dot' && prim[i] !== 'head').reduce((a, i) => a + feats[i].len, 0);
    notes.forEach(n => { n.unexplained = unexpl; out.push(noteSymbol(n, ctx, feats, strokes, g)); });
    R._lastAssemble = { used: Array.from(used), prim: g.map(i => i + ':' + prim[i]), stems: stems.map(s => ({ i: s.i, heads: s.heads.length, flags: s.flags, dir: s.dir })), unexpl: +unexpl.toFixed(2) };
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
    const fit0 = chordFit(ps);
    const fit = fit0 && fit0.every(p => p >= -8 && p <= 16) ? fit0 : null;   // (범위 밖이 섞이면 맞춤을 안 씀 — 잘라서 두 머리가 겹치던 것 · 점검원 ② 해소 확인)
    const nearHeads = ps.map((p, k) => ({ pos: p.pos, acc: accOf(k) }));
    const heads = fit ? fit.map((pos, k) => ({ pos: Math.max(-8, Math.min(16, pos)), acc: accOf(k) })) : nearHeads;
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
      strokes: g.slice(), headInner: n.heads[0].f ? n.heads[0].f.inner : null, fill,
      q: noteQ(n), noHead: n.heads.some(hd => hd.guess),
      // 모양 판정 신경망에 넘길 구조 정보: 딸린 획 · 기둥 유무 · 기둥 위아래 · 머리 높이(진짜 화음 가리기)
      side: n.side || [], noStem: !st, stemSpan: st ? [st.f.b.y0, st.f.b.y1] : null, headYs: n.heads.map(hd => hd.cy)
    };
  }

  // ── 모양이 '얼마나 그것다운가' (0~1, 문턱에서 뚝 끊기지 않게 선형으로) ──
  const smooth = (x, a, b) => (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a));
  const band = (x, a, b, c, d) => Math.min(smooth(x, a, b), 1 - smooth(x, c, d));
  // 머리다움: 알맞은 크기 · 옆으로 넓적하거나 둥긂 · 긴 직선이 아님
  function headQ(f) {
    const big = Math.max(f.w, f.h);
    const size = band(big, 0.25, 0.45, 1.8, 2.6);
    const aspect = f.h <= 1.7 * f.w + 0.25 ? 1 : 0.35;
    const notLine = big < 0.75 || f.straight < 0.8 ? 1 : 0.3;
    return size * aspect * notLine;
  }
  // 기둥다움: 충분히 길고 곧고 세로
  function stemQ(f) {
    return smooth(f.h, 1.3, 2.3) * (0.3 + 0.7 * Math.max(smooth(f.straight, 0.7, 0.9), 1 - smooth(f.thin, 0.1, 0.25))) * (f.w <= 0.45 * f.h + 0.25 ? 1 : 0.5);
  }
  // 음표로 읽은 것의 구조 점수: 머리(진짜로 그려진 머리인가) × 기둥
  function noteQ(n) {
    const hs = n.heads.map(hd => (hd.guess ? 0.08 : hd.f ? (hd.f.tiny ? Math.max(0.6, headQ(hd.f)) : headQ(hd.f)) : 0.6));
    const hq = hs.reduce((a, b) => a + b, 0) / hs.length;
    let sq = 1;
    if (n.stem) sq = stemQ(n.stem.f);
    else if (n.heads.every(hd => hd.fill)) {
      // 기둥 없이 칠한 머리만 = '지금 음길이' 줄임 입력 (흔하지 않으니 조금 덜 · 점만 한 크기면 점일 수 있음)
      const big = Math.max(...n.heads.map(hd => (hd.f ? Math.max(hd.f.w, hd.f.h) : 1)));
      sq = 0.72 * (0.3 + 0.7 * smooth(big, 0.45, 0.8));
    }
    // 이 음표로 설명 못 한 잉크(남는 기둥 · 줄)가 길수록 이 해석은 덜 그럴듯하다
    const un = n.unexplained || 0;
    return Math.sqrt(Math.max(0, hq) * Math.max(0, sq)) * Math.exp(-un / 2.2);
  }

  /* ── 음표가 아닌 해석을 '구조'로 확인 (쉼표는 자기 모양을 스스로 보여야 쉼표다 — 머리를 못 찾았다고 쉼표가 되지 않는다) ── */
  function gBox(g, feats, sp) {
    const b = g.map(i => feats[i].b).reduce((a, c) => Gm.merge(a, c));
    return { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, W: (b.x1 - b.x0) / sp, H: (b.y1 - b.y0) / sp, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 };
  }
  function gSegs(g, strokes, sp) {
    const out = [];
    g.forEach(i => Gm.segments(strokes[i], sp).forEach(s => { s.piece = i; out.push(s); }));
    return out;
  }
  // 4분쉼표: 세로로 길쭉(약 2~4칸) + 좌우로 여러 번 꺾임 · 긴 곧은 세로줄(기둥)이 몸통이면 아님
  function quarterRestQ(g, B, segs, strokes, sp) {
    const hS = band(B.H, 1.2, 1.8, 4.0, 5.4), wS = band(B.W, 0.2, 0.4, 2.0, 2.9);
    // 지그재그 = 큰 획(0.45칸 이상)들이 좌우로 번갈아 꺾이며 내려감 (작은 고리 · 머리의 둥근 곡선은 세지 않음)
    let rev = 0, last = 0;
    segs.forEach(s => {
      if (s.len < 0.45) return;
      const dx = (s.b.x - s.a.x) / sp;
      if (Math.abs(dx) < 0.25) return;
      const sg = Math.sign(dx);
      if (last && sg !== last) rev++;
      last = sg;
    });
    const zz = smooth(rev, 0.5, 2.5);
    // 몸통이 긴 곧은 세로줄(기둥 · 세로줄 · ♭ 줄)이면 4분쉼표가 아니다
    const longV = segs.some(s => s.ang < 20 && s.straight > 0.86 && s.len >= 0.6 * B.H && B.H >= 1.8);
    // 세로줄이 둘(♮ · ♯)이어도 아니다
    const vCount = segs.filter(s => s.ang < 22 && s.len >= 0.9 && s.straight > 0.85).length;
    const pr = PD.rank(g.map(i => strokes[i]), R.templates(), ['r:quarter']);
    const pq = pr.length ? smooth(pr[0].score, 0.5, 0.85) : 0;
    return hS * wS * (0.25 + 0.6 * zz + 0.15 * pq) * (longV ? 0.4 : 1) * (vCount >= 2 ? 0.4 : 1);
  }
  // 8 · 16 · 32 · 64분쉼표: 오른쪽 위 → 왼쪽 아래로 기운 곧은 줄 + 그 줄 위쪽 왼편에 붙은 갈고리(덩어리 · 팔) k개
  function flagRestQ(g, B, segs, sp, blobPts) {
    let main = null;
    segs.forEach(s => { if (s.len >= 1.0 && s.straight >= 0.82 && s.lean > 0 && s.ang >= 4 && s.ang <= 58 && (!main || s.len > main.len)) main = s; });
    if (!main) return { q: 0, k: 0 };
    const tilt = s => (s.ang < 7 ? 0.5 : 1);
    const xAt = y => main.bot.x + (main.top.x - main.bot.x) * ((main.bot.y - y) / Math.max(1e-6, main.bot.y - main.top.y));
    const vy = main.bot.y - main.top.y;
    const arms = [];
    let right = 0;
    segs.forEach(s => {
      if (s === main) return;
      const cx = s.pts.reduce((a, p) => a + p.x, 0) / s.pts.length, cy = s.pts.reduce((a, p) => a + p.y, 0) / s.pts.length;
      if (cy < main.top.y - 0.8 * sp || cy > main.top.y + 0.75 * vy) { if (s.len > 0.6) right += 0.2; return; }
      const lx = xAt(cy);
      if (cx < lx - 0.08 * sp) arms.push(cy);
      else if (cx > lx + 0.3 * sp) right += s.len;
    });
    arms.sort((a, b) => a - b);
    let k = 0, lastY = -1e9;
    arms.forEach(y => { if (y - lastY >= 0.45 * sp) { k++; lastY = y; } });
    k = Math.min(4, k);
    const hS = band(B.H, 0.9, 1.3, 5.0, 6.5);
    // 나란한 긴 줄이 또 있으면(♯ · ♮의 두 세로줄) 쉼표가 아니다
    const parallel = segs.some(s => s !== main && s.len >= 0.7 * main.len && Math.abs(s.ang - main.ang) < 15 && s.straight > 0.85);
    // 큰 지그재그(좌우로 2번 넘게 꺾이며 내려감)는 4분쉼표 쪽이다
    let rev = 0, last = 0;
    segs.forEach(s => { if (s.len < 0.45) return; const dx = (s.b.x - s.a.x) / sp; if (Math.abs(dx) < 0.25) return; const sg = Math.sign(dx); if (last && sg !== last) rev++; last = sg; });
    // 음표 머리 자리(줄 아래 끝, 또는 위 끝 오른편)에 둥근 덩어리가 있으면 쉼표가 아니라 음표다
    const blobs = blobPts || [];
    const noteHead = blobs.some(b => (b.y > main.bot.y - 0.7 * sp && Math.abs(b.x - main.bot.x) < 1.5 * sp) || (b.y < main.top.y + 0.7 * sp && b.x > main.top.x + 0.15 * sp));
    const q = smooth(main.len, 0.9, 1.6) * tilt(main) * (k ? 1 : 0.15) * hS * (right > 0.7 ? 0.4 : 1) * (parallel ? 0.3 : 1) * (rev >= 3 ? 0.55 : 1) * (noteHead ? 0.3 : 1);
    return { q, k: Math.max(1, k) };
  }
  // 온 · 2분쉼표: 옆으로 납작한 작은 칠한 네모
  function barRestQ(g, B, feats) {
    const flat = B.H <= 0.7 * B.W ? 1 : 0.3;
    const ink = g.reduce((a, i) => a + feats[i].len, 0);
    const fill = smooth(ink / Math.max(0.3, B.W), 1.3, 2.6);
    // 속이 빈 닫힌 고리 하나(온음표 머리)는 칠한 네모가 아니다
    const ring = g.length === 1 && feats[g[0]].closed < 0.4 && feats[g[0]].inner < 0.3 && feats[g[0]].wind > 0.7;
    return band(B.W, 0.55, 0.8, 2.3, 3.2) * band(B.H, 0.0, 0.08, 0.8, 1.15) * flat * (0.2 + 0.8 * fill) * (ring ? 0.3 : 1);
  }

  /* 묶음 하나의 최종 판정.
   * 해석 후보 = ① 음표로 읽기(구조 점수 q) ② 구조로 확인한 다른 기호들 ③ '모르겠음'(바닥 점수)
   * 점수를 확률로 바꿔(소프트맥스) 1등 확률을 확신도로 쓴다. 애매하면 amb = true → 화면에서 '?'로 묻는다. */
  const TEMP = 0.12, FLOOR = 0.3;

  /* ── 배운 모양 판정(shapeNet.js)과 뼈대 섞기 (조수 협의 11-02) ──
   * 신경망 = '무슨 종류인가'(사람 100명 글씨로 배움 · 누가 써도). 뼈대 = 음높이 · 묶기 · 구조 점수 q.
   * 점수 = log p_신경망 + λ·log q_뼈대. 규칙으로 덮어쓰지 않는다(구조를 잘못 세면 그대로 틀리니까).
   * 신경망이 배우지 않은 것(붙임줄 · 셈여림 글자 · 화음 · 임시표가 붙은 음표 · 여러 기호 묶음)은 뼈대 점수만 쓴다. */
  const NN_OTHER = 0.03;
  // λ · 온도 · '?' 문턱(1등 확률 ask 미만 또는 1·2등 차 gap 미만이면 묻기) = 조정 무리(작성자 43~50)에서 정함 · 시험 도구가 바꿔 볼 수 있게 밖에 둠
  //   (11-02 조정: 0.7/0.25 = 자신 있게 틀림 2.4% · 물어봄 37.8% → 0.6/0.1 = 4.5% · 29.6% — '자신 있게 틀림 ≤5%'를 지키며 덜 묻는 값)
  R.netCfg = { lambda: 1, T: 1, ask: 0.6, gap: 0.1, sepPrior: 1 };
  const NOTE_CLS = { whole: 'Whole-Note', half: 'Half-Note', quarter: 'Quarter-Note', eighth: 'Eighth-Note', '16th': 'Sixteenth-Note', '32nd': 'Thirty-Two-Note', '64th': 'Sixty-Four-Note' };
  const REST_CLS = { quarter: 'Quarter-Rest', eighth: 'Eighth-Rest', '16th': 'Sixteenth-Rest', '32nd': 'Thirty-Two-Rest', '64th': 'Sixty-Four-Rest', whole: 'Whole-Half-Rest', half: 'Whole-Half-Rest' };
  const ACC_CLS = { 1: 'Sharp', '-1': 'Flat', 0: 'Natural', 2: 'Double-Sharp' };
  const NOTE_LBL = { whole: '온음표', half: '2분음표', quarter: '4분음표', eighth: '8분음표', '16th': '16분음표', '32nd': '32분음표', '64th': '64분음표' };
  const REST_LBL = { quarter: '4분쉼표', eighth: '8분쉼표', '16th': '16분쉼표', '32nd': '32분쉼표', '64th': '64분쉼표', whole: '온쉼표', half: '2분쉼표' };
  function netCls(h) {
    const v = h.value;
    if (h.kind === 'notes') { const n = h.syms.filter(s => s.kind === 'note'); return n.length === 1 ? NOTE_CLS[n[0].value.type] : null; }
    if (!v) return null;
    if (h.kind === 'note') return NOTE_CLS[v.type];
    if (h.kind === 'rest') return REST_CLS[v.rest];
    if (h.kind === 'accidental') return ACC_CLS[v.acc];
    if (h.kind === 'artic' && v.art === 'staccato') return 'Dot';
    return null;
  }
  function netP(nn, h) {
    if (h.nnP !== undefined) return h.nnP;
    if (h.kind === 'unknown') return (nn.Barline || 0) + NN_OTHER;   // 여기서 넣을 수 없는 모양(마디줄 등)이면 '다시 그리기' 쪽
    const c = netCls(h);
    return c ? nn[c] || 0 : NN_OTHER;
  }
  // 이 묶음을 신경망이 볼 수 있나 → 확률 {종류: p} 또는 null
  function netFor(g, strokes, ctx, notes, H, B) {
    if (!SJ.ShapeNet || !SJ.ShapeNet.ready()) return null;
    // 음표 여럿으로 읽혔어도 폭이 기호 하나만 하면(꼬리 고리를 머리로 읽은 경우 등) 신경망이 '하나'인지 본다. 화음(머리 여럿인 음표)은 뼈대만.
    const no = why => { R._netWhy = why; return null; };
    // 빔으로 이은 음표들 = 진짜 여러 음표(배운 자료에 없음) → 뼈대만. 빔 없이 음표 여럿으로 읽힌 좁은 묶음(3.2칸 안)은 신경망이 '한 기호인가'를 본다
    if (notes.some(n => n.value.beamed)) return no('빔');
    if (notes.length > 1 && B.W > 3.2) return no('여러 음표 · 넓음');
    if (notes.some(n => n.value.heads.length > 3)) return no('화음');
    // 확실한 화음 = 머리들이 서로 다른 높이(0.4칸 이상)로 쌓이고 모두 기둥 한쪽 끝에 모임 → 배운 자료에 없는 모양이라 뼈대만.
    // (같은 높이에 '머리' 둘 = 칠한 막대 쉼표 등을 잘못 읽은 것일 수 있어 신경망이 봄)
    const sureChord = n => { const ys = n.headYs || []; if (ys.length < 2 || Math.max(...ys) - Math.min(...ys) < 0.4 * ctx.sp) return false; if (!n.stemSpan) return true; const mid = (n.stemSpan[0] + n.stemSpan[1]) / 2; return ys.every(y => y > mid) || ys.every(y => y < mid); };
    if (notes.some(sureChord)) return no('화음');
    if (H.some(h => (h.kind === 'tie' || h.kind === 'dyn') && h.q >= 0.5)) return no('붙임줄 · 셈여림');
    if (B.W > 4.5 || B.H > 9) return no('큼');
    R._netWhy = '';
    // 원래 획 그대로(이어 그려 조각낸 획은 조각이 모두 이 묶음에 있을 때만 원래 획으로)
    // 원래 획 그대로(이어 그려 조각낸 획은 조각이 모두 이 묶음에 있을 때만 원래 획으로)
    const orig = ctx._orig, inp = ctx._in;
    const listOf = ids => {
      const list = [], seen = new Set();
      ids.forEach(i => {
        if (!orig || !inp) { list.push(strokes[i]); return; }
        const o = orig[i]; if (seen.has(o)) return;
        let whole = true; orig.forEach((x, k) => { if (x === o && ids.indexOf(k) < 0) whole = false; });
        if (whole) { seen.add(o); list.push(inp[o]); } else list.push(strokes[i]);
      });
      return list;
    };
    const nn = SJ.ShapeNet.probs(listOf(g), ctx.sp);
    if (!nn) return null;
    // 음표에 딸린 점 · 임시표가 있으면: 그것을 뺀 '맨 음표' 확률(core)과 딸린 조각들이 그 기호다운 정도(sideP)도 함께 — netExpand가 두 나눔을 겨룸
    const parts = notes.length === 1 ? (notes[0].side || []) : [];
    if (parts.length) {
      const sideIds = new Set(); parts.forEach(p => p.idx.forEach(i => sideIds.add(i)));
      const core = g.filter(i => !sideIds.has(i));
      nn._core = core.length ? SJ.ShapeNet.probs(listOf(core), ctx.sp) : null;
      nn._sideP = parts.reduce((a, p) => { if (!p.cls) return a * 0.3; const q = SJ.ShapeNet.probs(p.idx.map(i => strokes[i]), ctx.sp); return a * Math.max(q ? q[p.cls] || 0 : 0, 0.05); }, 1);
    }
    return nn;
  }
  // 신경망이 본 종류를 해석 목록에 더한다: 음표는 같은 머리 · 기둥으로 길이만 바꾼 해석, 쉼표 · 임시표 · 점은 뼈대가 못 세운 것도 낮은 q로
  function netExpand(nn, H, notes, cpos, g, strokes, ctx) {
    const hn = H.find(h => h.kind === 'notes');
    if (hn && notes.length) {
      // 음표 여럿으로 읽힌 좁은 묶음: 각 음표를 '이 묶음의 유일한 음표'로 본 해석(나머지 잉크는 꼬리 등) — 뼈대 점수는 조금 깎아서
      // 화음(머리 여럿)으로 읽힌 것: 화음 해석은 그 길이의 음표다움으로 겨루고, '머리 하나만 진짜(나머지는 꼬리)' 해석도 세운다
      const one = notes.length > 1 || notes[0].value.heads.length > 1 ? 0.7 : 1;
      // 음표에 같은 묶음의 기호(임시표 · 스타카토 …)가 붙어 있으면: (가) 음표 + 기호 = 음표 부분의 음표다움 × 기호 조각의 그 기호다움
      // (나) 아래 '하나' 해석들 = 묶음 전체가 음표 하나(그 조각은 꼬리 등) — 신경망으로 두 나눔을 겨룬다
      const extras = hn.syms.filter(s => s.kind !== 'note');
      if (extras.length && notes.length === 1) {
        const xs = new Set(); extras.forEach(s => (s.strokes || []).forEach(i => xs.add(i)));
        const noteSt = g.filter(i => !xs.has(i));
        const pN = noteSt.length ? SJ.ShapeNet.probs(noteSt.map(i => strokes[i]), ctx.sp) : null;
        let p = pN ? pN[NOTE_CLS[notes[0].value.type]] || 0 : NN_OTHER;
        extras.forEach(s => {
          const c = s.kind === 'accidental' && s.value ? ACC_CLS[s.value.acc] : s.kind === 'artic' && s.value && s.value.art === 'staccato' ? 'Dot' : null;
          const px = c && s.strokes && s.strokes.length ? SJ.ShapeNet.probs(s.strokes.map(i => strokes[i]), ctx.sp) : null;
          p *= px && c ? Math.max(px[c] || 0, 0.05) : 0.3;   // 신경망이 모르는 기호(테누토 등)는 중립에 가깝게
        });
        hn.nnP = p;
      }
      // 진짜 화음 = 머리가 모두 기둥 한쪽 끝에 모임(기둥 없는 온음표 화음 포함): 화음 해석은 '음표 종류 전체 확률'로 쉼표 등과 겨루고, 머리 하나짜리 해석은 세우지 않음.
      // 기둥 양쪽 끝에 '머리'가 있으면 꼬리 고리를 머리로 읽은 것일 수 있어 '머리 하나 + 꼬리' 해석들을 세운다
      const realChord = n => n.value.heads.length > 1 && (!n.stemSpan || (() => { const mid = (n.stemSpan[0] + n.stemSpan[1]) / 2; return n.headYs.every(y => y > mid) || n.headYs.every(y => y < mid); })());
      const noteMass = Object.keys(nn).filter(c => /-Note$/.test(c)).reduce((a, c) => a + nn[c], 0);
      if (notes.length === 1 && realChord(notes[0]) && !extras.length) hn.nnP = noteMass;
      // 빔 없이 음표 여럿으로 읽힌 좁은 묶음: 따로 쓴 음표들이면 저마다 기둥이 있다(그때만 중립 0.5).
      // 기둥 없는 '머리'가 다른 음표에 바짝 붙어 있으면 꼬리 고리 · 칠한 머리 조각일 가능성이 커서 낮게 (신경망은 '두 기호'를 모르므로 1등 확률로 재지 않음)
      if (notes.length > 1) hn.nnP = notes.every(n => !n.noStem) ? 0.5 : NN_OTHER;
      const bases = [];
      hn.syms.filter(s => s.kind === 'note').forEach(n => { if (realChord(n)) return; if (n.value.heads.length > 1) n.value.heads.forEach(hd => bases.push({ n, heads: [hd] })); else bases.push({ n, heads: n.value.heads }); });
      // 딸린 점 · 임시표가 있으면 두 갈래: 'keep' = 딸린 것 그대로(맨 음표 확률 × 딸린 조각 확률) · 'absorb' = 그 획도 음표의 일부(전체 확률, 점 · 임시표 없음)
      const hasSide = !!nn._core;
      if (hasSide && !extras.length) hn.nnP = (nn._core[NOTE_CLS[notes[0].value.type]] || 0) * nn._sideP;
      // 머리만 찍기(기본 길이로 넣는 앱 입력)는 배운 자료에 없다: 그 해석은 '덩어리 하나처럼 생긴 정도'(점 · 온음표 모양)로 겨룬다 — 기둥을 놓친 음표면 신경망의 음표 해석이 이김
      if (notes.length === 1 && notes[0].noStem && notes[0].value.type !== 'whole' && !extras.length) {
        const P = hasSide ? nn._core : nn, blob = P ? (P.Dot || 0) + (P['Whole-Note'] || 0) + NN_OTHER : NN_OTHER;
        hn.nnP = blob * (hasSide ? nn._sideP : 1);
      }
      // 머리를 칠했나(4분 이하) · 비웠나(온 · 2분)는 뼈대가 머리 안 잉크 밀도로 직접 잰다 — 그 확신(기준에서 먼 정도)만큼 채움을 뒤집는 해석에 벌점
      const hollowT = t => t === 'whole' || t === 'half';
      const fillSure = n => (n.headInner === null || n.headInner === undefined ? 0 : Math.min(1, Math.abs(n.headInner - user.fillInner) / 0.25));
      bases.forEach(({ n, heads }) => {
        const ti = NOTE_TYPES.indexOf(n.value.type);
        // 채움은 뼈대가 직접 잰다(실측 작성자 1~50: 4분 97% · 2분 89%). 뼈대가 확실하면 신경망이 뒤집지 못하게(확신의 제곱만큼 0.01배까지) —
        // 반듯하게 칠한 머리처럼 배운 자료에 드문 모양에 신경망이 99%로 과신한 것을 합성 시험에서 확인(11-02)
        const flipFit = 0.01 + 0.59 * Math.pow(1 - fillSure(n), 2);
        (hasSide ? ['keep', 'absorb'] : ['absorb']).forEach(fam => {
          const same = notes.length === 1 && heads === n.value.heads && !extras.length && (fam === 'keep' || !hasSide);
          const P = fam === 'keep' ? nn._core : nn;
          if (!P) return;
          NOTE_TYPES.forEach((tp, tj) => {
            if ((tp === n.value.type && same) || (P[NOTE_CLS[tp]] || 0) < 0.02) return;
            // 뼈대가 센 꼬리 · 채움과 얼마나 다른가 (채움이 바뀌면 그 확신만큼 더 깎음 · 기둥 없는 머리는 채움 판단 대상 아님)
            const flip = !n.noStem && hollowT(tp) !== hollowT(n.value.type) && tp !== 'whole';
            const fit = (tp === n.value.type ? 1 : Math.abs(ti - tj) === 1 ? 0.6 : 0.35) * (flip ? flipFit / 0.6 : 1) * one;
            const value = fam === 'keep' || !hasSide ? Object.assign({}, n.value, { type: tp, heads })
              : Object.assign({}, n.value, { type: tp, dots: 0, staccato: false, heads: heads.map(hd => ({ pos: hd.pos, acc: null })) });
            const label = dotted(SJ.t(NOTE_LBL[tp]), value.dots) + (value.staccato ? ' · ' + SJ.t('스타카토') : '');   // (스타카토 있음/없음 후보가 같은 이름이던 것)
            const cands = [{ label, value }].concat(n.cands.filter(c => c.value.type !== tp));
            const h = { q: hn.q * fit, kind: 'notes', syms: [Object.assign({}, n, { value, cands, strokes: g.slice() })], sub: true };
            if (hasSide) h.nnP = fam === 'keep' ? (P[NOTE_CLS[tp]] || 0) * nn._sideP : P[NOTE_CLS[tp]] || 0;
            H.push(h);
          });
        });
      });
    }
    // 뼈대가 머리를 못 찾았는데 신경망은 음표라고 볼 때: 잉크가 더 많은 끝(머리는 칠하거나 동그랗게 감아 잉크가 몰림)을 머리 자리로 짐작
    if (!notes.length && g && g.length) {
      const pts = []; g.forEach(i => strokes[i].pts.forEach(p => pts.push(p)));
      let y0 = 1e9, y1 = -1e9; pts.forEach(p => { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
      const hgt = y1 - y0, sp = ctx.sp;
      if (hgt >= 1.5 * sp) {
        const end = (lo) => { const sel = pts.filter(p => (lo ? p.y >= y1 - 0.3 * hgt : p.y <= y0 + 0.3 * hgt)); return { n: sel.length, x: sel.reduce((a, p) => a + p.x, 0) / (sel.length || 1), y: sel.reduce((a, p) => a + p.y, 0) / (sel.length || 1) }; };
        const lo = end(true), hi = end(false), hd = lo.n >= hi.n ? lo : hi;
        const pos = posOf(hd.y, ctx).pos;
        ['quarter', 'half', 'eighth', '16th', '32nd', '64th'].forEach(tp => {
          if ((nn[NOTE_CLS[tp]] || 0) < 0.1) return;
          const value = { type: tp, dots: 0, heads: [{ pos, acc: null }] };
          const cands = [{ label: SJ.t(NOTE_LBL[tp]), value }];
          H.push({ q: 0.12, kind: 'notes', syms: [{ kind: 'note', x: hd.x, y: hd.y, conf: 0.6, cands, value, strokes: g.slice(), noHead: true }], sub: true });
        });
      }
    }
    const have = new Set(H.map(netCls).filter(Boolean));
    // (0.03 이상이면 넣는다 — 확률은 낮아도 '?' 후보 그림에는 나오게: 정답이 후보에 없어 지우고 다시 그려야 하는 헛수고를 줄임 · 미리보기 실제 손글씨에서 확인 11-02)
    const add = (cls, kind, value, label) => { if (!have.has(cls) && (nn[cls] || 0) >= 0.03) { H.push({ q: 0.05, kind, value, label, sub: true }); have.add(cls); } };
    ['quarter', 'eighth', '16th', '32nd', '64th'].forEach(r => add(REST_CLS[r], 'rest', { rest: r }, SJ.t(REST_LBL[r])));
    const wr = cpos >= 5 ? 'whole' : 'half';
    add('Whole-Half-Rest', 'rest', { rest: wr }, SJ.t(REST_LBL[wr]));
    [['sharp', 1], ['flat', -1], ['natural', 0], ['dsharp', 2]].forEach(([k, a]) => add(ACC_CLS[a], 'accidental', { acc: a }, SJ.t(RT.LABEL[k])));
    add('Dot', 'artic', { art: 'staccato' }, SJ.t('스타카토'));
  }

  function decide(g, parse, feats, strokes, ctx) {
    const sp = ctx.sp;
    const B = gBox(g, feats, sp);
    const segs = gSegs(g, strokes, sp);
    const posOfY = y => 8 - 2 * (y - ctx.staffTop) / sp;
    const cpos = posOfY(B.cy);
    const inStaff = cpos > -2 && cpos < 10;
    const notes = parse.filter(s => s.kind === 'note');
    const keepOthers = parse.filter(s => s.kind === 'erase');
    const H = [];   // {q, kind, value, label, syms?}
    if (notes.length) {
      const extra = parse.filter(s => s.kind !== 'note' && s.kind !== 'erase' && !(s.kind === 'dyn' && inStaff));
      const q = Math.min(...notes.map(n => n.q)) * Math.pow(0.8, extra.filter(s => s.kind === 'unknown' || s.kind === 'dyn' || s.kind === 'rest').length);
      H.push({ q, kind: 'notes', syms: notes.concat(extra.filter(s => s.kind !== 'rest' && s.kind !== 'unknown')) });
    }
    // 쉼표들
    const qr = quarterRestQ(g, B, segs, strokes, sp);
    if (qr > 0.05) H.push({ q: qr, kind: 'rest', value: { rest: 'quarter' }, label: SJ.t('4분쉼표') });
    // 둥근 덩어리(머리 · 쉼표 갈고리 머리 후보): 작고 곧지 않은 획
    const blobPts = g.filter(i => headQ(feats[i]) >= 0.45 && feats[i].straight < 0.8 && Math.max(feats[i].w, feats[i].h) <= 1.6).map(i => ({ x: feats[i].b.cx, y: feats[i].b.cy }));
    const fr = flagRestQ(g, B, segs, sp, blobPts);
    if (fr.q > 0.05) {
      const RT2 = ['eighth', '16th', '32nd', '64th'], LB = ['8분쉼표', '16분쉼표', '32분쉼표', '64분쉼표'];
      H.push({ q: fr.q, kind: 'rest', value: { rest: RT2[fr.k - 1] }, label: SJ.t(LB[fr.k - 1]) });
      if (fr.k < 4) H.push({ q: fr.q * 0.7, kind: 'rest', value: { rest: RT2[fr.k] }, label: SJ.t(LB[fr.k]), sub: true });
      if (fr.k > 1) H.push({ q: fr.q * 0.7, kind: 'rest', value: { rest: RT2[fr.k - 2] }, label: SJ.t(LB[fr.k - 2]), sub: true });
    }
    const br = barRestQ(g, B, feats);
    if (br > 0.05) {
      const whole = cpos >= 5;
      H.push({ q: br, kind: 'rest', value: { rest: whole ? 'whole' : 'half' }, label: SJ.t(whole ? '온쉼표' : '2분쉼표') });
      H.push({ q: br * 0.8, kind: 'rest', value: { rest: whole ? 'half' : 'whole' }, label: SJ.t(whole ? '2분쉼표' : '온쉼표'), sub: true });
    }
    // 임시표 (홀로 그린 것)
    if (B.H >= 0.4 && B.H <= 5) {
      const ra = rankAcc(g, feats, strokes, sp);
      const vs = segs.filter(s => s.ang < 25 && s.len >= 0.9);
      const hasV = vs.length > 0;
      // ♭ = 세로줄 '아래쪽 오른편'에 고리. (위 기둥 음표는 머리가 아래 왼편, 아래 기둥 음표는 위 오른편)
      let flatGate = 0.3;
      if (hasV) {
        const V = vs.reduce((a, s) => (s.len > a.len ? s : a));
        const rest = segs.filter(s => s !== V).reduce((a, s) => a.concat(s.pts), []);
        if (rest.length) {
          const cx = rest.reduce((a, p) => a + p.x, 0) / rest.length, cy = rest.reduce((a, p) => a + p.y, 0) / rest.length;
          const vx = (V.top.x + V.bot.x) / 2, mid = (V.top.y + V.bot.y) / 2;
          flatGate = (cx > vx + 0.05 * sp ? 1 : 0.25) * (cy > mid ? 1 : 0.3);
        }
      }
      const twoV = vs.length >= 2 ? 1 : 0.4;
      // 𝄪 = 서로 반대로 기운 짧은 사선 둘(X). 고리 · 점은 아님
      const diagP = segs.filter(s => s.ang >= 22 && s.ang <= 68 && s.straight > 0.78 && s.len >= 0.35);
      const xGate = diagP.some(s => s.lean > 0) && diagP.some(s => s.lean < 0) ? 1 : 0.25;
      ra.slice(0, 3).forEach((r, k) => {
        const shape = r.label === 'flat' ? flatGate : r.label === 'sharp' || r.label === 'natural' ? twoV : r.label === 'dsharp' ? xGate : 1;
        const gate = shape * (r.label === 'dsharp' ? band(B.H, 0.3, 0.5, 1.8, 2.6) * band(B.W, 0.3, 0.5, 1.8, 2.6) : band(B.H, 1.0, 1.5, 4.0, 5.0) * (hasV ? 1 : 0.3));
        const q = smooth(r.score, 0.2, 0.75) * gate * (k ? 0.9 : 1);
        if (q > 0.05) H.push({ q, kind: 'accidental', value: { acc: ACC_ALTER[r.label] }, label: SJ.t(RT.LABEL[r.label]), sub: k > 0 });
      });
    }
    // 점 (스타카토 · 점음표의 점)
    const big = Math.max(B.W, B.H);
    if (g.length <= 2 && big < 0.75) H.push({ q: 1 - smooth(big, 0.3, 0.7), kind: 'artic', value: { art: 'staccato' }, label: SJ.t('스타카토') });
    // 붙임줄: 옆으로 길고 낮은 호 하나
    if (g.length === 1 && B.W >= 1.5 && B.H <= Math.min(1.5, 0.5 * B.W) && feats[g[0]].straight < 0.97 && feats[g[0]].straight > 0.5) H.push({ q: 0.75 * band(B.W, 1.4, 2.0, 9, 14), kind: 'tie', value: { tie: true }, label: SJ.t('붙임줄') });
    // 셈여림 글자: 오선 밖(위 · 아래)에서만
    if (!inStaff) {
      const pr = PD.rank(g.map(i => strokes[i]), R.templates(), ['dyn:p', 'dyn:f', 'dyn:m', 'dyn:z', 'dyn:s']);
      pr.slice(0, 2).forEach((r, k) => { const q = smooth(r.score, 0.4, 0.85) * (k ? 0.9 : 1); if (q > 0.05) H.push({ q, kind: 'dyn', value: { dynLetter: r.label.slice(4) }, label: r.label.slice(4), sub: k > 0 }); });
    }
    // 머리 없이 곧은 세로줄만: 쉼표가 아니라 '머리를 아직 안 그린 음표'일 가능성 — 보기로만 낮게 둔다(그대로 박지 않음)
    if (!notes.length) {
      const v = segs.filter(s => s.ang < 22 && s.len >= 1.8 && s.straight > 0.85).sort((a, b) => b.len - a.len)[0];
      if (v) {
        const tp = ctx.defaultDur && ctx.defaultDur.type !== 'whole' ? ctx.defaultDur.type : 'quarter';
        const pos = Math.max(-8, Math.min(16, Math.round(posOfY(v.bot.y))));
        H.push({ q: 0.2, kind: 'note', value: { type: tp, dots: 0, heads: [{ pos, acc: null }] }, label: SJ.t('{x} (머리 자리 짐작)', { x: SJ.t({ half: '2분음표', quarter: '4분음표', eighth: '8분음표', '16th': '16분음표', '32nd': '32분음표', '64th': '64분음표' }[tp]) }), sub: true, x: v.bot.x - 0.6 * sp, noHead: true });
      }
    }
    H.push({ q: FLOOR, kind: 'unknown', value: null, label: SJ.t('다시 그리기') });
    const nn = netFor(g, strokes, ctx, notes, H, B);
    if (nn) netExpand(nn, H, notes, cpos, g, strokes, ctx);
    R._lastDecide = H.map(h => h.kind + ':' + (h.label || (h.syms && h.syms[0] && h.syms[0].cands[0].label) || '') + ' q' + h.q.toFixed(2) + (nn ? ' n' + netP(nn, h).toFixed(2) : '')).join(' | ');
    // 확률: 신경망이 볼 수 있는 묶음이면 log p_신경망 + λ·log q_뼈대, 아니면 뼈대 점수만
    const sc = H.map(h => (nn ? (Math.log(netP(nn, h) + 1e-3) + R.netCfg.lambda * Math.log(h.q + 1e-3)) / R.netCfg.T : h.q / TEMP));
    const mx = Math.max(...sc);
    const ex = sc.map(s => Math.exp(s - mx));
    const sum = ex.reduce((a, b) => a + b, 0);
    H.forEach((h, i) => { h.p = ex[i] / sum; });
    // 같은 답(화면에 같은 것이 들어가는 해석 — 같은 길이 · 점 · 높이 · 임시표, 같은 쉼표 …)은 확률을 합친다: 갈라져 있으면 1 · 2등 차가 작아 괜히 묻게 됨 (조수 검토 11-02)
    const keyOf = h => {
      if (h.kind === 'unknown') return null;
      // (스타카토 · 붙임줄도 키에 — 다르면 다른 답 · 'note'(머리 짐작)와 'notes'는 값이 같으면 같은 답 · 점검원 ② 11-02)
      const nk = v => 'n:' + JSON.stringify([v.type, v.dots, v.heads.map(x => [x.pos, x.acc]), !!v.staccato, !!v.tie]);
      if (h.kind === 'notes') { if (h.syms.length !== 1 || h.syms[0].kind !== 'note') return null; return nk(h.syms[0].value); }
      if (h.kind === 'note' && h.value && h.value.heads) return nk(h.value);
      return h.kind + ':' + JSON.stringify(h.value);
    };
    const firstOf = {};
    H.slice().sort((a, b) => b.p - a.p).forEach(h => { const k = keyOf(h); if (!k) return; if (firstOf[k]) { firstOf[k].p += h.p; h.dup = true; } else firstOf[k] = h; });
    for (let i = H.length - 1; i >= 0; i--) if (H[i].dup) H.splice(i, 1);
    H.sort((a, b) => b.p - a.p);
    const top = H[0], second = H.find(h => h !== top && h.kind !== 'unknown');
    const noteCands = () => (notes.length === 1 ? notes[0].cands.slice(0, 3) : []);
    // 다른 해석들(확률 순): 음표 하나짜리 다른 해석(길이를 바꾼 것 등)도 후보 그림에 넣는다
    const otherCands = except => H.filter(h => h !== except && h.kind !== 'unknown' && (h.kind !== 'notes' || (h.syms.length === 1 && h.syms[0].kind === 'note')))
      .map(h => (h.kind === 'notes' ? { label: h.syms[0].cands[0].label, value: h.syms[0].value } : { label: h.label, value: h.value }));
    if (top.kind === 'notes') {
      const out = top.syms.map(s => Object.assign({}, s));
      out.filter(s => s.kind === 'note').forEach(s => {
        s.conf = Math.min(s.conf, top.p);
        if (out.length === 1 || notes.length === 1) {
          // 음표 안 대안(꼬리 ± · 점 ±) 2개 뒤에 다른 종류 해석(쉼표 · 임시표 …)을 끼워 둔다
          const alt = otherCands(top).slice(0, 2);
          s.cands = s.cands.slice(0, 2).concat(alt).concat(s.cands.slice(2)).filter((c, i, a) => a.findIndex(d => sameVal(d.value, c.value)) === i).slice(0, 5);
        }
        s.amb = s.noHead || s.conf < R.netCfg.ask || (second && top.p - second.p < R.netCfg.gap);
      });
      // 음표로 설명하고도 남은 획(쉼표 · 모름으로 읽힌 조각)은 버리지 않고 '?'로 묻는다 — 모든 획은 설명되거나 물어야 한다
      // (신경망이 이 묶음 전체를 한 기호로 보고 고른 것이면 남은 조각도 그 기호의 일부 — 따로 묻지 않는다)
      const left = nn ? [] : parse.filter(s => (s.kind === 'rest' || s.kind === 'unknown' || (s.kind === 'dyn' && inStaff)) && s.cands && s.cands.length)
        .map(s => Object.assign({}, s, { amb: true, unsure: true, conf: Math.min(s.conf || 0.3, 0.45) }));
      return out.concat(left).concat(keepOthers);
    }
    if (top.kind === 'unknown') {
      // 무엇인지 모르겠음: 가장 그럴듯한 것들을 보기로 (확정하지 않고 묻는다)
      const cands = [];
      if (notes.length === 1) noteCands().forEach(c => cands.push(c));
      otherCands(top).forEach(c => cands.push(c));
      const uniq = cands.filter((c, i, a) => a.findIndex(d => sameVal(d.value, c.value)) === i).slice(0, 4);
      if (!uniq.length) return keepOthers;
      const first = uniq[0];
      const kind = first.value.rest !== undefined ? 'rest' : first.value.type ? 'note' : first.value.acc !== undefined ? 'accidental' : first.value.tie ? 'tie' : first.value.art ? 'artic' : first.value.dynLetter ? 'dyn' : 'unknown';
      const base = kind === 'note' && notes.length ? Object.assign({}, notes[0]) : { x: kind === 'note' ? B.x0 + 0.6 * sp : B.x0, x1: B.x1, y: B.cy, y0: B.y0, y1: B.y1, strokes: g.slice() };
      return [Object.assign(base, { kind, value: first.value, cands: uniq, conf: Math.min(0.45, top.p), amb: true, unsure: true })].concat(keepOthers);
    }
    const cands = [{ label: top.label, value: top.value }].concat(otherCands(top)).concat(noteCands())
      .filter((c, i, a) => a.findIndex(d => sameVal(d.value, c.value)) === i).slice(0, 5);
    const sym = { kind: top.kind, x: top.x !== undefined ? top.x : B.x0, x1: B.x1, y: B.cy, y0: B.y0, y1: B.y1, conf: top.p, value: top.value, cands, strokes: g.slice() };
    // 머리 자리를 짐작한 음표는 확률이 높아도 늘 묻는다(음높이가 짐작이라)
    sym.amb = !!top.noHead || top.p < R.netCfg.ask || (second && top.p - second.p < R.netCfg.gap);
    if (top.noHead) sym.noHead = true;
    return [sym].concat(keepOthers);
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
