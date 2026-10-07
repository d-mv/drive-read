import grotesk from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?inline'
import literataItalic from '@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?inline'
import literata from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?inline'
import literataExt from '@fontsource-variable/literata/files/literata-latin-ext-wght-normal.woff2?inline'

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

import type { FontFace } from './reader-theme'

/**
 * The app's self-hosted faces, embedded inline as data URIs and re-declared inside the book
 * frame so font files are never repeatedly requested or downloaded across page/chapter turns.
 */
export const READER_FONTS: readonly FontFace[] = [
  // Literata (Variable)
  { family: 'Literata Variable', url: literata, style: 'normal', format: 'woff2' },
  { family: 'Literata Variable', url: literataExt, style: 'normal', format: 'woff2' },
  { family: 'Literata Variable', url: literataItalic, style: 'italic', format: 'woff2' },

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
