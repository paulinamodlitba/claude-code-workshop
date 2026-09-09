import { createServerSupabaseClient } from '@/lib/supabase'

async function markContacted(leadId: string) {
  'use server'
  const supabase = createServerSupabaseClient()
  await supabase.from('leads').update({ status: 'kontaktad' }).eq('id', leadId)
}

async function assignToDate(leadId: string, formData: FormData) {
  'use server'
  const courseDateId = formData.get('course_date_id') as string
  const supabase = createServerSupabaseClient()
  await supabase
    .from('leads')
    .update({ interested_course_date_id: courseDateId || null })
    .eq('id', leadId)
}

async function createLead(formData: FormData) {
  'use server'
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const supabase = createServerSupabaseClient()
  await supabase.from('leads').insert({ name, email, source: 'manuellt' })
}

export default async function LeadsPage({ searchParams }: { searchParams: { source?: string } }) {
  const supabase = createServerSupabaseClient()

  let query = supabase
    .from('leads')
    .select('id, name, email, source, status, interested_course_date_id')
    .order('created_at', { ascending: false })

  if (searchParams.source) {
    query = query.eq('source', searchParams.source)
  }

  const { data: leads } = await query
  const { data: courseDates } = await supabase
    .from('course_dates')
    .select('id, date')
    .order('date', { ascending: true })

  return (
    <main style={{ maxWidth: 900, margin: '40px auto' }}>
      <h1>Leads</h1>

      <form action={createLead} style={{ marginBottom: 24 }}>
        <input name="name" placeholder="Namn" required />{' '}
        <input name="email" type="email" placeholder="E-post" required />{' '}
        <button type="submit">Lägg till lead</button>
      </form>

      <nav>
        <a href="/leads">Alla</a> · <a href="/leads?source=formulär">Formulär</a> ·{' '}
        <a href="/leads?source=manuellt">Manuellt</a> ·{' '}
        <a href="/leads?source=nastan_betalare">Nästan-betalare</a>
      </nav>
      <ul>
        {(leads ?? []).map((lead) => (
          <li key={lead.id} style={{ marginBottom: 12 }}>
            {lead.name} — {lead.email} — {lead.source} — {lead.status}{' '}
            {lead.status !== 'kontaktad' && (
              <form action={markContacted.bind(null, lead.id)} style={{ display: 'inline' }}>
                <button type="submit">Markera kontaktad</button>
              </form>
            )}{' '}
            <form action={assignToDate.bind(null, lead.id)} style={{ display: 'inline' }}>
              <select name="course_date_id" defaultValue={lead.interested_course_date_id ?? ''}>
                <option value="">Inget datum</option>
                {(courseDates ?? []).map((cd) => (
                  <option key={cd.id} value={cd.id}>
                    {cd.date}
                  </option>
                ))}
              </select>
              <button type="submit">Koppla</button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  )
}
