import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const password = formData.get('password')
  const from = (formData.get('from') as string) || '/'

  if (password !== process.env.CRM_PASSWORD) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('from', from)
    loginUrl.searchParams.set('error', '1')
    return NextResponse.redirect(loginUrl)
  }

  const response = NextResponse.redirect(new URL(from, request.url))
  response.cookies.set('crm_auth', String(password), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}
