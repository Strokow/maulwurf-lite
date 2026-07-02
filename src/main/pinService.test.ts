import { describe, it, expect } from 'vitest'
import { hashPin, verifyPin, type PinSettings } from './pinService'

function settingsWith(overrides: Partial<PinSettings> = {}): PinSettings {
  return {
    enabled: true,
    pinHash: hashPin('123456'),
    lockoutUntil: null,
    failedAttempts: 0,
    ...overrides,
  }
}

describe('hashPin', () => {
  it('produces a stable SHA-256 hex hash', () => {
    const h = hashPin('123456')
    expect(h).toMatch(/^[a-f0-9]{64}$/)
    expect(hashPin('123456')).toBe(h)
  })
  it('different PINs produce different hashes', () => {
    expect(hashPin('123456')).not.toBe(hashPin('654321'))
  })
})

describe('verifyPin', () => {
  it('accepts the correct PIN', () => {
    const result = verifyPin('123456', settingsWith())
    expect(result.success).toBe(true)
    expect(result.locked).toBe(false)
  })

  it('rejects a wrong PIN and decrements attempts', () => {
    const result = verifyPin('000000', settingsWith())
    expect(result.success).toBe(false)
    expect(result.attemptsLeft).toBe(2)
    expect(result.locked).toBe(false)
  })

  it('locks after the third failed attempt', () => {
    const result = verifyPin('000000', settingsWith({ failedAttempts: 2 }))
    expect(result.success).toBe(false)
    expect(result.locked).toBe(true)
    expect(result.lockoutUntil).toBeDefined()
  })

  it('stays locked while the lockout is active', () => {
    const lockoutUntil = new Date(Date.now() + 60000).toISOString()
    const result = verifyPin('123456', settingsWith({ lockoutUntil, failedAttempts: 3 }))
    expect(result.success).toBe(false)
    expect(result.locked).toBe(true)
  })

  it('accepts the correct PIN after the lockout expires', () => {
    const lockoutUntil = new Date(Date.now() - 1000).toISOString()
    const result = verifyPin('123456', settingsWith({ lockoutUntil, failedAttempts: 3 }))
    expect(result.success).toBe(true)
  })
})
