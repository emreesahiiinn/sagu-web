import { useEffect, useState } from 'react'
import Scene from './components/Scene'
import Hero from './components/Hero'
import QuoteModal from './components/QuoteModal'
import { CONTACT } from './data'

export default function App() {
  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<string | undefined>(undefined)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const openModal = (product?: string) => {
    setPrefill(product)
    setOpen(true)
  }

  return (
    <>
      <Scene />

      <div className={'wrap' + (mounted ? ' in' : '') + (open ? ' is-blurred' : '')}>
        <Hero onQuote={openModal} />

        <footer className="foot">
          <span>{CONTACT.address}</span>
          <span className="sep">|</span>
          <a href={CONTACT.phoneHref}>{CONTACT.phoneLabel}</a>
          <span className="sep">|</span>
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
        </footer>
      </div>

      <QuoteModal open={open} prefill={prefill} onClose={() => setOpen(false)} />
    </>
  )
}
