import { useEffect, useRef, useState } from 'react'
import FogCanvasFallback from './FogCanvasFallback'
import mountains from '../assets/mountains.jpg'

/**
 * ADVECTED MIST — rüzgarın gelip sisi dağıttığı his.
 *
 * Fikir: fare sadece TEK bir şeye dokunur — düşük çözünürlüklü, sıkıştırılamaz
 * (divergence-free) bir HIZ ALANI. O alan şunları taşır:
 *   (a) üç derinlik katmanının yoğunluğu,
 *   (b) bir "shear memory" (gerilme hafızası) kanalı,
 *   (c) her hava parçacığının biriken Lagrange yer değiştirmesi (flowmap).
 *
 * Görünen sis ASLA yoğunluk dokusu değildir: yatay katmanlı bir fBm'in, yer
 * değiştirme alanı ÜZERİNDEN örneklenmiş hâlidir; yoğunluk ise bir "erozyon
 * eşiği"ni sürer. Bu yüzden makaslanma gürültüyü fiziksel olarak lif lif yırtar,
 * incelen sis düzgünce sönmek yerine adacıklara ayrılır.
 *
 * Fare, gerçek imleç yolu boyunca momentum taşıyan "gust node"ları bırakır;
 * imleç dursa da bu node'lar üflemeye devam eder. Alan divergence-free'ye
 * yansıtıldığı için yönlü bir jet zorunlu olarak kendi kendini iten, ters yönde
 * dönen bir girdap çiftine sarılır — rüzgarın "geldiği" hissi buradan gelir.
 */

/* ══════════════════════════ 1. AYARLAR ═══════════════════════════════════════
   Tasarımcının eline alacağı her şey burada. Düz sayılar, türetme yok.        */
const T = {
  SIM_DIV: 8, SIM_MIN: 160, SIM_MAX: 256, DYE_MUL: 1.9,
  TARGET_PX: 6.4e5, RS_MIN: 0.42, RS_MAX: 0.62,
  JACOBI: 12, PRS_RETAIN: 0.82,

  AMB_RELAX: 0.32, VORT: 1.1, AMB_SPEED: 0.050, AMB_BIAS: 0.030,
  DIFF_RATE: 2.1, SHEAR_MIX: 1.35,
  RELAX_BASE: 0.05, RELAX_EDGE: 0.30, DENS_CLAMP: 1.35,
  /* DISP_TAU: yer değiştirmenin geri çekilme süresi. Denge |v|*tau'da oturur.
     Büyütmek daha uzun lifler ama daha çok "sakız" verir; küçültmek daha diri
     ama daha az yapı. Periyodik sıfırlama YOK — bu yüzden hiçbir zaman zıplamaz. */
  DISP_TAU: 2.2, DISP_CLAMP: 0.50,
  DRIFT: 0.0045,                 // sisin hâkim rüzgarla çok yavaş kayması
  SHEAR_UP: 0.26, SHEAR_DOWN: 1.10,

  LVEL: [1.00, 0.58, 0.30], LRELAX: [1.00, 0.66, 0.38],
  LCARVE: [0.62, 0.44, 0.26], LDISP: [1.00, 0.60, 0.30],
  LNSX: [1.00, 1.30, 1.65], LNSY: [0.46, 0.72, 1.05],
  LBAND: [0.16, 0.22, 0.30], LW: [0.24, 0.34, 0.42],

  NOISE_BASE: 1.35, OCT: [0.38, 1.05, 2.60],
  /* İki eşiğin İŞİ FARKLI — "daha çok sis" isterken ikisini birden düşürmek hata:
       TH_HI = SEYREK bölgedeki eşik. Düşürmek kapsama ekler. "Daha çok sis" budur.
       TH_LO = YOĞUN bölgedeki eşik. Düşürmek yapıyı ÖLDÜRÜR: dipte gürültünün
               tamamı eşiği geçer, band() her yerde 1 olur, alt yarı düz beyaz
               bir levhaya döner. 0.20 denendi, ölçüldü, alt %40 tek parça oldu.
     Yoğunluğun tepesi zaten yumuşak-diz tavanına dayandığından parlaklık orada
     zaten doymuş; kazanılacak yer seyrek bölge.

     Not: iki-faz çapraz geçişi kaldırılınca gürültü tek örneklemeye düştü ve
     varyansı yükseldi (karışım onu ortalamaya çekiyordu). Aynı eşikler artık
     yoğun bölgede daha az doluluk veriyor — eşikler buna göre yeniden ayarlandı. */
  TH_HI: 0.62, TH_LO: 0.26,
  WARP_AMT: 0.34, WARP_SCALE: 0.21,
  STREAK_K: 0.62, DIVVIS_K: 26.0, DIVVIS_TAU: 0.16,
  GAIN: 1.50, SOFT_K: 0.34, SOFT_A: 0.47,
  LEGIB: 0.58, VMASK0: 0.10, VMASK1: 0.42, POOL_W: 0.45,

  MAX_NODES: 10,
  SPAWN_STEP: 0.09, NODE_R0: 0.105, NODE_RGROW: 0.075, NODE_RCAP: 0.30,
  NODE_DRAG: 1.10, NODE_STR: 1.35, V_INHERIT: 0.62,
  INJ_TARGET: 0.55, INJ_RATE: 0.55, INJ_VERT: 0.55,
  ELONG_MAX: 3.6, ELONG_REF: 0.85,
  P_ATTACK: 0.28, P_RELEASE: 0.055,
  /* İki kapı da aynı felsefeyi paylaşmalı: eşiğin altında HİÇBİR ŞEY olmaz.
     GATE_V0 0.05'te bırakılırsa oyma kapalıyken bile hava enjeksiyonu yarı güçle
     çalışır ve sisi taşıyıp yolda %36 inceltir — yani "sis imlecimi takip ediyor".
     Ölçüldü: 0.16 h/s'de yerel etki -%36 → 0.13/0.52 ile -%4'e indi, hızlı
     savuruşun gücü aynen korunurken. */
  GATE_V0: 0.13, GATE_V1: 0.52, GATE_C0: 0.18, GATE_C1: 0.95,
  WHIP_DROP: 0.45, WHIP_MIN: 0.55, WHIP_STR: 1.35, WHIP_V: 1.25,
  IDLE_AFTER: 2.2, FPS_CAP_MS: 15.6,
}
/* Bir node treninin ~4x örtüşmesini götürür → toplam gust otoritesi SPAWN_STEP'ten
   bağımsız kalır. HESAPLANIR, asla iki kez yazılmaz. */
const NODE_NORM = T.SPAWN_STEP / (2 * T.NODE_R0) // 0.4286

const sstep = (a: number, b: number, x: number) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u)
}
/* GLSL float biçimleyici: "1.0" garantiler, asla geçersiz int literali "1" üretmez.
   (GLSL ES ikili operatörlerde örtük int→float dönüşümü YAPMAZ; `v * 1` derlenmez.) */
const F = (x: number) => { const s = String(x); return /[.e]/.test(s) ? s : s + '.0' }
const V3 = (a: number[]) => `vec3(${F(a[0])},${F(a[1])},${F(a[2])})`

/* ══════════════════════════ 2. SHADER'LAR ════════════════════════════════════ */

const VERT = `#version 300 es
void main(){
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`

/* KOORDİNAT KURALI: her pass `gl_FragCoord.xy / uRes` kullanır — GL kuralı, y=0 ALTTA.
   Tüm alan dokuları bu uv ile adreslenir; yazma ve okuma kendi içinde tutarlı, hiçbir
   pass'ta dikey flip olmaz. "Ekranda yukarı/aşağı" anlamlı olduğunda yerel olarak
   `float sy = 1.0 - uv.y;` türetilir (0 = ÜST). */
const HEAD = `#version 300 es
precision highp float;
precision highp sampler2D;
out vec4 fragColor;
uniform vec2 uRes;
#define ENC_V(v) vec4((v), 0.0, 1.0)
#define DEC_V(t) ((t).xy)
#define ENC_D(d) (d)
#define DEC_D(t) (t)
#define ENC_P(p) (p)
#define DEC_P(t) (t)
float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
`

const DEFS = `
const int   NMAX       = ${T.MAX_NODES};
const float NODE_NORM  = ${F(NODE_NORM)};
const float INJ_TARGET = ${F(T.INJ_TARGET)};
const float INJ_RATE   = ${F(T.INJ_RATE)};
const float INJ_VERT   = ${F(T.INJ_VERT)};
const float AMB_RELAX  = ${F(T.AMB_RELAX)};
const float VORT       = ${F(T.VORT)};
const float AMB_SPEED  = ${F(T.AMB_SPEED)};
const float AMB_BIAS   = ${F(T.AMB_BIAS)};
const float DIFF_RATE  = ${F(T.DIFF_RATE)};
const float SHEAR_MIX  = ${F(T.SHEAR_MIX)};
const float RELAX_BASE = ${F(T.RELAX_BASE)};
const float RELAX_EDGE = ${F(T.RELAX_EDGE)};
const float DENS_CLAMP = ${F(T.DENS_CLAMP)};
const float DISP_CLAMP = ${F(T.DISP_CLAMP)};
const float SHEAR_UP   = ${F(T.SHEAR_UP)};
const float SHEAR_DOWN = ${F(T.SHEAR_DOWN)};
const float POOL_W     = ${F(T.POOL_W)};
const vec3  LVEL       = ${V3(T.LVEL)};
const vec3  LRELAX     = ${V3(T.LRELAX)};
const vec3  LCARVE     = ${V3(T.LCARVE)};
uniform vec2 uAspect;                    // (W/H, 1.0)
uniform vec4 uNA[NMAX];                  // p.xy, v.xy      (uv, uv/s)
uniform vec4 uNB[NMAX];                  // R, elong, strVel, strCarve
uniform int  uNN;

/* Node'un KENDİ çerçevesinde eliptik gauss → temizlenen bölge daha doğduğu anda
   hareket yönünde uzamış olur. Mesafeler ekran-yüksekliği biriminde. */
float nodeK(vec2 uv, int i){
  vec2 p = uNA[i].xy, v = uNA[i].zw;
  float R = uNB[i].x, el = uNB[i].y;
  vec2 rel = (uv - p) * uAspect;
  float sp = length(v * uAspect);
  vec2 dir = sp > 1e-5 ? (v * uAspect) / sp : vec2(1.0, 0.0);
  vec2 loc = vec2(dot(rel, dir), dot(rel, vec2(-dir.y, dir.x)));
  loc.x /= max(el, 1.0);
  return exp(-dot(loc, loc) / (R * R) * 2.2);
}
`

/* ---- PASS 1: hızı taşı, ORTAMA gevşet, vorticity confinement, node enjeksiyonu -- */
const F_VEL = HEAD + DEFS + `
uniform sampler2D uVel, uNoise;
uniform float uDt, uTime;

float psi(vec2 p){
  float a = texture(uNoise, p * 0.42 + vec2( uTime * 0.0060, -uTime * 0.0033)).a;
  float b = texture(uNoise, p * 1.05 + vec2(-uTime * 0.0110,  uTime * 0.0072)).r;
  return a + 0.45 * b;
}
/* skaler potansiyelin curl'ü => yapı gereği divergence-free => projeksiyon-güvenli */
vec2 ambient(vec2 uv, float sy){
  vec2 e = vec2(0.0035) / uAspect;
  float dx = psi(uv + vec2(e.x, 0.0)) - psi(uv - vec2(e.x, 0.0));
  float dy = psi(uv + vec2(0.0, e.y)) - psi(uv - vec2(0.0, e.y));
  vec2 c = clamp(vec2(dy / (2.0 * e.y), -dx / (2.0 * e.x)), vec2(-3.0), vec2(3.0)) / 3.0;
  float amp = mix(1.0, 0.42, smoothstep(0.62, 1.0, sy));   // sis alçakta birikir
  vec2 v = c * (AMB_SPEED / uAspect) * amp;
  v.x += (AMB_BIAS / uAspect.x) * amp;                     // vadi rüzgarı
  v.y += sin(uv.x * 3.1 + uTime * 0.08) * 0.0060;
  return v;
}
float curlAt(sampler2D S, vec2 uv, vec2 tx){
  float l = DEC_V(texture(S, uv - vec2(tx.x, 0.0))).y;
  float r = DEC_V(texture(S, uv + vec2(tx.x, 0.0))).y;
  float b = DEC_V(texture(S, uv - vec2(0.0, tx.y))).x;
  float t = DEC_V(texture(S, uv + vec2(0.0, tx.y))).x;
  return 0.5 * ((r - l) - (t - b));                        // dv/dx - du/dy
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 tx = 1.0 / uRes;
  float sy = 1.0 - uv.y;

  vec2 v0 = DEC_V(texture(uVel, uv));
  vec2 v  = DEC_V(texture(uVel, uv - v0 * uDt));           // semi-Lagrange (koşulsuz kararlı)

  /* MOMENTUM: sıfıra değil, HÂKİM RÜZGARA gevşe. Yarı ömür 2.17s.
     Gust böylece durgunluğa değil, esintinin içine ölür. */
  v += (ambient(uv, sy) - v) * (1.0 - exp(-AMB_RELAX * uDt));

  /* Vorticity confinement — 240x135'te sayısal sönümleme gust'ın girdap çiftini
     1 saniyede öldürürdü. İşaret koordinat kuralına bağlı olan TEK terim budur. */
  float w  = curlAt(uVel, uv, tx);
  float gx = abs(curlAt(uVel, uv + vec2(tx.x, 0.0), tx)) - abs(curlAt(uVel, uv - vec2(tx.x, 0.0), tx));
  float gy = abs(curlAt(uVel, uv + vec2(0.0, tx.y), tx)) - abs(curlAt(uVel, uv - vec2(0.0, tx.y), tx));
  vec2 N = vec2(gx, gy) / (length(vec2(gx, gy)) + 1e-5);
  v += vec2(N.y, -N.x) * w * VORT * tx.y * uDt * 60.0;

  /* NODE ENJEKSİYONU: ağırlıklı hedef hıza doğru DOYUMLU harman.
     Asla biriken kuvvet değil — hızlı bir karalamada node çekirdekleri üst üste
     bindiğinde biriken kuvvet patlar ve alan kararsızlaşır. */
  vec2 tv = vec2(0.0); float tw = 0.0;
  for (int i = 0; i < NMAX; i++) {
    if (i >= uNN) break;
    float k = nodeK(uv, i);
    if (k < 0.004) continue;
    vec2 nv = uNA[i].zw * INJ_TARGET * uNB[i].z;
    nv.y *= INJ_VERT;                                      // hava yatay hareket eder
    tv += nv * k; tw += k;
  }
  if (tw > 1e-4) {
    vec2 target = tv / tw;
    float rate = min(0.85, tw * NODE_NORM * INJ_RATE * uDt * 60.0);
    v = mix(v, target, rate);
  }
  fragColor = ENC_V(clamp(v, vec2(-1.2), vec2(1.2)));
}`

/* ---- PASS 2: divergence + tau=0.16s alçak geçiren (bow-wave parlaklık ipucu) --- */
const F_DIV = HEAD + `
uniform sampler2D uVel, uDivPrev;
uniform float uDt;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes, tx = 1.0 / uRes;
  float l = texture(uVel, uv - vec2(tx.x, 0.0)).x;
  float r = texture(uVel, uv + vec2(tx.x, 0.0)).x;
  float b = texture(uVel, uv - vec2(0.0, tx.y)).y;
  float t = texture(uVel, uv + vec2(0.0, tx.y)).y;
  float dv = 0.5 * ((r - l) + (t - b));
  float prev = texture(uDivPrev, uv).y;
  float lp = prev + (dv - prev) * (1.0 - exp(-uDt / ${F(T.DIVVIS_TAU)}));
  fragColor = vec4(dv, lp, 0.0, 1.0);
}`

/* ---- PASS 3: Jacobi, sıcak başlatmalı (uPrsScale sadece 0. iterasyonda 0.82) --- */
const F_JAC = HEAD + `
uniform sampler2D uPrs, uDiv;
uniform float uPrsScale;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes, tx = 1.0 / uRes;
  float l = texture(uPrs, uv - vec2(tx.x, 0.0)).x;
  float r = texture(uPrs, uv + vec2(tx.x, 0.0)).x;
  float b = texture(uPrs, uv - vec2(0.0, tx.y)).x;
  float t = texture(uPrs, uv + vec2(0.0, tx.y)).x;
  float p = (uPrsScale * (l + r + b + t) - texture(uDiv, uv).x) * 0.25;
  fragColor = vec4(p, 0.0, 0.0, 1.0);
}`

/* ---- PASS 4: gradyan çıkarma ------------------------------------------------- */
const F_GRAD = HEAD + `
uniform sampler2D uPrs, uVel;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes, tx = 1.0 / uRes;
  float l = texture(uPrs, uv - vec2(tx.x, 0.0)).x;
  float r = texture(uPrs, uv + vec2(tx.x, 0.0)).x;
  float b = texture(uPrs, uv - vec2(0.0, tx.y)).x;
  float t = texture(uPrs, uv + vec2(0.0, tx.y)).x;
  fragColor = ENC_V(DEC_V(texture(uVel, uv)) - vec2(r - l, t - b));
}`

/* ---- PASS 5: YOĞUNLUK — 3 derinlik kanalı + shear memory + kenar-öncelikli dolum */
const F_DENS = HEAD + DEFS + `
uniform sampler2D uDens, uVel, uNoise, uPool;
uniform float uDt, uTime, uSeed;
vec4 tent(vec2 uv, vec2 tx){
  vec2 o = tx * 0.92;
  return 0.25 * ( texture(uDens, uv + vec2( o.x,  o.y))
                + texture(uDens, uv + vec2(-o.x,  o.y))
                + texture(uDens, uv + vec2( o.x, -o.y))
                + texture(uDens, uv + vec2(-o.x, -o.y)) );
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes, tx = 1.0 / uRes;
  float sy = 1.0 - uv.y;
  vec2 v = DEC_V(texture(uVel, uv));

  /* DERİNLİK = üç farklı hızda geri-izleme → uzak sis gözle görülür şekilde geriden gelir. */
  vec4 n0 = DEC_D(texture(uDens, uv - v * LVEL.x * uDt));
  vec3 d;
  d.r = n0.r;
  d.g = DEC_D(texture(uDens, uv - v * LVEL.y * uDt)).g;
  d.b = DEC_D(texture(uDens, uv - v * LVEL.z * uDt)).b;
  float sm = n0.a;                                    // shear memory yakın katmana biner

  vec4 nb4 = DEC_D(tent(uv, tx));
  vec3 nb  = nb4.rgb;

  /* Türbülanslı karışım: sis tam olarak rüzgarın hızlı olduğu yerde kontrast kaybeder. */
  float sp = length(v * uAspect);
  float k  = 1.0 - exp(-(DIFF_RATE + clamp(sp * SHEAR_MIX, 0.0, 1.6)) * uDt);
  d = mix(d, nb, k);

  /* Ortam hedefi: dikey profil x yavaş fbm x ARAZİ BİRİKİMİ x 75s nefes.
     Profil yukarı genişletildi (0.26->0.16) → sis ekranda daha yükseğe tırmanır.
     Logo hâlâ güvende: okunabilirlik elipsi ve VMASK kompozitte ayrıca koruyor. */
  float vp   = smoothstep(0.16, 0.70, sy);
  float slow = texture(uNoise, uv * 0.33 + vec2(uTime * 0.0035, -uTime * 0.0021)).a;
  float pool = smoothstep(0.34, 0.06, texture(uPool, uv).g);
  float brth = 0.86 + 0.14 * sin(uTime * 0.0838);
  float target = clamp(vp * (0.52 + 0.48 * slow) * (0.72 + POOL_W * pool) * brth, 0.0, 1.05);

  /* TOHUMLAMA (açılışta bir kez): alanı doğrudan ortam hedefine yaz.
     Kenar-öncelikli dolum, KANALI doldurmak için ayarlandı — komşuları yoğun
     olduğunda hızlıdır. Bomboş bir alandan başlarken ise elde yalnızca
     RELAX_BASE=0.05/s kalır, yani tau~20s: sayfa ilk 15 saniye çıplak açılırdı.
     Sabitleri bozmadan doğru çözüm, soğuk başlangıcı hiç yaşamamaktır. */
  if (uSeed > 0.5) { fragColor = ENC_D(vec4(vec3(target), 0.0)); return; }

  /* KENAR-ÖNCELİKLİ DOLUM: yoğun komşusu olan hızlı iyileşir, boş çekirdek yavaş.
     Kanal böylece İÇERİ DOĞRU kapanır. Duvarlar tau~3.8s, merkez tau~10.5s. */
  vec3 rate = (RELAX_BASE + RELAX_EDGE * nb) * LRELAX;
  d += (vec3(target) - d) * (1.0 - exp(-rate * uDt));

  /* Anizotropik oyma — inceltir, asla boşaltmaz. */
  float G = 0.0;
  for (int i = 0; i < NMAX; i++) { if (i >= uNN) break; G += nodeK(uv, i) * uNB[i].w; }
  G = min(1.0, G * NODE_NORM);
  d *= 1.0 - LCARVE * G;

  /* SHEAR MEMORY: gerilmek 0.26s, gevşemek 1.10s. Yönlü çizgilenmeyi bir hız
     okumasından "hava durumu"na çeviren şey bu asimetri. */
  float sT = clamp(sp * SHEAR_MIX, 0.0, 1.0);
  sm += (sT - sm) * (1.0 - exp(-uDt / (sT > sm ? SHEAR_UP : SHEAR_DOWN)));

  fragColor = ENC_D(vec4(clamp(d, vec3(0.0), vec3(DENS_CLAMP)), clamp(sm, 0.0, 1.0)));
}`

/* ---- PASS 6: YER DEĞİŞTİRME — malzeme-koordinat alanı (lifler buradan doğar) ---
   TEK alan, SÜREKLİ geri çekilme. Eskiden burada iki faz vardı: her biri 3 saniyede
   bir sıfırlanıp aralarında çapraz geçiş yapılıyordu. Ölçüldü: sarma anındaki tek
   karede küresel değişim 10.57, tipik kare 0.099 — yani 107 katı bir kopukluk, her
   6 saniyede bir, tüm ekranda aynı anda. "Sisler yenileniyor" denen şey buydu.

   Yerine elastik model: alan akışla birlikte birikir ve aynı anda tau ile sıfıra
   doğru çekilir. Denge noktası |v|*tau'da oturur, yani sınırlama kendiliğinden
   gelir — sıfırlamaya, faza, çapraz geçişe gerek kalmaz. Periyodik hiçbir şey yok.
   Yan fayda: kompozit katman başına yarı yarıya az doku okur. */
const F_DISP = HEAD + `
const float DISP_CLAMP = ${F(T.DISP_CLAMP)};
const float DISP_TAU   = ${F(T.DISP_TAU)};
uniform sampler2D uDisp, uVel;
uniform float uDt;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 v = DEC_V(texture(uVel, uv));
  vec2 D = DEC_P(texture(uDisp, uv - v * uDt)).xy;   // offset alanı da kendisi taşınır
  D -= v * uDt;                                       // eksi: desen sisle BİRLİKTE gider
  D *= exp(-uDt / DISP_TAU);                          // sürekli, pürüzsüz geri çekilme
  /* Yumuşak doyum: sert clamp bir kırık üretir, tanh asimptotik yaklaşır. */
  float L = length(D);
  if (L > 1e-6) D *= DISP_CLAMP * tanh(L / DISP_CLAMP) / L;
  fragColor = ENC_P(vec4(D, 0.0, 0.0));
}`

/* ---- PASS 7: KOMPOZİT -------------------------------------------------------- */
const F_COMP = HEAD + `
uniform sampler2D uDens, uDisp, uVel, uDiv, uNoise;
uniform vec2  uAspect;
uniform vec3  uBand;
uniform float uTime, uGain, uStreak, uDebugNoise;

const mat2 R1 = mat2( 0.7986, 0.6018, -0.6018, 0.7986);   // +37 derece
const mat2 R2 = mat2( 0.3256,-0.9455,  0.9455, 0.3256);   // -71 derece
const vec3 LNSX  = ${V3(T.LNSX)};
const vec3 LNSY  = ${V3(T.LNSY)};
const vec3 LDISP = ${V3(T.LDISP)};
const vec3 LW    = ${V3(T.LW)};
const float O0 = ${F(T.OCT[0])}, O1 = ${F(T.OCT[1])}, O2 = ${F(T.OCT[2])};

float fog3(vec2 q){
  return texture(uNoise, q * O0      + vec2(0.13, 0.07)).r * 0.50
       + texture(uNoise, R1 * q * O1 + vec2(0.61, 0.29)).g * 0.32
       + texture(uNoise, R2 * q * O2 + vec2(0.37, 0.83)).b * 0.18;
}
float fog2(vec2 q){
  float n = texture(uNoise, q * O0      + vec2(0.13, 0.07)).r * 0.61
          + texture(uNoise, R1 * q * O1 + vec2(0.61, 0.29)).g * 0.39;
  return 0.5 + (n - 0.5) * 0.855;                  // fog3 ile sigma eşitleme
}
/* EROZYON: yoğunluk düştükçe eşik yükselir ve yalnızca en yüksek gürültü tepeleri
   hayatta kalır → incelen sis düzgünce sönmek yerine ADACIKLARA ayrılır. */
float band(float d, float n, float b){
  float th = mix(${F(T.TH_HI)}, ${F(T.TH_LO)}, clamp(d, 0.0, 1.15) / 1.15);
  return smoothstep(th, th + b, n);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float sy = 1.0 - uv.y;

  vec4  DN = DEC_D(texture(uDens, uv));
  vec3  d  = DN.rgb;
  float sh = DN.a;
  vec2  D  = DEC_P(texture(uDisp, uv)).xy;
  vec2  v  = DEC_V(texture(uVel,  uv));
  float dv = texture(uDiv, uv).y;

  /* ANİZOTROPİK ÇİZGİLENME, sıfır ek doku okuma: biriken offset'i AKIŞ BOYUNCA
     güçlendir. Anlık |v| ile değil, SHEAR MEMORY ile kapılanır. */
  float L = length(v * uAspect);
  vec2  dir = L > 1e-5 ? normalize(v * uAspect) : vec2(1.0, 0.0);
  float s = sh * ${F(T.STREAK_K)} * uStreak;
  vec2 dA = D + dir * dot(D, dir) * s;

  /* Gürültünün "ev konumu" ekrana sabit kalmasın diye hâkim rüzgar yönünde çok
     yavaş bir kayma. Periyodu yok — sonsuz, düzgün, tekrarsız. */
  vec2 base = uv * uAspect * ${F(T.NOISE_BASE)} + vec2(uTime * ${F(T.DRIFT)}, 0.0);
  vec2 d2b  = uAspect * ${F(T.NOISE_BASE)};             // uv offset -> base uzayı
  vec4 wv   = texture(uNoise, (base + dA * d2b) * ${F(T.WARP_SCALE)} + vec2(0.0, uTime * 0.004));
  vec2 warp = (wv.ag - 0.5) * ${F(T.WARP_AMT)};

  if (uDebugNoise > 0.5) { fragColor = vec4(vec3(fog3(base)), 1.0); return; }

  /* Gust'ın önünde sıkışma dudağı / arkasında seyrelmiş oyuk. */
  float comp = clamp(1.0 - dv * ${F(T.DIVVIS_K)}, 0.72, 1.34);

  float a = 0.0;
  /* Tek faz → katman başına yarı yarıya az doku okuma (12 fetch yerine 7). */
  /* YAKIN: 3 oktav, tam yer değiştirme, en keskin bant ----------------------- */
  { vec2 sc = vec2(LNSX.x, LNSY.x);
    vec2 q  = base * sc + warp + vec2(0.00, 0.00);
    a += band(d.r, fog3(q + dA * d2b * sc * LDISP.x), uBand.x) * LW.x; }
  /* ORTA: 2 oktav ------------------------------------------------------------ */
  { vec2 sc = vec2(LNSX.y, LNSY.y);
    vec2 q  = base * sc + warp + vec2(3.17, 1.41);
    a += band(d.g, fog2(q + dA * d2b * sc * LDISP.y), uBand.y) * LW.y; }
  /* UZAK: 2 oktav, en yumuşak bant, en çok ağırlık --------------------------- */
  { vec2 sc = vec2(LNSX.z, LNSY.z);
    vec2 q  = base * sc + warp + vec2(7.73, 5.09);
    a += band(d.b, fog2(q + dA * d2b * sc * LDISP.z), uBand.z) * LW.z; }

  /* OKUNABİLİRLİK — her tier'da, her yolda aktif; hiçbir uyarlama kapatamaz. */
  vec2  lp    = (vec2(uv.x, sy) - vec2(0.50, 0.50)) / vec2(0.42, 0.30);
  float legib = 1.0 - ${F(T.LEGIB)} * (1.0 - smoothstep(0.45, 1.15, length(lp)));
  a *= legib * smoothstep(${F(T.VMASK0)}, ${F(T.VMASK1)}, sy) * comp * uGain;
  a += (hash(gl_FragCoord.xy) - 0.5) * 0.006;          // 8-bit bantlanmayı kır

  /* Yumuşak diz: 0.34 altında birebir, asimptot 0.46. Görünür kırpma platosu yok. */
  float K = ${F(T.SOFT_K)}, A0 = ${F(T.SOFT_A)};
  a = a < K ? a : K + (A0 - K) * (1.0 - exp(-(a - K) / (A0 - K)));
  a = clamp(a, 0.0, A0);

  /* Atmosferik perspektif; aralığın tepesi tam olarak rgba(226,233,245). */
  vec3 col = mix(vec3(0.720, 0.780, 0.900), vec3(0.886, 0.914, 0.961), smoothstep(0.0, 0.42, a));
  fragColor = vec4(col * a, 1.0);                      // opak canvas + screen blend
}`

/* ---- BAKE: RGBA'ya paketlenmiş 4 sorunsuz tekrarlayan fBm, 2 colorMask çizimi -- */
const F_BAKE = HEAD + `
uniform int uPass;
float h21(vec2 p, float s){
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973) + s);
  q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z);
}
float vn(vec2 x, float per, float s){                 // tekrarlayan value noise
  vec2 i = floor(x), f = fract(x);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = h21(mod(i, per), s),                b = h21(mod(i + vec2(1,0), per), s);
  float c = h21(mod(i + vec2(0,1), per), s),    d = h21(mod(i + vec2(1,1), per), s);
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);
}
/* Genlik-normalize => ortalama TAM OLARAK 0.5. Sonra BİLİNEN bir sigmaya genişletilir,
   böylece kompozitin erozyon eşiği tahmin değil, TÜREV olur. */
float fbm(vec2 uv, float bp, int oct, float gain, float s, float contrast){
  float v = 0.0, amp = 0.5, p = bp, n = 0.0;
  for (int i = 0; i < 8; i++) { if (i >= oct) break;
    v += amp * vn(uv * p, p, s + float(i) * 17.0); n += amp; amp *= gain; p *= 2.0; }
  return clamp(0.5 + (v / n - 0.5) * contrast, 0.0, 1.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  if (uPass == 0) fragColor = vec4(fbm(uv,  4.0, 5, 0.55,  1.7, 2.2),
                                   fbm(uv,  7.0, 4, 0.52,  5.3, 2.2), 0.0, 0.0);
  else            fragColor = vec4(0.0, 0.0,
                                   fbm(uv, 13.0, 3, 0.50,  9.1, 2.2),
                                   fbm(uv,  5.0, 2, 0.50, 13.7, 1.4));
}`

const F_COPY = HEAD + `
uniform sampler2D uSrc;
void main(){ fragColor = texture(uSrc, gl_FragCoord.xy / uRes); }`

/* ══════════════════════════ 3. GL ALTYAPISI ══════════════════════════════════ */

type FBO = { tex: WebGLTexture; fbo: WebGLFramebuffer; w: number; h: number }
type Dbl = { read: FBO; write: FBO; swap(): void }
type Prog = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> }

function makeProgram(gl: WebGL2RenderingContext, fs: string): Prog {
  const sh = (t: number, src: string) => {
    const s = gl.createShader(t)!
    gl.shaderSource(s, src); gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error('fog shader: ' + gl.getShaderInfoLog(s))
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT))
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS))
    throw new Error('fog link: ' + gl.getProgramInfoLog(p))
  const u: Record<string, WebGLUniformLocation | null> = {}
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i)!
    const nm = info.name.replace(/\[0\]$/, '')
    u[nm] = gl.getUniformLocation(p, info.name)
  }
  return { p, u }
}

function makeFBO(gl: WebGL2RenderingContext, w: number, h: number): FBO {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
  const fbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
    throw new Error('fog: incomplete FBO')
  gl.clearColor(0, 0, 0, 1); gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT)
  return { tex, fbo, w, h }
}
const dbl = (gl: WebGL2RenderingContext, w: number, h: number): Dbl => {
  const a = makeFBO(gl, w, h), b = makeFBO(gl, w, h)
  return { read: a, write: b, swap() { const s = this.read; this.read = this.write; this.write = s } }
}

/* HALF-FLOAT lineer filtreleme sondası. Bazı Mali/Adreno sürücüleri HALF_FLOAT
   örneklerken sessizce nearest'a düşer; bu da tüm semi-Lagrange taşımayı kare kare
   yapar. Kaynak doku RGBA16F OLMAK ZORUNDA — RGBA8 sondası her yerde geçer ve
   hiçbir şey test etmez. Sonda kendisi patlarsa şüpheden sanık yararlanır (true):
   görünür bir downgrade'e zorlamaktansa devam etmek yeğdir. */
function probeLinear(gl: WebGL2RenderingContext, copy: Prog, vao: WebGLVertexArrayObject): boolean {
  let src: WebGLTexture | null = null
  let dst: FBO | null = null
  try {
    src = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, src)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    // 2x2 yarım-float: sol sütun 0, sağ sütun 1
    const data = new Float32Array([0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 1])
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, 2, 2, 0, gl.RGBA, gl.FLOAT, data)
    dst = makeFBO(gl, 1, 1)
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, 1, 1)
    gl.useProgram(copy.p); gl.bindVertexArray(vao)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src)
    if (copy.u.uSrc) gl.uniform1i(copy.u.uSrc, 0)
    if (copy.u.uRes) gl.uniform2f(copy.u.uRes, 1, 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    const out = new Float32Array(4)
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, out)
    return out[0] > 0.12 && out[0] < 0.88          // harman olmalı, 0 ya da 1 değil
  } catch {
    return true
  } finally {
    if (src) gl.deleteTexture(src)
    if (dst) { gl.deleteTexture(dst.tex); gl.deleteFramebuffer(dst.fbo) }
  }
}

/* ══════════════════════════ 4. ARAZİ BİRİKİM DOKUSU ══════════════════════════ */
/* mountains.jpg'nin 128x72 parlaklık mip'i; .photo ile AYNI cover + "center 40%" +
   scale(1.07) matematiğiyle → sis gerçek vadilerde birikir. */
function buildPool(gl: WebGL2RenderingContext, W: number, H: number): WebGLTexture {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const flat = new Uint8Array(4).fill(128); flat[3] = 255
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, flat)
  const img = new Image()
  img.decoding = 'async'
  img.onload = () => {
    try {
      const PW = 128, PH = 72
      const c = document.createElement('canvas'); c.width = PW; c.height = PH
      const x = c.getContext('2d'); if (!x) return
      const k = PW / W                                     // viewport px -> pool px
      const cover = Math.max(W / img.width, H / img.height) * 1.07
      const dw = img.width * cover * k, dh = img.height * cover * k
      const dx = (PW - dw) * 0.5, dy = (PH - dh) * 0.40    // background-position: center 40%
      x.fillStyle = '#202430'; x.fillRect(0, 0, PW, PH)
      x.drawImage(img, dx, dy, dw, dh)
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)         // canvas üstü -> ekran üstü
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, c)
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    } catch { /* düz 0.5 dokusu kalsın */ }
  }
  img.src = mountains
  return tex
}

/* ══════════════════════════ 5. RÜZGAR: node, imleç, hava ═════════════════════ */

type Node = { x: number; y: number; vx: number; vy: number; age: number; str: number; carve: number }

class Wind {
  nodes: Node[] = []
  NA = new Float32Array(T.MAX_NODES * 4)
  NB = new Float32Array(T.MAX_NODES * 4)
  queue: number[] = []
  px = 0.5; py = 0.4; svx = 0; svy = 0
  seen = false; travel = 0; prevRaw = 0; lastMove = -99
  ghost: { x: number; y: number; vx: number; vy: number; left: number; str: number } | null = null
  gTravel = 0; nextGust = 5 + Math.random() * 5; nextEddy = 4 + Math.random() * 4

  reset() { this.seen = false; this.queue.length = 0; this.travel = 0 }

  push(x: number, y: number) {
    this.queue.push(x, y)
    if (this.queue.length > 240) this.queue.splice(0, 2)
  }

  spawn(x: number, y: number, vx: number, vy: number, str: number, carve: number) {
    if (this.nodes.length >= T.MAX_NODES) this.nodes.shift()
    this.nodes.push({ x, y, vx: vx * T.V_INHERIT, vy: vy * T.V_INHERIT, age: 0, str, carve })
  }

  /* Birleştirilmiş kuyruk üzerinde tek geçiş: node'ları GERÇEK yol boyunca bırak,
     sonra asimetrik EMA'yı güncelle. Güç, geçen karenin EMA'sını kullanır (16ms
     gecikme, görünmez). */
  step(dt: number, t: number, aspect: number, coarse: boolean, touchScale: number) {
    const spd0 = Math.hypot(this.svx * aspect, this.svy)
    const strV = sstep(T.GATE_V0, T.GATE_V1, spd0) * touchScale
    const strC = sstep(T.GATE_C0, T.GATE_C1, spd0) * touchScale
    let dx = 0, dy = 0

    const q = this.queue
    for (let i = 0; i + 1 < q.length; i += 2) {
      const x = q[i], y = q[i + 1]
      if (!this.seen) { this.px = x; this.py = y; this.seen = true; continue }
      const sx = x - this.px, sy = y - this.py
      dx += sx; dy += sy
      const segLen = Math.hypot(sx * aspect, sy)
      this.travel += segLen
      let guard = 4
      while (this.travel >= T.SPAWN_STEP && guard-- > 0 && strV > 0.02) {
        this.travel -= T.SPAWN_STEP
        const f = segLen > 1e-6 ? 1 - this.travel / segLen : 1
        this.spawn(this.px + sx * f, this.py + sy * f, this.svx, this.svy, strV, strC)
      }
      this.px = x; this.py = y
      this.lastMove = t
    }
    q.length = 0
    this.travel = Math.min(this.travel, T.SPAWN_STEP * 4)

    /* Ham hız: BİRİKEN delta / GERÇEK dt. Asla sabit 1/60 değil — 1000Hz'lik bir
       oyuncu faresi aksi hâlde ~16 kat hız bildirir. */
    const rx = dx / dt, ry = dy / dt
    const raw = Math.hypot(rx * aspect, ry)
    const cur = Math.hypot(this.svx * aspect, this.svy)
    const k = raw > cur ? T.P_ATTACK : T.P_RELEASE
    this.svx += (rx - this.svx) * k
    this.svy += (ry - this.svy) * k

    /* KAMÇI BIRAKMA: savuruşun sonundaki şaklama. HAM hız üzerinden yakalanır. */
    if (this.prevRaw > T.WHIP_MIN && raw < this.prevRaw * (1 - T.WHIP_DROP)) {
      this.spawn(this.px, this.py, this.svx * T.WHIP_V, this.svy * T.WHIP_V,
        Math.min(1.35, strV * T.WHIP_STR), Math.min(1.0, strC * T.WHIP_STR))
    }
    this.prevRaw = raw

    /* SAYFA KENDİ RÜZGARINI YAPAR — aynı node üreteci, hayalet imleç. */
    /* Masaüstünde bu bir ESİNTİ olmalı, olay değil: kullanıcı hiçbir şey yapmamışken
       ekranı baştan sona süpüren güçlü bir hamle "kendi kendine yenilendi" gibi
       okunuyor. Güç 0.55->0.34, süre 2.2->3.2s (daha yavaş geçiş), aralık 17-26 ->
       24-38s. Dokunmatikte güç korunur — orada rüzgarın BAŞKA kaynağı yok. */
    if (!this.ghost && t > this.nextGust && t - this.lastMove > 3.0) {
      const fromL = Math.random() < 0.62
      const dur = coarse ? 2.6 : 3.2
      this.ghost = {
        x: fromL ? -0.08 : 1.08, y: 0.14 + Math.random() * 0.44,
        vx: (fromL ? 1 : -1) * 0.9 / dur, vy: (Math.random() - 0.5) * 0.08,
        left: dur, str: (coarse ? 0.60 : 0.34) * (0.8 + Math.random() * 0.4),
      }
      this.nextGust = t + (coarse ? 11 + Math.random() * 6 : 24 + Math.random() * 14)
    }
    if (this.ghost) {
      const g = this.ghost
      const nx = g.x + g.vx * dt, ny = g.y + g.vy * dt
      this.gTravel += Math.hypot((nx - g.x) * aspect, ny - g.y)
      let guard = 4
      while (this.gTravel >= T.SPAWN_STEP && guard-- > 0) {
        this.gTravel -= T.SPAWN_STEP
        this.spawn(nx, ny, g.vx, g.vy, g.str, g.str * 0.85)
      }
      g.x = nx; g.y = ny; g.left -= dt
      if (g.left <= 0) this.ghost = null
    }
    if (t > this.nextEddy) {                        // ortam curl'ü, periyodikliği kırar
      this.nextEddy = t + 5.5 + Math.random() * 3.5
      const a = Math.random() * 6.283, ex = 0.1 + Math.random() * 0.8, ey = 0.1 + Math.random() * 0.5
      const ux = Math.cos(a) * 0.10, uy = Math.sin(a) * 0.10
      this.spawn(ex, ey, -uy, ux, 0.06, 0)
      this.spawn(ex + ux * 0.6, ey + uy * 0.6, uy, -ux, 0.06, 0)
    }

    /* Node entegrasyonu: momentum burada yaşar, hız alanının DIŞINDA. */
    const kd = Math.exp(-dt / T.NODE_DRAG), ks = Math.exp(-dt / T.NODE_STR)
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i]
      n.x += n.vx * dt; n.y += n.vy * dt; n.age += dt
      n.vx *= kd; n.vy *= kd; n.str *= ks; n.carve *= ks
      if (n.str < 0.03 || n.age > 3.2 || n.x < -0.5 || n.x > 1.5 || n.y < -0.5 || n.y > 1.5)
        this.nodes.splice(i, 1)
    }
    const nn = this.nodes.length
    for (let i = 0; i < nn; i++) {
      const n = this.nodes[i], o = i * 4
      const R = Math.min(T.NODE_RCAP, T.NODE_R0 + T.NODE_RGROW * n.age)
      const spread = T.NODE_R0 / R                  // açılırken 2D momentum korunumu
      const sp = Math.hypot(n.vx * aspect, n.vy)
      const el = 1 + Math.min(1, sp / T.ELONG_REF) * (T.ELONG_MAX - 1)
      this.NA[o] = n.x; this.NA[o + 1] = n.y; this.NA[o + 2] = n.vx; this.NA[o + 3] = n.vy
      this.NB[o] = R; this.NB[o + 1] = el; this.NB[o + 2] = n.str * spread
      this.NB[o + 3] = n.carve * spread
    }
    return nn
  }
  idle(t: number) {
    if (t - this.lastMove < T.IDLE_AFTER || this.ghost) return false
    for (const n of this.nodes) if (n.str > 0.06) return false
    return true
  }
}

/* ══════════════════════════ 6. INIT + ANA DÖNGÜ ══════════════════════════════ */

const TIERS = [
  { simDiv: 8, simMin: 160, simMax: 256, dye: 1.9, rs: 1.00, jac: 12, streak: 1 },  // T2
  { simDiv: 10, simMin: 144, simMax: 208, dye: 1.7, rs: 0.82, jac: 6, streak: 1 },  // T1
  { simDiv: 13, simMin: 128, simMax: 144, dye: 1.5, rs: 0.68, jac: 3, streak: 0 },  // T0
]

function initGL(canvas: HTMLCanvasElement, bail: () => void): (() => void) | null {
  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    preserveDrawingBuffer: false, powerPreference: 'low-power',
  }) as WebGL2RenderingContext | null
  if (!gl) return null
  if (!gl.getExtension('EXT_color_buffer_float')) return null

  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches
  const coarse = !matchMedia('(pointer:fine)').matches

  const P_VEL = makeProgram(gl, F_VEL)
  const P_DIV = makeProgram(gl, F_DIV)
  const P_JAC = makeProgram(gl, F_JAC)
  const P_GRAD = makeProgram(gl, F_GRAD)
  const P_DENS = makeProgram(gl, F_DENS)
  const P_DISP = makeProgram(gl, F_DISP)
  const P_COMP = makeProgram(gl, F_COMP)
  const P_BAKE = makeProgram(gl, F_BAKE)
  const P_COPY = makeProgram(gl, F_COPY)
  const vao = gl.createVertexArray()!
  gl.bindVertexArray(vao)
  gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE)

  if (!probeLinear(gl, P_COPY, vao)) return null     // Mali/Adreno: half-float'ta nearest

  /* ---- gürültü atlası (1024^2, mipmap'li, 2 kareye yayılmış bake) ---- */
  const NT = 1024
  const noise = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, noise)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, NT, NT, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  const bakeFbo = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, bakeFbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, noise, 0)
  const bake = (p: number) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, bakeFbo); gl.viewport(0, 0, NT, NT)
    gl.useProgram(P_BAKE.p)
    gl.uniform2f(P_BAKE.u.uRes!, NT, NT); gl.uniform1i(P_BAKE.u.uPass!, p)
    gl.colorMask(p === 0, p === 0, p === 1, p === 1)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.colorMask(true, true, true, true)
  }

  /* ---- boyuta bağlı durum ---- */
  let W = 0, H = 0, aspect = 1, simW = 0, simH = 0, dyeW = 0, dyeH = 0, tier = coarse ? 1 : 0
  let vel!: Dbl, prs!: Dbl, dv!: Dbl, dens!: Dbl, disp!: Dbl
  let pool = buildPool(gl, innerWidth, innerHeight)

  const alloc = (preserve: boolean) => {
    W = innerWidth; H = innerHeight; aspect = W / H
    const C = TIERS[tier]
    simW = Math.max(C.simMin, Math.min(C.simMax, Math.round(W / C.simDiv)))
    simH = Math.max(2, Math.round(simW / aspect))
    dyeW = Math.round(simW * C.dye); dyeH = Math.round(simH * C.dye)
    /* SABİT ALAN — devicePixelRatio ile ASLA çarpılmaz. 4K panel, 1080p laptopla
       tam olarak aynı maliyeti ödemeli. */
    const rs = Math.max(T.RS_MIN, Math.min(T.RS_MAX, Math.sqrt(T.TARGET_PX / (W * H)))) * C.rs
    canvas.width = Math.max(2, Math.round(W * rs))
    canvas.height = Math.max(2, Math.round(H * rs))

    const oldD = preserve ? dens : null, oldP = preserve ? disp : null, oldV = preserve ? vel : null
    const nVel = dbl(gl, simW, simH), nPrs = dbl(gl, simW, simH), nDv = dbl(gl, simW, simH)
    const nDens = dbl(gl, dyeW, dyeH), nDisp = dbl(gl, dyeW, dyeH)
    const copy = (src: FBO, dst: FBO) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h)
      gl.useProgram(P_COPY.p)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex)
      gl.uniform1i(P_COPY.u.uSrc!, 0); gl.uniform2f(P_COPY.u.uRes!, dst.w, dst.h)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    if (oldD) copy(oldD.read, nDens.read)
    if (oldP) copy(oldP.read, nDisp.read)
    if (oldV) copy(oldV.read, nVel.read)
    for (const o of [oldD, oldP, oldV]) if (o) for (const f of [o.read, o.write]) {
      gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fbo)
    }
    if (preserve && prs) for (const f of [prs.read, prs.write]) { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fbo) }
    if (preserve && dv) for (const f of [dv.read, dv.write]) { gl.deleteTexture(f.tex); gl.deleteFramebuffer(f.fbo) }
    vel = nVel; prs = nPrs; dv = nDv; dens = nDens; disp = nDisp
  }
  alloc(false)

  /* ---- pass yardımcıları: sıfır tahsis, önbelleklenmiş uniform konumları ---- */
  let unit = 0
  const bind = (target: FBO | null, w: number, h: number, pr: Prog) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null)
    gl.viewport(0, 0, w, h)
    gl.useProgram(pr.p)
    gl.uniform2f(pr.u.uRes!, w, h)
    unit = 0
  }
  const tex = (loc: WebGLUniformLocation | null | undefined, t: WebGLTexture) => {
    gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t)
    if (loc) gl.uniform1i(loc, unit)
    unit++
  }
  const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3)

  /* ---- girdi ---- */
  const wind = new Wind()
  const touchScale = coarse ? 0.6 : 1.0
  const onMove = (e: PointerEvent) => {
    const co = (e as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] })
      .getCoalescedEvents?.()
    const list = co && co.length ? co : [e]
    for (const ev of list) wind.push(ev.clientX / W, 1 - ev.clientY / H)
  }
  const onReset = () => wind.reset()
  if (!reduce) {
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('pointerleave', onReset)
    addEventListener('blur', onReset)
  }

  /* ---- TEK SİMÜLASYON ADIMI (17 pass) ---- */
  let time = 0
  const stepSim = (dt: number) => {
    const nn = wind.step(dt, time, aspect, coarse, touchScale)
    const C = TIERS[tier]

    bind(vel.write, simW, simH, P_VEL)
    tex(P_VEL.u.uVel, vel.read.tex); tex(P_VEL.u.uNoise, noise)
    gl.uniform1f(P_VEL.u.uDt!, dt); gl.uniform1f(P_VEL.u.uTime!, time)
    gl.uniform2f(P_VEL.u.uAspect!, aspect, 1)
    gl.uniform4fv(P_VEL.u.uNA!, wind.NA); gl.uniform4fv(P_VEL.u.uNB!, wind.NB)
    gl.uniform1i(P_VEL.u.uNN!, nn)
    draw(); vel.swap()

    bind(dv.write, simW, simH, P_DIV)
    tex(P_DIV.u.uVel, vel.read.tex); tex(P_DIV.u.uDivPrev, dv.read.tex)
    gl.uniform1f(P_DIV.u.uDt!, dt)
    draw(); dv.swap()

    for (let i = 0; i < C.jac; i++) {
      bind(prs.write, simW, simH, P_JAC)
      tex(P_JAC.u.uPrs, prs.read.tex); tex(P_JAC.u.uDiv, dv.read.tex)
      gl.uniform1f(P_JAC.u.uPrsScale!, i === 0 ? T.PRS_RETAIN : 1.0)
      draw(); prs.swap()
    }

    bind(vel.write, simW, simH, P_GRAD)
    tex(P_GRAD.u.uPrs, prs.read.tex); tex(P_GRAD.u.uVel, vel.read.tex)
    draw(); vel.swap()

    bind(dens.write, dyeW, dyeH, P_DENS)
    tex(P_DENS.u.uDens, dens.read.tex); tex(P_DENS.u.uVel, vel.read.tex)
    tex(P_DENS.u.uNoise, noise); tex(P_DENS.u.uPool, pool)
    gl.uniform1f(P_DENS.u.uDt!, dt); gl.uniform1f(P_DENS.u.uTime!, time)
    gl.uniform1f(P_DENS.u.uSeed!, 0)
    gl.uniform2f(P_DENS.u.uAspect!, aspect, 1)
    gl.uniform4fv(P_DENS.u.uNA!, wind.NA); gl.uniform4fv(P_DENS.u.uNB!, wind.NB)
    gl.uniform1i(P_DENS.u.uNN!, nn)
    draw(); dens.swap()

    bind(disp.write, dyeW, dyeH, P_DISP)
    tex(P_DISP.u.uDisp, disp.read.tex); tex(P_DISP.u.uVel, vel.read.tex)
    gl.uniform1f(P_DISP.u.uDt!, dt)
    draw(); disp.swap()
  }

  /* Gürültü atlası piştikten SONRA çağrılır (hedefteki `slow` terimi onu okur). */
  const seedDensity = () => {
    bind(dens.write, dyeW, dyeH, P_DENS)
    tex(P_DENS.u.uDens, dens.read.tex); tex(P_DENS.u.uVel, vel.read.tex)
    tex(P_DENS.u.uNoise, noise); tex(P_DENS.u.uPool, pool)
    gl.uniform1f(P_DENS.u.uDt!, 0); gl.uniform1f(P_DENS.u.uTime!, time)
    gl.uniform1f(P_DENS.u.uSeed!, 1)
    gl.uniform2f(P_DENS.u.uAspect!, aspect, 1)
    gl.uniform1i(P_DENS.u.uNN!, 0)
    draw(); dens.swap()
  }

  const composite = (gain: number, band: number[]) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.useProgram(P_COMP.p)
    gl.uniform2f(P_COMP.u.uRes!, canvas.width, canvas.height)
    unit = 0
    tex(P_COMP.u.uDens, dens.read.tex); tex(P_COMP.u.uDisp, disp.read.tex)
    tex(P_COMP.u.uVel, vel.read.tex); tex(P_COMP.u.uDiv, dv.read.tex)
    tex(P_COMP.u.uNoise, noise)
    gl.uniform2f(P_COMP.u.uAspect!, aspect, 1)
    gl.uniform3f(P_COMP.u.uBand!, band[0], band[1], band[2])
    gl.uniform1f(P_COMP.u.uTime!, time)
    gl.uniform1f(P_COMP.u.uGain!, gain)
    gl.uniform1f(P_COMP.u.uStreak!, TIERS[tier].streak)
    gl.uniform1f(P_COMP.u.uDebugNoise!, 0)
    draw()
  }

  /* ---- azaltılmış hareket: otur, tek kare çiz, sonsuza dek dur ---- */
  let warm = 0
  const renderReducedFrame = () => composite(1.25, [0.24, 0.32, 0.40])

  /* Yeniden ayırma HER ZAMAN buradan geçer.
     `canvas.width`e yazmak çizim tamponunu ANINDA temizler. Yeni kompozit bir
     sonraki kareye kalırsa arada tam bir kare boyunca sis yok olur — ekranda
     "bir anlığına yenilendi" diye görünen flaş tam olarak budur. Çözüm: aynı
     görev içinde hemen yeniden kompozit et, boşluk hiç oluşmasın. */
  let graceUntil = performance.now() + 5000
  const reallocate = (preserve: boolean) => {
    alloc(preserve)
    if (reduce) renderReducedFrame()
    else composite(T.GAIN, T.LBAND)
    graceUntil = performance.now() + 3000        // yeniden ayırma sonrası valiye mola
  }

  /* ---- resize: 180ms debounce + "gerçekten önemli mi" filtresi ----
     Filtre tek başına iOS adres çubuğu açılıp kapanma sarsıntısını öldüren şey. */
  let rt = 0, lastW = innerWidth, lastH = innerHeight
  const onResize = () => {
    clearTimeout(rt)
    rt = window.setTimeout(() => {
      if (innerWidth === lastW && Math.abs(innerHeight - lastH) < 120) return
      lastW = innerWidth; lastH = innerHeight
      gl.deleteTexture(pool); pool = buildPool(gl, innerWidth, innerHeight)
      reallocate(true)
    }, 180)
  }
  addEventListener('resize', onResize)

  /* ---- vali (governor): ORTANCA, ortalama değil ----
     Tek bir GC duraklaması 30 karelik ortalamayı sahte bir kalıcı düşüşe yetecek
     kadar kaydırır; ortanca kaydırmaz.

     Ölçüm DUVAR SAATİ (işlenen kareler arası gerçek aralık). Önceki hâli
     `performance.now()` farkıyla yalnızca komutların GÖNDERİLME süresini ölçüyordu;
     GPU işi asenkron olduğundan bu sayı gerçek kare maliyetiyle neredeyse ilgisiz.

     Geri yükseltme yolu KALDIRILDI: kazancı bir miktar çözünürlük, bedeli garantili
     ikinci bir yeniden ayırma. Kalite pompalamak, tek tier aşağıda oturmaktan çok
     daha fazla göze batar — ve kullanıcının şikâyet ettiği ikinci sıçrama buydu.
     Açılış mola süresi de şart: ilk saniyelerde font/görsel yüklemesi ve hero
     geçişi kareleri yavaşlatır, bu kalıcı bir yavaşlık değildir. */
  const ft: number[] = []
  let win = 0, bad = 0
  const govern = (now: number, wallMs: number) => {
    if (now < graceUntil) { ft.length = 0; win = 0; bad = 0; return }
    ft.push(wallMs); if (ft.length > 60) ft.shift()
    if (++win < 60 || ft.length < 60) return
    win = 0
    const s = ft.slice().sort((a, b) => a - b)
    const med = s[30]
    if (med > 24) {                                  // ~42fps altı = gerçekten zorlanıyor
      if (++bad >= 3) {                              // 3 saniye SÜREKLİ yavaşlık
        bad = 0
        if (tier < 2) { tier++; reallocate(true) }
        else bail()                                  // T-1: Canvas2D'ye devret
      }
    } else bad = 0
  }

  /* ---- ANA DÖNGÜ ---- */
  let raf = 0, last = 0, baked = 0, visible = true, halfTick = false, dead = false
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting
    if (!visible) { if (raf) cancelAnimationFrame(raf); raf = 0 }
    else if (!raf && !dead && !reduce) { last = performance.now(); raf = requestAnimationFrame(frame) }
  })
  io.observe(canvas)

  function frame(nowMs: number) {
    raf = requestAnimationFrame(frame)
    if (!visible) return
    if (baked < 2) {
      bake(baked++)
      if (baked === 2) {
        gl!.bindTexture(gl!.TEXTURE_2D, noise); gl!.generateMipmap(gl!.TEXTURE_2D)
        seedDensity()                       // sayfa dolu sisle açılsın
      }
      return
    }
    if (reduce) {                                          // 6 tick x 10 adım, sonra dur
      for (let i = 0; i < 10; i++) { time += 1 / 60; stepSim(1 / 60) }
      if (++warm >= 6) { renderReducedFrame(); cancelAnimationFrame(raf); raf = 0 }
      return
    }
    if (nowMs - last < T.FPS_CAP_MS) return                // 60fps sınırı: `last`e DOKUNMA
    const wall = nowMs - last
    let dt = Math.min(1 / 30, Math.max(1 / 120, wall / 1000))
    last = nowMs

    /* 30Hz boşta yavaşlatma: kareleri atla, dt'yi ikiye katla. Görünmez, çünkü her
       sönüm 1-exp(-lambda*dt) ve taşıma semi-Lagrange; ayrıca boştaki ortam rüzgarı
       0.05 ekran-yüksekliği/s, yani karede ~1 piksel. Kompoziti yarıya indirir —
       maliyetin bulunduğu yer orası. */
    let idled = false
    if (wind.idle(time)) {
      halfTick = !halfTick
      if (halfTick) return
      dt = Math.min(1 / 30, dt * 2)
      idled = true
    }

    try {
      time += dt
      stepSim(dt)
      composite(T.GAIN, T.LBAND)
    } catch { dead = true; cancelAnimationFrame(raf); raf = 0; bail(); return }
    /* Boşta duvar aralığı bilerek 2x — valiye verilirse sahte yavaşlık gibi okunur. */
    if (!idled) govern(nowMs, wall)
  }

  const onVis = () => {
    if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; wind.reset() }
    else if (!raf && !dead && visible && !(reduce && warm >= 6)) {
      last = performance.now(); wind.reset(); raf = requestAnimationFrame(frame)
    }
  }
  document.addEventListener('visibilitychange', onVis)

  const onLost = (e: Event) => { e.preventDefault(); dead = true; if (raf) cancelAnimationFrame(raf); raf = 0; bail() }
  canvas.addEventListener('webglcontextlost', onLost)

  last = performance.now()
  raf = requestAnimationFrame(frame)

  /* ---- yıkım: StrictMode-güvenli, HMR-güvenli, sızdırmaz ---- */
  return () => {
    dead = true
    if (raf) cancelAnimationFrame(raf)
    clearTimeout(rt)
    io.disconnect()
    removeEventListener('pointermove', onMove)
    removeEventListener('pointerleave', onReset)
    removeEventListener('blur', onReset)
    removeEventListener('resize', onResize)
    document.removeEventListener('visibilitychange', onVis)
    canvas.removeEventListener('webglcontextlost', onLost)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

/* ══════════════════════════ 7. REACT KABUĞU ══════════════════════════════════ */

export default function FogCanvas() {
  const hostRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<'gl' | '2d'>('gl')

  useEffect(() => {
    if (mode !== 'gl') return
    const host = hostRef.current
    if (!host) return

    /* Canvas'ın sahibi JSX değil, bu efekt. Sebebi: teardown'da loseContext()
       çağırıyoruz ve bir elemana bir kez WebGL context verildiyse, o context
       kaybedildikten sonra AYNI elemandan sağlam bir context bir daha alınamaz.
       React 19 StrictMode geliştirmede efektleri çift mount eder ve Vite HMR her
       düzenlemede remount eder — JSX'te sabit bir <canvas> ile ikinci mount
       garanti şekilde ölü bir context alır ve sessizce yedeğe düşerdi.
       Her oturuma taze eleman: hem StrictMode/HMR güvenli, hem sızdırmaz. */
    const c = document.createElement('canvas')
    c.className = 'fog-canvas'
    c.setAttribute('aria-hidden', 'true')
    host.appendChild(c)

    let disposed = false
    let dispose: (() => void) | null = null
    /* Yedek AYRI bir bileşen + KENDİ taze <canvas>'ı olmak zorunda: WebGL context
       vermiş bir elemana getContext('2d') sonsuza dek null döner. */
    const bail = () => { if (!disposed) setMode('2d') }
    try { dispose = initGL(c, bail) } catch (err) {
      if (import.meta.env.DEV) console.error('[fog] WebGL init başarısız, Canvas2D yedeğine düşülüyor:', err)
      dispose = null
    }
    if (!dispose) { c.remove(); setMode('2d'); return }

    const mq = matchMedia('(prefers-reduced-motion:reduce)')
    const onMq = () => { dispose?.(); disposed = true; setMode('2d'); setTimeout(() => setMode('gl'), 0) }
    mq.addEventListener('change', onMq)
    return () => {
      disposed = true
      mq.removeEventListener('change', onMq)
      dispose?.()
      c.remove()
    }
  }, [mode])

  if (mode === '2d') return <FogCanvasFallback />
  /* display:contents → bu sarmalayıcı hiçbir kutu üretmez; canvas düzen ve boyama
     sırasında .scene'in doğrudan çocuğuymuş gibi davranır (CSS aynen geçerli). */
  return <div ref={hostRef} style={{ display: 'contents' }} />
}
