/**
 * SAGU — statik varlıklı Cloudflare Worker.
 *
 *  • POST /api/quote  → teklif formunu alır, KENDİ SMTP sunucun üzerinden mail atar
 *  • diğer her istek  → dist/ içindeki statik dosyalar (ASSETS binding)
 *
 * Gizli bilgiler (SMTP kullanıcı/parola) yalnızca sunucu tarafında, Cloudflare
 * secret'ı olarak durur. Tarayıcıya ASLA gönderilmez, repoya ASLA girmez.
 */
import { sendMail } from './smtp'

export interface Env {
  ASSETS: Fetcher
  SMTP_HOST: string
  SMTP_PORT?: string
  SMTP_USER: string
  SMTP_PASS: string
  MAIL_TO: string
  MAIL_FROM: string
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneRe = /^[+()\d][\d\s()\-.]{6,}$/

type Payload = {
  nameType?: unknown
  name?: unknown
  contactType?: unknown
  contact?: unknown
  product?: unknown
  botcheck?: unknown
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/* Google uygulama şifresi panelde "abcd efgh ijkl mnop" diye BOŞLUKLU gösterilir
   ve öyle yapıştırılınca kimlik doğrulama sessizce başarısız olur. Yalnızca bu
   kalıba birebir uyuyorsa boşlukları temizle — başka hiçbir parolaya dokunma
   (gerçek parolalar boşluk içerebilir, onları bozmak daha kötü olurdu). */
const normalizePass = (p: string) =>
  /^[a-z]{4}( [a-z]{4}){3}$/.test(p) ? p.replace(/ /g, '') : p

async function handleQuote(request: Request, env: Env): Promise<Response> {
  /* Yapılandırma eksikse SESSİZCE BAŞARILI DÖNME. Eski hâli demo modundaydı ve
     ziyaretçiye "talebiniz ulaştı" diyip hiçbir yere bir şey göndermiyordu. */
  const missing = (['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_TO', 'MAIL_FROM'] as const)
    .filter((k) => !env[k])
  if (missing.length) {
    console.error('[quote] eksik yapılandırma:', missing.join(', '))
    return json({ ok: false, error: 'config' }, 500)
  }
  /* Gmail/Workspace, gönderen adresi doğrulanan hesapla aynı değilse From'u
     sessizce yeniden yazar. Mail yine ulaşır ama sebebi anlaşılmaz görünür —
     log'a düş ki teşhis on saniye sürsün. */
  if (env.MAIL_FROM !== env.SMTP_USER) {
    console.warn(`[quote] MAIL_FROM (${env.MAIL_FROM}) ile SMTP_USER (${env.SMTP_USER}) farklı — Google gönderen adresini değiştirebilir`)
  }

  let body: Payload
  try {
    const raw = await request.text()
    if (raw.length > 8_000) return json({ ok: false, error: 'too_large' }, 413)
    body = JSON.parse(raw) as Payload
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400)
  }

  /* Bal küpü: gerçek kullanıcı bu alanı asla doldurmaz. Botlara başarı görüntüsü
     ver ki tekrar denemesinler, ama mail gönderme. */
  if (str(body.botcheck, 20)) return json({ ok: true })

  const isFirma = body.nameType === 'firma'
  const isEmail = body.contactType !== 'telefon'
  const name = str(body.name, 120)
  const contact = str(body.contact, 160)
  const product = str(body.product, 3000)

  /* Sunucu tarafı doğrulama — istemciye asla güvenme. */
  if (!name) return json({ ok: false, error: 'name' }, 400)
  if (!contact) return json({ ok: false, error: 'contact' }, 400)
  if (isEmail && !emailRe.test(contact)) return json({ ok: false, error: 'email' }, 400)
  if (!isEmail && !phoneRe.test(contact)) return json({ ok: false, error: 'phone' }, 400)

  const lines = [
    `${isFirma ? 'Firma Adı' : 'Ad Soyad'}: ${name}`,
    `${isEmail ? 'E-Posta' : 'Telefon'}: ${contact}`,
    '',
    'İlgilenilen ürün / mesaj:',
    product || '—',
    '',
    '—',
    `Gönderim: ${new Date().toISOString()}`,
    `Kaynak: ${new URL(request.url).origin}`,
  ]

  try {
    await sendMail(
      {
        host: env.SMTP_HOST,
        port: Number(env.SMTP_PORT ?? '465') || 465,
        user: env.SMTP_USER,
        pass: normalizePass(env.SMTP_PASS),
        from: env.MAIL_FROM,
        fromName: 'SAGU Web Sitesi',
        to: env.MAIL_TO,
      },
      {
        subject: `Yeni Teklif Talebi — ${name}`,
        text: lines.join('\n'),
        replyTo: isEmail ? contact : undefined,
      },
    )
    return json({ ok: true })
  } catch (err) {
    /* Ayrıntı log'a; ziyaretçiye sunucu iç bilgisi sızdırma. */
    console.error('[quote] gönderim hatası:', err instanceof Error ? err.message : err)
    return json({ ok: false, error: 'send' }, 502)
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/quote') {
      if (request.method !== 'POST') {
        return json({ ok: false, error: 'method' }, 405)
      }
      return handleQuote(request, env)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
