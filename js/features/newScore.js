/* 새 악보 만들기 (§7-2) — 2탭 안에 만들 수 있게: [+ 새 악보] → [만들기]. 나머지는 기본값이 이미 골라져 있다. */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, S = SJ.Score;
  const NS = {};
  const TIMES = [   // 앞 4개 = 자주 쓰는 것 (나머지는 [더보기])
    { label: '4/4', v: { num: 4, den: 4 } }, { label: '3/4', v: { num: 3, den: 4 } }, { label: '2/4', v: { num: 2, den: 4 } }, { label: '6/8', v: { num: 6, den: 8 } },
    { label: '¢ (2/2)', v: { num: 2, den: 2, symbol: 'cut' } }, { label: 'C (4/4)', v: { num: 4, den: 4, symbol: 'common' } }, { label: '2/2', v: { num: 2, den: 2 } },
    { label: '3/8', v: { num: 3, den: 8 } }, { label: '9/8', v: { num: 9, den: 8 } }, { label: '12/8', v: { num: 12, den: 8 } }, { label: '5/4', v: { num: 5, den: 4 } }, { label: '7/8', v: { num: 7, den: 8 } }
  ];
  NS.TIMES = TIMES;
  const KEY_ORDER = [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7];   // 쉬운 조부터 (앞 7개만 보이고 [더보기])
  const tkey = v => v.num + '/' + v.den + (v.symbol || '');

  function defaults() {
    const d = SJ.Settings.get('newDefaults') || {};
    return Object.assign({ tpl: 'preset:single', time: { num: 4, den: 4 }, key: { fifths: 0, mode: 'major' }, measuresMode: 'page', measures: 32,
      paper: SJ.Settings.get('defaultPaper') || 'A4', orientation: SJ.Settings.get('defaultOrientation') || 'portrait',
      align: SJ.Settings.get('alignDefault') !== false, alignN: SJ.Settings.get('alignN') || 4, tempoText: '', bpm: '' }, d, SJ.Settings.get('defaultTemplate') ? { tpl: SJ.Settings.get('defaultTemplate') } : {});
  }

  // 보표 구성 작은 미리보기 (첫 줄만)
  const previewCache = {};
  function presetPreview(key, makeScore) {
    if (previewCache[key]) return previewCache[key];
    try {
      const sc = makeScore();
      sc.measures = sc.measures.slice(0, 2);
      sc.measures[1].attrs.barlineEnd = 'final';
      sc.layout = Object.assign({}, sc.layout, { alignGrid: { enabled: false } });
      const L = SJ.Layout.layout(sc, { pageW: 70, pageH: 400, margins: { top: 4, bottom: 2, left: 3, right: 3 }, staffSize: 4, titleBlock: false, pageNumbers: false, noJustify: true });
      const p = L.pages[0];
      const sys = L.systems[0];
      const sp = L.spMm;
      const y0 = Math.max(0, sys.y + (sys.top - 1) * sp), y1 = sys.y + (sys.bottom + 1) * sp;
      const svg = SJ.SvgRender.page({ w: p.w, h: y1 - y0, items: p.items.map(it => shiftY(it, -y0)) });
      previewCache[key] = svg;
      return svg;
    } catch (e) { return ''; }
  }
  function shiftY(it, dy) {
    const c = Object.assign({}, it);
    if ('y' in c) c.y += dy;
    if ('y1' in c) { c.y1 += dy; c.y2 += dy; }
    if (c.pts) c.pts = c.pts.map(p => [p[0], p[1] + dy]);
    if (c.d && Array.isArray(c.d)) c.d = c.d.map(s => s.map((v, i) => (i > 0 && i % 2 === 0) ? v + dy : v));
    return c;
  }

  NS.open = async function () {
    const d = defaults();
    const st = U.clone(d);
    const userTpls = await SJ.Templates.list();
    const title = h('input', { class: 'field', placeholder: t('제목 (나중에 써도 돼요)'), style: { width: '100%' } });
    const composer = h('input', { class: 'field', placeholder: t('작곡 (선택)'), style: { width: '100%' } });

    // 구성 고르기 (가로로 넘겨 보기)
    const strip = h('div', { class: 'row', style: { overflowX: 'auto', gap: '10px', padding: '2px 2px 8px', scrollSnapType: 'x mandatory' } });
    const drawStrip = () => {
      strip.innerHTML = '';
      const add = (key, label, desc, svg, onLong) => {
        const isDef = SJ.Settings.get('defaultTemplate') === key || (!SJ.Settings.get('defaultTemplate') && key === 'preset:single');
        const el = h('button', { class: 'card' + (st.tpl === key ? ' on' : ''), style: { flex: 'none', width: '168px', textAlign: 'left', border: st.tpl === key ? '2px solid var(--accent)' : '2px solid transparent', scrollSnapAlign: 'start', padding: 0 },
          onclick: () => { st.tpl = key; drawStrip(); applyTplDefaults(); } }, [
          h('div', { class: 'thumb', style: { aspectRatio: 'auto', minHeight: '64px', padding: '4px', alignItems: 'center' }, html: svg }),
          h('div', { class: 'info' }, [h('div', { class: 't', style: { fontSize: '13px', whiteSpace: 'normal' }, text: label + (isDef ? ' ★' : '') }), desc ? h('div', { class: 'm', text: desc }) : null])
        ]);
        if (onLong) UI.longPress(el, onLong);
        strip.appendChild(el);
      };
      S.PRESET_ORDER.forEach(k => {
        const p = S.PRESETS[k];
        add('preset:' + k, SJ.getLang() === 'en' ? p.labelEn : t(p.label), t(p.desc || ''), presetPreview(k, () => S.create({ preset: k, measures: 2 })), () => tplMenu('preset:' + k, null));
      });
      userTpls.forEach(tp => add('user:' + tp.id, tp.name, t('내 템플릿') + (tp.withNotes ? ' · ' + t('음표 포함') : ''), presetPreview('u' + tp.id, () => SJ.Templates.toScore(tp, { measures: 2 })), () => tplMenu('user:' + tp.id, tp)));
    };
    function tplMenu(key, tp) {
      UI.menu(tp ? tp.name : t('보표 구성'), [
        { icon: 'star', label: t('새 악보 기본으로 정하기'), onClick: () => { SJ.Settings.set('defaultTemplate', key); drawStrip(); UI.toast(t('새 악보 기본값으로 정했어요')); } },
        tp ? { icon: 'text', label: t('이름 바꾸기'), onClick: async () => { await SJ.Templates.rename(tp); drawStrip(); } } : null,
        tp ? { icon: 'trash', label: t('템플릿 지우기'), danger: true, onClick: async () => { if (await SJ.Templates.remove(tp)) { userTpls.splice(userTpls.indexOf(tp), 1); if (st.tpl === key) st.tpl = 'preset:single'; drawStrip(); } } } : null
      ]);
    }
    function applyTplDefaults() {
      if (st.tpl.startsWith('user:')) {
        const tp = userTpls.find(x => 'user:' + x.id === st.tpl);
        if (tp) { st.time = U.clone(tp.time); st.key = U.clone(tp.key); timeChips.set(tkey(st.time)); keyChips.set(st.key.fifths); modeSeg.set(st.key.mode); }
      }
    }
    drawStrip();

    const timeChips = UI.chips(TIMES.map(x => ({ label: x.label, value: tkey(x.v) })), tkey(st.time), v => { st.time = U.clone(TIMES.find(x => tkey(x.v) === v).v); }, { more: 4 });
    const makeKeys = () => UI.chips(KEY_ORDER.map(f => ({ label: SJ.Pitch.keyName({ fifths: f, mode: st.key.mode }, SJ.getLang()) + (f ? ' (' + (f > 0 ? '♯' : '♭') + Math.abs(f) + ')' : ''), value: f })),
      st.key.fifths, v => { st.key.fifths = v; }, { more: 7 });
    let keyChips = makeKeys();
    const keyBox = h('div', {}, [keyChips]);
    const modeSeg = UI.seg([{ label: t('장조'), value: 'major' }, { label: t('단조'), value: 'minor' }], st.key.mode, v => {
      st.key.mode = v;
      keyChips = makeKeys(); keyBox.innerHTML = ''; keyBox.appendChild(keyChips);
    });
    const tempoText = h('input', { class: 'field', placeholder: t('빠르기 글 (예: Moderato)'), value: st.tempoText, style: { flex: 1 } });
    const bpm = h('input', { class: 'field', type: 'number', inputmode: 'numeric', min: 20, max: 400, placeholder: '♩ = ', value: st.bpm, style: { width: '96px' } });

    const mCount = UI.stepper(st.measures, 1, 400, v => { st.measures = v; }, v => t('{n}마디', { n: v }));
    mCount.style.display = st.measuresMode === 'page' ? 'none' : '';
    const mSeg = UI.seg([{ label: t('한 쪽 가득'), value: 'page' }, { label: t('직접 정하기'), value: 'count' }], st.measuresMode, v => { st.measuresMode = v; mCount.style.display = v === 'page' ? 'none' : ''; });
    const paperSeg = UI.seg([{ label: 'A4', value: 'A4' }, { label: 'Letter', value: 'Letter' }], st.paper, v => { st.paper = v; });
    const oriSeg = UI.seg([{ label: t('세로'), value: 'portrait' }, { label: t('가로'), value: 'landscape' }], st.orientation, v => { st.orientation = v; });
    const nStep = UI.stepper(st.alignN, 1, 8, v => { st.alignN = v; }, v => t('줄당 {n}마디', { n: v }));
    const alignSw = UI.switch(st.align, v => { st.align = v; nStep.style.opacity = v ? 1 : 0.4; });

    const body = [
      UI.field(t('제목'), title),
      UI.field(t('작곡'), composer),
      h('label', { class: 'lab', text: t('보표 구성 (옆으로 넘겨 보기 · 길게 누르면 기본으로 정하기)') }), strip,
      UI.field(t('박자'), timeChips),
      h('label', { class: 'lab', text: t('조표') }), modeSeg, h('div', { style: { height: '8px' } }), keyBox,
      // 자주 안 바꾸는 것은 접어 둔다 (기본값이 이미 좋음 · 나중에 언제든 바꿀 수 있음)
      h('details', { class: 'more-opts' }, [
        h('summary', { text: t('자세히 · 빠르기 · 마디 수 · 정렬 · 용지') }),
        h('label', { class: 'lab', text: t('빠르기 (선택)') }), h('div', { class: 'row' }, [tempoText, bpm]),
        h('label', { class: 'lab', text: t('마디 수') }), mSeg, h('div', { style: { height: '8px' } }), mCount,
        h('label', { class: 'lab', text: t('세로줄 정렬') }), h('div', { class: 'row' }, [h('div', { class: 'grow small muted', text: t('줄마다 세로줄을 같은 자리에 · 마디 폭 같게') }), alignSw]), h('div', { style: { height: '8px' } }), nStep,
        h('label', { class: 'lab', text: t('용지') }), h('div', { class: 'row' }, [paperSeg, oriSeg]),
        h('button', { class: 'btn ghost block small', style: { marginTop: '14px' }, text: t('이 설정을 새 악보 기본값으로 저장'), onclick: () => { saveDefaults(); UI.toast(t('새 악보 기본값으로 저장했어요')); } })
      ])
    ];
    const createBtn = h('button', { class: 'btn primary', html: SJ.icon('check') + U.esc(t('만들기')) });
    const sheet = UI.sheet({ title: t('새 악보'), body, foot: [createBtn] });
    function saveDefaults() {
      SJ.Settings.set('newDefaults', { tpl: st.tpl, time: st.time, key: st.key, measuresMode: st.measuresMode, measures: st.measures, paper: st.paper, orientation: st.orientation,
        align: st.align, alignN: st.alignN, tempoText: tempoText.value, bpm: bpm.value });
      SJ.Settings.set('defaultTemplate', st.tpl);
    }
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      try {
        const tempo = (tempoText.value.trim() || Number(bpm.value)) ? { text: U.nfc(tempoText.value.trim()), bpm: Number(bpm.value) || undefined } : null;
        const n = st.measuresMode === 'page' ? 80 : st.measures;
        let score;
        if (st.tpl.startsWith('user:')) {
          const tp = userTpls.find(x => 'user:' + x.id === st.tpl);
          score = SJ.Templates.toScore(tp, { title: U.nfc(title.value.trim()), composer: U.nfc(composer.value.trim()), time: st.time, key: st.key, tempo, measures: tp.withNotes ? undefined : n, paper: st.paper, orientation: st.orientation });
        } else {
          score = S.create({ title: U.nfc(title.value.trim()), composer: U.nfc(composer.value.trim()), preset: st.tpl.slice(7), time: st.time, key: st.key, tempo, measures: n, paper: st.paper, orientation: st.orientation });
        }
        score.layout = Object.assign({}, score.layout, { alignGrid: { enabled: st.align, measuresPerSystem: st.alignN, widthMode: (score.layout.alignGrid && score.layout.alignGrid.widthMode) || SJ.Settings.get('alignWidth') || 'equal' } });
        if (st.measuresMode === 'page' && !(st.tpl.startsWith('user:') && userTpls.find(x => 'user:' + x.id === st.tpl).withNotes)) score = SJ.Layout.fitFirstPage(score);
        await SJ.Storage.saveScore(score, { snapshot: true });
        sheet.close();
        SJ.App.openEditor(score.id);
      } catch (e) {
        createBtn.disabled = false;
        UI.alert(t('만들지 못했어요'), String(e && e.message || e));
      }
    });
  };

  SJ.NewScore = NS;
})(window.SJ = window.SJ || {});
