import { createServerSupabaseClient } from '@/lib/supabase'

export default async function StatsPage() {
  const supabase = createServerSupabaseClient()

  const { data: courseDates } = await supabase
    .from('course_dates')
    .select('id, date')
    .order('date', { ascending: true })

  const { data: participants } = await supabase.from('participants').select('course_date_id')
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })

  const totalParticipants = (participants ?? []).length
  const conversionRate =
    totalLeads && totalLeads + totalParticipants > 0
      ? Math.round((totalParticipants / (totalParticipants + totalLeads)) * 100)
      : 0

  return (
    <main style={{ maxWidth: 700, margin: '40px auto' }}>
      <h1>Statistik</h1>
      <p>
        Konverteringsgrad lead → betalande: <strong>{conversionRate}%</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Betalande</th>
          </tr>
        </thead>
        <tbody>
          {(courseDates ?? []).map((cd) => (
            <tr key={cd.id}>
              <td>{cd.date}</td>
              <td>{(participants ?? []).filter((p) => p.course_date_id === cd.id).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
