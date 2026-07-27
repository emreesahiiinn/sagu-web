# SAGU — Landing + Hızlı Teklif Formu

React 19 + Vite + TypeScript. Animasyonlar ve arka plan efekti elle yazıldı — animasyon kütüphanesi yok.
Teklif formu **kendi SMTP sunucun** üzerinden mail atar; üçüncü taraf form servisi ya da API key yoktur.

## Çalıştırma

```bash
npm install
npm run dev          # http://localhost:5173 — site (HMR)
npm run dev:worker   # http://localhost:8788 — API (/api/quote)
npm run build        # tsc + worker typecheck + dist/
npm run deploy       # build + wrangler deploy
```

Formu **yerelde** denemek için ikisini aynı anda çalıştır: `npm run dev` içindeki `/api` istekleri
`npm run dev:worker`'a proxy'lenir (`vite.config.ts`).

## Mimari

Cloudflare'e **statik varlıklı Worker** olarak deploy edilir (`wrangler.jsonc`):

- `POST /api/quote` → `worker/index.ts` karşılar, doğrular, `worker/smtp.ts` ile mail atar
- diğer her istek → `dist/` içindeki statik dosyalar (`ASSETS` binding)

`worker/smtp.ts` bağımlılıksız, elle yazılmış minimal bir SMTP istemcisidir. Cloudflare Workers ham TCP
soketi (`cloudflare:sockets`) açabildiği ve `startTls()` desteklediği için doğrudan kendi mail sunucuna
bağlanır. **25 numaralı port Cloudflare'de kapalıdır** — 465 (örtük TLS, önerilir) ya da 587 (STARTTLS) kullan.

## Mailleri almak için (tek seferlik ayar)

Mail kutusu **Google Workspace**, site **Cloudflare**. Bunlar çakışmaz: Workspace yalnızca MX kayıtlarını
kullanır, site ise Worker üzerinden servis edilir. DNS Cloudflare'de kalabilir.

### 1. Google tarafı — Uygulama Şifresi

Google, SMTP'ye normal hesap parolasıyla bağlanmayı kabul etmiyor. Uygulama Şifresi gerekiyor, o da
**2 Adımlı Doğrulama** açık olmasını şart koşuyor:

1. `fcetinol@sagutasarim.com` ile Google Hesabı → **Güvenlik** → **2 Adımlı Doğrulama** → aç
2. Aynı sayfada **Uygulama şifreleri** → yeni üret
3. Çıkan 16 haneli kodu **boşluksuz** kaydet (panelde `abcd efgh ijkl mnop` diye gösterilir)

### 2. Cloudflare tarafı — secret'lar

Bunlar koda **girmez**, repoya **girmez**, tarayıcıya **gitmez**. Yalnızca Worker içinde okunur.

```bash
npx wrangler secret put SMTP_HOST     # smtp.gmail.com
npx wrangler secret put SMTP_PORT     # 465
npx wrangler secret put SMTP_USER     # fcetinol@sagutasarim.com
npx wrangler secret put SMTP_PASS     # 16 haneli uygulama şifresi
npx wrangler secret put MAIL_TO       # fcetinol@sagutasarim.com
npx wrangler secret put MAIL_FROM     # SMTP_USER ile AYNI olmalı
```

`MAIL_FROM` ile `SMTP_USER` farklı olursa Google gönderen adresini sessizce kendi hesabınla değiştirir.
Ziyaretçinin adresi zaten `From`'a değil `Reply-To`'ya konur — "Yanıtla" dediğinde doğrudan ona gider.

Yerel geliştirme için `.dev.vars.example` dosyasını `.dev.vars` olarak kopyalayıp doldur — `.gitignore`'da.

### Gönderim limiti

Google Workspace hesabı için günde ~2.000 mail. Bir teklif formu için fazlasıyla yeterli.

> Yapılandırma eksikse form **başarı ekranı göstermez**; hata verir ve ziyaretçiyi telefona yönlendirir.
> Sessizce "gönderildi" deyip hiçbir yere bir şey göndermez.

Gelen mailde "Yanıtla" dediğinde, ziyaretçi e-posta bıraktıysa doğrudan onun adresine gider (`Reply-To`).

## Spam koruması

Formda görünmez bir bal küpü alanı var; dolduğunda sunucu 200 döner (bot tekrar denemesin diye) ama mail
göndermez. Gövde 8 KB ile sınırlı, tüm alanlar sunucu tarafında yeniden doğrulanır.

## Özelleştirme

- **Logo:** `src/components/Hero.tsx` içindeki `.logo` bloğu şu an yazıyla "SAGU" gösteriyor. Markanın
  gerçek logosu (SVG/PNG) varsa oraya `<img>` konur.
- **Arka plan:** Dağ fotoğrafı (`src/assets/mountains.jpg`) + üstünde WebGL sis
  (`src/components/FogCanvas.tsx`). Fare hareketi bir hız alanına rüzgar üfler; sis taşınır, dağılır ve
  saniyeler içinde kenarlardan geri dolar. Ayar sabitleri dosyanın başındaki `T` bloğunda:
  `TH_HI` (sis miktarı — düşür = daha çok), `GAIN` (parlaklık), `DISP_TAU` (lif uzunluğu),
  `LCARVE` (savuruşun gücü). WebGL2 yoksa `FogCanvasFallback.tsx` (Canvas2D) otomatik devreye girer.
  Karartma/okunabilirlik `index.css`'teki `.scene-tint` ve `.vignette`'ten ayarlanır.
- **Etiketler / iletişim:** `src/data.ts`
