/* 모양 판정 신경망 (11-02 · 누가 써도 알아듣기): 사람 100명 손글씨(HOMUS)로 미리 배운 작은 신경망.
 * 쓰는 사람에게 표본을 받지 않는다 — 배운 가중치만 앱에 들어 있다(shapeNetWeights.js · 만드는 법 tests/node/mlp_eval.js --save).
 * 특징 = 획 방향 4가지 × 12×12 칸 + 끝점 칸(획 순서 · 그린 방향 · 점 간격과 무관) + 가로세로 비 · 칸 크기 대비 크기 · 획 수 · 가로지르는 수 · 잉크 양.
 * 여기는 '무슨 종류인가'만 본다. 음높이 · 묶기 · 박 문맥은 recognizer.js(뼈대)가 맡는다. */
(function (SJ) {
  'use strict';
  const G = 12;
  const N = {};

  N.feat = function (strokes, sp) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    strokes.forEach(s => s.pts.forEach(p => { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }));
    const w = Math.max(x1 - x0, 1e-6), h = Math.max(y1 - y0, 1e-6), S = Math.max(w, h), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const f = new Float32Array(5 * G * G);
    const put = (ch, u, v, val) => {   // u,v ∈ [0,1] → 이웃 네 칸에 나눠 넣기
      const gx = Math.min(G - 1.001, Math.max(0, u * G - 0.5)), gy = Math.min(G - 1.001, Math.max(0, v * G - 0.5));
      const i = Math.floor(gx), j = Math.floor(gy), a = gx - i, b = gy - j, o = ch * G * G;
      f[o + j * G + i] += val * (1 - a) * (1 - b); f[o + j * G + i + 1] += val * a * (1 - b);
      f[o + (j + 1) * G + i] += val * (1 - a) * b; f[o + (j + 1) * G + i + 1] += val * a * b;
    };
    const nz = q => ({ u: (q.x - cx) / S + 0.5, v: (q.y - cy) / S + 0.5 });
    strokes.forEach(s => {
      const P = s.pts.map(nz);
      put(4, P[0].u, P[0].v, 1); put(4, P[P.length - 1].u, P[P.length - 1].v, 1);
      for (let i = 1; i < P.length; i++) {
        const du = P[i].u - P[i - 1].u, dv = P[i].v - P[i - 1].v, L = Math.hypot(du, dv);
        if (L < 1e-9) continue;
        let ang = Math.atan2(dv, du); if (ang < 0) ang += Math.PI; if (ang >= Math.PI) ang -= Math.PI;
        const bin = ang / (Math.PI / 4), b0 = Math.floor(bin) % 4, b1 = (b0 + 1) % 4, t = bin - Math.floor(bin);
        const steps = Math.max(1, Math.ceil(L / 0.03));
        for (let k = 0; k < steps; k++) {
          const u = P[i - 1].u + du * (k + 0.5) / steps, v = P[i - 1].v + dv * (k + 0.5) / steps;
          put(b0, u, v, (L / steps) * (1 - t)); put(b1, u, v, (L / steps) * t);
        }
      }
    });
    const g = new Float32Array(f.length);
    for (let ch = 0; ch < 5; ch++) for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      let sum = 0, wt = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= G || jj >= G) continue;
        const ww = (di || dj) ? 0.5 : 1; sum += f[ch * G * G + jj * G + ii] * ww; wt += ww;
      }
      g[ch * G * G + j * G + i] = sum / wt;
    }
    let n2 = 0; for (let i = 0; i < g.length; i++) { g[i] = Math.sqrt(g[i]); n2 += g[i] * g[i]; }
    n2 = Math.sqrt(n2) || 1; for (let i = 0; i < g.length; i++) g[i] /= n2;
    // 획 수는 8까지 센다(꼬리를 한 획씩 긋는 사람: 32분 = 5획 · 64분 = 6획 — 4에서 자르면 둘이 같아 보였음 · 11-02 눈으로 확인)
    // (가로세로 비는 ±4.5에서 자름 — 완전히 곧은 획이면 폭이 0에 가까워 값이 튐 · 배운 자료 15,200개 중 넘는 것 3개뿐이라 다시 배울 필요 없음 · 점검원 ② 11-02)
    const glob = [Math.max(-4.5, Math.min(4.5, Math.log(h / w))) * 0.25, Math.log(S / sp) * 0.35, Math.min(strokes.length, 8) * 0.06];
    // 따로 그은 짧은 가로 획 수(꼬리 · 쉼표 팔 후보)
    glob.push(Math.min(strokes.filter(s => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; s.pts.forEach(p => { a = Math.min(a, p.x); b = Math.max(b, p.x); c = Math.min(c, p.y); d = Math.max(d, p.y); }); return b - a >= 1.2 * (d - c) && b - a <= 0.8 * S && b - a >= 0.12 * S; }).length, 6) * 0.08);
    // 가로지르는 수(꼬리 · 줄 개수) + 잉크 양(머리를 칠했나)
    const sg = []; let ink = 0;
    strokes.forEach(s => { for (let i = 1; i < s.pts.length; i++) { const a = s.pts[i - 1], b = s.pts[i]; sg.push([(a.x - x0) / w, (a.y - y0) / h, (b.x - x0) / w, (b.y - y0) / h]); ink += Math.hypot(b.x - a.x, b.y - a.y); } });
    [0.15, 0.35, 0.5, 0.65, 0.85].forEach(t => {
      let cv = 0, chz = 0;
      sg.forEach(q => { if ((q[0] - t) * (q[2] - t) < 0) cv++; if ((q[1] - t) * (q[3] - t) < 0) chz++; });
      glob.push(Math.min(cv, 8) * 0.06, Math.min(chz, 8) * 0.06);
    });
    // 촘촘한 9줄로 훑어 가장 많이 가로지르는 수(꼬리 · 빔 개수)
    let mv = 0, mh = 0;
    for (let k = 1; k <= 9; k++) { const t = k / 10; let cv = 0, chz = 0; sg.forEach(q => { if ((q[0] - t) * (q[2] - t) < 0) cv++; if ((q[1] - t) * (q[3] - t) < 0) chz++; }); mv = Math.max(mv, cv); mh = Math.max(mh, chz); }
    glob.push(Math.min(mv, 10) * 0.05, Math.min(mh, 10) * 0.05);
    // (시험 후 뺌 11-02: '꺾인 곳에서 자른 비스듬한 짧은 선분 수'는 칠한 머리의 낙서까지 세어 16 · 32 · 64분 분포가 같았음 — +0.2점 = 잡음)
    glob.push(Math.log(Math.max(ink, 1e-6) / S) * 0.2);
    const x = new Float32Array(g.length + glob.length); x.set(g); x.set(glob, g.length);
    return x;
  };

  // 가중치 풀기 (int8 + 한 덩어리마다 배율 · base64)
  let net = null;
  function unpack(b64, scale) {
    const bin = atob(b64), a = new Float32Array(bin.length);
    for (let i = 0; i < bin.length; i++) { const c = bin.charCodeAt(i); a[i] = (c > 127 ? c - 256 : c) * scale; }
    return a;
  }
  // 판정기 하나 또는 여럿(W.nets — 다르게 시작해 배운 판정기들의 확률 평균 = 한 판정기의 우연한 버릇을 줄임)
  const one = W => ({ classes: W.classes, D: W.D, HID: W.HID, T: W.T, W1: unpack(W.W1, W.s[0]), b1: unpack(W.b1, W.s[1]), W2: unpack(W.W2, W.s[2]), b2: unpack(W.b2, W.s[3]) });
  N.load = function (W) {
    if (!W) return null;
    const list = (W.nets || [W]).map(one);
    net = { classes: list[0].classes, D: list[0].D, list };
    return net;
  };
  N.ready = () => { if (!net && SJ.ShapeNetWeights) N.load(SJ.ShapeNetWeights); return !!net; };
  N.classes = () => (net ? net.classes : []);

  // 종류마다 확률 {이름: p} (온도 보정 포함)
  N.probs = function (strokes, sp) {
    if (!N.ready() || !strokes.length) return null;
    const x = N.feat(strokes, sp);
    if (x.length !== net.D) return null;
    const classes = net.classes, C = classes.length, avg = new Float64Array(C);
    net.list.forEach(nt => {
      const { D, HID, W1, b1, W2, b2 } = nt;
      const hdn = new Float32Array(HID);
      for (let j = 0; j < HID; j++) { let s = b1[j]; const o = j * D; for (let i = 0; i < D; i++) s += W1[o + i] * x[i]; hdn[j] = s > 0 ? s : 0; }
      const z = new Float32Array(C);
      for (let k = 0; k < C; k++) { let s = b2[k]; const o = k * HID; for (let j = 0; j < HID; j++) s += W2[o + j] * hdn[j]; z[k] = s / nt.T; }
      const m = Math.max(...z); let sum = 0; const e = Array.from(z, v => { const t = Math.exp(v - m); sum += t; return t; });
      e.forEach((v, k) => { avg[k] += v / sum / net.list.length; });
    });
    // (개인 맞춤 — '?'에서 고른 글씨와 가까우면 그 종류를 올리기 — 은 시험 후 넣지 않음 11-02: 작성자 31~50에서 종류마다 3~6개 골라도 +1점 안팎 = 잡음. tests/node/pers_eval.js 기록)
    const out = {}; classes.forEach((c, k) => { out[c] = avg[k]; });
    return out;
  };

  SJ.ShapeNet = N;
})(window.SJ = window.SJ || {});
