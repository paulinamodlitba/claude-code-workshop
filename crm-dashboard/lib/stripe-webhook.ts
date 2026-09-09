import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { isPossibleDuplicate, type PersonRecord } from './matching'

export async function handleCheckoutCompleted(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
) {
  const name = session.customer_details?.name ?? 'Okänd'
  const email = session.customer_details?.email ?? ''
  const amount = session.amount_total ?? 0

  const { data: existingParticipants } = await supabase.from('participants').select('name, email')

  const candidate: PersonRecord = { name, email }
  const possibleDuplicate = isPossibleDuplicate(existingParticipants ?? [], candidate)

  await supabase.from('participants').upsert(
    {
      name,
      email,
      amount_paid_sek: Math.round(amount / 100),
      stripe_checkout_session_id: session.id,
      note: possibleDuplicate ? 'Möjlig dubblett — kolla manuellt' : null,
    },
    { onConflict: 'stripe_checkout_session_id' }
  )
}

export async function handleCheckoutExpired(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
) {
  const name = session.customer_details?.name ?? 'Okänd'
  const email = session.customer_details?.email ?? ''

  await supabase.from('leads').upsert(
    {
      name,
      email,
      source: 'nastan_betalare',
      stripe_checkout_session_id: session.id,
    },
    { onConflict: 'stripe_checkout_session_id' }
  )
}
