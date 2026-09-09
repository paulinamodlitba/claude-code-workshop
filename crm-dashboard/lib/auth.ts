const SESSION_PAYLOAD = 'crm-authenticated'

async function importHmacKey(password: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

export async function createAuthToken(password: string): Promise<string> {
  const key = await importHmacKey(password)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(SESSION_PAYLOAD))
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

export async function isValidAuthToken(
  token: string | undefined,
  password: string
): Promise<boolean> {
  if (!token) return false
  const expected = await createAuthToken(password)
  return constantTimeEqual(token, expected)
}

export function safeRedirectPath(from: string | null | undefined): string {
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/\\')) {
    return '/'
  }
  return from
}
