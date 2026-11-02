export type Lang = 'ru' | 'en';
export const text = (lang: Lang, ru: string, en: string) => lang === 'ru' ? ru : en;
export const CHAPTER_PLAN = [10, 5, 6, 8, 9, 11, 12, 12, 13, 14] as const;
export const ROOMS = [
  ['Чердак', 'Attic'], ['Верхняя площадка', 'Landing'], ['Кладовая', 'Storeroom'],
  ['Кабинет отца', "Father’s study"], ['Спальня родителей', 'Parents’ bedroom'],
  ['Комната Веры', 'Vera’s room'], ['Ванная', 'Bathroom'], ['Кухня', 'Kitchen'],
  ['Столовая', 'Dining room'], ['Прихожая', 'Entrance hall'],
] as const;
export const DOCUMENTS: Record<string, { title: [string, string]; body: [string, string] }> = {
  atticNote: { title: ['Не шуми наверху', 'Keep quiet upstairs'], body: [
    'Лёша. Если ты читаешь это, значит, письмо дошло.\n\nКлюч от люка я оставила в жестяной коробке на рабочем столе, под круглым окном. Возьми фонарь: внизу давно нет света.\n\nНе верь тому, что услышишь из кабинета отца. И не оставляй двери открытыми.\n\nВ.',
    'Alyosha. If you are reading this, the letter reached you.\n\nThe hatch key is in the tin box on the workbench beneath the round window. Take the flashlight. There is no power downstairs.\n\nDo not trust the sounds from Father’s study. And do not leave the doors open.\n\nV.',
  ] },
  storeNote: { title: ['Записка на обороте счёта', 'On the back of a receipt'], body: [
    'Шкаф в кладовой снова заело. Освободить место справа и тянуть за боковую стенку.\n\nЗапасной ключ от кабинета лежит ЗА шкафом. Вера, не прячь его там больше.\n\nПапа.',
    'The storeroom cabinet is stuck again. Clear the space on its right and pull the side panel.\n\nThe spare study key is BEHIND it. Vera, please stop hiding it there.\n\nDad.',
  ] },
  fatherNote: { title: ['Письмо, которое не отправили', 'An unsent letter'], body: [
    'Алексей,\n\nТы всегда думал, что я ремонтировал замки. Я проектировал двери, которые должны были удержать людей внутри. Сто помещений. Десять секторов.\n\nКогда я понял, зачем им это нужно, Вера уже нашла служебный проход.\n\nКлюч от нашей спальни оставил рядом. Её рисунок всё ещё там.\n\nПрости, что не рассказал раньше.',
    'Alexei,\n\nYou thought I repaired locks. I designed doors meant to keep people inside. One hundred rooms. Ten sectors.\n\nBy the time I understood why, Vera had found the service passage.\n\nOur bedroom key is beside this letter. Her drawing is still there.\n\nI am sorry I did not tell you sooner.',
  ] },
  bedroomNote: { title: ['Семейная фотография', 'A family photograph'], body: [
    'На обороте почерком матери:\n\n«23 октября. Вера опять нарисовала дом с сотней дверей. Сергей сказал, что это просто игра».\n\nПод фотографией — ключ от комнаты Веры. Вы узнаёте красную ленту: когда-то сами привязали её к кольцу.',
    'On the back, in Mother’s handwriting:\n\n“23 October. Vera drew a house with a hundred doors again. Sergei said it was only a game.”\n\nBeneath the photograph is Vera’s room key. You recognise its red ribbon. You tied it there yourself.',
  ] },
  veraNote: { title: ['Последняя страница дневника', 'The last diary page'], body: [
    'Если я не вернусь, ищи меня за старой мастерской.\n\nКлюч от входной двери в моей музыкальной шкатулке. Сигнализация не даст открыть дверь без электричества: нужен предохранитель из аптечки в ванной. Щиток на кухне. Пульт отключения — ЗА шкафом в столовой.\n\nЛёша, ты не виноват, что уехал. Но теперь, пожалуйста, не уходи без меня.',
    'If I do not return, look beyond the old workshop.\n\nThe front door key is in my music box. The alarm needs power before it can release the door. Take the fuse from the bathroom cabinet to the kitchen fuse box. The alarm panel is BEHIND the dining-room wardrobe.\n\nAlyosha, leaving was not your fault. But this time, please do not leave without me.',
  ] },
  bathNote: { title: ['Назначение врача', 'A prescription'], body: [
    'Пациент: В. Соколова.\nЖалобы: бессонница, повторяющийся сон о закрытых помещениях.\n\nПриписка другим почерком: «Шприцы не трогай. Предохранитель в аптечке — он тебе нужнее».',
    'Patient: V. Sokolova.\nSymptoms: insomnia, recurring dreams of locked rooms.\n\nA note in another hand: “Leave the syringes alone. The fuse in the cabinet is what you need.”',
  ] },
  kitchenNote: { title: ['Схема питания', 'Wiring diagram'], body: [
    'Кухня → предохранитель 10 А → сигнализация в столовой → входная дверь.\n\nСначала восстановить питание. Затем снять блокировку на пульте. Ключ лишь отпирает механический замок.',
    'Kitchen → 10 A fuse → dining-room alarm → front door.\n\nRestore power first. Then release the alarm at its panel. The key only opens the mechanical lock.',
  ] },
};
export interface Settings { language: Lang; quality: 'low' | 'medium' | 'high'; volume: number; sensitivity: number; headBob: boolean; }
export const DEFAULT_SETTINGS: Settings = { language: 'ru', quality: 'high', volume: .65, sensitivity: 1, headBob: false };
export interface Save {
  version: 1; flags: string[]; items: string[]; read: string[]; doors: string[]; moved: string[];
  position: [number, number, number]; yaw: number; pitch: number; room: number; updatedAt: string;
}
export const newSave = (): Save => ({ version: 1, flags: [], items: [], read: [], doors: [], moved: [], position: [0, 3.6, 2.8], yaw: 0, pitch: -.23, room: 0, updatedAt: new Date().toISOString() });
export function validSave(value: unknown): value is Save {
  if (!value || typeof value !== 'object') return false;
  const s = value as Save;
  return s.version === 1 && ['flags', 'items', 'read', 'doors', 'moved'].every(k => Array.isArray(s[k as keyof Save]) && (s[k as keyof Save] as unknown[]).every(x => typeof x === 'string'))
    && Array.isArray(s.position) && s.position.length === 3 && s.position.every(n => Number.isFinite(n) && Math.abs(n) < 200)
    && Number.isFinite(s.yaw) && Number.isFinite(s.pitch) && Number.isInteger(s.room) && s.room >= 0 && s.room < 10;
}
