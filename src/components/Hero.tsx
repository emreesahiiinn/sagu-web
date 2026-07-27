import { TAGS } from '../data'
import Wordmark from './Wordmark'

type Props = { onQuote: (product?: string) => void }

const half = Math.ceil(TAGS.length / 2)
const ROW_A = TAGS.slice(0, half)
const ROW_B = TAGS.slice(half)

function Row({ items, dir, onQuote }: { items: readonly string[]; dir: 'l' | 'r'; onQuote: (p: string) => void }) {
  const loop = [...items, ...items]
  return (
    <div className="mrow">
      <div className={`mtrack mtrack-${dir}`}>
        {loop.map((t, i) => (
          <button key={`${dir}-${i}`} type="button" className="tag" onClick={() => onQuote(t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Hero({ onQuote }: Props) {
  return (
    <main className="hero">
      <div className="eyebrow">Reklam · Tanıtım · Tasarım</div>

      <div className="logo-block">
        <Wordmark />
      </div>

      <div className="marquee" role="list" aria-label="Ürün ve hizmetler">
        <Row items={ROW_A} dir="l" onQuote={onQuote} />
        <Row items={ROW_B} dir="r" onQuote={onQuote} />
      </div>

      <button className="cta" onClick={() => onQuote()}>
        <span className="cta-inner">
          Hızlı Teklif Al <span className="arw">→</span>
        </span>
      </button>
    </main>
  )
}
