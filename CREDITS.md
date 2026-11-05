# Ресурсы

## Глава I — Дом, который помнит

- PBR-материал Wood Planks — Poly Haven, автор Amal Kumar, CC0 1.0. Карты цвета, нормалей OpenGL и шероховатости, 2K. Источник: https://polyhaven.com/a/wood_planks ; лицензия: https://polyhaven.com/license . Файлы сохранены локально в `public/textures/`.
- Дополнительные PBR-материалы Poly Haven, CC0 1.0: [Worn Plaster Wall](https://polyhaven.com/a/worn_plaster_wall), [Rough Linen](https://polyhaven.com/a/rough_linen), [Brown Mud 03](https://polyhaven.com/a/brown_mud_03). Использованы локальные карты цвета, нормалей OpenGL и, для штукатурки, шероховатости.
- Бочка, сумка, письмо и мастерская — оригинальная геометрия Blender для 100gate. Бочка использует авторские карты пятен и ржавчины на основе [Grey Oak Veneer 02](https://polyhaven.com/a/grey_oak_veneer_02); сумка — [Hessian 380](https://polyhaven.com/a/hessian_380) и [Brown Leather](https://polyhaven.com/a/brown_leather); мастерская — [Roof Slates 02](https://polyhaven.com/a/roof_slates_02) и [Red Brick Plaster Patch 02](https://polyhaven.com/a/red_brick_plaster_patch_02). Эти материалы распространяются по CC0.
- Мебель и растения: CC0-модели Poly Haven [Painted Wooden Chair 02](https://polyhaven.com/a/painted_wooden_chair_02), [Dining Table](https://polyhaven.com/a/dining_table), [Gothic Cabinet 01](https://polyhaven.com/a/GothicCabinet_01), [Painted Wooden Bench](https://polyhaven.com/a/painted_wooden_bench), [Wooden Crate 01](https://polyhaven.com/a/wooden_crate_01), [Fir Sapling](https://polyhaven.com/a/fir_sapling) и [Pine Sapling Small](https://polyhaven.com/a/pine_sapling_small). Подогнаны под игровые размеры, разобраны и оптимизированы для браузерного рендера; авторские UV и PBR-карты сохранены.
- Фонарь, латунный ключ, куртка, брюки и ботинки созданы в Blender для 100gate. Кисти в двух позах и голова для силуэта адаптированы в Blender из [анатомической сетки MakeHuman](https://github.com/makehumancommunity/makehuman/blob/master/makehuman/data/3dobjs/base.obj) (CC0, как указано в заголовке файла). Движение тела, смена хвата, положение фонаря, часть мелких предметов, эффекты погоды и открытая часть двора реализованы в Three.js.
- PBR-кожа кистей: Aksel Skin, автор Mindfront, [официальный набор MakeHuman Skins 02](https://static.makehumancommunity.org/assets/assetpacks/skins02.html), CC0. Исходные цвет, нормали и specular использованы в Blender; цвет, нормали и художественно настроенная шероховатость запечены на отдельный UV-атлас кистей. Экспорт включает MikkTSpace-тангенты. Редактируемый исходник: `art/character-hands.blend`.
- Записанный Foley (CC0, нарезка и сведение для 100gate): шаги и бег в ботинках по доскам — [Nox_Sound](https://freesound.org/people/Nox_Sound/sounds/533044/); шорох бумаги и замок — [rubberduck](https://opengameart.org/content/100-cc0-sfx); поднятие ключей — [WeeJee_vdH](https://freesound.org/people/WeeJee_vdH/sounds/267711/) и [RealSquink](https://freesound.org/people/RealSquink/sounds/788310/).
- Скрип и падение деревянного стула (CC0): [JK129645](https://freesound.org/people/JK129645/sounds/547466/), [harveyism](https://freesound.org/people/harveyism/sounds/130364/) и [Janijs](https://freesound.org/people/Janijs/sounds/686712/). Хруст — [Tito и StarNinjas](https://opengameart.org/content/7-eating-crunches); бутылка, вода и глотки — [qubodup](https://opengameart.org/content/liquid-bottle-drink-set), также CC0. Оригинальный процедурный Web Audio остаётся для фона и части эффектов (двери, верёвки, гром).
- Шрифты Cormorant Garamond и Manrope — Google Fonts, SIL Open Font License. При недоступности сервиса используются локальные системные шрифты.
- Значки — Lucide, ISC License, https://lucide.dev/license .

## Сохранённые ресурсы предыдущей версии

- «Смотритель» — оригинальная текстурированная GLB-модель, созданная через Tripo API по описанию проекта. Upstream task: `22af18a1-02e8-4564-a02a-53dc306b6072`.
- Дверь `01-L1-0006` — библиотека редактируемых 3D-ресурсов Kimi. Лицензия Three.js: `public/assets/door/THREE-LICENSE.txt`.
- Настольная лампа `01-L1-0269` — библиотека редактируемых 3D-ресурсов Kimi. Лицензия Three.js: `public/assets/lamp/THREE-LICENSE.txt`.
- Остальная геометрия, интерьерные материалы, текстуры, интерфейс и синтезированный звук создаются кодом проекта.
- Изображения заброшенных интерьеров использовались только как визуальные референсы и не включены в игру.

## Isolated replacement-character review

The not-yet-integrated `art/character-mpfb-review.blend` and
`art/character-mpfb-grip-review.glb` use the CC0 MakeHuman/MPFB base human,
stock game-engine skeleton and source weights. Skin: Mindfront, Aksel Skin.
Clothing: Margaret Toigo / MRT, Fisherman Sweater and Ankle Boots Male;
Cortu Johnstone, Cargo Pants. Eye mesh/texture: MakeHuman core.
Selected catalog assets are CC0; the MPFB tool code is GPLv3 and is not
included in the browser runtime. See `art/provenance/MPFB-SOURCES.json`,
`art/provenance/MPFB-LICENSE.md`, `art/provenance/MPFB-ASSETS-CC0.txt`
and `art/provenance/MAKEHUMAN-LICENSE.md` for exact sources and terms.

The old chair is the existing credited game prop. Knife geometry/materials
and grip-study choreography are project-authored. para's CC0 FPS Arms archive
was inspected as a reference but its meshes and actions were not imported.
