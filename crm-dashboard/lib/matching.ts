export interface PersonRecord {
  name: string
  email: string
}

export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase()
  const [local, domain] = trimmed.split('@')
  if (!domain) return trimmed
  const isGmail = domain === 'gmail.com' || domain === 'googlemail.com'
  const normalizedLocal = isGmail ? local.replace(/\./g, '').split('+')[0] : local
  return `${normalizedLocal}@${domain}`
}

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isPossibleDuplicate(existing: PersonRecord[], candidate: PersonRecord): boolean {
  const candidateEmail = normalizeEmail(candidate.email)
  const candidateName = normalizeName(candidate.name)
  return existing.some(
    (person) =>
      normalizeEmail(person.email) === candidateEmail ||
      normalizeName(person.name) === candidateName
  )
}
