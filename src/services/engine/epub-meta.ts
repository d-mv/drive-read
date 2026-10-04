import type { TocEntry } from './types'

/**
 * Pure helpers that turn foliate-js metadata (Readium webpub manifest shapes) into BookMeta fields.
 */

type LanguageMap = string | Record<string, string> | undefined
type Contributor = string | { name?: LanguageMap } | undefined

export function formatLanguageMap(value: LanguageMap, lang?: string): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return (lang ? value[lang] : undefined) ?? value.en ?? Object.values(value)[0] ?? ''
}

const contributorName = (c: Contributor, lang?: string) =>
  typeof c === 'string' ? c : formatLanguageMap(c?.name, lang)

export function formatAuthors(value: Contributor | Contributor[], lang?: string): string {
  const list = Array.isArray(value) ? value : [value]
  return list
    .map((c) => contributorName(c, lang).trim())
    .filter(Boolean)
    .join(', ')
}

export interface RawTocItem {
  label?: string
  href?: string
  subitems?: RawTocItem[]
}

/**
 * Top-level TOC entries with their starting fraction. `resolve` maps an href to its section
 * index; entries it cannot resolve are dropped.
 */
export function tocEntries(
  toc: readonly RawTocItem[],
  starts: readonly number[],
  resolve: (href: string) => number | undefined,
): TocEntry[] {
  return toc.flatMap((item) => {
    if (!item.href) return []
    const index = resolve(item.href)
    const start = index === undefined ? undefined : starts[index]
    if (start === undefined) return []
    return [{ label: (item.label ?? '').trim(), locator: { kind: 'href', href: item.href }, start }]
  })
}
