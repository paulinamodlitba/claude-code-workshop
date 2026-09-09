import { createServerSupabaseClient } from '@/lib/supabase'

async function toggleZoom(participantId: string, current: boolean) {
  'use server'
  const supabase = createServerSupabaseClient()
  await supabase.from('participants').update({ zoom_invite_sent: !current }).eq('id', participantId)
}

export default async function CourseDateDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient()

  const { data: courseDate } = await supabase
    .from('course_dates')
    .select('id, date, track, capacity')
    .eq('id', params.id)
    .single()

  if (!courseDate) {
    return <main style={{ maxWidth: 800, margin: '40px auto' }}>Kurstillfället hittades inte.</main>
  }

  const { data: participants } = await supabase
    .from('participants')
    .select('id, name, email, amount_paid_sek, note, zoom_invite_sent')
    .eq('course_date_id', params.id)

  const { data: leads } = await supabase
    .from('leads')
    .select('id, name, email, source, status')
    .eq('interested_course_date_id', params.id)

  return (
    <main style={{ maxWidth: 800, margin: '40px auto' }}>
      <h1>
        {courseDate.date} ({courseDate.track})
      </h1>

      <h2>
        Betalande ({(participants ?? []).length}/{courseDate.capacity})
      </h2>
      <ul>
        {(participants ?? []).map((p) => (
          <li key={p.id}>
            {p.name} — {p.email} — {p.amount_paid_sek} kr
            {p.note && <em> ({p.note})</em>}{' '}
            <form action={toggleZoom.bind(null, p.id, p.zoom_invite_sent)} style={{ display: 'inline' }}>
              <button type="submit">
                {p.zoom_invite_sent ? '✓ Zoom skickad' : 'Markera Zoom skickad'}
              </button>
            </form>
          </li>
        ))}
      </ul>

      <h2>Väntelista ({(leads ?? []).length})</h2>
      <ul>
        {(leads ?? []).map((l) => (
          <li key={l.id}>
            {l.name} — {l.email} — {l.source} — {l.status}
          </li>
        ))}
      </ul>
    </main>
  )
}
