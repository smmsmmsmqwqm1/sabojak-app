/* 편집 중인 악보 + 되돌리기/다시 실행 (§12) + 자동 저장 (800ms 디바운스 · 백그라운드 · 확인 시 즉시)
 * 악보는 불변 객체로 다룬다: 바뀐 마디만 새 객체 → 되돌리기 기록은 이전 악보 객체를 그대로 쌓으면 된다(구조 공유). */
(function (SJ) {
  'use strict';
  const U = SJ.U;
  const MAX_UNDO = 120;
  const St = { score: null, undo: [], redo: [], saveState: 'saved', readonly: false };
  const listeners = [];
  St.on = fn => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };
  const emit = (why) => listeners.slice().forEach(fn => { try { fn(why); } catch (e) { console.error(e); } });

  St.open = function (score, opts) {
    St.score = score; St.undo = []; St.redo = []; St.saveState = 'saved';
    St.readonly = !!(opts && opts.readonly);
    emit('open');
  };
  St.close = async function () { await St.flush(); St.score = null; St.undo = []; St.redo = []; };

  // label: 되돌리기 알림용 이름. fn(score) → 새 score
  St.apply = function (label, fn) {
    if (!St.score || St.readonly) return false;
    const before = St.score;
    const after = fn(before);
    if (!after || after === before) return false;
    after.meta = Object.assign({}, after.meta, { updatedAt: U.isoNow() });
    St.undo.push({ label, score: before });
    if (St.undo.length > MAX_UNDO) St.undo.shift();
    St.redo = [];
    St.score = after;
    St.markDirty();
    emit('change');
    return true;
  };
  // 되돌리기 기록 없이 바꾸기 (예: 정렬 설정 미리보기)
  St.replace = function (score) { St.score = score; St.markDirty(); emit('change'); };

  St.canUndo = () => St.undo.length > 0;
  St.canRedo = () => St.redo.length > 0;
  St.doUndo = function () {
    const e = St.undo.pop(); if (!e) return null;
    St.redo.push({ label: e.label, score: St.score });
    St.score = e.score; St.markDirty(); emit('undo');
    return e.label;
  };
  St.doRedo = function () {
    const e = St.redo.pop(); if (!e) return null;
    St.undo.push({ label: e.label, score: St.score });
    St.score = e.score; St.markDirty(); emit('redo');
    return e.label;
  };

  // ── 자동 저장 ──
  let saving = null, again = false;
  const debounced = U.debounce(() => St.save(), 800);
  St.markDirty = function () { St.saveState = 'dirty'; emit('saveState'); debounced(); };
  St.save = async function () {
    if (!St.score || St.readonly) return;
    if (saving) { again = true; return saving; }
    const score = St.score;
    St.saveState = 'saving'; emit('saveState');
    saving = (async () => {
      let tries = 0;
      for (;;) {
        try {
          let pages;
          try { const L = SJ.Layout.layout(score); pages = L.pages.length; SJ.Storage.saveThumb(score.id, SJ.SvgRender.page(L.pages[0])); } catch (e) { /* 썸네일 실패는 무시 */ }
          await SJ.Storage.saveScore(score, { pages });
          St.saveState = St.score === score ? 'saved' : 'dirty';
          St.lastError = null;
          break;
        } catch (e) {
          tries++;
          St.lastError = e;
          if (tries >= 3) { St.saveState = 'error'; emit('saveState'); SJ.UI.toast(SJ.t('저장하지 못했어요. 다시 시도할게요'), { action: { label: SJ.t('다시'), fn: () => St.save() } }); break; }
          await new Promise(r => setTimeout(r, 400 * tries));
        }
      }
      saving = null;
      emit('saveState');
      if (again) { again = false; return St.save(); }
    })();
    return saving;
  };
  St.flush = async function () {
    if (debounced.pending()) { debounced.cancel(); await St.save(); }
    else if (saving) await saving;
    else if (St.saveState === 'dirty') await St.save();
  };

  SJ.Store = St;
})(window.SJ = window.SJ || {});
