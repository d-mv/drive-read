/**
 * Builds e2e/fixtures/test-manual.pdf: 6 Letter pages, Title/Author metadata, and an outline
 * with three parts (pages 1, 3 and 5). Hand-written PDF objects with exact xref offsets.
 * Run: bun e2e/fixtures/build-pdf.ts
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const PAGES = 6
const PARTS = [
  { title: 'Part One', page: 0 },
  { title: 'Part Two', page: 2 },
  { title: 'Part Three', page: 4 },
]

// Object numbers: 1 catalog, 2 pages, 3 outlines, 4 font, 5 info,
// then per page: page object, content stream; then one object per outline item.
const pageObj = (i: number) => 6 + i * 2
const contentObj = (i: number) => 7 + i * 2
const outlineObj = (i: number) => 6 + PAGES * 2 + i

const objects: string[] = []
const set = (n: number, body: string) => (objects[n] = body)

set(1, `<< /Type /Catalog /Pages 2 0 R /Outlines 3 0 R /PageMode /UseOutlines >>`)
set(
  2,
  `<< /Type /Pages /Count ${PAGES} /Kids [${Array.from({ length: PAGES }, (_, i) => `${pageObj(i)} 0 R`).join(' ')}] >>`,
)
set(
  3,
  `<< /Type /Outlines /First ${outlineObj(0)} 0 R /Last ${outlineObj(PARTS.length - 1)} 0 R /Count ${PARTS.length} >>`,
)
set(4, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`)
set(5, `<< /Title (The Test Manual) /Author (Ada Fixture) >>`)

for (let i = 0; i < PAGES; i++) {
  const part = [...PARTS].reverse().find((p) => p.page <= i)!
  const lines = [
    `BT /F1 40 Tf 72 690 Td (${part.title}) Tj ET`,
    `BT /F1 18 Tf 72 640 Td (Manual page ${i + 1} of ${PAGES}) Tj ET`,
    ...Array.from(
      { length: 22 },
      (_, l) =>
        `BT /F1 12 Tf 72 ${600 - l * 24} Td (Line ${l + 1}: the keeper checks the lamp and writes the hour in the log.) Tj ET`,
    ),
  ].join('\n')
  set(
    pageObj(i),
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents ${contentObj(i)} 0 R >>`,
  )
  set(contentObj(i), `<< /Length ${lines.length} >>\nstream\n${lines}\nendstream`)
}

PARTS.forEach((p, i) => {
  const prev = i > 0 ? ` /Prev ${outlineObj(i - 1)} 0 R` : ''
  const next = i < PARTS.length - 1 ? ` /Next ${outlineObj(i + 1)} 0 R` : ''
  set(
    outlineObj(i),
    `<< /Title (${p.title}) /Parent 3 0 R${prev}${next} /Dest [${pageObj(p.page)} 0 R /Fit] >>`,
  )
})

let out = '%PDF-1.4\n'
const offsets: number[] = []
for (let n = 1; n < objects.length; n++) {
  offsets[n] = out.length
  out += `${n} 0 obj\n${objects[n]}\nendobj\n`
}
const xref = out.length
out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
for (let n = 1; n < objects.length; n++) out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`
out += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`

const file = join(import.meta.dir, 'test-manual.pdf')
writeFileSync(file, out, 'latin1')
console.log(`wrote ${file} (${out.length} bytes)`)
