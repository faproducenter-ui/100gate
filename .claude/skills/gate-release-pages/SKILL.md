---
name: gate-release-pages
description: Сборка и публикация 100GATE: main, gh-pages, 100gate.online (Cloudflare), Railway.
---
# Релиз
- `main` хранит исходники; `gh-pages` только собранную игру (CNAME 100gate.online). Скрипты: `scripts/publish-isometric-pages.mjs`, `scripts/publish-pages.mjs` (fast-forward, без force).
- Порядок: `npm run check` -> тесты -> `npm run build` -> проверка -> публикация.
- ПУБЛИКАЦИЯ И PUSH ТОЛЬКО С ЯВНОГО РАЗРЕШЕНИЯ ПОЛЬЗОВАТЕЛЯ. Сохранения игроков (localStorage, Railway `server/save-api.ts`) не ломать и не писать тестовыми запросами в прод.
- Старая версия от первого лица: ветка `archive/fps-production-2026-11-10`.
