import grotesk from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?inline'
import literataCyrExtItalic from '@fontsource-variable/literata/files/literata-cyrillic-ext-wght-italic.woff2?inline'
import literataCyrExt from '@fontsource-variable/literata/files/literata-cyrillic-ext-wght-normal.woff2?inline'
import literataCyrItalic from '@fontsource-variable/literata/files/literata-cyrillic-wght-italic.woff2?inline'
import literataCyr from '@fontsource-variable/literata/files/literata-cyrillic-wght-normal.woff2?inline'
import literataExtItalic from '@fontsource-variable/literata/files/literata-latin-ext-wght-italic.woff2?inline'
import literataExt from '@fontsource-variable/literata/files/literata-latin-ext-wght-normal.woff2?inline'
import literataItalic from '@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?inline'
import literata from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?inline'

import cartisseBold from '@/assets/fonts/Cartisse-Bold.ttf?inline'
import cartisseBoldItalic from '@/assets/fonts/Cartisse-BoldItalic.ttf?inline'
import cartisseItalic from '@/assets/fonts/Cartisse-Italic.ttf?inline'
import cartisseRegular from '@/assets/fonts/Cartisse-Regular.ttf?inline'

import libronBold from '@/assets/fonts/Libron-Bold.ttf?inline'
import libronBoldItalic from '@/assets/fonts/Libron-BoldItalic.ttf?inline'
import libronItalic from '@/assets/fonts/Libron-Italic.ttf?inline'
import libronRegular from '@/assets/fonts/Libron-Regular.ttf?inline'

import jostBold from '@/assets/fonts/NV_Jost-Bold.ttf?inline'
import jostBoldItalic from '@/assets/fonts/NV_Jost-BoldItalic.ttf?inline'
import jostItalic from '@/assets/fonts/NV_Jost-Italic.ttf?inline'
import jostRegular from '@/assets/fonts/NV_Jost-Regular.ttf?inline'

import zillaBold from '@/assets/fonts/NV_Zilla_Slab-Bold.ttf?inline'
import zillaBoldItalic from '@/assets/fonts/NV_Zilla_Slab-BoldItalic.ttf?inline'
import zillaItalic from '@/assets/fonts/NV_Zilla_Slab-Italic.ttf?inline'
import zillaRegular from '@/assets/fonts/NV_Zilla_Slab-Regular.ttf?inline'

import readerlyBold from '@/assets/fonts/Readerly-Bold.ttf?inline'
import readerlyBoldItalic from '@/assets/fonts/Readerly-BoldItalic.ttf?inline'
import readerlyItalic from '@/assets/fonts/Readerly-Italic.ttf?inline'
import readerlyRegular from '@/assets/fonts/Readerly-Regular.ttf?inline'

import type { ReaderFont } from '@/services/engine/types'

// Fontsource's subset ranges (wght.css), so a subset is only loaded for text that needs it.
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
const LATIN_EXT =
  'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF'
const CYRILLIC = 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'
const CYRILLIC_EXT = 'U+0460-052F,U+1C80-1C8A,U+20B4,U+2DE0-2DFF,U+A640-A69F,U+FE2E-FE2F'

const literataFace = (url: string, style: ReaderFont['style'], unicodeRange: string) => ({
  family: 'Literata Variable',
  url,
  style,
  unicodeRange,
})

/**
 * The app's self-hosted faces, embedded inline as data URIs and registered inside the book
 * frame so font files are never repeatedly requested or downloaded across page/chapter turns.
 */
export const READER_FONTS: readonly ReaderFont[] = [
  // Literata (Variable), with Cyrillic
  literataFace(literata, 'normal', LATIN),
  literataFace(literataExt, 'normal', LATIN_EXT),
  literataFace(literataCyr, 'normal', CYRILLIC),
  literataFace(literataCyrExt, 'normal', CYRILLIC_EXT),
  literataFace(literataItalic, 'italic', LATIN),
  literataFace(literataExtItalic, 'italic', LATIN_EXT),
  literataFace(literataCyrItalic, 'italic', CYRILLIC),
  literataFace(literataCyrExtItalic, 'italic', CYRILLIC_EXT),

  // Space Grotesk (Variable)
  { family: 'Space Grotesk Variable', url: grotesk, style: 'normal', format: 'woff2' },

  // Cartisse
  { family: 'Cartisse', url: cartisseRegular, style: 'normal', weight: '400', format: 'truetype' },
  { family: 'Cartisse', url: cartisseItalic, style: 'italic', weight: '400', format: 'truetype' },
  { family: 'Cartisse', url: cartisseBold, style: 'normal', weight: '700', format: 'truetype' },
  {
    family: 'Cartisse',
    url: cartisseBoldItalic,
    style: 'italic',
    weight: '700',
    format: 'truetype',
  },

  // Libron
  { family: 'Libron', url: libronRegular, style: 'normal', weight: '400', format: 'truetype' },
  { family: 'Libron', url: libronItalic, style: 'italic', weight: '400', format: 'truetype' },
  { family: 'Libron', url: libronBold, style: 'normal', weight: '700', format: 'truetype' },
  { family: 'Libron', url: libronBoldItalic, style: 'italic', weight: '700', format: 'truetype' },

  // NV Jost
  { family: 'NV Jost', url: jostRegular, style: 'normal', weight: '400', format: 'truetype' },
  { family: 'NV Jost', url: jostItalic, style: 'italic', weight: '400', format: 'truetype' },
  { family: 'NV Jost', url: jostBold, style: 'normal', weight: '700', format: 'truetype' },
  { family: 'NV Jost', url: jostBoldItalic, style: 'italic', weight: '700', format: 'truetype' },

  // NV Zilla Slab
  {
    family: 'NV Zilla Slab',
    url: zillaRegular,
    style: 'normal',
    weight: '400',
    format: 'truetype',
  },
  { family: 'NV Zilla Slab', url: zillaItalic, style: 'italic', weight: '400', format: 'truetype' },
  { family: 'NV Zilla Slab', url: zillaBold, style: 'normal', weight: '700', format: 'truetype' },
  {
    family: 'NV Zilla Slab',
    url: zillaBoldItalic,
    style: 'italic',
    weight: '700',
    format: 'truetype',
  },

  // Readerly
  { family: 'Readerly', url: readerlyRegular, style: 'normal', weight: '400', format: 'truetype' },
  { family: 'Readerly', url: readerlyItalic, style: 'italic', weight: '400', format: 'truetype' },
  { family: 'Readerly', url: readerlyBold, style: 'normal', weight: '700', format: 'truetype' },
  {
    family: 'Readerly',
    url: readerlyBoldItalic,
    style: 'italic',
    weight: '700',
    format: 'truetype',
  },
]
