/**
 * SAGU wordmark — inline SVG.
 *
 * Neden font değil de SVG: 4 glif için 100-200KB'lık bir display font indirmek,
 * font yüklenene kadar yanlış fontla görünmek (FOUT) ve web'e gömme lisansı
 * derdi yok. Marka ile birebir aynı, her çözünürlükte net.
 *
 * Neden ayrı dosyaya değil de inline: harfleri tek tek hareket ettirebilmek için
 * gruplara CSS'ten erişmek gerekiyor (<img> içindeki SVG'ye erişilemez). Ayrıca
 * ek bir ağ isteği de olmuyor.
 *
 * Harfler kaynak SVG'de zaten ayrı path'lerdi; belge sırası U-S-A-G olduğu için
 * burada okuma sırasına dizildi. A'nın içindeki baklava (5. path) A grubuna ait.
 */
export default function Wordmark() {
  return (
    <svg
      className="logo"
      viewBox="0 0 144 92"
      fill="currentColor"
      role="img"
      aria-label="SAGU"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="ltr ltr-s">
        <path d="M33.2002 51.642L10.999 16.4096L16.6128 7.51895L25.1732 21.1089L33.2002 16.054L23.0903 0H10.1099L0 16.054L0.584242 16.4096L0 16.7652L23.7253 54.3853V72.5985L16.6128 83.8769L9.47489 72.5985V56.3667H0V75.3419L10.1099 91.3958H23.0903L33.2002 75.3419V51.642Z" />
      </g>
      <g className="ltr ltr-a">
        <path d="M36.9316 39.7539V91.3958H46.4065V54.7918L60.6316 77.3486V91.3704H70.1065V74.6052V35.0037V31.4983V16.0286L60.0219 0H47.067L36.957 16.054V31.5237V35.0291V39.7539H36.9316ZM46.4065 37.0105V35.0291V31.5237V18.7974L53.519 7.51895L60.6316 18.7974V31.5237V35.0291V59.5673L46.4065 37.0105Z" />
        <path d="M49.8125 20.403L53.5212 26.2962L57.2552 20.403L53.5212 14.5098L49.8125 20.403Z" />
      </g>
      <g className="ltr ltr-g">
        <path d="M107.067 39.7539V37.0105H97.5925L83.3675 59.5673V56.3667V18.7974L90.48 7.51895L97.6687 18.9244L99.0404 21.1089L107.067 16.054L96.9575 0H84.0025L73.8926 16.054V56.3667V59.9738V74.6306V75.3673L84.0025 91.4212H96.9575L107.067 75.3673V39.7793V39.7539ZM90.48 83.8769L84.8662 74.9609L97.5925 54.7664V72.5731L90.48 83.8515V83.8769Z" />
      </g>
      <g className="ltr ltr-u">
        <path d="M134.524 0V56.3667V59.8721V72.5985L127.412 83.8769L120.299 72.5985V59.8721V56.3667V0H110.799V56.3667V59.8721V75.3419L120.934 91.3958H133.889L143.999 75.3419V59.8721V56.3667V0H134.524Z" />
      </g>
    </svg>
  )
}
