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
  completed_at: string | null
}

type AuthState = {
  user: User | null
  session: Session | null
  profile: Profile | null
  isLoading: boolean
  isProfileComplete: boolean
}

type SocialProvider = 'google' | 'kakao'

type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>

let supabaseBrowserClient: SupabaseBrowserClient | null = null

function getSupabaseBrowserClient() {
  if (!supabaseBrowserClient) {
    supabaseBrowserClient = createSupabaseBrowserClient()
  }

  return supabaseBrowserClient
}

function hasCompletedProfile(profile: Profile | null) {
  return Boolean(profile?.completed_at)
}

export function useAuth() {
  const supabase = getSupabaseBrowserClient()

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
      .select('id, email, full_name, phone, is_super_admin, bio, completed_at')
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('Profile fetch error:', error)
      return null
    }

    return data as Profile
  }, [supabase])

  useEffect(() => {
    // Initial session check
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          const profile = await fetchProfile(session.user.id)
          setAuthState({
            user: session.user,
            session,
            profile,
            isLoading: false,
            isProfileComplete: hasCompletedProfile(profile),
          })
        } else {
          setAuthState(prev => ({ ...prev, isLoading: false }))
        }
      } catch (error) {
        console.debug('Supabase session initialization lock/timeout warning:', error)
        // Fallback: mark loading as false so the app doesn't hang in loading state
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
            isProfileComplete: hasCompletedProfile(profile),
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
  }, [fetchProfile, supabase])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [supabase])

  const getAuthRedirectUrl = useCallback(() => {
    const nextPath = `${window.location.pathname}${window.location.search}`

    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath || '/')}`
  }, [])

  const signInWithSocialProvider = useCallback(async (provider: SocialProvider) => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: getAuthRedirectUrl(),
      },
    })

    if (error) {
      console.error(`${provider} sign in error:`, error)
    }

    return { error }
  }, [getAuthRedirectUrl, supabase])

  const signInWithGoogle = useCallback(async () => {
    return signInWithSocialProvider('google')
  }, [signInWithSocialProvider])

  const signInWithKakao = useCallback(async () => {
    return signInWithSocialProvider('kakao')
  }, [signInWithSocialProvider])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) console.error('Email sign in error:', error)
    return { data, error }
  }, [supabase])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) console.error('Email sign up error:', error)
    return { data, error }
  }, [supabase])

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
        isProfileComplete: hasCompletedProfile(profile),
      }))
    }

    return { error: error?.message || null }
  }, [authState.user, fetchProfile, supabase])

  return {
    ...authState,
    signInWithGoogle,
    signInWithKakao,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    updateProfile,
    supabase,
  }
}
