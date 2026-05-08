'use client'

import { useEffect, useState, useCallback } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import type { User, Session } from '@supabase/supabase-js'

type Profile = {
  id: string
  email: string | null
  full_name: string | null
  phone: string | null
  is_super_admin: boolean | null
  bio: string | null
}

type AuthState = {
  user: User | null
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isProfileComplete: boolean
}

const supabase = createSupabaseBrowserClient()

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    isLoading: true,
    isProfileComplete: false,
  })

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, phone, is_super_admin, bio')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Profile fetch error:', error)
      return null
    }

    return data as Profile
  }, [])

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
          isProfileComplete: Boolean(profile?.full_name && profile?.phone && profile?.bio),
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
            isProfileComplete: Boolean(profile?.full_name && profile?.phone && profile?.bio),
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
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

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
  }, [])

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
  }, [])

  const updateProfile = useCallback(async (updates: Partial<Pick<Profile, 'full_name' | 'phone' | 'bio'>>) => {
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
        isProfileComplete: Boolean(profile?.full_name && profile?.phone && profile?.bio),
      }))
    }

    return { error: error?.message || null }
  }, [authState.user, fetchProfile])

  return {
    ...authState,
    signInWithGoogle,
    signInWithKakao,
    signOut,
    updateProfile,
    supabase,
  }
}
