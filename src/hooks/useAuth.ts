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

function hasCompletedProfile(profile: Profile | null, user: User | null) {
  return Boolean(
    profile?.full_name?.trim() &&
    profile?.phone?.trim() &&
    (profile?.email || user?.email)?.trim()
  )
}

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
          isProfileComplete: hasCompletedProfile(profile, session.user),
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
            isProfileComplete: hasCompletedProfile(profile, session.user),
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

  const getAuthRedirectUrl = useCallback(() => {
    const nextPath = `${window.location.pathname}${window.location.search}`

    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath || '/')}`
  }, [])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    })

    if (error) {
      console.error('Google sign in error:', error)
    }
  }, [getAuthRedirectUrl])

  const signInWithKakao = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    })

    if (error) {
      console.error('Kakao sign in error:', error)
    }
  }, [getAuthRedirectUrl])

  const updateProfile = useCallback(async (updates: Partial<Pick<Profile, 'full_name' | 'phone' | 'bio'>>) => {
    if (!authState.user) return { error: 'Not authenticated' }

    const { error } = await supabase.rpc('complete_profile', {
      p_full_name: updates.full_name || '',
      p_phone: updates.phone || '',
      p_bio: updates.bio || null,
    })

    if (!error) {
      const profile = await fetchProfile(authState.user.id)
      setAuthState(prev => ({
        ...prev,
        profile,
        isProfileComplete: hasCompletedProfile(profile, authState.user),
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
