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
 * Formun gönderim adresi. Bunu kendi Worker'ımız karşılar (worker/index.ts) ve
 * mail'i KENDİ SMTP sunucumuz üzerinden atar — üçüncü taraf bir form servisi ya
 * da API key yok. SMTP bilgileri yalnızca sunucu tarafında (Cloudflare secret)
 * durur, bu dosyaya ve tarayıcıya asla girmez.
 */
export const QUOTE_ENDPOINT = '/api/quote'
