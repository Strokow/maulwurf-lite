import { describe, it, expect } from 'vitest'
import { en } from '../i18n/en'
import { fr } from '../i18n/fr'
import { de } from '../i18n/de'
import { ru } from '../i18n/ru'
import { buildI18n } from '../i18n'

// EN is the source of truth; every other dictionary is checked against it.
const translations: Record<string, Record<string, string>> = { fr, de, ru }

const stripPluralSuffix = (key: string): string => key.replace(/_(few|many)$/, '')

describe('i18n dictionaries', () => {
  for (const [lang, dict] of Object.entries(translations)) {
    describe(lang.toUpperCase(), () => {
      it('covers every EN key', () => {
        for (const key of Object.keys(en)) {
          expect(dict[key], `${lang}.${key} is missing`).toBeDefined()
        }
      })

      it('has no keys unknown to EN (extra CLDR plural forms excepted)', () => {
        const enKeys = new Set(Object.keys(en))
        for (const key of Object.keys(dict)) {
          if (enKeys.has(key)) continue
          // Languages with three plural forms (Russian) may add `_few`/`_many`
          // variants of plural keys that exist in EN as `_one`/`_other`.
          const base = stripPluralSuffix(key)
          expect(
            base !== key && enKeys.has(`${base}_other`),
            `${lang}.${key} has no EN counterpart`
          ).toBe(true)
        }
      })

      it('has no empty translations and matching placeholders', () => {
        const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort()
        const enDict = en as Record<string, string>
        for (const [key, value] of Object.entries(dict)) {
          expect(value.length, `${lang}.${key} is empty`).toBeGreaterThan(0)
          const reference = enDict[key] ?? enDict[`${stripPluralSuffix(key)}_other`]
          expect(placeholders(value), `placeholder mismatch in "${lang}.${key}"`).toEqual(
            placeholders(reference)
          )
        }
      })
    })
  }

  it('EN has no empty translations', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.length, `en.${key} is empty`).toBeGreaterThan(0)
    }
  })
})

describe('buildI18n', () => {
  it('interpolates params', () => {
    const i18n = buildI18n('en')
    expect(i18n.t('attemptsLeft', { n: 2 })).toBe('Attempts left: 2')
  })

  it('handles plural forms', () => {
    const i18n = buildI18n('en')
    expect(i18n.tn('duePayments', 1)).toContain('1 payment due')
    expect(i18n.tn('duePayments', 3)).toContain('3 payments due')
  })

  it('picks Russian CLDR plural forms (one/few/many)', () => {
    const i18n = buildI18n('ru')
    expect(i18n.tn('duePayments', 1)).toContain('1 платёж ')
    expect(i18n.tn('duePayments', 2)).toContain('2 платежа ')
    expect(i18n.tn('duePayments', 5)).toContain('5 платежей ')
    expect(i18n.tn('duePayments', 21)).toContain('21 платёж ')
  })

  it('falls back to _other when a plural form is not defined', () => {
    // ru.linkedCount defines only _one/_other; n=2 selects 'few' → _other.
    expect(buildI18n('ru').tn('linkedCount', 2)).toBe('связано: 2')
  })

  it('localises month names', () => {
    expect(buildI18n('en').monthName(3)).toBe('March')
    expect(buildI18n('fr').monthName(3).toLowerCase()).toBe('mars')
    expect(buildI18n('de').monthName(3)).toBe('März')
    expect(buildI18n('ru').monthName(3).toLowerCase()).toBe('март')
  })

  it('formats currency per locale and code', () => {
    const enFmt = buildI18n('en').formatCurrency(1234.5, 'USD')
    expect(enFmt).toContain('$')
    const frFmt = buildI18n('fr').formatCurrency(1234.5, 'EUR')
    expect(frFmt).toContain('€')
    const ruFmt = buildI18n('ru').formatCurrency(1234.5, 'EUR')
    expect(ruFmt).toContain('€')
  })

  it('falls back gracefully on an invalid currency code', () => {
    expect(buildI18n('en').formatCurrency(10, 'NOPE!')).toBe('10.00 NOPE!')
  })
})
