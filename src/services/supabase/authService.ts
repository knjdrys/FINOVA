import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface AuthUserProfile {
  id: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  isGuest?: boolean;
}

const LOCAL_GUEST_USER_KEY = 'finova_guest_session_v2';

export class AuthService {
  /**
   * Check if user is currently logged in (via Supabase or local Guest session)
   */
  public static async getInitialSession(): Promise<{ user: AuthUserProfile | null; session: Session | null }> {
    if (isSupabaseConfigured) {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!error && data.session?.user) {
          const user = data.session.user;
          return {
            user: {
              id: user.id,
              email: user.email || '',
              fullName: user.user_metadata?.full_name || user.user_metadata?.name || 'Juan Dela Cruz',
              avatarUrl: user.user_metadata?.avatar_url,
              isGuest: false,
            },
            session: data.session,
          };
        }
      } catch (err) {
        console.warn('Supabase session fetch failed:', err);
      }
    }

    // Check if guest session is active in local storage
    const localGuest = localStorage.getItem(LOCAL_GUEST_USER_KEY);
    if (localGuest) {
      try {
        const parsed = JSON.parse(localGuest);
        return { user: parsed, session: null };
      } catch {
        localStorage.removeItem(LOCAL_GUEST_USER_KEY);
      }
    }

    return { user: null, session: null };
  }

  /**
   * Listen for Supabase auth state changes
   */
  public static onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null, user: AuthUserProfile | null) => void
  ) {
    if (!isSupabaseConfigured) {
      return { data: { subscription: { unsubscribe: () => {} } } };
    }

    return supabase.auth.onAuthStateChange((event, session) => {
      let profile: AuthUserProfile | null = null;
      if (session?.user) {
        profile = {
          id: session.user.id,
          email: session.user.email || '',
          fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || 'Juan Dela Cruz',
          avatarUrl: session.user.user_metadata?.avatar_url,
          isGuest: false,
        };
      }
      callback(event, session, profile);
    });
  }

  /**
   * One-Click Google OAuth Sign In
   */
  public static async signInWithGoogle(): Promise<{ error: Error | null }> {
    if (!isSupabaseConfigured) {
      // If keys aren't added yet, sign in as a demo Google user locally
      const demoUser: AuthUserProfile = {
        id: 'demo-google-user',
        email: 'juan.delacruz@gmail.com',
        fullName: 'Juan Dela Cruz',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=128&q=80',
        isGuest: false,
      };
      localStorage.setItem(LOCAL_GUEST_USER_KEY, JSON.stringify(demoUser));
      return { error: null };
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      return { error };
    } catch (err: any) {
      return { error: err };
    }
  }

  /**
   * Sign In with Email and Password
   */
  public static async signInWithEmail(
    email: string,
    password: string
  ): Promise<{ user: AuthUserProfile | null; error: Error | null }> {
    if (!isSupabaseConfigured) {
      // Offline / Local mock login
      const mockUser: AuthUserProfile = {
        id: 'local-email-user',
        email: email.trim(),
        fullName: email.split('@')[0] || 'Juan Dela Cruz',
        isGuest: false,
      };
      localStorage.setItem(LOCAL_GUEST_USER_KEY, JSON.stringify(mockUser));
      return { user: mockUser, error: null };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) return { user: null, error };
      if (!data.user) return { user: null, error: new Error('User not found') };

      const profile: AuthUserProfile = {
        id: data.user.id,
        email: data.user.email || '',
        fullName: data.user.user_metadata?.full_name || 'Juan Dela Cruz',
        avatarUrl: data.user.user_metadata?.avatar_url,
        isGuest: false,
      };
      return { user: profile, error: null };
    } catch (err: any) {
      return { user: null, error: err };
    }
  }

  /**
   * Sign Up with Email and Password
   */
  public static async signUpWithEmail(
    email: string,
    password: string,
    fullName: string
  ): Promise<{ user: AuthUserProfile | null; error: Error | null; message?: string }> {
    if (!isSupabaseConfigured) {
      const mockUser: AuthUserProfile = {
        id: 'local-signup-user',
        email: email.trim(),
        fullName: fullName.trim() || 'Juan Dela Cruz',
        isGuest: false,
      };
      localStorage.setItem(LOCAL_GUEST_USER_KEY, JSON.stringify(mockUser));
      return { user: mockUser, error: null };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim() || 'Juan Dela Cruz',
          },
        },
      });

      if (error) return { user: null, error };

      if (data.user) {
        const profile: AuthUserProfile = {
          id: data.user.id,
          email: data.user.email || '',
          fullName: data.user.user_metadata?.full_name || fullName || 'Juan Dela Cruz',
          isGuest: false,
        };
        return {
          user: profile,
          error: null,
          message: data.session ? undefined : 'Confirmation email sent. Please check your inbox.',
        };
      }

      return { user: null, error: null };
    } catch (err: any) {
      return { user: null, error: err };
    }
  }

  /**
   * Guest / Offline Mode Explorer
   */
  public static startGuestSession(): AuthUserProfile {
    const guestUser: AuthUserProfile = {
      id: 'guest-user-session',
      email: 'guest@finova.local',
      fullName: 'Juan Dela Cruz (Guest)',
      isGuest: true,
    };
    localStorage.setItem(LOCAL_GUEST_USER_KEY, JSON.stringify(guestUser));
    return guestUser;
  }

  /**
   * Sign Out
   */
  public static async signOut(): Promise<void> {
    localStorage.removeItem(LOCAL_GUEST_USER_KEY);
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Supabase sign out error:', err);
      }
    }
  }
}
