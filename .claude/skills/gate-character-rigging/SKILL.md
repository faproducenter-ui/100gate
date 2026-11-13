---
name: gate-character-rigging
description: Персонаж Алексей и анимации: риг, mocap, IK, подключение alexei.glb в src/iso/actor.ts.
---
# Персонаж и анимации
- Модель: `public/assets/iso/alexei.glb`, логика: `src/iso/actor.ts` (+ `actor.test.ts`).
- Источник тела/лица в старой версии: MPFB/MakeHuman (CC0), см. `art/provenance/*`. Сохранять лицензионные записи.
- Не менять имена костей без обновления кода; проверять скольжение стоп и пересечения одежды с телом; проверять в игре, не только в Blender.
