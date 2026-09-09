import { describe, it, expect, vi } from 'vitest'
import { handleCheckoutCompleted, handleCheckoutExpired } from './stripe-webhook'
import type Stripe from 'stripe'

function makeSupabaseMock(existingParticipants: { name: string; email: string }[] = []) {
  const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null })
  const selectMock = vi.fn().mockResolvedValue({ data: existingParticipants, error: null })
  const from = vi.fn(() => ({
    select: selectMock,
    upsert: upsertMock,
  }))
  return { from, upsertMock, selectMock } as any
}

function makeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    amount_total: 375000,
    customer_details: { name: 'Anna Svensson', email: 'anna@example.com' },
    ...overrides,
  } as Stripe.Checkout.Session
}

describe('handleCheckoutCompleted', () => {
  it('upserts a participant with amount converted from öre to kronor', async () => {
    const supabase = makeSupabaseMock()
    await handleCheckoutCompleted(supabase, makeSession())

    expect(supabase.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Anna Svensson',
        email: 'anna@example.com',
        amount_paid_sek: 3750,
        stripe_checkout_session_id: 'cs_test_123',
      }),
      { onConflict: 'stripe_checkout_session_id' }
    )
  })

  it('flags a possible duplicate when name matches an existing participant', async () => {
    const supabase = makeSupabaseMock([{ name: 'Anna Svensson', email: 'anna.jobb@example.com' }])
    await handleCheckoutCompleted(supabase, makeSession())

    expect(supabase.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'Möjlig dubblett — kolla manuellt' }),
      expect.anything()
    )
  })
})

describe('handleCheckoutExpired', () => {
  it('upserts a lead with source nastan_betalare', async () => {
    const supabase = makeSupabaseMock()
    await handleCheckoutExpired(supabase, makeSession({ id: 'cs_test_expired' }))

    expect(supabase.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'nastan_betalare',
        stripe_checkout_session_id: 'cs_test_expired',
      }),
      { onConflict: 'stripe_checkout_session_id' }
    )
  })
})
