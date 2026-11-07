# 100gate · новый сюжетный пролог

- Текущий бриф: `docs/specs/2026-11-07-cinematic-intro.md`; план: `docs/superpowers/plans/2026-11-07-story-intro.md`.
- Локальная ветка `intro/story-cinematic`, откат `backup/story-intro-start-5ab3fd1`. Новую версию не пушить и не публиковать.
- Старый ролик и сидячие исходники сохранены. Старый Railway preview не считать релизом новой сцены; процесс старого smoke-проверочного ожидания остановлен. В старом pinned preview найден прод-URL сохранений из `.env.production`; не использовать этот URL для QA, будущему локальному preview нужен проверяемый явный режим без облака.
- Ведущий: монтаж и новый FSM. `story_assets`: инвентаризация исходников/лицензий. Новая последовательность не содержит падения; старый клип не использовать как визуальный fallback.
- Сначала рабочий storyboard и реальные материалы домашней сцены. Не заявлять готовность истории без полной интеграции и просмотра.

## Монтаж и квартира · проверено локально

- Blender открывался с исходной сидячей позой; отдельная сцена VSE не перезаписала её. Монтажные карточки отрендерены Blender, без старого кадра падения и без выдуманных игровых кадров. `outputs/story-intro/trailer/100gate-trailer-animatic.{blend,webm}`: 25 с, VP9 1280×720/24; ffmpeg декодирует целиком без ошибок.
- `scripts/art/author-story-apartment.py` → `outputs/story-intro/home/story-home.{blend,glb,json}`. GLB 4 728 876 Б, 18 014 треугольников, 31 примитив. GLB-иерархия и текстуры проверены, полоса выхода проверена 45 лучами в Blender; дверь освобождает её при +1.42 рад. Источники и лицензия перечислены в JSON. Отдельная Blender-сцена декорации подлинкована для просмотра в открытое окно; оригинальный файл не перезаписывался.
- Новый `StoryIntroFlow`: шесть Vitest-тестов (RED до реализации → GREEN). Удержание R проверено на уровне состояния, не на новой анимации кисти. Проверка режущего контакта — внешний контракт с будущим адаптером; при восстановлении он должен пересчитать проверенный отрезок клипа, а не подставлять разрешение на основе времени.
- `npm run build` проходит; в итоговом JS нет URL новой декорации, тестового API и dev-чанка. Старый путь остаётся рабочим, не используется как fallback нового пролога.
- `npm run verify:intro-clock` на обычном маршруте: desktop/mobile, пауза, восстановление прежнего checkpoint и режущего контакта, отсутствие дубля ножа, переход в свободный режим — PASS для старой реализации.
- Локально: `npm run dev -- --host 127.0.0.1 --port 5182 --strictPort`, затем `http://127.0.0.1:5182/?story-home=1` и `node scripts/verify-story-home.mjs`. Playwright прошёл desktop и landscape touch: пауза/продолжение, открытие двери и остановка на границе готовой сцены; нет ошибок консоли, ошибочных ответов, запросов ассетов старой главы и API сохранений. Подмена только внешней таблицы шрифтов пустым CSS для офлайн-прогона. Скриншоты и отчёт в `outputs/story-intro/home/browser/`.
- **Следующий незавершённый шаг:** подключить второго лицензированного MPFB-персонажа и поставить диалог/уход с исходным Алексeем; существующий тестовый проезд камеры не считается анимацией актёра. Затем продолжить на улице и за стулом, не возвращая падение.

## User correction · full cast and playable opening
- Binding brief now docs/specs/2026-11-07-complete-opening.md. No more storyboard work.
- Rollback backup/complete-opening-b9e3169 (local). Preserve the original character and previous set.
- Ruling: do not activate New Game on an incomplete sequence or silently reuse the discarded falling animation. Implement real actor shots then bridge into the new seated escape. It costs a temporary local-only route until the full chain is valid.
- Workers: story_assets owns real MPFB female source/neutral rig; street_set owns street/store/car source. Lead owns original Alexei skeletal performance, all runtime integration and final browser/video.
- This pass begins with failing two-skin + moving-bones browser acceptance. Successful build alone is not completion.

## Full local chain · review branch

- `?story-intro=1` on local Vite is the same Episode renderer and controller. New Game runs through the authored apartment cast, street/store and return, then the new upright-chair native clip. It does not publish the preview or overwrite existing saves. `?story-home=1` stops at the attic boundary for exterior/set review.
- Blender sources: `outputs/story-intro/cast/story-home-performance.blend`, `street/story-street.blend`, `hero/story-hero-walk.blend`, `grocery/story-grocery-bag.blend`, `escape/story-upright-escape.blend`. No generated replacement humans. Street surface shimmer was coplanar base/slabs, corrected at the mesh, not masked by shadows.
- Cut: original MPFB mesh/weights and separate finger joints; left wrist retains its cuff, right tether has a deforming span and real split seam. R progress uses the same animation time as camera/props; release freezes reach, E does nothing, actual measured blade travel gates right release. Fixed a reproduced pause/autorepeat bug and keyup between render frames; no old fall clip or legacy art fetch on this route.
- First-person eye no longer intersects the face; head remains a shadow caster and visible in the rear cutaway. Bound review shows the real chair hitches from behind. Original trousers use an evaluated chair-contact corrective. Latest coarse Blender BVH audit: 20 samples, zero hand/knife inside vertices and zero body/seat surface crossings at those samples. This does not claim all possible frames or final anatomy acceptance.
- Current desktop and landscape touch Playwright passes: opening to R, skip, pause, release, R repetition, edge draw, stand, actual original movement, no console/network/save errors. Exterior still captures include grocery doors, 23:16 carrier and approaching actors. 11 unit tests; production Vite build excludes story chunks/test probes.
- Active Blender 4.5 LTS opened the upright source and is left on the rear/side view at the hitch-release beat, with MCP working. No push/deploy.
- Fixed an additional render-only bug exposed by inspecting the street frame: a single GLB material had become an array, so Three submitted no draw groups for the two unknowns. The street smoke now checks actual draw callbacks for both actors as well as their scene visibility.
- Continuous browser run with real R and W keys: `outputs/story-intro/full-browser/intro-real-controls.webm` (VP9, 960×540, 159.36 s; software test renderer, unaccelerated, silent recording). `report.json` lists every beat through FREE and zero console/network failures. FFmpeg decoded the entire file; extracted car/rear-hitch/cutting frames were visually inspected. Keep this separate from the storyboard and incomplete attempts.
- Remaining art gates: real contact for the two car exits, hand contact while removing cuffs, visual consistency of clothing/light and performance on target mobile hardware. Not accepted as a final release.
