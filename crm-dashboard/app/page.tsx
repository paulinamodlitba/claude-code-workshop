import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase'

export default async function HomePage() {
  const supabase = createServerSupabaseClient()

  const { data: courseDates } = await supabase
    .from('course_dates')
    .select('id, date, track, capacity')
    .order('date', { ascending: true })

  const { data: participants } = await supabase
    .from('participants')
    .select('course_date_id, zoom_invite_sent')

  const { data: leads } = await supabase.from('leads').select('interested_course_date_id')

  return (
    <main style={{ maxWidth: 800, margin: '40px auto' }}>
      <h1>Kurstillfällen</h1>
      <ul>
        {(courseDates ?? []).map((courseDate) => {
          const participantsForDate = (participants ?? []).filter(
            (p) => p.course_date_id === courseDate.id
          )
          const waitlistForDate = (leads ?? []).filter(
            (l) => l.interested_course_date_id === courseDate.id
          )
          const missingZoom = participantsForDate.some((p) => !p.zoom_invite_sent)

          return (
            <li key={courseDate.id} style={{ marginBottom: 16 }}>
              <Link href={`/kurstillfalle/${courseDate.id}`}>
                {courseDate.date} ({courseDate.track})
              </Link>{' '}
              — {participantsForDate.length}/{courseDate.capacity} betalande,{' '}
              {waitlistForDate.length} på väntelista
              {missingZoom && <strong style={{ color: 'crimson' }}> ⚠ Zoom saknas</strong>}
            </li>
          )
        })}
      </ul>
      <nav style={{ marginTop: 32 }}>
        <Link href="/leads">Leads</Link> · <Link href="/statistik">Statistik</Link>
      </nav>
    </main>
  )
}
