import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createServerSupabaseClient } from '@/lib/supabase'
import { spotsLeft } from '@/lib/spots'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const courseDateId = formData.get('course_date_id') as string
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL!

  const supabase = createServerSupabaseClient()

  const { data: courseDate } = await supabase
    .from('course_dates')
    .select('id, date, track, capacity')
    .eq('id', courseDateId)
    .single()

  if (!courseDate) {
    return NextResponse.json({ error: 'Kurstillfället hittades inte' }, { status: 404 })
  }

  const { count: participantCount } = await supabase
    .from('participants')
    .select('id', { count: 'exact', head: true })
    .eq('course_date_id', courseDateId)

  if (spotsLeft(courseDate.capacity, participantCount ?? 0) <= 0) {
    return NextResponse.json({ error: 'Kurstillfället är fullbokat' }, { status: 409 })
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'sek',
          unit_amount: 375000,
          product_data: {
            name: `Claude Code-workshop — ${courseDate.date} (${courseDate.track})`,
            description: '3000 kr ex moms',
          },
        },
        quantity: 1,
      },
    ],
    allow_promotion_codes: true,
    metadata: { course_date_id: courseDate.id },
    success_url: `${siteUrl}?bokad=1`,
    cancel_url: `${siteUrl}?avbruten=1`,
  })

  return NextResponse.redirect(session.url!, { status: 303 })
}
