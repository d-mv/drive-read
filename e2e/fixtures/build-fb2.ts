/**
 * Builds the FB2 fixtures: `test-flame.fb2` (UTF-8 XML) and `test-flame-fb2.epub`, the same book
 * in windows-1251, zipped and misnamed `.epub` the way such books are often downloaded.
 * Run: bun e2e/fixtures/build-fb2.ts (needs the `zip` and `iconv` CLIs)
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const here = import.meta.dir
const paragraphs = (n: number, text: string) =>
  Array.from({ length: n }, (_, i) => `<p>${text} ${i + 1}.</p>`).join('\n')

const chapters = [
  ['Глава первая', 'Огонь горел ровно, и путники молчали у костра'],
  ['Глава вторая', 'Наутро дорога ушла в горы, и ветер стал холоднее'],
  ['Глава третья', 'У перевала их ждал старый смотритель с фонарём'],
]

const book = (encoding: string) => `<?xml version="1.0" encoding="${encoding}"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
  <title-info>
    <genre>sf</genre>
    <author><first-name>Ада</first-name><last-name>Фикстурова</last-name></author>
    <book-title>Тестовое пламя</book-title>
    <lang>ru</lang>
  </title-info>
</description>
<body>
${chapters.map(([title, text]) => `<section><title><p>${title}</p></title>\n${paragraphs(40, text!)}\n</section>`).join('\n')}
</body>
</FictionBook>
`

writeFileSync(join(here, 'test-flame.fb2'), book('utf-8'))

const dir = mkdtempSync(join(tmpdir(), 'fb2-'))
try {
  const utf8 = join(dir, 'utf8.fb2')
  writeFileSync(utf8, book('windows-1251'))
  const cp1251 = Bun.spawnSync(['iconv', '-f', 'utf-8', '-t', 'windows-1251', utf8])
  if (cp1251.exitCode !== 0) throw new Error(cp1251.stderr.toString())
  writeFileSync(join(dir, 'Fikstura_Plamya.fb2'), cp1251.stdout)
  const out = join(here, 'test-flame-fb2.epub')
  rmSync(out, { force: true })
  const zip = Bun.spawnSync(['zip', '-X9', out, 'Fikstura_Plamya.fb2'], { cwd: dir })
  if (zip.exitCode !== 0) throw new Error(zip.stderr.toString())
} finally {
  rmSync(dir, { recursive: true, force: true })
}
console.log('wrote test-flame.fb2 and test-flame-fb2.epub')
