/**
 * Readable titles, authors and folder names from Drive file names, before a book is opened.
 * Covers the two common library layouts: "Last, First. Title.epub" and Calibre's
 * "Title - Author.epub" inside author folders named like "dawson,-mark".
 */

const stripExtension = (name: string) => name.replace(/\.(epub|pdf)$/i, '').trim()

/** "Last, First. Title" — the author part has no dots, the title follows ". ". */
const LAST_FIRST = /^([^,.]+),\s*([^.]+?)\.\s+(.+)$/
/** "Title - Author" */
const TITLE_AUTHOR = /^(.+?)\s+-\s+(.+)$/

export function bookFromFileName(fileName: string): { title: string; author: string } {
  const base = stripExtension(fileName)
  const lastFirst = LAST_FIRST.exec(base)
  if (lastFirst)
    return {
      title: lastFirst[3]!.trim(),
      author: `${lastFirst[2]!.trim()} ${lastFirst[1]!.trim()}`,
    }
  const titleAuthor = TITLE_AUTHOR.exec(base)
  if (titleAuthor) return { title: titleAuthor[1]!.trim(), author: titleAuthor[2]!.trim() }
  return { title: base || fileName, author: '' }
}

/** Only "last,-first" is clearly an author: a lone word like "books" may be any folder. */
const AUTHOR_SLUG = /^[a-z0-9-]+,-[a-z0-9-]+$/
const words = (s: string) =>
  s
    .split('-')
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase() + w.slice(1))
    .join(' ')

/** "dawson,-mark" → "Mark Dawson"; every other name is returned as is. */
export function folderLabel(name: string): string {
  if (!AUTHOR_SLUG.test(name)) return name
  const [last, first] = name.split(',-')
  return `${words(first!)} ${words(last!)}`
}
