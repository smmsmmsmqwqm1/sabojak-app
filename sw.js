/* 사보작 오프라인 캐시 (scripts/make_pwa.py 가 만듦 — 손으로 고치지 말 것). 버전이 바뀌면 새 판을 받아 다음 실행부터 적용 */
const CACHE = 'sabojak-81dc30d8f0b5';
const FILES = ["app_version.js", "css/app.css", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "index.html", "js/config/app.js", "js/config/constants.js", "js/core/util.js", "js/engine/alignGrid.js", "js/engine/beams.js", "js/engine/decorations.js", "js/engine/focusLayout.js", "js/engine/glyphs.generated.js", "js/engine/glyphs.js", "js/engine/layoutPages.js", "js/engine/layoutSystem.js", "js/engine/measurePrep.js", "js/engine/measureRender.js", "js/engine/pen.js", "js/engine/reflow.js", "js/engine/spacing.js", "js/engine/systemBuild.js", "js/engine/textWidth.js", "js/features/editor.js", "js/features/editorGestures.js", "js/features/editorSheets.js", "js/features/editorTools.js", "js/features/exportSheet.js", "js/features/focus.js", "js/features/focusInput.js", "js/features/handwriting.js", "js/features/help.js", "js/features/library.js", "js/features/lyricsExpr.js", "js/features/measureSheet.js", "js/features/newScore.js", "js/features/performance.js", "js/features/settingsView.js", "js/features/templates.js", "js/features/textTools.js", "js/features/trash.js", "js/io/exporter.js", "js/io/importer.js", "js/io/midi.js", "js/io/musicxmlExport.js", "js/io/musicxmlImport.js", "js/io/platform.js", "js/io/sabojakFormat.js", "js/io/sha256.js", "js/io/storage.js", "js/io/zip.js", "js/main.js", "js/model/chord.js", "js/model/duration.js", "js/model/measureEdit.js", "js/model/migrate.js", "js/model/ops.js", "js/model/pitch.js", "js/model/score.js", "js/model/validate.js", "js/recognition/geometry.js", "js/recognition/pdollar.js", "js/recognition/player.js", "js/recognition/recognizer.js", "js/recognition/templates.js", "js/render/svgString.js", "js/state/settings.js", "js/state/store.js", "js/ui/art.js", "js/ui/components.js", "js/ui/i18n.js", "js/ui/i18n_en.js", "js/ui/icons.js", "licenses/Bravura_OFL.txt", "manifest.webmanifest"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'].concat(FILES))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
