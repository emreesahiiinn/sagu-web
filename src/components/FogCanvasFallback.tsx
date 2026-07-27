import { useEffect, useRef } from 'react'

/**
 * Canvas2D yedek sis — WebGL2 yoksa/başarısızsa devreye girer.
 * Bu, projenin eski (bilinen-çalışır) sis efektinin birebir kopyasıdır.
 * Kaçış kapısı olduğu için burada "iyileştirme" yapma; sade ve garantili kalsın.
 */
export default function FogCanvasFallback() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches
    const fine = window.matchMedia('(pointer:fine)').matches

    let w = 0, h = 0
    const dpr = Math.min(1.5, window.devicePixelRatio || 1)
    const resize = () => {
      w = window.innerWidth
      h = window.innerHeight
      canvas.width = Math.floor(w * dpr)
      canvas.height = Math.floor(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const rand = (a: number, b: number) => a + Math.random() * (b - a)
    type P = { x: number; y: number; r: number; a: number; vy: number; ph: number; clear: number }
    const N = reduce ? 26 : fine ? 54 : 36
    const mk = (): P => ({
      x: rand(-0.15, 1.15) * w,
      y: rand(0.4, 1.22) * h, // alt yarıda yoğun
      r: rand(200, 560),
      a: rand(0.06, 0.16),
      vy: rand(-0.12, 0.12),
      ph: rand(0, Math.PI * 2),
      clear: 0,
    })
    const parts = Array.from({ length: N }, mk)

    let mx = -9999, my = -9999, mvx = 0, mvy = 0, active = false
    const onMove = (e: PointerEvent) => {
      if (mx < -9000) { mx = e.clientX; my = e.clientY }
      mvx = mvx * 0.5 + (e.clientX - mx) * 0.5
      mvy = mvy * 0.5 + (e.clientY - my) * 0.5
      mx = e.clientX; my = e.clientY
      active = true
    }
    const onLeave = () => { active = false }
    if (fine && !reduce) {
      window.addEventListener('pointermove', onMove, { passive: true })
      window.addEventListener('pointerleave', onLeave)
    }

    const TAU = Math.PI * 2
    let t = 0
    let raf = 0

    const draw = () => {
      t += 0.008
      ctx.clearRect(0, 0, w, h)
      const wind = 1.4 + Math.sin(t * 0.7) * 0.7 + Math.sin(t * 0.21 + 1.3) * 0.4
      const speed = Math.hypot(mvx, mvy)

      for (const p of parts) {
        const flow = Math.sin(p.y * 0.006 + t * 1.1 + p.ph)
        p.x += wind * 1.6 + flow * 1.1
        p.y += p.vy + Math.cos(p.x * 0.004 + t * 0.9 + p.ph) * 0.4

        if (active) {
          const dx = p.x - mx, dy = p.y - my
          const R = 260
          const d2 = dx * dx + dy * dy
          if (d2 < R * R) {
            const d = Math.sqrt(d2) || 1
            const f = 1 - d / R
            p.x += (mvx * 1.2 + (dx / d) * 26) * f
            p.y += (mvy * 1.2 + (dy / d) * 26) * f
            p.clear = Math.min(1, p.clear + f * Math.min(1, speed / 12) * 0.7)
          }
        }
        p.clear *= 0.93

        if (p.x - p.r > w + 80) { p.x = -p.r - rand(0, 180); p.y = rand(0.4, 1.22) * h; p.clear = 0 }
        else if (p.x + p.r < -80) { p.x = w + p.r + rand(0, 180) }
        if (p.y - p.r > h + 120) p.y = -p.r * 0.4
        else if (p.y + p.r < -120) p.y = h + p.r * 0.4

        // dikey solma: logo hizasının (üst) üstünde temiz, aşağı indikçe yoğun
        const vFade = Math.max(0, Math.min(1, (p.y / h - 0.3) / 0.42))
        const alpha = p.a * vFade * (1 - p.clear * 0.9)
        if (alpha <= 0.002) continue
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
        g.addColorStop(0, `rgba(226,233,245,${alpha})`)
        g.addColorStop(1, 'rgba(226,233,245,0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, TAU)
        ctx.fill()
      }

      mvx *= 0.86; mvy *= 0.86
      if (!reduce) raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return <canvas className="fog-canvas is-2d" ref={ref} aria-hidden="true" />
}
