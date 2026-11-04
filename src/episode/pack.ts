export const PACK = {
  phone: { title:['Телефон','Phone'], detail:['Нет сети. Последнее сообщение от Веры: «Я оставила кое-что в мастерской. Если погаснет свет, смотри на компас».','No signal. Last message from Vera: “I left something in the workshop. If the lights go out, watch the compass.”'] },
  book: { title:['Книга','Book'], detail:['«Остров сокровищ». На форзаце детская подпись: «А. Соколов, 1998». Между страницами засох клевер.','Treasure Island. Inside the cover, in a child’s handwriting: “A. Sokolov, 1998.” A pressed clover lies between the pages.'] },
  compass: { title:['Компас','Compass'], detail:['Красная стрелка показывает север, к окну чердака. Возьми компас в руку и повернись: стрелка останется направленной на север.','The red needle points north, toward the attic window. Hold the compass and turn: the needle keeps pointing north.'] },
  pen: { title:['Ручка','Pen'], detail:['Синяя шариковая ручка с трещиной на колпачке. Ещё пишет.','A blue ballpoint with a cracked cap. It still writes.'] },
  sheet: { title:['Лист бумаги','Sheet of paper'], detail:['На просвет виден вдавленный след: «мастерская — за домом». Сами чернила давно выцвели.','A faint impression reads “workshop — behind the house.” The ink has long faded.'] },
  notebook: { title:['Блокнот','Notebook'], detail:['Полевые записи Алексея. Здесь отмечены документы, которые ты уже осмотрел.','Alexei’s field notes. Documents you have examined are listed here.'] },
  candy: { title:['Конфеты','Candies'], detail:['Две карамельки из кармана куртки. Можно съесть одну.','Two caramels from a jacket pocket. You can eat one.'] },
  water: { title:['Бутылка воды','Water bottle'], detail:['Воды хватит на три глотка. Остаток виден на бутылке в руке.','Enough for three sips. You can see the remaining water in the bottle.'] },
} as const;

export type PackItem = keyof typeof PACK;
export type PropId = PackItem | 'bag' | 'knife' | 'flashlight' | 'key' | 'fuse';
export const PACK_IDS = Object.keys(PACK) as PackItem[];
export const PORTIONS = { candy:2, water:3 } as const;
export type Consumable = keyof typeof PORTIONS;
export const remaining = (flags: readonly string[], id: Consumable) =>
  PORTIONS[id] - Array.from({length:PORTIONS[id]},(_,i)=>flags.includes(`pack:${id}:${i+1}`)).filter(Boolean).length;
