import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizeName, isPossibleDuplicate } from './matching'

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Anna@Example.com ')).toBe('anna@example.com')
  })

  it('strips dots and plus-suffix for gmail addresses', () => {
    expect(normalizeEmail('anna.svensson+workshop@gmail.com')).toBe('annasvensson@gmail.com')
  })

  it('leaves dots intact for non-gmail addresses', () => {
    expect(normalizeEmail('anna.svensson@company.se')).toBe('anna.svensson@company.se')
  })
})

describe('normalizeName', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeName('  Anna   Svensson ')).toBe('anna svensson')
  })
})

describe('isPossibleDuplicate', () => {
  const existing = [{ name: 'Anna Svensson', email: 'anna.svensson@gmail.com' }]

  it('flags a match on normalized email even from a different-looking address', () => {
    const candidate = { name: 'A. Svensson', email: 'annasvensson@gmail.com' }
    expect(isPossibleDuplicate(existing, candidate)).toBe(true)
  })

  it('flags a match on name when the email differs completely', () => {
    const candidate = { name: 'Anna Svensson', email: 'anna@jobbet.se' }
    expect(isPossibleDuplicate(existing, candidate)).toBe(true)
  })

  it('does not flag an unrelated person', () => {
    const candidate = { name: 'Erik Larsson', email: 'erik@example.com' }
    expect(isPossibleDuplicate(existing, candidate)).toBe(false)
  })
})
