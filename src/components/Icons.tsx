// App icons: Lucide (https://lucide.dev), wrapped so every icon shares one stroke weight and size.
// Components import these names, never lucide directly, so the set can be swapped in one place.
import {
  ArrowRight as LArrowRight,
  ArrowUp as LArrowUp,
  ArrowUpRight,
  BookOpen,
  Check as LCheck,
  CircleHelp,
  Clapperboard,
  CloudUpload,
  Download as LDownload,
  Eye as LEye,
  Feather,
  FileText,
  GripVertical,
  Library,
  Link2,
  Maximize2,
  Minimize2,
  Minus as LMinus,
  NotebookPen,
  PanelLeft,
  PenLine,
  Plus as LPlus,
  RotateCcw,
  Share2,
  Sparkles,
  Square,
  Trash2,
  X,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { useId } from 'react'
import type { BlockKind } from '../lib/supabase'

const icon = (I: LucideIcon) => {
  const Icon = (p: LucideProps) => <I size={18} strokeWidth={1.75} aria-hidden {...p} />
  Icon.displayName = I.displayName
  return Icon
}

export const ArrowRight = icon(LArrowRight)
export const ArrowUp = icon(LArrowUp)
export const Plus = icon(LPlus)
export const Minus = icon(LMinus)
export const Close = icon(X)
export const Check = icon(LCheck)
export const Trash = icon(Trash2)
export const Grip = icon(GripVertical)
export const Pencil = icon(PenLine)
export const Eye = icon(LEye)
export const Share = icon(Share2)
export const Download = icon(LDownload)
export const External = icon(ArrowUpRight)
export const Help = icon(CircleHelp)
export const Menu = icon(PanelLeft)
export const Send = icon(LArrowUp)
export const Stop = (p: LucideProps) => <Square size={18} fill="currentColor" strokeWidth={0} aria-hidden {...p} />
export const Spark = icon(Sparkles)
export const Expand = icon(Maximize2)
export const Shrink = icon(Minimize2)
export const Refresh = icon(RotateCcw)
export const Upload = icon(CloudUpload)

const KIND_ICONS: Record<BlockKind, LucideIcon> = {
  poetry: Feather,
  drama: Clapperboard,
  prose: BookOpen,
  text: NotebookPen,
  file: FileText,
  link: Link2,
  resources: Library,
}

export const KindIcon = ({ kind, ...p }: LucideProps & { kind: BlockKind }) => {
  const I = KIND_ICONS[kind]
  return <I size={18} strokeWidth={1.75} aria-hidden {...p} />
}

/** Manu AI's mark: a four-point sparkle filled with the assistant gradient. */
export const ManuSpark = ({ size = 18 }: { size?: number }) => {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="manu-spark">
      <defs>
        <linearGradient id={id} x1="2" y1="22" x2="22" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--ai-1)" />
          <stop offset="0.55" stopColor="var(--ai-2)" />
          <stop offset="1" stopColor="var(--ai-3)" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5c.5 5.6 4.9 10 10.5 10.5-5.6.5-10 4.9-10.5 10.5C11.5 16.9 7.1 12.5 1.5 12 7.1 11.5 11.5 7.1 12 1.5z"
        fill={`url(#${id})`}
      />
    </svg>
  )
}

/** The "m." mark: black glyph on light themes, white glyph on dark themes. */
export const Logo = () => (
  <span className="logo">
    <picture className="logo-mark">
      <source srcSet="/icons/white-icon.png" media="(prefers-color-scheme: dark)" />
      <img src="/icons/black-icon.png" alt="" width={46} height={46} />
    </picture>
    <span className="logo-word">manuscript</span>
  </span>
)
