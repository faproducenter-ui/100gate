---
name: gate-playwright-verify
description: Автотесты и визуальная проверка 100GATE через Vitest и Playwright (desktop и мобильные).
---
# Проверки
- Юнит: `npx vitest run src/iso`. Типы: `npm run check`. Сборка: `npm run build`.
- Браузер: `npm run dev`, затем `scripts/verify-isometric-chapter.mjs`, `verify-isometric-production.mjs`, `verify-kitchen-menu.mjs`. Нужен `npx playwright install chromium` (или `CHROMIUM_PATH`).
- Эмуляция мобильных не заменяет реальное устройство; headless SwiftShader не показывает реальный FPS. Так и сообщать.
- Честно сообщать, что прошло и что не запускалось.
