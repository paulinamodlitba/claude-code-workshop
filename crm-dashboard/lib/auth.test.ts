import { describe, it, expect } from 'vitest'
import { createAuthToken, isValidAuthToken, safeRedirectPath, constantTimeEqual } from './auth'

describe('createAuthToken / isValidAuthToken', () => {
  it('accepts a token created from the same password', async () => {
    const token = await createAuthToken('hemligt')
    expect(await isValidAuthToken(token, 'hemligt')).toBe(true)
  })

  it('rejects a token created from a different password', async () => {
    const token = await createAuthToken('fel-lösenord')
    expect(await isValidAuthToken(token, 'hemligt')).toBe(false)
  })

  it('rejects a missing token', async () => {
    expect(await isValidAuthToken(undefined, 'hemligt')).toBe(false)
  })

  it('never stores the raw password as the token', async () => {
    const token = await createAuthToken('hemligt')
    expect(token).not.toBe('hemligt')
  })
})

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true)
  })

  it('returns false for different strings of the same length', () => {
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false)
  })

  it('returns false for strings of different length', () => {
    expect(constantTimeEqual('abc', 'abcdef')).toBe(false)
  })
})

describe('safeRedirectPath', () => {
  it('allows a plain relative path', () => {
    expect(safeRedirectPath('/kurstillfalle/123')).toBe('/kurstillfalle/123')
  })

  it('falls back to / for a missing value', () => {
    expect(safeRedirectPath(undefined)).toBe('/')
  })

  it('falls back to / for a protocol-relative URL (open redirect attempt)', () => {
    expect(safeRedirectPath('//evil.example.com')).toBe('/')
  })

  it('falls back to / for an absolute URL', () => {
    expect(safeRedirectPath('https://evil.example.com')).toBe('/')
  })
})
