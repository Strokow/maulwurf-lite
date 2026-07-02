import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Language } from '../types'
import { en, type TranslationKey } from './en'
import { fr } from './fr'

const dictionaries: Record<Language, Record<TranslationKey, string>> = { en, fr }

export type { TranslationKey }

export interface I18n {
  language: Language
  locale: string // BCP 47 locale for Intl APIs
  t: (key: TranslationKey, params?: Record<string, string | number>) => string
  // Plural-aware translation: picks `${key}_one` / `${key}_other` and injects {n}.
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
  const locale = language === 'fr' ? 'fr-FR' : 'en-US'
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

  const t: I18n['t'] = (key, params) => interpolate(dict[key] ?? key, params)

  const tn: I18n['tn'] = (key, n, params) => {
    const suffix = n === 1 ? '_one' : '_other'
    const full = (dict as Record<string, string>)[key + suffix] ?? key + suffix
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
        return n.toLocaleString(locale, { style: 'currency', currency })
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
