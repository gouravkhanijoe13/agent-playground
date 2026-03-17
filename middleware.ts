import { NextRequest, NextResponse } from 'next/server'

const SECRET_KEY = 'e25217c30ce3ff7950852411'
const COOKIE_NAME = 'access_key'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow the auth page and its POST action through
  if (pathname === '/auth') {
    return NextResponse.next()
  }

  // Check cookie
  const cookie = request.cookies.get(COOKIE_NAME)
  if (cookie?.value === SECRET_KEY) {
    return NextResponse.next()
  }

  // Redirect to auth page, preserving the intended destination
  const authUrl = new URL('/auth', request.url)
  authUrl.searchParams.set('next', pathname)
  return NextResponse.redirect(authUrl)
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|public|api/auth).*)'],
}
