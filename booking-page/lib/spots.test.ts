import { describe, it, expect } from 'vitest'
import { spotsLeft } from './spots'

describe('spotsLeft', () => {
  it('subtracts confirmed participants from capacity', () => {
    expect(spotsLeft(20, 16)).toBe(4)
  })

  it('never goes below zero when overbooked', () => {
    expect(spotsLeft(20, 22)).toBe(0)
  })

  it('returns full capacity when there are no participants', () => {
    expect(spotsLeft(20, 0)).toBe(20)
  })
})
