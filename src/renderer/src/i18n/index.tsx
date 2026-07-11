import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Language } from '../types'
import { en, type TranslationKey } from './en'
import { fr } from './fr'
import { de } from './de'
import { ru } from './ru'

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, fr, de, ru }

const locales: Record<Language, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  de: 'de-DE',
  ru: 'ru-RU',
}

export type { TranslationKey }

export interface I18n {
  language: Language
  locale: string // BCP 47 locale for Intl APIs
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  // Plural-aware translation: picks the CLDR form (`${key}_one/_few/_many/_other`,
  // falling back to `_other`) and injects {n}.
  tn: (key: string, n: number, params?: Record<string, string | number>) => string
  monthName: (month: number) => string // 1-12, standalone ("March" / "mars")
  monthYear: (year: number, month: number) => string // "March 2026" / "mars 2026"
  monthShort: (month: number) => string // "Mar" / "mars" (short)
  formatCurrency: (n: number, currency: string) => string
  formatDateTime: (d: Date) => string
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (m, name) =>
    params[name] !== undefined ? String(params[name]) : m
  )
}

export function buildI18n(language: Language): I18n {
  const dict = dictionaries[language]
  const locale = locales[language]
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

  const t: I18n['t'] = (key, params) => interpolate(dict[key] ?? key, params)

  // CLDR plural category ('one' | 'few' | 'many' | 'other') per locale; the
  // dictionary key is `${key}_${category}` with `_other` as the fallback.
  // EN/FR/DE only define _one/_other; RU adds _few/_many where needed.
  const pluralRules = new Intl.PluralRules(locale)
  const tn: I18n['tn'] = (key, n, params) => {
    const d = dict as Record<string, string>
    const full = d[`${key}_${pluralRules.select(n)}`] ?? d[`${key}_other`] ?? `${key}_other`
    return interpolate(full, { n, ...params })
  }

  return {
    language,
    locale,
    t,
    tn,
    monthName: (month) =>
      cap(new Date(2000, month - 1, 1).toLocaleDateString(locale, { month: 'long' })),
    monthYear: (year, month) =>
      cap(new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })),
    monthShort: (month) =>
      cap(new Date(2000, month - 1, 1).toLocaleDateString(locale, { month: 'short' })),
    formatCurrency: (n, currency) => {
      try {
        // narrowSymbol → always the real currency glyph (₽ $ £ €) regardless of
        // locale, instead of a code like "RUB" or a wide form like "US$".
        return n.toLocaleString(locale, {
          style: 'currency',
          currency,
          currencyDisplay: 'narrowSymbol',
        })
      } catch {
        // Invalid/unknown currency code — fall back to a plain number + code.
        return `${n.toFixed(2)} ${currency}`
      }
    },
    formatDateTime: (d) => d.toLocaleString(locale),
  }
}

const I18nContext = createContext<I18n>(buildI18n('en'))

export function I18nProvider({
  language,
  children,
}: {
  language: Language
  children: ReactNode
}): React.JSX.Element {
  const i18n = useMemo(() => buildI18n(language), [language])
  return <I18nContext.Provider value={i18n}>{children}</I18nContext.Provider>
}

export function useI18n(): I18n {
  return useContext(I18nContext)
}
