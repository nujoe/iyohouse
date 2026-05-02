'use client'

import { useEffect, useState, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import type { User, Session } from '@supabase/supabase-js'

type Profile = {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  role: string
}

type AuthState = {
  user: User | null
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isProfileComplete: boolean
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    isLoading: true,
    isProfileComplete: false,
  })

  const supabase = createSupabaseBrowserClient()

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone, role')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('Profile fetch error:', error)
      return null
    }

    return data as Profile
  }, [supabase])

  useEffect(() => {
    // Initial session check
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.user) {
        const profile = await fetchProfile(session.user.id)
        setAuthState({
          user: session.user,
          session,
          profile,
          isLoading: false,
          isProfileComplete: Boolean(profile?.full_name && profile?.phone),
        })
      } else {
        setAuthState(prev => ({ ...prev, isLoading: false }))
      }
    }

    initAuth()

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          setAuthState({
            user: session.user,
            session,
            profile,
            isLoading: false,
            isProfileComplete: Boolean(profile?.full_name && profile?.phone),
          })
        } else {
          setAuthState({
            user: null,
            session: null,
            profile: null,
            isLoading: false,
            isProfileComplete: false,
          })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase, fetchProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [supabase])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error('Google sign in error:', error)
    }
  }, [supabase])

  const signInWithKakao = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      console.error('Kakao sign in error:', error)
    }
  }, [supabase])

  const updateProfile = useCallback(async (updates: Partial<Pick<Profile, 'full_name' | 'phone'>>) => {
    if (!authState.user) return { error: 'Not authenticated' }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', authState.user.id)

    if (!error) {
      const profile = await fetchProfile(authState.user.id)
      setAuthState(prev => ({
        ...prev,
        profile,
        isProfileComplete: Boolean(profile?.full_name && profile?.phone),
      }))
    }

    return { error: error?.message || null }
  }, [authState.user, supabase, fetchProfile])

  return {
    ...authState,
    signInWithGoogle,
    signInWithKakao,
    signOut,
    updateProfile,
    supabase,
  }
}
