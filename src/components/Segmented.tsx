export type SegOption = { value: string; label: string }

type Props = {
  options: [SegOption, SegOption]
  value: string
  onChange: (value: string) => void
}

/** iOS tarzı 2'li segmented toggle — kayan thumb'lı. */
export default function Segmented({ options, value, onChange }: Props) {
  const activeIndex = options.findIndex((o) => o.value === value)
  return (
    <div className="seg" data-active={activeIndex === 1 ? '1' : '0'}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={'seg-btn' + (o.value === value ? ' active' : '')}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
      <span className="seg-thumb" aria-hidden="true" />
    </div>
  )
}
