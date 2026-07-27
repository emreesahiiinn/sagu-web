/**
 * Cloudflare Workers için minimal SMTP gönderim (submission) istemcisi.
 *
 * Neden elle yazıldı: bağımlılık yok, tedarik zinciri riski yok, her satırı
 * okunabilir. Üçüncü taraf bir mail servisine (Web3Forms, Resend, Mailgun...)
 * ihtiyaç duymadan doğrudan KENDİ SMTP sunucuna bağlanır.
 *
 * Workers'ta ham TCP `cloudflare:sockets` ile açılır ve `startTls()` desteklenir,
 * yani hem örtük TLS (465) hem STARTTLS (587) çalışır. 25 numaralı port
 * Cloudflare tarafından kapalıdır — kullanma.
 */
import { connect } from 'cloudflare:sockets'

export type SmtpConfig = {
  host: string
  port: number
  user: string
  pass: string
  from: string      // zarf gönderici (bare adres)
  fromName?: string // görünen ad
  to: string
}

export type Mail = { subject: string; text: string; replyTo?: string }

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** UTF-8 güvenli base64 (btoa tek başına latin1 bekler). */
function b64(s: string): string {
  const bytes = encoder.encode(s)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** Başlıklarda Türkçe karakter için RFC 2047 encoded-word. */
const mimeWord = (s: string) => (/^[\x20-\x7E]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`)

/** Header injection koruması: CR/LF hiçbir başlık değerine giremez. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()

type Sock = {
  readable: ReadableStream<Uint8Array>
  writable: WritableStream<Uint8Array>
  close(): Promise<void>
  startTls(): Sock
}

/** Tek bir SMTP oturumu: satır tabanlı yaz/oku. */
class Session {
  private reader: ReadableStreamDefaultReader<Uint8Array>
  private writer: WritableStreamDefaultWriter<Uint8Array>
  private buf = ''

  constructor(socket: Sock) {
    this.reader = socket.readable.getReader()
    this.writer = socket.writable.getWriter()
  }

  /** startTls() öncesi kilitleri bırak — sonrasında yeni soket kullanılır. */
  detach() {
    try { this.reader.releaseLock() } catch { /* yoksay */ }
    try { this.writer.releaseLock() } catch { /* yoksay */ }
  }

  async write(data: string) {
    await this.writer.write(encoder.encode(data))
  }

  async cmd(line: string) {
    await this.write(line + '\r\n')
  }

  /**
   * Tam bir SMTP yanıtı oku. Yanıt çok satırlı olabilir:
   *   250-PIPELINING
   *   250 AUTH PLAIN LOGIN
   * Son satır, kodun ardından BOŞLUK gelenidir.
   */
  async reply(): Promise<{ code: number; text: string }> {
    const complete = /^(?:\d{3}-[^\r\n]*\r?\n)*(\d{3})(?: [^\r\n]*)?\r?\n/
    for (;;) {
      const m = this.buf.match(complete)
      if (m) {
        const raw = m[0]
        this.buf = this.buf.slice(raw.length)
        return { code: Number(m[1]), text: raw.trim() }
      }
      const { value, done } = await this.reader.read()
      if (done) throw new Error('SMTP: sunucu bağlantıyı beklenmedik şekilde kapattı')
      this.buf += decoder.decode(value, { stream: true })
    }
  }

  /** Yanıtı oku ve beklenen kodlardan biri değilse anlaşılır hata fırlat. */
  async expect(stage: string, ...codes: number[]) {
    const r = await this.reply()
    if (!codes.includes(r.code)) {
      throw new Error(`SMTP ${stage} başarısız (beklenen ${codes.join('/')}, gelen ${r.code}): ${r.text}`)
    }
    return r
  }
}

function buildMessage(cfg: SmtpConfig, mail: Mail): string {
  const from = cfg.fromName
    ? `${mimeWord(oneLine(cfg.fromName))} <${cfg.from}>`
    : cfg.from
  const headers = [
    `From: ${from}`,
    `To: <${cfg.to}>`,
    mail.replyTo ? `Reply-To: <${oneLine(mail.replyTo)}>` : null,
    `Subject: ${mimeWord(oneLine(mail.subject))}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${cfg.from.split('@')[1] ?? 'localhost'}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean).join('\r\n')

  /* Gövde base64 → satır uzunluğu ve nokta-kaçışı (dot-stuffing) sorunları
     tamamen ortadan kalkar; Türkçe karakterler de bozulmaz. */
  const body = b64(mail.text).replace(/(.{76})/g, '$1\r\n')
  return `${headers}\r\n\r\n${body}\r\n.\r\n`
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => {
        timer = setTimeout(() => rej(new Error(`SMTP: ${ms}ms içinde yanıt yok`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function sendMail(cfg: SmtpConfig, mail: Mail): Promise<void> {
  await withTimeout(deliver(cfg, mail), 20_000)
}

async function deliver(cfg: SmtpConfig, mail: Mail): Promise<void> {
  if (cfg.port === 25) {
    throw new Error('SMTP: Cloudflare 25 numaralı portu kapatır; 465 (TLS) veya 587 (STARTTLS) kullan')
  }
  const implicitTls = cfg.port === 465
  const ehloName = cfg.from.split('@')[1] || 'localhost'

  let socket = connect(
    { hostname: cfg.host, port: cfg.port },
    { secureTransport: implicitTls ? 'on' : 'starttls', allowHalfOpen: false },
  ) as unknown as Sock

  let s = new Session(socket)
  try {
    await s.expect('karşılama', 220)
    await s.cmd(`EHLO ${ehloName}`)
    let caps = (await s.expect('EHLO', 250)).text

    if (!implicitTls) {
      if (!/\bSTARTTLS\b/i.test(caps)) {
        throw new Error('SMTP: sunucu STARTTLS desteklemiyor — 465 portunu dene')
      }
      await s.cmd('STARTTLS')
      await s.expect('STARTTLS', 220)
      s.detach()
      socket = socket.startTls()          // şifreli yeni soket
      s = new Session(socket)
      await s.cmd(`EHLO ${ehloName}`)
      caps = (await s.expect('EHLO (TLS)', 250)).text
    }

    /* Kimlik doğrulama: PLAIN tercih edilir (tek tur), yoksa LOGIN. */
    if (/AUTH[^\r\n]*\bPLAIN\b/i.test(caps)) {
      await s.cmd(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass}`)}`)
      await s.expect('AUTH PLAIN', 235)
    } else if (/AUTH[^\r\n]*\bLOGIN\b/i.test(caps)) {
      await s.cmd('AUTH LOGIN')
      await s.expect('AUTH LOGIN', 334)
      await s.cmd(b64(cfg.user))
      await s.expect('AUTH kullanıcı', 334)
      await s.cmd(b64(cfg.pass))
      await s.expect('AUTH parola', 235)
    } else {
      throw new Error('SMTP: sunucu AUTH PLAIN/LOGIN sunmuyor')
    }

    await s.cmd(`MAIL FROM:<${cfg.from}>`)
    await s.expect('MAIL FROM', 250)
    await s.cmd(`RCPT TO:<${cfg.to}>`)
    await s.expect('RCPT TO', 250, 251)
    await s.cmd('DATA')
    await s.expect('DATA', 354)
    await s.write(buildMessage(cfg, mail))
    await s.expect('gönderim', 250)
    await s.cmd('QUIT')
  } finally {
    try { await socket.close() } catch { /* kapanış hatası önemsiz */ }
  }
}
