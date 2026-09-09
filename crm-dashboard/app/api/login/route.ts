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
