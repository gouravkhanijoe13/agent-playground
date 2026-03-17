'use client'

import { useState, FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function AuthForm() {
  const [key, setKey] = useState('')
  const [error, setError] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') || '/'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    if (res.ok) {
      window.location.href = next
    } else {
      setError(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-10 w-full max-w-sm shadow-xl">
        <h1 className="text-white text-2xl font-semibold mb-2 text-center">Access Required</h1>
        <p className="text-gray-400 text-sm text-center mb-8">Enter your access key to continue</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={key}
            onChange={e => { setKey(e.target.value); setError(false) }}
            placeholder="Access key"
            autoFocus
            className="bg-gray-800 text-white border border-gray-700 rounded-lg px-4 py-3 text-sm outline-none focus:border-blue-500 transition"
          />
          {error && <p className="text-red-400 text-xs text-center">Incorrect key. Try again.</p>}
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg py-3 text-sm font-medium transition"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  )
}
