export const TAGS = [
  'etiket', 'ikaz levhaları', 'kumlama folyo', 'ledbox', 'örümcek stand', 'mesh branda',
  'reklam dubaları', 'branda afiş', 'yelken bayrak', 'rollup', 'lightbox', 'promosyon ürünleri',
  'tanıtım standı', 'kartvizit', 'oneway cam giydirme', 'flyer', 'masa bayrağı', 'katalog', 'broşür',
  'araç magnetleri', 'nfc kart', 'folyo kaplama', 'kırlangıç bayrak', 'fuar hazırlıkları', 'tabela',
  'marka oluşturma', 'logo tasarımı', 'totem',
] as const

export const CONTACT = {
  address: 'Hürriyet Mh. 2055 Sk. No:4 Gebze, Kocaeli',
  phoneLabel: '+90 542 676 54 48',
  phoneHref: 'tel:+905426765448',
  email: 'fcetinol@sagutasarim.com',
}

/**
 * Web3Forms ayarı.
 * Access key'i https://web3forms.com adresinden (fcetinol@sagutasarim.com ile) al.
 * En temizi: proje köküne `.env` koyup  VITE_WEB3FORMS_KEY=xxxx  yaz.
 * Alternatif: aşağıdaki fallback string'i doğrudan key ile değiştir.
 */
export const CONFIG = {
  accessKey: import.meta.env.VITE_WEB3FORMS_KEY ?? 'YOUR_ACCESS_KEY_HERE',
  subject: 'Yeni Teklif Talebi — SAGU Web Sitesi',
}

export const KEY_SET =
  !!CONFIG.accessKey && CONFIG.accessKey !== 'YOUR_ACCESS_KEY_HERE'
