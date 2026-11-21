import type {
  BusinessAsset,
  BusinessType,
  ContactMethod,
  Lang,
  PhotoCount,
  PhotoPurpose,
  Service,
  VideoDuration,
  VideoOccasion,
  VideoVariant,
} from './catalog.js';

type Dict = Record<Lang, string>;

function pick(dict: Dict, lang: Lang): string {
  return dict[lang];
}

const service: Record<Service, Dict> = {
  photo: { ru: 'Фото с вами в любой локации', uz: 'Istalgan joyda siz bilan surat', en: 'A photo of you in any place' },
  animation: { ru: 'Оживление фотографий', uz: 'Suratlarni jonlantirish', en: 'Bringing photos to life' },
  video: { ru: 'Видеоролик к событию', uz: 'Tadbir uchun video', en: 'A video for an occasion' },
  landing: { ru: 'Лендинг для бизнеса', uz: 'Biznes uchun lending', en: 'A landing page for your business' },
  post_generator: { ru: 'Генератор постов', uz: 'Postlar generatori', en: 'A post generator' },
  accounting: { ru: 'Программа учёта доходов и расходов', uz: 'Kirim-chiqim hisobi dasturi', en: 'Income and expense tracking' },
  other: { ru: 'Другое', uz: 'Boshqa', en: 'Something else' },
};

const photoCount: Record<PhotoCount, Dict> = {
  '1': { ru: '1 фото', uz: '1 ta surat', en: '1 photo' },
  '2-3': { ru: '2–3 фото', uz: '2–3 ta surat', en: '2–3 photos' },
  '4-5': { ru: '4–5 фото', uz: '4–5 ta surat', en: '4–5 photos' },
  '6+': { ru: 'Больше 5 фото', uz: '5 tadan koʻp surat', en: 'More than 5 photos' },
};

const photoPurpose: Record<PhotoPurpose, Dict> = {
  personal: { ru: 'Для себя / соцсетей', uz: 'Oʻzim / ijtimoiy tarmoqlar uchun', en: 'For myself / social media' },
  gift: { ru: 'В подарок', uz: 'Sovgʻa uchun', en: 'As a gift' },
  archive: { ru: 'Семейный архив', uz: 'Oilaviy arxiv', en: 'Family archive' },
  business: { ru: 'Для бизнеса / рекламы', uz: 'Biznes / reklama uchun', en: 'For business / advertising' },
};

const occasion: Record<VideoOccasion, Dict> = {
  love_story: { ru: 'Love story / свадьба', uz: 'Love story / toʻy', en: 'Love story / wedding' },
  birthday: { ru: 'День рождения', uz: 'Tugʻilgan kun', en: 'Birthday' },
  jubilee: { ru: 'Юбилей', uz: 'Yubiley', en: 'Jubilee' },
  time_machine: { ru: 'Машина времени', uz: 'Vaqt mashinasi', en: 'Time machine' },
  other: { ru: 'Другое', uz: 'Boshqa', en: 'Other' },
};

const variant: Record<VideoVariant, Dict> = {
  A: { ru: 'А — по моему сценарию', uz: 'A — mening ssenariyim boʻyicha', en: 'A — from my script' },
  B: { ru: 'Б — под ключ', uz: 'B — toʻliq tayyor', en: 'B — done for you' },
  unknown: { ru: 'Нужна консультация', uz: 'Maslahat kerak', en: 'I need advice' },
};

const duration: Record<string, Dict> = {
  '15': { ru: '15 секунд', uz: '15 soniya', en: '15 seconds' },
  '30': { ru: '30 секунд', uz: '30 soniya', en: '30 seconds' },
  '45': { ru: '45 секунд', uz: '45 soniya', en: '45 seconds' },
  '60': { ru: '60 секунд', uz: '60 soniya', en: '60 seconds' },
  unknown: { ru: 'Не знаю, посоветуйте', uz: 'Bilmayman, maslahat bering', en: 'Not sure, please advise' },
};

const businessType: Record<BusinessType, Dict> = {
  retail: { ru: 'Торговля / магазин', uz: 'Savdo / doʻkon', en: 'Retail / shop' },
  services: { ru: 'Услуги', uz: 'Xizmatlar', en: 'Services' },
  food: { ru: 'Общепит', uz: 'Oziq-ovqat', en: 'Food service' },
  production: { ru: 'Производство / опт', uz: 'Ishlab chiqarish / ulgurji', en: 'Production / wholesale' },
  other: { ru: 'Другое', uz: 'Boshqa', en: 'Other' },
};

const asset: Record<BusinessAsset, Dict> = {
  site: { ru: 'Сайт', uz: 'Sayt', en: 'A website' },
  social: { ru: 'Instagram / Telegram', uz: 'Instagram / Telegram', en: 'Instagram / Telegram' },
  spreadsheet: { ru: 'Учёт в таблице', uz: 'Jadvalda hisob', en: 'A spreadsheet' },
  nothing: { ru: 'Пока ничего', uz: 'Hozircha hech narsa', en: 'Nothing yet' },
};

const contact: Record<ContactMethod, Dict> = {
  telegram: { ru: 'Telegram', uz: 'Telegram', en: 'Telegram' },
  call: { ru: 'Звонок', uz: 'Qoʻngʻiroq', en: 'Phone call' },
  whatsapp: { ru: 'WhatsApp', uz: 'WhatsApp', en: 'WhatsApp' },
};

const deadline: Record<string, Dict> = {
  standard: { ru: 'Стандарт (7 дн.)', uz: 'Odatiy muddat (7 kun)', en: 'Standard (7 days)' },
  no_rush: { ru: 'Не спешит', uz: 'Shoshilmaydi', en: 'No rush' },
};

export const label = {
  service: (value: Service, lang: Lang) => pick(service[value], lang),
  photoCount: (value: PhotoCount, lang: Lang) => pick(photoCount[value], lang),
  photoPurpose: (value: PhotoPurpose, lang: Lang) => pick(photoPurpose[value], lang),
  occasion: (value: VideoOccasion, lang: Lang) => pick(occasion[value], lang),
  variant: (value: VideoVariant, lang: Lang) => pick(variant[value], lang),
  duration: (value: VideoDuration, lang: Lang) => pick(duration[String(value)]!, lang),
  businessType: (value: BusinessType, lang: Lang) => pick(businessType[value], lang),
  asset: (value: BusinessAsset, lang: Lang) => pick(asset[value], lang),
  contact: (value: ContactMethod, lang: Lang) => pick(contact[value], lang),
  deadlineMode: (value: 'standard' | 'no_rush', lang: Lang) => pick(deadline[value]!, lang),
};

export const LANG_NAME: Record<Lang, string> = {
  ru: 'RU',
  uz: 'UZ',
  en: 'EN',
};

export const LANG_HINT: Record<Lang, string> = {
  ru: '',
  uz: 'общаться на узбекском',
  en: 'reply in English',
};

export const SHEET_STATUS: Record<string, string> = {
  new: 'Новая',
  in_work: 'В работе',
  no_answer: 'Не дозвонился',
  prepaid: 'Предоплата получена',
  revision: 'Правка',
  done: 'Сдано',
  rejected: 'Отказ',
};
