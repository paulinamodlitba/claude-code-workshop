import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

config({ path: '.env.local' })

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        current += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      values.push(current)
      current = ''
    } else {
      current += char
    }
  }
  values.push(current)

  return values.map((v) => v.trim())
}

function parseCsv(content: string): Record<string, string>[] {
  const [headerLine, ...lines] = content.trim().split('\n')
  const headers = parseCsvLine(headerLine)
  return lines
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const values = parseCsvLine(line)
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    })
}

async function importDeltagare(filePath: string, courseDateId: string) {
  const content = readFileSync(filePath, 'utf-8')
  const rows = parseCsv(content)

  for (const row of rows) {
    await supabase.from('participants').insert({
      course_date_id: courseDateId,
      name: row['Namn'],
      email: row['E-post'],
      amount_paid_sek: Number(row['Betalt (inkl. moms)'] ?? 0),
      note: row['Notering'] || null,
    })
  }

  console.log(`Importerade ${rows.length} deltagare från ${filePath}`)
}

async function main() {
  const [, , filePath, courseDateId] = process.argv
  if (!filePath || !courseDateId) {
    console.error('Användning: npx tsx scripts/import-csv.ts <fil> <course_date_id>')
    process.exit(1)
  }
  await importDeltagare(filePath, courseDateId)
}

main()
