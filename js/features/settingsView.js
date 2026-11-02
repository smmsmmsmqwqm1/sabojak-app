/* 설정 화면 (§14): 필기 · 악보 모드 · 정렬 · 일반 · 데이터 */
(function (SJ) {
  'use strict';
  const U = SJ.U, h = U.h, t = SJ.t, UI = SJ.UI, S = SJ.Settings;
  const SV = {};
  let root = null;

  SV.mount = function (container) {
    root = h('div', { class: 'view hidden', id: 'settings' });
    container.appendChild(root);
  };
  SV.show = function () { draw(); root.classList.remove('hidden'); };
  SV.hide = function () { root.classList.add('hidden'); };

  function row(title, sub, ctrl) {
    return h('div', { class: 'set' }, [h('div', { class: 'tx' }, [h('b', { text: title }), sub ? h('span', { text: sub }) : null]), ctrl]);
  }
  function sw(key, onChange) { return UI.switch(S.get(key) !== false && !!S.get(key), v => { S.set(key, v); if (onChange) onChange(v); }); }
  function link(title, sub, fn, icon) {
    return h('div', { class: 'li', role: 'button', tabindex: 0, onclick: fn }, [h('span', { class: 'ic', html: SJ.icon(icon || 'right') }), h('div', { class: 'tx' }, [h('b', { text: title }), sub ? h('span', { text: sub }) : null])]);
  }

  function draw() {
    root.innerHTML = '';
    const top = h('div', { class: 'topbar' }, [UI.ibtn('back', t('뒤로'), () => SJ.App.back(), { noLabel: true }), h('div', { class: 'title', style: { cursor: 'default' }, text: t('설정') })]);
    const body = h('div', { class: 'settings grow' });
    // 필기
    body.append(h('h4', { text: t('필기') }), h('div', { class: 'list' }, [
      row(t('펜으로만 필기'), t('손가락은 이동·선택에만 써요 (펜이 없는 기기는 끄세요)'), sw('pencilOnly')),
      row(t('인식 대기 시간'), t('그리기를 멈춘 뒤 인식하기까지'), UI.stepper(S.get('recogDelay') / 100, 3, 20, v => S.set('recogDelay', v * 100), v => (v / 10) + t('초'))),
      row(t('긁어서 지우기'), t('음표 위를 지그재그로 긁으면 지워요'), sw('scratchErase')),
      link(t('내 필기 등록 (선택 · 약 2분)'), t('기본 기호를 한 번씩 그려 두면 더 잘 알아봐요'), () => SJ.Handwriting && SJ.Handwriting.enrollWizard(), 'pen'),
      link(t('필기 학습 초기화'), t('내 필기로 배운 것을 지워요'), async () => {
        if (await UI.confirm(t('필기 학습을 초기화할까요?'), t('내가 등록한 필기와 고친 기록이 지워져요.'), { ok: t('초기화'), danger: true })) { await SJ.Recognizer.resetUser(); UI.toast(t('초기화했어요')); }
      }, 'restore')
    ]));
    // 악보 모드
    body.append(h('h4', { text: t('악보 모드') }), h('div', { class: 'list' }, [
      // 나가는 방법은 늘 하나 이상(둘 다 끄면 아이폰에서 악보 모드를 못 나감 · 점검원 ⑤ 11-02)
      row(t('두 손가락 두 번 톡으로 나가기'), null, sw('perfExitTwoFinger', v => { if (!v && S.get('perfExitHold') === false) { S.set('perfExitHold', true); UI.toast(t('나가는 방법 하나는 켜 둬야 해서 1초 누르기를 켰어요')); SJ.SettingsView.show(); } })),
      row(t('위 가운데 1초 누르기로 나가기'), null, sw('perfExitHold', v => { if (!v && S.get('perfExitTwoFinger') === false) { S.set('perfExitTwoFinger', true); UI.toast(t('나가는 방법 하나는 켜 둬야 해서 두 손가락 톡을 켰어요')); SJ.SettingsView.show(); } })),
      row(t('넘김 효과'), null, UI.seg([{ label: t('없음'), value: 'none' }, { label: t('짧은 페이드'), value: 'fade' }], S.get('perfAnim'), v => S.set('perfAnim', v))),
      row(t('쪽 번호 표시'), null, sw('perfPageNum')),
      row(t('화면 맞춤 줄 수'), t('한 화면에 보일 줄'), UI.stepper(S.get('perfLines') || 3, 1, 8, v => S.set('perfLines', v), v => t('{n}줄', { n: v }))),
      link(t('사용 안내 다시 보기'), null, () => { S.set('perfGuideSeen', false); UI.toast(t('다음에 악보 모드를 열면 안내가 나와요')); }, 'info')
    ]));
    // 정렬
    body.append(h('h4', { text: t('정렬 (새 악보 기본값)') }), h('div', { class: 'list' }, [
      row(t('세로줄 정렬 켜기'), t('새 악보를 만들 때'), sw('alignDefault')),
      row(t('줄당 마디 수'), null, UI.stepper(S.get('alignN') || 4, 1, 8, v => S.set('alignN', v), v => t('{n}마디', { n: v }))),
      row(t('마디 폭'), null, UI.seg([{ label: t('같은 폭'), value: 'equal' }, { label: t('내용에 맞춤'), value: 'fit' }], S.get('alignWidth') || 'equal', v => S.set('alignWidth', v)))
    ]));
    // 일반
    body.append(h('h4', { text: t('일반') }), h('div', { class: 'list' }, [
      // 언어: 처음엔 기기 언어를 따름. 바꾸면 화면을 새로 그린다(작업은 이미 저장돼 있음)
      row(t('언어'), t('처음엔 휴대폰 언어를 따라가요'), UI.seg([{ label: t('기기 설정'), value: 'auto' }, { label: '한국어', value: 'ko' }, { label: 'English', value: 'en' }],
        S.get('lang') === 'ko' || S.get('lang') === 'en' ? S.get('lang') : 'auto', async v => {
          S.set('lang', v);
          try { await SJ.Storage.saveJson('settings.json', S.all()); if (SJ.Store && SJ.Store.flush) await SJ.Store.flush(); } catch (e) { /* 무시 */ }
          location.reload();
        })),
      row(t('화면 모드'), t('악보 종이는 항상 흰색'), UI.seg([{ label: t('기기 따라'), value: 'system' }, { label: t('밝게'), value: 'light' }, { label: t('어둡게'), value: 'dark' }], S.get('theme'), v => S.set('theme', v))),
      row(t('글자 크기'), t('메뉴·버튼 글자 (악보는 그대로)'), UI.stepper(Math.round((S.get('uiScale') || 1) * 10), 8, 14, v => S.set('uiScale', v / 10), v => (v * 10) + '%')),
      row(t('진동(햅틱)'), t('확인·끝 쪽에서 살짝'), sw('haptics')),
      link(t('처음 안내 다시 보기'), null, () => SJ.Help.onboarding(true), 'info'),
      link(t('사용법 · 손동작 모음'), null, () => SJ.Help.open(), 'help')
    ]));
    // 데이터
    body.append(h('h4', { text: t('데이터') }), h('div', { class: 'list' }, [
      link(t('전체 백업 내보내기'), t('모든 악보를 zip 하나로'), () => SJ.ExportSheet.backupAll(), 'folder'),
      link(t('백업에서 되살리기'), t('백업 zip · .sabojak 파일 고르기'), () => SJ.Library.importFlow(), 'restore'),
      link(t('휴지통'), t('지운 악보·템플릿 7일 보관'), () => SJ.Trash.open(), 'trash'),
      link(t('템플릿 관리'), t('새 악보 화면에서 길게 누르면 이름 바꾸기·지우기'), () => SJ.NewScore.open(), 'template'),
      h('div', { class: 'set' }, [h('div', { class: 'tx' }, [h('b', { text: t('저장 공간') }), h('span', { class: 'storage-info', text: '…' })])])
    ]));
    body.append(h('p', { class: 'tiny muted', style: { textAlign: 'center', margin: '18px 0' }, text: (SJ.getLang() === 'en' ? SJ.APP.nameEn : SJ.APP.name + ' (' + SJ.APP.nameEn + ')') + ' ' + (window.APP_VERSION || SJ.APP.version) + ' · ' + t('악보 글꼴 Bravura (SIL OFL)') }));
    root.append(top, body);
    SJ.Storage.list().then(list => {
      const el = root.querySelector('.storage-info');
      if (el) el.textContent = t('악보 {n}개 · 기기 안에만 저장 (계정·클라우드 없음)', { n: list.length });
    });
  }

  SJ.SettingsView = SV;
})(window.SJ = window.SJ || {});
