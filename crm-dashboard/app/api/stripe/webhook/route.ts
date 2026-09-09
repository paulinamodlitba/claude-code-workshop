import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase'
import { handleCheckoutCompleted, handleCheckoutExpired } from '@/lib/stripe-webhook'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = createServerSupabaseClient()

  if (event.type === 'checkout.session.completed') {
    await handleCheckoutCompleted(supabase, event.data.object as Stripe.Checkout.Session)
  } else if (event.type === 'checkout.session.expired') {
    await handleCheckoutExpired(supabase, event.data.object as Stripe.Checkout.Session)
  }

  return NextResponse.json({ received: true })
}
