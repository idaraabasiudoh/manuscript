import type { SVGProps } from 'react'
import type { BlockKind } from '../lib/supabase'

type P = SVGProps<SVGSVGElement>

const base = (props: P) => ({
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
})

export const ArrowRight = (p: P) => <svg {...base(p)}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
export const Plus = (p: P) => <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
export const Close = (p: P) => <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
export const Check = (p: P) => <svg {...base(p)}><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
export const Trash = (p: P) => <svg {...base(p)}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5M14 11v5" /></svg>
export const Grip = (p: P) => (
  <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}>
    {[6, 12, 18].map((y) => (
      <g key={y}><circle cx="9" cy={y} r="1.5" /><circle cx="15" cy={y} r="1.5" /></g>
    ))}
  </svg>
)
export const Pencil = (p: P) => <svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" /></svg>
export const Eye = (p: P) => <svg {...base(p)}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>
export const Share = (p: P) => <svg {...base(p)}><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg>
export const Download = (p: P) => <svg {...base(p)}><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>
export const External = (p: P) => <svg {...base(p)}><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg>
export const Help = (p: P) => <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.4M12 17h.01" /></svg>
export const Menu = (p: P) => <svg {...base(p)}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
export const Send = (p: P) => <svg {...base(p)}><path d="M5 12h13M12 6l6 6-6 6" /></svg>
export const Stop = (p: P) => <svg {...base({ ...p, fill: 'currentColor', stroke: 'none' })}><rect x="7" y="7" width="10" height="10" rx="1.5" /></svg>
export const Spark = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
  </svg>
)
export const Upload = (p: P) => <svg {...base(p)}><path d="M12 16V4M7 8.5l5-5 5 5M5 20h14" /></svg>

export const KindIcon = ({ kind, ...p }: P & { kind: BlockKind }) => {
  switch (kind) {
    case 'poetry':
      return <svg {...base(p)}><path d="M20 4C11 4 6 10 5 20M5 20c4-1 8-3 10.5-6.5M9.5 14.5H15M12 9.5h6.5" /></svg>
    case 'drama':
      return (
        <svg {...base(p)}>
          <path d="M4 5c3 1.5 7 1.5 10 0v6a5 5 0 0 1-10 0z" />
          <path d="M14 9.5c2 .8 4.2.8 6.2 0V15a5 5 0 0 1-8.4 3.6" />
          <path d="M7 9.5h.01M11 9.5h.01M7.5 13c1 .8 2 .8 3 0M15.8 13.5h.01M18.5 13.5h.01M15.5 17c1-.8 2.4-.8 3.3 0" />
        </svg>
      )
    case 'prose':
      return <svg {...base(p)}><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5zM12 6.5v13" /></svg>
    case 'text':
      return <svg {...base(p)}><path d="M5 6h14M5 10h14M5 14h9M5 18h6" /></svg>
    case 'file':
      return <svg {...base(p)}><path d="M14 3.5H7a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8zM14 3.5V8h4.5" /></svg>
    case 'link':
      return <Share {...p} />
    case 'resources':
      return <svg {...base(p)}><path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" /></svg>
  }
}

export const Logo = () => (
  <span className="logo">
    <span className="logo-mark" aria-hidden>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
        <path d="M8.5 9h7M8.5 12h7M8.5 15h4" strokeWidth="1.8" />
      </svg>
    </span>
    <span className="logo-word">manuscript</span>
  </span>
)
