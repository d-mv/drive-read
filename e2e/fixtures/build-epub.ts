/**
 * Builds e2e/fixtures/test-voyage.epub: four chapters with a TOC, long enough to paginate.
 * Chapter 3 carries a script that must NOT run (the CSP blocks it).
 * Run: bun e2e/fixtures/build-epub.ts (needs the `zip` CLI)
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const out = join(import.meta.dir, 'test-voyage.epub')
const dir = mkdtempSync(join(tmpdir(), 'epub-'))
const write = (p: string, s: string) => {
  mkdirSync(join(dir, p, '..'), { recursive: true })
  writeFileSync(join(dir, p), s)
}

const chapters = ['Departure', 'The Long Calm', 'Signals', 'Landfall']
const sentence = (c: number, i: number) =>
  `Chapter ${c + 1}, line ${i + 1}: the ship kept its heading while the crew counted the hours and wrote them down in the log.`
const body = (c: number) =>
  Array.from(
    { length: 40 },
    (_, p) => `<p>${Array.from({ length: 6 }, (_, i) => sentence(c, p * 6 + i)).join(' ')}</p>`,
  ).join('\n')

write('mimetype', 'application/epub+zip')
write(
  'META-INF/container.xml',
  `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
)
write(
  'OEBPS/content.opf',
  `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:drive-read-test-voyage</dc:identifier>
    <dc:title>The Test Voyage</dc:title>
    <dc:creator>Ada Fixture</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-10-04T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${chapters.map((_, i) => `<item id="c${i + 1}" href="c${i + 1}.xhtml" media-type="application/xhtml+xml"${i === 2 ? ' properties="scripted"' : ''}/>`).join('\n    ')}
  </manifest>
  <spine>${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('')}</spine>
</package>`,
)
write(
  'OEBPS/nav.xhtml',
  `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head>
<body><nav epub:type="toc"><ol>${chapters.map((t, i) => `<li><a href="c${i + 1}.xhtml">${t}</a></li>`).join('')}</ol></nav></body></html>`,
)
chapters.forEach((title, i) => {
  const script =
    i === 2
      ? `<script>try { parent.document.documentElement.dataset.pwned = '1' } catch (e) {} document.documentElement.dataset.pwned = '1'</script>`
      : ''
  write(
    `OEBPS/c${i + 1}.xhtml`,
    `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>${title}</title>${script}</head>
<body><h1>${title}</h1>\n${body(i)}</body></html>`,
  )
})

const zip = (args: string[]) => {
  const r = Bun.spawnSync(['zip', ...args], { cwd: dir })
  if (r.exitCode !== 0) throw new Error(r.stderr.toString())
}
Bun.spawnSync(['rm', '-f', out])
zip(['-X0', out, 'mimetype'])
zip(['-Xr9D', out, 'META-INF', 'OEBPS'])
console.log(`wrote ${out}`)
