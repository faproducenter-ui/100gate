---
name: gate-graphics-lighting
description: Качество графики, свет и тени 100GATE: экспозиция, мягкие тени, объёмный и точечный свет, постобработка, бюджеты по качеству. Использовать при правках внешнего вида сцены.
---
# Графика, свет и тени
- Настройки рендера: `world.ts` (`ACESFilmicToneMapping`, `PCFSoftShadowMap`, пиксельное отношение по `quality`/`scale`). Любая новая роскошь должна выключаться на `quality:low` и при `settings.shadows=false`.
- Свет: тёмные комнаты строятся от малого ambient (`darkness` в `world.ts`) + локальные источники (лампы щитовой, фонарь). Не поднимать общий ambient, чтобы «починить» тёмный кадр: добавить источник.
- Тени: максимум 2 источника с `castShadow`; карты 512–1024; `normalBias`/`bias` подбирать на реальных стенах, чтобы не было «акне».
- Материалы: PBR из `env-materials.ts`; запечённое освещение и AO из Blender (см. `gate-blender-export`) дешевле динамики.
- Бюджеты: смотреть `IsoWorld.diagnostics()` и `environment.test.ts` (меши < 350, треугольники < 500k).
- Проверка: скриншоты desktop и mobile (`gate-playwright-verify`).
