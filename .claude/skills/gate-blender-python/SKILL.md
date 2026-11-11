---
name: gate-blender-python
description: Генерация и аудит моделей скриптами bpy в стиле scripts/art/*.py. Использовать для процедурного создания сцен, проверок геометрии и повторяемой сборки.
---
# Blender Python
- Образцы: `scripts/art/author-*.py` (создание), `scripts/art/audit-*.py` (проверки).
- Скрипты повторяемые: одинаковый вход -> одинаковый результат, без ручных правок в .blend.
- Запуск без UI: `blender -b файл.blend --python скрипт.py` (C:\Program Files\Blender Foundation\Blender 4.5).
- Любой аудит (контакты, пересечения, лучи) выводит числа в JSON, а не только «ок».
