/* 도움말(손동작 치트시트 · 언제든) · 첫 실행 안내 3장 (§11) */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI;
  const HP = {};

  HP.open = function () {
    const rows = [
      ['tap', '마디 한 번 톡', '마디 고르기 → 아래에 마디 도구'],
      ['edit', '마디 두 번 톡 (또는 [입력])', '그 마디 집중 입력'],
      ['range', '옆으로 넘기듯 끌기', '쪽 넘기기'],
      ['search', '두 손가락 벌리기', '확대 (3배까지) · 확대 중엔 끌어서 이동'],
      ['note', '집중 모드: 오선 톡', '그 높이에 음 · 같은 자리 다른 높이 톡 = 화음'],
      ['pen', '집중 모드: [필기]', '손으로 그리면 알아보고, 아래 후보를 톡 해 바꾸기'],
      ['play', '[▶] 또는 더보기 › 악보 모드', '연주용 전체 화면: 왼쪽 반 = 이전, 오른쪽 반 = 다음'],
      ['hand', '악보 모드 나가기', '두 손가락 두 번 톡 · 위 가운데 1초 누르기'],
      ['undo', '실수했을 때', '위의 되돌리기 · 지운 악보는 휴지통에서 7일'],
      ['text', '제목 · 작곡 · 보표 이름', '악보에서 바로 톡 해서 고치기']
    ];
    const list = h('div', { class: 'list' }, rows.map(r => h('div', { class: 'li', style: { cursor: 'default' } }, [
      h('span', { class: 'ic', html: SJ.icon(r[0]) }), h('div', { class: 'tx' }, [h('b', { text: t(r[1]) }), h('span', { text: t(r[2]) })])])));
    UI.sheet({ title: t('사용법 · 손동작'), body: [list, h('button', { class: 'btn ghost block', style: { marginTop: '12px' }, text: t('처음 안내 다시 보기'), onclick: () => HP.onboarding(true) })] });
  };

  // 첫 실행 3장: 만들기 → 마디 두 번 톡 → 악보 모드
  HP.onboarding = function (force) {
    if (!force && SJ.Settings.get('onboarded')) return;
    const slides = [
      { t: '빠르게 만들고', d: '[+ 새 악보]에서 [만들기]를 누르면 제목 칸과 오선이 그려진 악보가 열려요.' },
      { t: '마디를 두 번 톡', d: '그 마디가 화면 가득 커져요. 오선을 톡 하거나 손으로 그려서 음표를 넣으세요.' },
      { t: '보면서 연주', d: '악보 모드에서는 화면 왼쪽 반을 톡 하면 이전, 오른쪽 반은 다음 쪽이에요.' }
    ];
    let i = 0;
    const el = h('div', { class: 'onb', role: 'dialog' });
    const unBack = UI.pushBack(() => done());
    const draw = () => {
      el.innerHTML = '';
      const s = slides[i];
      el.append(
        h('div', { class: 'row' }, [h('div', { class: 'grow' }), h('button', { class: 'btn ghost', text: t('건너뛰기'), onclick: () => done() })]),
        h('div', { class: 'slide' }, [h('div', { html: SJ.Art.onb(i) }), h('h2', { text: t(s.t) }), h('p', { text: t(s.d) })]),
        h('div', { class: 'dots' }, slides.map((_, k) => h('i', { class: k === i ? 'on' : '' }))),
        h('button', { class: 'btn primary block', text: i < slides.length - 1 ? t('다음') : t('시작하기'), onclick: () => { if (i < slides.length - 1) { i++; draw(); } else done(); } })
      );
    };
    function done() { unBack(); el.remove(); SJ.Settings.set('onboarded', true); }
    draw();
    document.body.appendChild(el);
  };

  SJ.Help = HP;
})(window.SJ = window.SJ || {});
