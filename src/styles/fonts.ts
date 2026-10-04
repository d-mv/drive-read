import grotesk from '@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2?url'
import literataItalic from '@fontsource-variable/literata/files/literata-latin-wght-italic.woff2?url'
import literata from '@fontsource-variable/literata/files/literata-latin-wght-normal.woff2?url'
import literataExt from '@fontsource-variable/literata/files/literata-latin-ext-wght-normal.woff2?url'

import type { FontFace } from './reader-theme'

/** The app's self-hosted faces, re-declared inside the book frame (it cannot see the app's). */
export const READER_FONTS: readonly FontFace[] = [
  { family: 'Literata Variable', url: literata, style: 'normal' },
  { family: 'Literata Variable', url: literataExt, style: 'normal' },
  { family: 'Literata Variable', url: literataItalic, style: 'italic' },
  { family: 'Space Grotesk Variable', url: grotesk, style: 'normal' },
]
