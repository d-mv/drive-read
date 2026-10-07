import type { Settings, Typeface } from '@/domain/settings'

/**
 * Builds the CSS injected into the book frame from the resolved theme colours and the text
 * settings. The frame does not see the app's fonts, so they are declared here again.
 */

export interface ReaderColors {
  paper: string
  ink: string
  ink2: string
  signal: string
}

export interface FontFace {
  family: string
  url: string
  style: 'normal' | 'italic'
  weight?: string
  format?: string
}

const FAMILY_NAME: Record<Exclude<Typeface, 'original'>, string> = {
  literata: 'Literata Variable',
  grotesk: 'Space Grotesk Variable',
  cartisse: 'Cartisse',
  libron: 'Libron',
  jost: 'NV Jost',
  'zilla-slab': 'NV Zilla Slab',
  readerly: 'Readerly',
}

const FAMILY: Record<Exclude<Typeface, 'original'>, string> = {
  literata: "'Literata Variable', Georgia, serif",
  grotesk: "'Space Grotesk Variable', system-ui, sans-serif",
  cartisse: "'Cartisse', Georgia, serif",
  libron: "'Libron', Georgia, serif",
  jost: "'NV Jost', system-ui, sans-serif",
  'zilla-slab': "'NV Zilla Slab', Georgia, serif",
  readerly: "'Readerly', Georgia, serif",
}

const fontFaceCss = (f: FontFace) =>
  `@font-face { font-family: '${f.family}'; font-style: ${f.style}; font-weight: ${f.weight ?? '200 900'}; font-display: swap; src: url('${f.url}') format('${f.format ?? 'woff2'}'); }`

export function readerCss(
  colors: ReaderColors,
  settings: Pick<Settings, 'typeface' | 'size' | 'lineHeight' | 'align'>,
  fonts: readonly FontFace[],
): string {
  const typeface = settings.typeface
  const override = typeface !== 'original'
  const family = typeface === 'original' ? '' : `font-family: ${FAMILY[typeface]} !important;`
  const activeFamily = typeface !== 'original' ? FAMILY_NAME[typeface] : null
  const activeFonts = activeFamily ? fonts.filter((f) => f.family === activeFamily) : []
  const fontsToInject = activeFonts.length > 0 ? activeFonts : fonts
  return [
    ...(override ? fontsToInject.map(fontFaceCss) : []),
    `html { color-scheme: light dark; color: ${colors.ink}; background: ${colors.paper}; }`,
    `body { ${family} font-size: ${settings.size}px !important; line-height: ${settings.lineHeight} !important; text-align: ${settings.align}; hyphens: auto; -webkit-hyphens: auto; }`,
    // Publisher colours would fight the theme; images keep theirs.
    `body *:not(img, svg, video) { color: inherit !important; background-color: transparent !important; }`,
    override
      ? `p, li, blockquote, dd { font-family: inherit !important; line-height: inherit !important; }`
      : '',
    `p { text-align: ${settings.align}; }`,
    `a:any-link { color: ${colors.signal} !important; }`,
    `::selection { background: color-mix(in srgb, ${colors.signal} 30%, transparent); }`,
  ]
    .filter(Boolean)
    .join('\n')
}
