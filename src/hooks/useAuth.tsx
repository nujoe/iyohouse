'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import type { AuthError, User, Session } from '@supabase/supabase-js'

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

type SocialProvider = 'google'
type SupabaseBrowserClient = ReturnType<typeof createSupabaseBrowserClient>
type EmailAuthResult = Promise<{ data: unknown; error: AuthError | null }>
type SocialAuthResult = Promise<{ error: AuthError | null }>

type AuthContextValue = AuthState & {
  signInWithGoogle: () => SocialAuthResult
  signInWithEmail: (email: string, password: string) => EmailAuthResult
  signUpWithEmail: (email: string, password: string) => EmailAuthResult
  signOut: () => Promise<void>
  updateProfile: (updates: Partial<Pick<Profile, 'email' | 'full_name' | 'phone' | 'bio'>>) => Promise<{ error: string | null }>
  supabase: SupabaseBrowserClient
}

const AuthContext = createContext<AuthContextValue | null>(null)
let supabaseBrowserClient: SupabaseBrowserClient | null = null

function getSupabaseBrowserClient() {
  if (!supabaseBrowserClient) {
    supabaseBrowserClient = createSupabaseBrowserClient()
  }

  return supabaseBrowserClient
}

function hasCompletedProfile(profile: Profile | null, user: User | null) {
  return Boolean(
    profile?.completed_at ||
    (
      profile?.full_name?.trim() &&
      profile?.phone?.trim() &&
      (profile?.email?.trim() || user?.email)
    )
  )
}

const signedOutState: AuthState = {
  user: null,
  session: null,
  profile: null,
  isLoading: false,
  isProfileComplete: false,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = getSupabaseBrowserClient()
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    isLoading: true,
    isProfileComplete: false,
  })
  const profileRequestRef = useRef(0)

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

  const applySession = useCallback((session: Session | null) => {
    const requestId = profileRequestRef.current + 1
    profileRequestRef.current = requestId

    if (!session?.user) {
      setAuthState(signedOutState)
      return
    }

    setAuthState(prev => ({
      ...prev,
      user: session.user,
      session,
      profile: prev.user?.id === session.user.id ? prev.profile : null,
      isLoading: true,
      isProfileComplete: prev.user?.id === session.user.id
        ? hasCompletedProfile(prev.profile, session.user)
        : false,
    }))

    window.setTimeout(async () => {
      try {
        const profile = await fetchProfile(session.user.id)
        if (profileRequestRef.current !== requestId) return

        setAuthState({
          user: session.user,
          session,
          profile,
          isLoading: false,
          isProfileComplete: hasCompletedProfile(profile, session.user),
        })
      } catch (error) {
        if (profileRequestRef.current !== requestId) return
        console.debug('Supabase profile fetch warning:', error)
        setAuthState({
          user: session.user,
          session,
          profile: null,
          isLoading: false,
          isProfileComplete: false,
        })
      }
    }, 0)
  }, [fetchProfile])

  useEffect(() => {
    let isMounted = true

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!isMounted) return
        applySession(session)
      }
    )

    return () => {
      isMounted = false
      profileRequestRef.current += 1
      subscription.unsubscribe()
    }
  }, [applySession, supabase])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    profileRequestRef.current += 1
    setAuthState(signedOutState)
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

  const updateProfile = useCallback(async (updates: Partial<Pick<Profile, 'email' | 'full_name' | 'phone' | 'bio'>>) => {
    if (!authState.user) return { error: 'Not authenticated' }

    const fullName = updates.full_name ?? authState.profile?.full_name ?? ''
    const phone = updates.phone ?? authState.profile?.phone ?? ''
    const email = updates.email ?? authState.profile?.email ?? authState.user.email ?? ''
    const hasBioUpdate = Object.prototype.hasOwnProperty.call(updates, 'bio')
    const bio = hasBioUpdate ? updates.bio ?? '' : authState.profile?.bio ?? null
    const clearBio = hasBioUpdate && !(bio ?? '').trim()

    const { data, error } = await supabase.rpc('complete_profile', {
      p_full_name: fullName,
      p_phone: phone,
      p_bio: bio,
      p_email: email,
      p_clear_bio: clearBio,
    })

    if (!error) {
      const profile = data as Profile | null
      if (profile) {
        setAuthState(prev => ({
          ...prev,
          profile,
          isProfileComplete: hasCompletedProfile(profile, prev.user),
        }))
      } else {
        const refreshedProfile = await fetchProfile(authState.user.id)
        setAuthState(prev => ({
          ...prev,
          profile: refreshedProfile,
          isProfileComplete: hasCompletedProfile(refreshedProfile, prev.user),
        }))
      }
    }

    return { error: error?.message || null }
  }, [authState.profile, authState.user, fetchProfile, supabase])

  const value: AuthContextValue = {
    ...authState,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
    updateProfile,
    supabase,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }

  return context
}
