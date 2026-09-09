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
