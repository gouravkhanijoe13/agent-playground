import { NextRequest, NextResponse } from 'next/server'

const SECRET_KEY = 'e25217c30ce3ff7950852411'

export async function POST(request: NextRequest) {
  const { key } = await request.json()

  if (key !== SECRET_KEY) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set('access_key', SECRET_KEY, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  return response
}
