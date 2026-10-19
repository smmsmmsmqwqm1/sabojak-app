/* 둥근 선 아이콘 (직접 그린 SVG, 선 두께 일정) */
(function (SJ) {
  'use strict';
  const P = {
    back: 'M15 5l-7 7 7 7',
    fwd: 'M9 5l7 7-7 7',
    undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
    redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 000 12h3',
    align: 'M3 5h18v5H3zM3 14h18v5H3zM9 5v5M15 5v5M9 14v5M15 14v5',
    help: 'M12 21a9 9 0 110-18 9 9 0 010 18zM9.5 9.5a2.5 2.5 0 015 .3c0 1.7-2.5 2-2.5 3.7M12 17h.01',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    import: 'M12 3v12M7 10l5 5 5-5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
    export: 'M12 15V3M7 8l5-5 5 5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
    search: 'M11 18a7 7 0 110-14 7 7 0 010 14zM20 20l-4-4',
    sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
    play: 'M7 4.5v15l12.5-7.5z',
    trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
    copy: 'M9 9h10v11H9zM5 15H4V4h11v1',
    cut: 'M6 9a3 3 0 100-6 3 3 0 000 6zM6 21a3 3 0 100-6 3 3 0 000 6zM8.2 7.8L20 19M8.2 16.2L20 5',
    paste: 'M9 4h6v3H9zM7 5H5v16h14V5h-2',
    edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
    check: 'M5 12.5l4.5 4.5L19 7',
    x: 'M6 6l12 12M18 6L6 18',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    up: 'M5 15l7-7 7 7',
    down: 'M5 9l7 7 7-7',
    page: 'M6 3h9l4 4v14H6zM15 3v4h4',
    // 도구 막대: 단순한 기하 모양만 (손가락 모양 금지 — 오해 소지)
    text: 'M5 5h14M12 5v14M9 19h6',
    chord: 'M12 7.2A5 5 0 1 0 12 16.8M15 6h5l-3.2 9',
    lyrics: 'M4 6h9M4 11h9M4 16h5M18 16V5M13.2 16a2.4 2.4 0 1 0 4.8 0 2.4 2.4 0 1 0-4.8 0',
    measure: 'M3.5 7h17v10h-17zM12 7v10',
    expr: 'M20 6L5 12l15 6',
    pen: 'M4 20l3.5-1 11-11-2.5-2.5-11 11zM14.5 6.5l2.5 2.5',
    tap: 'M6 3.5l12 9-5.3 1.1 3.3 6-2.4 1.3-3.3-6.1L6 18.2z',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7 1.1V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-2.7-1.1l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00-1.1-2.7H3a2 2 0 110-4h.1a1.6 1.6 0 001.1-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-1.1V3a2 2 0 114 0v.1a1.6 1.6 0 002.7 1.1l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 001.1 2.7H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1.3z',
    share: 'M8 12l8-5M8 12l8 5M6 14a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM18 19a2 2 0 100-4 2 2 0 000 4z',
    print: 'M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z',
    image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9h.01',
    file: 'M6 3h9l4 4v14H6zM15 3v4h4M9 13h6M9 17h6',
    note: 'M9 18a3 3 0 11-3-3h3V5l10-2v12a3 3 0 11-3-3h3',
    grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
    layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
    transpose: 'M7 17l-4-4 4-4M3 13h12M17 7l4 4-4 4M21 11H9',
    template: 'M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z',
    info: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 11v6M12 7.5h.01',
    warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    staves: 'M3 5h18M3 8h18M3 11h18M3 15h18M3 18h18M3 21h18',
    insert: 'M12 5v14M5 12h14M3 3v18M21 3v18',
    wrap: 'M4 6h14a3 3 0 010 6H8M11 9l-3 3 3 3M4 18h6',
    pagebreak: 'M5 3h14v7H5zM5 14h14v7H5zM2 12h3M8 12h2M13 12h2M19 12h3',
    range: 'M4 12h16M7 8l-4 4 4 4M17 8l4 4-4 4',
    fill: 'M5 19h14M7 15V5l10 4-10 4',
    hand: 'M12 12m-2.5 0a2.5 2.5 0 1 0 5 0 2.5 2.5 0 1 0-5 0M12 12m-7 0a7 7 0 1 0 14 0 7 7 0 1 0-14 0',
    keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
    flip: 'M12 3v18M8 7l-4 5 4 5M16 7l4 5-4 5',
    rest: 'M10 4l4 4-3 4 3 4c-3-1-5 1-3 4',
    tie: 'M4 14c3 4 13 4 16 0',
    grace: 'M14 4v10a3 3 0 11-2-2.8M8 9l10-4',
    tuplet: 'M4 9V6h16v3M12 13v.01M8 18v-4M16 18v-4',
    dot: 'M12 12h.01',
    folder: 'M3 6h6l2 2h10v11H3z',
    restore: 'M3 12a9 9 0 109-9M3 4v5h5',
    voice: 'M7 18V6M17 18V6M4 9h6M14 15h6',
    accidental: 'M9 4v16M15 4v16M5 10l14-3M5 17l14-3',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
    moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
    stem: 'M15 4v12M15 16a3 3 0 11-3-3h3',
    beam: 'M6 18V7M18 18V5M6 7l12-2M6 10l12-2',
    erase: 'M8 20h12M4 15l9-9 6 6-5 5H9z',
    send: 'M4 12l16-8-6 16-3-7z'
  };
  SJ.icon = function (name, cls) {
    const d = P[name] || P.info;
    const fillOnly = name === 'play';
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="' + (fillOnly ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="' + (name === 'more' || name === 'dot' ? 3 : 1.9) +
      '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  };
  // 음표 모양 아이콘 (Bravura 글리프로) — 도구 막대의 음길이 단추
  SJ.glyphIcon = function (names, opts) {
    opts = opts || {};
    const G = SJ.Glyphs;
    let body = '', x = 0;
    names.forEach(n => {
      const g = G[n]; if (!g) return;
      body += '<path d="' + g.d + '" transform="translate(' + x + ' 0)"/>';
      x += g.w + 0.25;
    });
    const h = opts.h || 7, top = opts.top !== undefined ? opts.top : -4.5;
    return '<svg viewBox="' + (-0.4) + ' ' + top + ' ' + Math.max(x + 0.4, 3) + ' ' + h + '" fill="currentColor" aria-hidden="true" style="height:' + (opts.px || 26) + 'px;width:auto">' + body + '</svg>';
  };
})(window.SJ = window.SJ || {});
