# CRM/lead-dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a password-protected internal dashboard (`crm-dashboard/`) that tracks kurstillfällen, betalande deltagare, and leads by syncing live from Stripe webhooks, replacing the current manual CSV workflow.

**Architecture:** Next.js (App Router, TypeScript) app deployed on Vercel, backed by a Supabase Postgres database. A Stripe webhook endpoint upserts `participants` on completed checkouts and `leads` on expired ones. A shared-password middleware gate protects every route except the webhook and login page. Server actions handle in-app mutations (mark contacted, toggle Zoom sent, assign lead to a date) — no separate API layer needed for those.

**Tech Stack:** Next.js 14, TypeScript, Supabase (`@supabase/supabase-js`), Stripe SDK, Vitest for unit tests.

Spec: [`docs/superpowers/specs/2026-09-09-crm-dashboard-design.md`](../specs/2026-09-09-crm-dashboard-design.md)

---

## File Structure

```
crm-dashboard/
├── package.json
├── tsconfig.json
├── next.config.mjs
├── vitest.config.ts
├── .env.local.example
├── middleware.ts
├── lib/
│   ├── supabase.ts
│   ├── matching.ts
│   ├── matching.test.ts
│   ├── stripe-webhook.ts
│   ├── stripe-webhook.test.ts
│   ├── auth.ts
│   └── auth.test.ts
├── app/
│   ├── layout.tsx
│   ├── page.tsx                        (kurstillfällen — startsida)
│   ├── login/page.tsx
│   ├── kurstillfalle/[id]/page.tsx
│   ├── leads/page.tsx
│   ├── statistik/page.tsx
│   └── api/
│       ├── login/route.ts
│       └── stripe/webhook/route.ts
├── supabase/
│   └── migrations/0001_init.sql
└── scripts/
    └── import-csv.ts
```

---

### Task 1: Project scaffold

**Files:**
- Create: `crm-dashboard/` (via `create-next-app`)
- Modify: `crm-dashboard/package.json` (add deps)
- Create: `crm-dashboard/vitest.config.ts`
- Create: `crm-dashboard/.env.local.example`

- [ ] **Step 1: Scaffold the Next.js app**

Run from `projects/claude-code-workshop/`:

```bash
npx create-next-app@14 crm-dashboard --typescript --tailwind=false --eslint --app --src-dir=false --import-alias "@/*" --use-npm
```

- [ ] **Step 2: Install dependencies**

```bash
cd crm-dashboard
npm install @supabase/supabase-js stripe
npm install -D vitest tsx dotenv
```

- [ ] **Step 3: Add Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
  },
})
```

- [ ] **Step 4: Add a `test` script**

Edit `package.json`, add to `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 5: Add environment variable template**

```bash
# .env.local.example
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CRM_PASSWORD=
```

- [ ] **Step 6: Commit**

```bash
git add crm-dashboard package.json crm-dashboard/vitest.config.ts crm-dashboard/.env.local.example
git commit -m "chore: scaffold crm-dashboard Next.js app"
```

---

### Task 2: Supabase schema and client

**Files:**
- Create: `crm-dashboard/supabase/migrations/0001_init.sql`
- Create: `crm-dashboard/lib/supabase.ts`

- [ ] **Step 1: Write the migration**

```sql
-- crm-dashboard/supabase/migrations/0001_init.sql
create extension if not exists "pgcrypto";

create table course_dates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  track text not null check (track in ('svenska', 'menti_en')),
  capacity integer not null,
  created_at timestamptz not null default now()
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  course_date_id uuid references course_dates(id),
  name text not null,
  email text not null,
  amount_paid_sek integer not null default 0,
  discount_code text,
  stripe_checkout_session_id text unique,
  zoom_invite_sent boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  source text not null check (source in ('formulär', 'manuellt', 'nastan_betalare')),
  status text not null default 'ny' check (status in ('ny', 'kontaktad')),
  interested_course_date_id uuid references course_dates(id),
  stripe_checkout_session_id text unique,
  is_subscriber boolean,
  note text,
  created_at timestamptz not null default now()
);

create index idx_participants_course_date on participants (course_date_id);
create index idx_leads_course_date on leads (interested_course_date_id);
create index idx_leads_email on leads (email);
create index idx_participants_email on participants (email);
```

- [ ] **Step 2: Run the migration against Supabase**

Open the Supabase project's SQL editor (created in Task 11) and run the file's contents. Until that project exists, just save the file — this step is repeated in Task 11.

- [ ] **Step 3: Write the Supabase client factory**

```ts
// crm-dashboard/lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createServerSupabaseClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}
```

The explicit `cache: 'no-store'` matters: without it, Next.js's fetch patching can cache the Supabase client's requests, so pages built with `export const dynamic = 'force-dynamic'` alone can still serve stale data (confirmed during manual verification — the dashboard showed 0 participants after an import that had actually succeeded).

- [ ] **Step 4: Commit**

```bash
git add crm-dashboard/supabase crm-dashboard/lib/supabase.ts
git commit -m "feat: add Supabase schema and server client"
```

---

### Task 3: Name/email matching logic (TDD)

**Files:**
- Create: `crm-dashboard/lib/matching.ts`
- Test: `crm-dashboard/lib/matching.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// crm-dashboard/lib/matching.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeEmail, normalizeName, isPossibleDuplicate } from './matching'

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Anna@Example.com ')).toBe('anna@example.com')
  })

  it('strips dots and plus-suffix for gmail addresses', () => {
    expect(normalizeEmail('anna.svensson+workshop@gmail.com')).toBe('annasvensson@gmail.com')
  })

  it('leaves dots intact for non-gmail addresses', () => {
    expect(normalizeEmail('anna.svensson@company.se')).toBe('anna.svensson@company.se')
  })
})

describe('normalizeName', () => {
  it('lowercases, trims, and collapses whitespace', () => {
    expect(normalizeName('  Anna   Svensson ')).toBe('anna svensson')
  })
})

describe('isPossibleDuplicate', () => {
  const existing = [{ name: 'Anna Svensson', email: 'anna.svensson@gmail.com' }]

  it('flags a match on normalized email even from a different-looking address', () => {
    const candidate = { name: 'A. Svensson', email: 'annasvensson@gmail.com' }
    expect(isPossibleDuplicate(existing, candidate)).toBe(true)
  })

  it('flags a match on name when the email differs completely', () => {
    const candidate = { name: 'Anna Svensson', email: 'anna@jobbet.se' }
    expect(isPossibleDuplicate(existing, candidate)).toBe(true)
  })

  it('does not flag an unrelated person', () => {
    const candidate = { name: 'Erik Larsson', email: 'erik@example.com' }
    expect(isPossibleDuplicate(existing, candidate)).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL with "Cannot find module './matching'" (file doesn't exist yet).

- [ ] **Step 3: Implement the matching logic**

```ts
// crm-dashboard/lib/matching.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add crm-dashboard/lib/matching.ts crm-dashboard/lib/matching.test.ts
git commit -m "feat: add name/email duplicate-matching logic"
```

---

### Task 4: Stripe webhook handler (TDD)

**Files:**
- Create: `crm-dashboard/lib/stripe-webhook.ts`
- Test: `crm-dashboard/lib/stripe-webhook.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// crm-dashboard/lib/stripe-webhook.test.ts
import { describe, it, expect, vi } from 'vitest'
import { handleCheckoutCompleted, handleCheckoutExpired } from './stripe-webhook'
import type Stripe from 'stripe'

function makeSupabaseMock(existingParticipants: { name: string; email: string }[] = []) {
  const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null })
  const selectMock = vi.fn().mockResolvedValue({ data: existingParticipants, error: null })
  const from = vi.fn(() => ({
    select: selectMock,
    upsert: upsertMock,
  }))
  return { from, upsertMock, selectMock } as any
}

function makeSession(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: 'cs_test_123',
    amount_total: 375000,
    customer_details: { name: 'Anna Svensson', email: 'anna@example.com' },
    ...overrides,
  } as Stripe.Checkout.Session
}

describe('handleCheckoutCompleted', () => {
  it('upserts a participant with amount converted from öre to kronor', async () => {
    const supabase = makeSupabaseMock()
    await handleCheckoutCompleted(supabase, makeSession())

    expect(supabase.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Anna Svensson',
        email: 'anna@example.com',
        amount_paid_sek: 3750,
        stripe_checkout_session_id: 'cs_test_123',
      }),
      { onConflict: 'stripe_checkout_session_id' }
    )
  })

  it('flags a possible duplicate when name matches an existing participant', async () => {
    const supabase = makeSupabaseMock([{ name: 'Anna Svensson', email: 'anna.jobb@example.com' }])
    await handleCheckoutCompleted(supabase, makeSession())

    expect(supabase.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'Möjlig dubblett — kolla manuellt' }),
      expect.anything()
    )
  })
})

describe('handleCheckoutExpired', () => {
  it('upserts a lead with source nastan_betalare', async () => {
    const supabase = makeSupabaseMock()
    await handleCheckoutExpired(supabase, makeSession({ id: 'cs_test_expired' }))

    expect(supabase.upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'nastan_betalare',
        stripe_checkout_session_id: 'cs_test_expired',
      }),
      { onConflict: 'stripe_checkout_session_id' }
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL with "Cannot find module './stripe-webhook'".

- [ ] **Step 3: Implement the handler**

```ts
// crm-dashboard/lib/stripe-webhook.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { isPossibleDuplicate, type PersonRecord } from './matching'

export async function handleCheckoutCompleted(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
) {
  const name = session.customer_details?.name ?? 'Okänd'
  const email = session.customer_details?.email ?? ''
  const amount = session.amount_total ?? 0

  const { data: existingParticipants } = await supabase.from('participants').select('name, email')

  const candidate: PersonRecord = { name, email }
  const possibleDuplicate = isPossibleDuplicate(existingParticipants ?? [], candidate)

  await supabase.from('participants').upsert(
    {
      name,
      email,
      amount_paid_sek: Math.round(amount / 100),
      stripe_checkout_session_id: session.id,
      note: possibleDuplicate ? 'Möjlig dubblett — kolla manuellt' : null,
    },
    { onConflict: 'stripe_checkout_session_id' }
  )
}

export async function handleCheckoutExpired(
  supabase: SupabaseClient,
  session: Stripe.Checkout.Session
) {
  const name = session.customer_details?.name ?? 'Okänd'
  const email = session.customer_details?.email ?? ''

  await supabase.from('leads').upsert(
    {
      name,
      email,
      source: 'nastan_betalare',
      stripe_checkout_session_id: session.id,
    },
    { onConflict: 'stripe_checkout_session_id' }
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: PASS, 3 new tests (9 total).

- [ ] **Step 5: Commit**

```bash
git add crm-dashboard/lib/stripe-webhook.ts crm-dashboard/lib/stripe-webhook.test.ts
git commit -m "feat: add Stripe checkout completed/expired handlers"
```

---

### Task 5: Webhook route and password-gate middleware

**Files:**
- Create: `crm-dashboard/app/api/stripe/webhook/route.ts`
- Create: `crm-dashboard/lib/auth.ts`
- Test: `crm-dashboard/lib/auth.test.ts`
- Create: `crm-dashboard/middleware.ts`
- Create: `crm-dashboard/app/login/page.tsx`
- Create: `crm-dashboard/app/api/login/route.ts`

- [ ] **Step 1: Write the webhook route**

```ts
// crm-dashboard/app/api/stripe/webhook/route.ts
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
```

- [ ] **Step 2: Write the auth helper**

The login cookie must not store the raw password (a leaked cookie would leak the password), and the redirect target must be validated (an unvalidated `from` param is an open-redirect vector). `middleware.ts` runs in the Next.js Edge Runtime, which does not support Node's `node:crypto` module, so this uses the Web Crypto API (`crypto.subtle`) instead — it works in both the Edge Runtime and Node.

```ts
// crm-dashboard/lib/auth.ts
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
```

```ts
// crm-dashboard/lib/auth.test.ts
import { describe, it, expect } from 'vitest'
import { createAuthToken, isValidAuthToken, safeRedirectPath, constantTimeEqual } from './auth'

describe('createAuthToken / isValidAuthToken', () => {
  it('accepts a token created from the same password', async () => {
    const token = await createAuthToken('hemligt')
    expect(await isValidAuthToken(token, 'hemligt')).toBe(true)
  })

  it('rejects a token created from a different password', async () => {
    const token = await createAuthToken('fel-lösenord')
    expect(await isValidAuthToken(token, 'hemligt')).toBe(false)
  })

  it('rejects a missing token', async () => {
    expect(await isValidAuthToken(undefined, 'hemligt')).toBe(false)
  })

  it('never stores the raw password as the token', async () => {
    const token = await createAuthToken('hemligt')
    expect(token).not.toBe('hemligt')
  })
})

describe('constantTimeEqual', () => {
  it('returns true for identical strings', () => {
    expect(constantTimeEqual('abc123', 'abc123')).toBe(true)
  })

  it('returns false for different strings of the same length', () => {
    expect(constantTimeEqual('abc123', 'abc124')).toBe(false)
  })

  it('returns false for strings of different length', () => {
    expect(constantTimeEqual('abc', 'abcdef')).toBe(false)
  })
})

describe('safeRedirectPath', () => {
  it('allows a plain relative path', () => {
    expect(safeRedirectPath('/kurstillfalle/123')).toBe('/kurstillfalle/123')
  })

  it('falls back to / for a missing value', () => {
    expect(safeRedirectPath(undefined)).toBe('/')
  })

  it('falls back to / for a protocol-relative URL (open redirect attempt)', () => {
    expect(safeRedirectPath('//evil.example.com')).toBe('/')
  })

  it('falls back to / for an absolute URL', () => {
    expect(safeRedirectPath('https://evil.example.com')).toBe('/')
  })
})
```

- [ ] **Step 3: Write the middleware**

```ts
// crm-dashboard/middleware.ts
import { NextRequest, NextResponse } from 'next/server'
import { isValidAuthToken } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/login') ||
    pathname.startsWith('/api/stripe/webhook')
  ) {
    return NextResponse.next()
  }

  const authCookie = request.cookies.get('crm_auth')?.value
  if (await isValidAuthToken(authCookie, process.env.CRM_PASSWORD ?? '')) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 4: Write the login route**

```ts
// crm-dashboard/app/api/login/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createAuthToken, constantTimeEqual, safeRedirectPath } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const password = String(formData.get('password') ?? '')
  const from = safeRedirectPath(formData.get('from') as string)

  const expected = process.env.CRM_PASSWORD ?? ''
  const passwordMatches = password.length === expected.length && constantTimeEqual(password, expected)

  if (!passwordMatches) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', from)
    loginUrl.searchParams.set('error', '1')
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.redirect(new URL(from, request.url))
  response.cookies.set('crm_auth', await createAuthToken(expected), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
```

- [ ] **Step 5: Write the login page**

```tsx
// crm-dashboard/app/login/page.tsx
export default function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string; error?: string }
}) {
  return (
    <main style={{ maxWidth: 320, margin: '80px auto' }}>
      <h1>Logga in</h1>
      {searchParams.error && <p style={{ color: 'crimson' }}>Fel lösenord.</p>}
      <form method="POST" action="/api/login">
        <input type="hidden" name="from" value={searchParams.from ?? '/'} />
        <input type="password" name="password" placeholder="Lösenord" autoFocus />
        <button type="submit">Logga in</button>
      </form>
    </main>
  )
}
```

- [ ] **Step 6: Verify manually**

```bash
npm run dev
```

Visit `http://localhost:3000` — expect a redirect to `/login`. Enter a wrong password from `.env.local` (`CRM_PASSWORD=test123`) — expect an error message. Enter the correct password — expect a redirect back to `/` (page not built yet, 404 is fine at this step).

- [ ] **Step 7: Commit**

```bash
git add crm-dashboard/app/api crm-dashboard/app/login crm-dashboard/middleware.ts crm-dashboard/lib/auth.ts crm-dashboard/lib/auth.test.ts
git commit -m "feat: add password-gate middleware and Stripe webhook route"
```

---

### Task 6: Kurstillfällen — startsida

**Files:**
- Create: `crm-dashboard/app/page.tsx`
- Modify: `crm-dashboard/app/layout.tsx`

- [ ] **Step 1: Write the home page**

```tsx
// crm-dashboard/app/page.tsx
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
```

- [ ] **Step 2: Verify manually**

In the Supabase SQL editor, insert a test row: `insert into course_dates (date, track, capacity) values ('2026-10-15', 'svenska', 20);`. Reload `http://localhost:3000` and confirm it shows "0/20 betalande, 0 på väntelista".

- [ ] **Step 3: Commit**

```bash
git add crm-dashboard/app/page.tsx
git commit -m "feat: add kurstillfällen overview page"
```

---

### Task 7: Kurstillfälle-detalj

**Files:**
- Create: `crm-dashboard/app/kurstillfalle/[id]/page.tsx`

- [ ] **Step 1: Write the detail page**

```tsx
// crm-dashboard/app/kurstillfalle/[id]/page.tsx
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
```

- [ ] **Step 2: Verify manually**

Click into the test kurstillfälle from the home page. Insert a test participant via SQL editor:
`insert into participants (course_date_id, name, email, amount_paid_sek) values ('<the id>', 'Test Person', 'test@example.com', 3750);`
Reload and confirm the participant shows up with a "Markera Zoom skickad" button, and clicking it flips to "✓ Zoom skickad".

- [ ] **Step 3: Commit**

```bash
git add "crm-dashboard/app/kurstillfalle"
git commit -m "feat: add kurstillfälle detail page with Zoom toggle"
```

---

### Task 8: Leads-vy

**Files:**
- Create: `crm-dashboard/app/leads/page.tsx`

- [ ] **Step 1: Write the leads page**

```tsx
// crm-dashboard/app/leads/page.tsx
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
```

- [ ] **Step 2: Verify manually**

Visit `/leads` and use the "Lägg till lead" form to add a test lead. Confirm it appears in the list with source "manuellt". Click "Markera kontaktad" and confirm the button disappears and status updates. Use the date dropdown to assign it to the test kurstillfälle and confirm it now shows up in that kurstillfälle's väntelista (Task 7 page).

- [ ] **Step 3: Commit**

```bash
git add crm-dashboard/app/leads
git commit -m "feat: add leads view with contact and date-assignment actions"
```

---

### Task 9: Statistik

**Files:**
- Create: `crm-dashboard/app/statistik/page.tsx`

- [ ] **Step 1: Write the stats page**

```tsx
// crm-dashboard/app/statistik/page.tsx
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
```

- [ ] **Step 2: Verify manually**

Visit `/statistik` and confirm the test kurstillfälle and its participant count show up, and the conversion rate reflects the 1 test participant vs. 1 test lead (50%).

- [ ] **Step 3: Commit**

```bash
git add crm-dashboard/app/statistik
git commit -m "feat: add statistik page"
```

---

### Task 10: CSV-migrering (engångsimport)

**Files:**
- Create: `crm-dashboard/scripts/import-csv.ts`

- [ ] **Step 1: Write the import script**

The real `deltagare_*.csv` files have quoted `Notering` values containing commas (and one has an escaped `""..""` quote inside a quoted field), so this needs a real CSV line parser, not a naive `split(',')`.

```ts
// crm-dashboard/scripts/import-csv.ts
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

function parseAmount(raw: string | undefined): number {
  if (!raw) return 0
  const digits = raw.replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

async function importDeltagare(filePath: string, courseDateId: string) {
  const content = readFileSync(filePath, 'utf-8')
  const rows = parseCsv(content)

  let successCount = 0
  const failures: { row: Record<string, string>; error: string }[] = []

  for (const row of rows) {
    const { error } = await supabase.from('participants').insert({
      course_date_id: courseDateId,
      name: row['Namn'],
      email: row['E-post'],
      amount_paid_sek: parseAmount(row['Betalt (inkl. moms)']),
      note: row['Notering'] || null,
    })

    if (error) {
      failures.push({ row, error: error.message })
    } else {
      successCount++
    }
  }

  console.log(`Importerade ${successCount}/${rows.length} deltagare från ${filePath}`)
  if (failures.length > 0) {
    console.error(`${failures.length} rader misslyckades:`)
    for (const f of failures) {
      console.error(`  ${f.row['Namn']} (${f.row['E-post']}): ${f.error}`)
    }
    process.exitCode = 1
  }
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
```

- [ ] **Step 2: Verify manually**

Run `npm install -D dotenv` if not already installed (Task 1 covers this). After creating a real `course_dates` row for that date (Task 11), run:

```bash
npx tsx scripts/import-csv.ts ../deltagare_28aug.csv <course_date_id>
```

Confirm the console prints the expected row count and the participants show up on that kurstillfälle's detail page.

- [ ] **Step 3: Commit**

```bash
git add crm-dashboard/scripts/import-csv.ts
git commit -m "feat: add one-off CSV import script for existing deltagarlistor"
```

---

### Task 11: Deployment (manual steps, no code)

This task has no automated tests — it's infrastructure setup done once, by Paulina, outside the editor.

- [ ] **Step 1: Create the Supabase project**

Create a new project at supabase.com. Run the SQL from `supabase/migrations/0001_init.sql` in its SQL editor. Copy the project URL and `service_role` key.

- [ ] **Step 2: Create the Vercel project**

Import `crm-dashboard/` (as the project root) from the git repo into a new Vercel project. Add environment variables: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CRM_PASSWORD` (pick a real password, not `test123`).

- [ ] **Step 3: Point the subdomain**

In Vercel, add `crm.pauspling.com` as a domain on the project. Vercel will show a CNAME record to add. Add that CNAME at Loopia's DNS settings for `pauspling.com`. Wait for DNS propagation (Vercel's domain settings page shows when it's verified).

- [ ] **Step 4: Register the Stripe webhook**

In the Stripe dashboard (Pauspling account, livemode) under Developers → Webhooks, add an endpoint pointing to `https://crm.pauspling.com/api/stripe/webhook`, subscribed to `checkout.session.completed` and `checkout.session.expired`. Copy the signing secret into Vercel's `STRIPE_WEBHOOK_SECRET`.

- [ ] **Step 5: Seed course_dates for upcoming kurstillfällen**

In the Supabase SQL editor, insert a row per upcoming kurstillfälle (using the real dates and capacities from the workshop planning), e.g.:

```sql
insert into course_dates (date, track, capacity) values ('2026-09-11', 'svenska', 20);
```

- [ ] **Step 6: Run the CSV import for past kurstillfällen**

For each existing `deltagare_<datum>.csv`, follow Task 10 Step 2 against its matching `course_dates` row.

- [ ] **Step 7: Smoke test**

Visit `https://crm.pauspling.com`, log in with the real password, confirm the seeded kurstillfällen and imported participants show up. Trigger a Stripe test webhook event (Stripe dashboard → Webhooks → the endpoint → "Send test webhook") for `checkout.session.completed` and confirm a new participant appears.

---

## Known gap: Google-formuläret

This plan does not include an automated sync from the Google Form (leads' current main source). Its response sheet is confirmed at `https://docs.google.com/spreadsheets/d/1B184Mj34kUV3wvROTMB_6uIM7s_iJUijvlLYm3zzzLk` (sheet "Formulärsvar 1", ~60 rows as of 2026-09-09), with columns: Tidstämpel, E-postadress, För- och efternamn, datumpreferens (multi-value), prenumerant (Ja/Nej/Vet ej), fritext. The `leads` table already has `is_subscriber` and `note` columns to receive this (Task 2).

What's still missing is a *production* sync mechanism — reading the sheet from inside this brainstorming session (via an authenticated browser fetch) doesn't carry over to the deployed app, which needs its own Google credential. Follow-up task once ready to build it: a Google service account with read access to the sheet, a Sheets API `values.get` call in a scheduled job or a manual "Sync now" button, mapping rows to `leads` inserts (`source: 'formulär'`, dedup via `isPossibleDuplicate` from `lib/matching.ts`, same as the webhook handler). Until then, use the manual "Lägg till lead" form (Task 8) for anything coming from the form.

## Notes for the next project (bokningssida)

Once this is live, the booking page (separate spec) will create Stripe checkout sessions against the same `course_dates` table — no schema change needed, just a new Next.js project (or route group) that reads `course_dates` and calls the Stripe Checkout Sessions API.
