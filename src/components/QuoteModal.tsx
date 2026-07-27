import { useEffect, useRef, useState, type FormEvent } from 'react'
import Segmented from './Segmented'
import { QUOTE_ENDPOINT } from '../data'

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phoneRe = /^[+()\d][\d\s()\-.]{6,}$/

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

type NameType = 'ad' | 'firma'
type ContactType = 'eposta' | 'telefon'
type Note = { msg: string; type?: 'err' | 'warn' } | null

type Props = { open: boolean; prefill?: string; onClose: () => void }

export default function QuoteModal({ open, prefill, onClose }: Props) {
  const [nameType, setNameType] = useState<NameType>('ad')
  const [contactType, setContactType] = useState<ContactType>('eposta')
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [product, setProduct] = useState('')
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const [success, setSuccess] = useState(false)

  const nameRef = useRef<HTMLInputElement>(null)
  const botRef = useRef<HTMLInputElement>(null)

  // Açılışta: gövde kilidi, Escape, autofocus
  useEffect(() => {
    if (!open) return
    document.body.classList.add('modal-open')
    const t = setTimeout(() => nameRef.current?.focus(), 360)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('modal-open')
      clearTimeout(t)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  // Her açılışta formu tazele (+ etiketten gelen ürünü doldur)
  useEffect(() => {
    if (!open) return
    setName('')
    setContact('')
    setNote(null)
    setSuccess(false)
    setNameType('ad')
    setContactType('eposta')
    setProduct(prefill ? `${cap(prefill)} hakkında bilgi almak istiyorum.` : '')
  }, [open, prefill])

  const contactIsEmail = contactType === 'eposta'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const n = name.trim()
    const c = contact.trim()
    const p = product.trim()

    if (!n) return fail(nameType === 'firma' ? 'Lütfen firma adını girin.' : 'Lütfen adınızı girin.', nameRef)
    if (!c) return setNote({ msg: contactIsEmail ? 'Lütfen e-posta adresinizi girin.' : 'Lütfen telefon numaranızı girin.', type: 'err' })
    if (contactIsEmail && !emailRe.test(c)) return setNote({ msg: 'Geçerli bir e-posta adresi girin.', type: 'err' })
    if (!contactIsEmail && !phoneRe.test(c)) return setNote({ msg: 'Geçerli bir telefon numarası girin.', type: 'err' })

    setNote(null)
    setLoading(true)

    /* Kendi Worker'ımıza gönderilir; o da kendi SMTP sunucumuz üzerinden mail atar.
       Başarı ekranı YALNIZCA sunucu gerçekten gönderdiğini doğrularsa gösterilir —
       eski "demo modu" yapılandırma eksikken bile "ulaştı" diyordu, ki bu
       ziyaretçiyi yanıltmaktı. */
    try {
      const res = await fetch(QUOTE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nameType,
          name: n,
          contactType,
          contact: c,
          product: p,
          botcheck: botRef.current?.checked ? 'true' : '',
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean } | null
      if (res.ok && data?.ok) setSuccess(true)
      else throw new Error(`quote endpoint ${res.status}`)
    } catch (err) {
      setNote({ msg: 'Bir sorun oluştu. Lütfen tekrar deneyin ya da doğrudan arayın: +90 542 676 54 48', type: 'err' })
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  function fail(msg: string, ref?: React.RefObject<HTMLInputElement | null>) {
    setNote({ msg, type: 'err' })
    ref?.current?.focus()
  }

  return (
    <div
      className={'modal' + (open ? ' is-open' : '')}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modalTitle"
      aria-hidden={!open}
    >
      <div className="backdrop" onClick={onClose} />
      <div className="panel">
        <button className="close" aria-label="Kapat" onClick={onClose}>✕</button>

        {success ? (
          <div className="success">
            <div className="check">
              <svg viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="24" />
                <path d="M15 27 l8 8 l15 -16" />
              </svg>
            </div>
            <h3>Talebiniz bize ulaştı 🎉</h3>
            <p>En kısa sürede size özel teklifimizle döneceğiz. İlginiz için teşekkürler!</p>
            <button
              className="ghost-btn"
              onClick={() => {
                setSuccess(false)
                setName('')
                setContact('')
                setProduct('')
                setNote(null)
              }}
            >
              Yeni talep oluştur
            </button>
          </div>
        ) : (
          <>
            <h2 id="modalTitle">Hızlı Teklif Formu</h2>
            <p className="lead">Bilgilerinizi bırakın, en kısa sürede teklifimizi iletelim.</p>

            <form onSubmit={handleSubmit} noValidate>
              <input ref={botRef} type="checkbox" name="botcheck" className="hp" tabIndex={-1} autoComplete="off" />

              <div className="field">
                <Segmented
                  options={[{ value: 'ad', label: 'Ad Soyad' }, { value: 'firma', label: 'Firma Adı' }]}
                  value={nameType}
                  onChange={(v) => setNameType(v as NameType)}
                />
              </div>

              <div className="field">
                <input
                  ref={nameRef}
                  className="control"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={nameType === 'firma' ? 'Firma adı' : 'Ad Soyad'}
                  autoComplete={nameType === 'firma' ? 'organization' : 'name'}
                />
              </div>

              <div className="field">
                <Segmented
                  options={[{ value: 'eposta', label: 'E-Posta' }, { value: 'telefon', label: 'Telefon' }]}
                  value={contactType}
                  onChange={(v) => {
                    setContactType(v as ContactType)
                    setContact('')
                  }}
                />
              </div>

              <div className="field">
                <input
                  className="control"
                  type={contactIsEmail ? 'email' : 'tel'}
                  inputMode={contactIsEmail ? 'email' : 'tel'}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={contactIsEmail ? 'E-postanızı yazın' : 'Telefon numaranız'}
                  autoComplete={contactIsEmail ? 'email' : 'tel'}
                />
              </div>

              <div className="field">
                <textarea
                  className="control"
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  placeholder="Hangi ürünle ilgileniyorsunuz?"
                />
              </div>

              <button type="submit" className="submit" disabled={loading}>
                <span className="submit-inner">
                  {loading ? <span className="spin" /> : 'Teklif Al'}
                </span>
              </button>

              {note && <div className={'note ' + (note.type ?? '')}>{note.msg}</div>}
            </form>
          </>
        )}
      </div>
    </div>
  )
}
