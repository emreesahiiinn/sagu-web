# SAGU — Landing + Hızlı Teklif Formu

React 19 + Vite + TypeScript + framer-motion. Statik build → her yere deploy.

## Çalıştırma

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ üretir (yayına bunu at)
npm run preview  # build'i lokalde test et
```

## Mailleri almak için (tek adım — ~2 dk)

Form **Web3Forms** ile çalışır (ücretsiz, backend yok, aylık 250 gönderim).

1. https://web3forms.com → **`fcetinol@sagutasarim.com`** adresini gir, mailine gelen **Access Key**'i al.
2. Proje köküne `.env` dosyası oluştur (`.env.example`'ı kopyala):
   ```
   VITE_WEB3FORMS_KEY=buraya-gelen-key
   ```
   (Netlify/Cloudflare kullanıyorsan bu değişkeni panelin "Environment variables" kısmına da ekle.)

Bitti — her teklif talebi direkt mailine düşer, "Yanıtla" dediğinde müşterinin adresine gider.

> **Demo modu:** Key eklenmeden de form çalışır, başarı ekranını gösterir ama gerçek mail göndermez.

## Yayına alma (ücretsiz)

- **Netlify / Cloudflare Pages:** repoyu bağla ya da `dist/` klasörünü sürükle-bırak. Build komutu `npm run build`, yayın klasörü `dist`.
- **GitHub Pages:** `npm run build` sonrası `dist/` içeriğini yayınla (`base: './'` ayarlı, alt dizinde de çalışır).

## Özelleştirme

- **Logo:** `src/components/Hero.tsx` içindeki `.logo` bloğu şu an yazıyla "SAGU" gösteriyor. Markanın gerçek logosu (SVG/PNG) varsa oraya `<img>` koyarak birebir yapabiliriz.
- **Arka plan:** Gerçek dağ fotoğrafı (`src/assets/mountains.jpg`, ~2560px'e optimize) + üstünde feTurbulence ile üretilen gelişmiş katmanlı sis (`src/components/Scene.tsx`). Fotoğrafı değiştirmek için `mountains.jpg`'i değiştir; karartma/okunabilirlik `index.css`'teki `.scene-tint`'ten ayarlanır.
- **Etiketler / iletişim:** `src/data.ts` içinden düzenlenir.
