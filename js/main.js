/* 앱 시작 · 화면 이동 · 뒤로 단추 · 앱 생명주기 (백그라운드 저장) */
(function (SJ) {
  'use strict';
  const t = SJ.t, UI = SJ.UI;
  const App = { view: 'library', stack: [] };

  App.boot = async function () {
    const app = document.getElementById('app');
    try {
      await SJ.Settings.load();
    } catch (e) { console.error(e); }
    SJ.Library.mount(app);
    SJ.Editor.mount(app);
    SJ.SettingsView.mount(app);
    if (SJ.Recognizer && SJ.Recognizer.loadUser) SJ.Recognizer.loadUser().catch(() => {});
    SJ.Storage.autoPurgeTrash();
    await SJ.Library.show();
    document.getElementById('boot').remove();
    SJ.Help.onboarding(false);
    // 하던 악보 이어 쓰기: 편집하다 앱을 닫았으면 그 악보로 바로(직접 목록으로 나왔으면 목록에서 시작 · 점검원 ⑤ 11-02)
    const last = SJ.Settings.get('lastScore');
    if (last && SJ.Settings.get('onboarded')) { try { await App.openEditor(last); } catch (e) { SJ.Settings.set('lastScore', null); } }

    // 다른 앱에서 .sabojak 파일로 열렸을 때
    SJ.Platform.onOpenFile = f => App.openFiles([f]);
    const queued = SJ.Platform.takeQueuedFiles();
    if (queued.length) App.openFiles(queued);

    // 뒤로 단추 (안드로이드): 시트·대화상자 → 집중 모드 → 악보 모드 → 화면
    window.onBack = function () {
      if (UI.handleBack()) return true;
      if (App.view !== 'library') { App.back(); return true; }
      return false;
    };
    // 앱이 뒤로 갈 때 저장 (§12)
    window.onPauseApp = function () {
      if (SJ.Focus.isOpen()) SJ.Focus.saveDraftNow();
      SJ.Store.flush();
    };
    document.addEventListener('visibilitychange', () => { if (document.hidden) window.onPauseApp(); });
    window.addEventListener('pagehide', () => window.onPauseApp());
    // 시스템 화면 모드 바뀜
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => SJ.Settings.apply()); } catch (e) { /* 무시 */ }
    window.onerror = function (msg) { console.error(msg); };
  };

  App.openFiles = async function (files) {
    const ids = await SJ.Importer.importFiles(files);
    await SJ.Library.refresh();
    if (ids.length === 1) App.openEditor(ids[0]);
  };

  App.openEditor = async function (id, opts) {
    if (SJ.Editor.isOpen() && !(await SJ.Editor.close())) return;
    const ok = await SJ.Editor.open(id, opts);
    if (!ok) { if (SJ.Settings.get('lastScore') === id) SJ.Settings.set('lastScore', null); return; }
    SJ.Settings.set('lastScore', id);
    SJ.Library.hide();
    SJ.SettingsView.hide();
    App.stack = ['library'];
    App.view = 'editor';
  };
  App.openSettings = function () {
    App.stack.push(App.view);
    App.view = 'settings';
    SJ.SettingsView.show();
  };
  App.openPerformance = function (id, from) {
    SJ.Performance.open(id, from);
  };
  App.back = async function () {
    if (App.view === 'settings') {
      SJ.SettingsView.hide();
      App.view = App.stack.pop() || 'library';
      if (App.view === 'library') SJ.Library.show();
      return;
    }
    if (App.view === 'editor') {
      if (!(await SJ.Editor.close())) return;   // 저장이 안 돼 머물기로 함
      SJ.Settings.set('lastScore', null);        // 직접 목록으로 나옴 → 다음에 열면 목록에서
      App.view = 'library';
      App.stack = [];
      SJ.Library.show();
    }
  };
  // 언어 바뀜 → 화면 다시 그리기
  App.relabel = function () {
    SJ.Library.hide();
    const app = document.getElementById('app');
    document.getElementById('library').remove();
    SJ.Library.mount(app);
    if (App.view === 'library') SJ.Library.show(); else SJ.Library.hide();
    if (SJ.Editor.isOpen()) { SJ.EditorTools.drawToolbar(); SJ.Editor.updateTop(); }
  };

  SJ.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.boot());
  else App.boot();
})(window.SJ = window.SJ || {});
