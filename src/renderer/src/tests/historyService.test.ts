import { describe, it, expect } from 'vitest'
import { pushHistory } from '../services/historyService'
import type { HistoryEntry } from '../types'

describe('pushHistory', () => {
  it('prepends the new entry', () => {
    const result = pushHistory([], 'Action', { obligations: [] }, { obligations: [] })
    expect(result).toHaveLength(1)
    expect(result[0].action).toBe('Action')
    expect(result[0].snapshotBefore).toEqual({ obligations: [] })
  })

  it('keeps at most 10 entries', () => {
    let history: HistoryEntry[] = []
    for (let i = 0; i < 15; i++) {
      history = pushHistory(history, `Action ${i}`, {}, {})
    }
    expect(history).toHaveLength(10)
    expect(history[0].action).toBe('Action 14')
    expect(history[9].action).toBe('Action 5')
  })
})
