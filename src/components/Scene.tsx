import { useEffect, useRef } from 'react'
import mountains from '../assets/mountains.jpg'
import FogCanvas from './FogCanvas'

/** Arka plan: gerçek dağ fotoğrafı + rüzgarla akan canvas sisi + scrim/vignette. */
export default function Scene() {
  const photoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches
    const fine = window.matchMedia('(pointer:fine)').matches
    if (reduce || !fine) return
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX / window.innerWidth - 0.5
      const dy = e.clientY / window.innerHeight - 0.5
      if (photoRef.current) {
        photoRef.current.style.transform = `scale(1.07) translate(${dx * -12}px, ${dy * -8}px)`
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <>
      <div className="scene" aria-hidden="true">
        <div className="photo" ref={photoRef} style={{ backgroundImage: `url(${mountains})` }} />
        <div className="scene-tint" />
        <FogCanvas />
        <div className="vignette" />
      </div>

      <svg className="grain" aria-hidden="true">
        <filter id="noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noise)" />
      </svg>
    </>
  )
}
