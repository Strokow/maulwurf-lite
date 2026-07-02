import { describe, it, expect } from 'vitest'
import { en } from '../i18n/en'
import { fr } from '../i18n/fr'
import { buildI18n } from '../i18n'

describe('i18n dictionaries', () => {
  it('FR covers exactly the same keys as EN', () => {
    const enKeys = Object.keys(en).sort()
    const frKeys = Object.keys(fr).sort()
    expect(frKeys).toEqual(enKeys)
  })

  it('no empty translations in either language', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value.length, `en.${key} is empty`).toBeGreaterThan(0)
    }
    for (const [key, value] of Object.entries(fr)) {
      expect(value.length, `fr.${key} is empty`).toBeGreaterThan(0)
    }
  })

  it('placeholders match between EN and FR', () => {
    const placeholders = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(fr[key]), `placeholder mismatch in "${key}"`).toEqual(
        placeholders(en[key])
      )
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

  it('localises month names', () => {
    expect(buildI18n('en').monthName(3)).toBe('March')
    expect(buildI18n('fr').monthName(3).toLowerCase()).toBe('mars')
  })

  it('formats currency per locale and code', () => {
    const enFmt = buildI18n('en').formatCurrency(1234.5, 'USD')
    expect(enFmt).toContain('$')
    const frFmt = buildI18n('fr').formatCurrency(1234.5, 'EUR')
    expect(frFmt).toContain('€')
  })

  it('falls back gracefully on an invalid currency code', () => {
    expect(buildI18n('en').formatCurrency(10, 'NOPE!')).toBe('10.00 NOPE!')
  })
})
