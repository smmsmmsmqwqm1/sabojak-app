/* 공통 UI: 토스트 · 하단 시트 · 확인창 · 입력창 · 동작 메뉴 · 작은 부품들 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t;
  const UI = {};
  const backStack = [];     // 뒤로 단추가 먼저 닫을 것들
  UI.pushBack = fn => { backStack.push(fn); return () => { const i = backStack.indexOf(fn); if (i >= 0) backStack.splice(i, 1); }; };
  UI.handleBack = function () {
    const fn = backStack.pop();
    if (fn) { fn(); return true; }
    return false;
  };

  // ── 토스트 ──
  let toastWrap = null, toastTimer = null;
  UI.toast = function (msg, opts) {
    opts = opts || {};
    if (!toastWrap) { toastWrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastWrap); }
    toastWrap.innerHTML = '';
    const el = h('div', { class: 'toast' }, [h('span', { text: msg })]);
    if (opts.action) el.appendChild(h('button', { class: 'ta', text: opts.action.label, onclick: () => { hide(); opts.action.fn(); } }));
    toastWrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    clearTimeout(toastTimer);
    const hide = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 200); };
    toastTimer = setTimeout(hide, opts.ms || (opts.action ? 4500 : 2200));
  };

  // ── 하단 시트 ── opts: {title, body(el), foot(el[]), onClose, wide}
  UI.sheet = function (opts) {
    const scrim = h('div', { class: 'scrim' });
    const head = h('div', { class: 'sh-head' }, [h('h3', { text: opts.title || '' }), h('button', { class: 'ibtn', 'aria-label': t('닫기'), html: SJ.icon('x'), onclick: () => close() })]);
    const body = h('div', { class: 'sh-body' }, opts.body || []);
    const el = h('div', { class: 'sheet', role: 'dialog', 'aria-label': opts.title || '' }, [h('div', { class: 'grip' }), head, body]);
    if (opts.foot) el.appendChild(h('div', { class: 'sh-foot' }, opts.foot));
    document.body.appendChild(scrim); document.body.appendChild(el);
    requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('on'); });
    let closed = false;
    const unBack = UI.pushBack(() => close(true));
    function close(fromBack) {
      if (closed) return; closed = true;
      if (!fromBack) unBack();
      scrim.classList.remove('on'); el.classList.remove('on');
      setTimeout(() => { scrim.remove(); el.remove(); }, 200);
      if (opts.onClose) opts.onClose();
    }
    scrim.addEventListener('click', () => close());
    // 손잡이 끌어내리기
    let sy = null;
    head.addEventListener('pointerdown', e => { sy = e.clientY; });
    window.addEventListener('pointerup', function up(e) { if (sy !== null && e.clientY - sy > 70) close(); sy = null; if (closed) window.removeEventListener('pointerup', up); });
    return { el, body, close, setTitle: s => { head.querySelector('h3').textContent = s; } };
  };

  // ── 확인창 ── → Promise<boolean>
  UI.confirm = function (title, msg, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      const scrim = h('div', { class: 'scrim' });
      const done = v => { unBack(); scrim.classList.remove('on'); el.classList.remove('on'); setTimeout(() => { scrim.remove(); el.remove(); }, 180); resolve(v); };
      const acts = h('div', { class: 'acts' }, [
        opts.cancel === false ? null : h('button', { class: 'btn', text: opts.cancel || t('취소'), onclick: () => done(false) }),
        h('button', { class: 'btn ' + (opts.danger ? 'danger' : 'primary'), text: opts.ok || t('확인'), onclick: () => done(true) })
      ]);
      const el = h('div', { class: 'dialog', role: 'alertdialog' }, [h('h3', { text: title }), msg ? h('p', { text: msg }) : null, opts.extra || null, acts]);
      document.body.appendChild(scrim); document.body.appendChild(el);
      const unBack = UI.pushBack(() => done(false));
      requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('on'); });
      scrim.addEventListener('click', () => done(false));
    });
  };
  UI.alert = (title, msg) => UI.confirm(title, msg, { cancel: false });

  // 세 갈래 선택 → Promise<value|null>  choices: [{label, value, kind}]
  UI.choose = function (title, msg, choices) {
    return new Promise(resolve => {
      const scrim = h('div', { class: 'scrim' });
      const done = v => { unBack(); scrim.classList.remove('on'); el.classList.remove('on'); setTimeout(() => { scrim.remove(); el.remove(); }, 180); resolve(v); };
      const acts = h('div', { class: 'col', style: { marginTop: '10px' } }, choices.map(c => h('button', { class: 'btn block ' + (c.kind || ''), text: c.label, onclick: () => done(c.value) })));
      const el = h('div', { class: 'dialog', role: 'alertdialog' }, [h('h3', { text: title }), msg ? h('p', { text: msg }) : null, acts]);
      document.body.appendChild(scrim); document.body.appendChild(el);
      const unBack = UI.pushBack(() => done(null));
      requestAnimationFrame(() => { scrim.classList.add('on'); el.classList.add('on'); });
      scrim.addEventListener('click', () => done(null));
    });
  };

  // ── 입력창 ── → Promise<string|null>
  UI.prompt = function (title, value, opts) {
    opts = opts || {};
    const inp = h(opts.multiline ? 'textarea' : 'input', { class: 'field', value: value || '', placeholder: opts.placeholder || '', maxlength: opts.max || 200 });
    if (opts.multiline) inp.value = value || '';
    inp.style.width = '100%';
    const p = UI.confirm(title, opts.msg || '', { extra: inp, ok: opts.ok || t('확인') }).then(ok => ok ? U.nfc(inp.value) : null);
    setTimeout(() => { inp.focus(); if (inp.select) inp.select(); }, 60);
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !opts.multiline && !e.isComposing) { const ok = inp.closest('.dialog').querySelector('.btn.primary'); if (ok) ok.click(); } });
    return p;
  };

  // ── 동작 메뉴 (하단 시트 목록) ── items: [{icon, label, sub, onClick, danger}]
  UI.menu = function (title, items) {
    const list = h('div', { class: 'list' });
    const sh = UI.sheet({ title, body: [list] });
    items.filter(Boolean).forEach(it => {
      list.appendChild(h('div', { class: 'li' + (it.danger ? ' danger' : ''), role: 'button', tabindex: 0, onclick: () => { sh.close(); setTimeout(() => it.onClick(), 120); } }, [
        h('span', { class: 'ic', html: SJ.icon(it.icon || 'dot') }),
        h('div', { class: 'tx' }, [h('b', { text: it.label }), it.sub ? h('span', { text: it.sub }) : null])
      ]));
    });
    return sh;
  };

  // ── 작은 부품 ──
  UI.seg = function (options, value, onChange) {
    const el = h('div', { class: 'seg', role: 'tablist' });
    const draw = v => { el.innerHTML = ''; options.forEach(o => el.appendChild(h('button', { class: o.value === v ? 'on' : '', role: 'tab', text: o.label, onclick: () => { draw(o.value); onChange(o.value); } }))); };
    draw(value);
    el.set = draw;
    return el;
  };
  UI.switch = function (on, onChange, label) {
    const b = h('button', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label || '' });
    b.addEventListener('click', () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); onChange(on); });
    return b;
  };
  UI.chips = function (options, value, onChange, opts) {
    opts = opts || {};
    const el = h('div', { class: 'chips' });
    let open = !opts.more;     // opts.more = N: 자주 쓰는 앞 N개만 보이고 [더보기]로 펼침 (고른 것은 늘 보임)
    let cur = value;
    const draw = v => {
      cur = v;
      el.innerHTML = '';
      options.forEach((o, i) => (open || i < opts.more || (opts.multi ? (v || []).indexOf(o.value) >= 0 : o.value === v)) && el.appendChild(h('button', { class: 'chip' + ((opts.multi ? (v || []).indexOf(o.value) >= 0 : o.value === v) ? ' on' : ''), html: o.html || U.esc(o.label),
        onclick: () => {
          let nv = o.value;
          if (opts.multi) { nv = (v || []).slice(); const i = nv.indexOf(o.value); if (i >= 0) nv.splice(i, 1); else nv.push(o.value); }
          else if (opts.toggle && o.value === v) nv = null;
          draw(nv); onChange(nv);
        } })));
      if (!open && options.length > opts.more) el.appendChild(h('button', { class: 'chip ghost', text: SJ.t('더보기') + ' ▾', onclick: () => { open = true; draw(cur); } }));
    };
    draw(value);
    el.set = draw;
    return el;
  };
  UI.stepper = function (value, min, max, onChange, fmt) {
    const sp = h('span', { text: fmt ? fmt(value) : String(value) });
    const set = v => { value = U.clamp(v, min, max); sp.textContent = fmt ? fmt(value) : String(value); onChange(value); };
    return h('div', { class: 'stepper' }, [h('button', { text: '−', 'aria-label': t('줄이기'), onclick: () => set(value - 1) }), sp, h('button', { text: '+', 'aria-label': t('늘리기'), onclick: () => set(value + 1) })]);
  };
  UI.ibtn = function (icon, label, onClick, opts) {
    opts = opts || {};
    const b = h('button', { class: 'ibtn' + (opts.on ? ' on' : ''), 'aria-label': opts.aria || label, title: label, onclick: onClick, disabled: opts.disabled },
      [h('span', { html: opts.html || SJ.icon(icon) }), label && !opts.noLabel ? h('span', { class: 'lbl', text: label }) : null]);
    return b;
  };
  UI.field = function (label, input) { return h('div', {}, [h('label', { class: 'lab', text: label }), input]); };

  // 길게 누르기 (움직이면 취소)
  UI.longPress = function (el, fn, ms) {
    let timer = null, sx = 0, sy = 0, fired = false;
    el.addEventListener('pointerdown', e => { fired = false; sx = e.clientX; sy = e.clientY; timer = setTimeout(() => { fired = true; SJ.Platform.haptic('light'); fn(e); }, ms || 500); });
    const cancel = () => { clearTimeout(timer); timer = null; };
    el.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
    el.addEventListener('pointerup', cancel); el.addEventListener('pointercancel', cancel); el.addEventListener('pointerleave', cancel);
    el.addEventListener('click', e => { if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; } }, true);
    el.addEventListener('contextmenu', e => e.preventDefault());
  };

  // 음표 아이콘 (음길이 단추): Bravura 머리 + 기둥 + 꼬리, 쉼표, 점
  UI.noteIcon = function (type, opts) {
    opts = opts || {};
    const G = SJ.Glyphs;
    let body = '';
    let w = 2.4;
    if (opts.rest) {
      const n = SJ.MeasurePrep.restGlyph(type);
      const g = G[n];
      const y = type === 'whole' ? -0.5 : type === 'half' ? 0.5 : 0;
      body = '<path d="' + g.d + '" transform="translate(0.4 ' + y + ')"/>';
      w = g.w + 0.8;
    } else {
      const hn = SJ.MeasurePrep.headGlyph(type);
      body += '<path d="' + G[hn].d + '" transform="translate(0.2 1.6)"/>';
      if (type !== 'whole') {
        const sx = 0.2 + 1.18 - 0.12;
        body += '<rect x="' + sx + '" y="-2.1" width="0.14" height="3.6"/>';
        const fl = { eighth: 'flag8thUp', '16th': 'flag16thUp', '32nd': 'flag32ndUp', '64th': 'flag64thUp' }[type];
        if (fl && G[fl]) body += '<path d="' + G[fl].d + '" transform="translate(' + sx + ' -2.1)"/>';
        w = fl ? 2.7 : 1.8;
      } else w = 2.1;
    }
    const dots = opts.dots || 0;
    for (let i = 0; i < dots; i++) body += '<circle cx="' + (w + 0.1 + i * 0.55) + '" cy="1.4" r="0.22"/>';
    w += dots * 0.55;
    return '<svg viewBox="-0.2 -2.6 ' + (w + 0.4) + ' 5.6" fill="currentColor" aria-hidden="true" style="height:' + (opts.px || 28) + 'px;width:auto">' + body + '</svg>';
  };
  UI.glyphSvg = function (name, px, opts) {
    const g = SJ.Glyphs[name]; if (!g) return '';
    opts = opts || {};
    const pad = 0.3;
    return '<svg viewBox="' + (g.x0 - pad) + ' ' + (g.y0 - pad) + ' ' + (g.x1 - g.x0 + pad * 2) + ' ' + (g.y1 - g.y0 + pad * 2) + '" fill="currentColor" aria-hidden="true" style="height:' + (px || 24) + 'px;width:auto">' +
      '<path d="' + g.d + '"/></svg>';
  };

  SJ.UI = UI;
})(window.SJ = window.SJ || {});
