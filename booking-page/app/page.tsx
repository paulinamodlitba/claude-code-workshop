import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase'
import { spotsLeft } from '@/lib/spots'

export const dynamic = 'force-dynamic'

const DATE_PREFERENCES = [
  { key: 'allmant', label: 'Allmänt intresserad när det kommer nya datum' },
  { key: 'kvall', label: 'Jag kan bara/föredrar kvällstid' },
  { key: 'helg', label: 'Jag kan bara/föredrar på helgen' },
  { key: 'fysisk', label: 'Jag vill inte köra digitalt' },
]

async function createLead(formData: FormData) {
  'use server'
  const name = formData.get('name') as string
  const email = formData.get('email') as string
  const freeText = (formData.get('free_text') as string) || ''
  const preferences = DATE_PREFERENCES.filter((p) => formData.get(`pref_${p.key}`)).map(
    (p) => p.label
  )

  const noteParts = []
  if (preferences.length > 0) noteParts.push(`Datumpreferens: ${preferences.join(', ')}`)
  if (freeText) noteParts.push(`Önskemål: ${freeText}`)

  const supabase = createServerSupabaseClient()
  await supabase.from('leads').insert({
    name,
    email,
    source: 'formulär',
    note: noteParts.join(' | ') || null,
  })
  revalidatePath('/')
}

export default async function BookingPage({
  searchParams,
}: {
  searchParams: { bokad?: string; avbruten?: string }
}) {
  const supabase = createServerSupabaseClient()

  const { data: courseDates } = await supabase
    .from('course_dates')
    .select('id, date, track, capacity')
    .order('date', { ascending: true })

  const { data: participants } = await supabase.from('participants').select('course_date_id')

  const dates = courseDates ?? []

  return (
    <main className="wrap">
      <header className="top">
        <p className="kicker">Claude Code-workshop</p>
        <h1>Boka en kursplats</h1>
        <p className="sub">Välj ett datum och betala direkt, eller anmäl intresse om du inte är redo än.</p>
      </header>

      {searchParams.bokad && (
        <div className="card" style={{ marginBottom: 24, borderColor: 'var(--good)' }}>
          <p>Tack för din bokning! Du får en bekräftelse via e-post från Stripe.</p>
        </div>
      )}
      {searchParams.avbruten && (
        <div className="card" style={{ marginBottom: 24 }}>
          <p>Bokningen avbröts — inget drogs från ditt kort.</p>
        </div>
      )}

      <h2>Boka nu</h2>
      {dates.length === 0 ? (
        <p className="empty">Inga kurstillfällen inlagda just nu — anmäl gärna intresse nedan.</p>
      ) : (
        <ul className="list">
          {dates.map((courseDate) => {
            const count = (participants ?? []).filter(
              (p) => p.course_date_id === courseDate.id
            ).length
            const remaining = spotsLeft(courseDate.capacity, count)
            const full = remaining <= 0

            return (
              <li key={courseDate.id} className="card">
                <div className="card-row">
                  <div>
                    <span className="card-title">
                      {courseDate.date} ({courseDate.track})
                    </span>
                    <p className="card-meta">
                      {full ? 'Fullbokat' : `${remaining} av ${courseDate.capacity} platser kvar`}
                    </p>
                  </div>
                  {full ? (
                    <span className="badge">Fullbokat</span>
                  ) : (
                    <form action="/api/book" method="POST">
                      <input type="hidden" name="course_date_id" value={courseDate.id} />
                      <button type="submit">Boka — 3000 kr ex moms</button>
                    </form>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <h2>Inte redo att bestämma dig?</h2>
      <div className="card">
        <form action={createLead} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input name="name" placeholder="Namn" required />
            <input name="email" type="email" placeholder="E-post" required />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {DATE_PREFERENCES.map((p) => (
              <label key={p.key} style={{ fontSize: 13.5, display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" name={`pref_${p.key}`} />
                {p.label}
              </label>
            ))}
          </div>
          <textarea
            name="free_text"
            placeholder="Har du några särskilda frågor eller önskemål?"
            rows={3}
          />
          <button type="submit" style={{ alignSelf: 'flex-start' }}>
            Anmäl intresse
          </button>
        </form>
      </div>
    </main>
  )
}
