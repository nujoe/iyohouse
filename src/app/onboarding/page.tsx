'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { useAuth } from '@/hooks/useAuth'

export default function OnboardingPage() {
  const { user, isLoading: authLoading } = useAuth()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
      return
    }

    const checkProfile = async () => {
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, phone')
          .eq('id', user.id)
          .single()

        if (profile) {
          setFullName(profile.full_name || '')
          setPhone(profile.phone || '')
          
          if (profile.full_name && profile.phone) {
            // Already completed, redirect home
            router.push('/')
          }
        }
        setLoading(false)
      }
    }

    if (user) {
      checkProfile()
    }
  }, [user, authLoading, router, supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setSubmitting(true)
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName,
        phone: phone,
        updated_at: new Date().toISOString(),
      })

    setSubmitting(false)

    if (error) {
      alert('Error updating profile: ' + error.message)
    } else {
      router.push('/')
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <div className="animate-pulse font-mono">LOADING_PROFILE...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-4">
      <div className="max-w-md w-full border border-zinc-800 p-8 rounded-lg bg-zinc-900/50 backdrop-blur-xl">
        <h1 className="text-2xl font-bold mb-2 tracking-tight">WELCOME TO IYO</h1>
        <p className="text-zinc-400 mb-8 text-sm font-mono">PLEASE COMPLETE YOUR PROFILE TO CONTINUE</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="fullName" className="block text-xs font-mono text-zinc-500 uppercase mb-2">Full Name</label>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded px-4 py-3 text-white focus:outline-none focus:border-white transition-colors font-mono"
              placeholder="YOUR NAME"
            />
          </div>
          
          <div>
            <label htmlFor="phone" className="block text-xs font-mono text-zinc-500 uppercase mb-2">Phone Number</label>
            <input
              id="phone"
              type="text"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-black border border-zinc-800 rounded px-4 py-3 text-white focus:outline-none focus:border-white transition-colors font-mono"
              placeholder="010-0000-0000"
            />
          </div>
          
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-white text-black font-bold py-3 rounded hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-sm"
          >
            {submitting ? 'UPDATING...' : 'COMPLETE PROFILE'}
          </button>
        </form>
      </div>
    </div>
  )
}
