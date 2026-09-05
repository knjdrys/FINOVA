import { Session, AuthChangeEvent } from '@supabase/supabase-js';
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
              fullName: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'Juan Dela Cruz',
              avatarUrl: user.user_metadata?.avatar_url,
              isGuest: false,
            },
            session: data.session,
          };
        }
      } catch (err) {
        console.warn('Supabase session fetch error:', err);
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
   * Listen for Supabase auth state changes (OAuth callbacks, login, logout)
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
          fullName: session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'Juan Dela Cruz',
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
      // Offline fallback: Demo Google user
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
      const redirectUrl = window.location.origin;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('provider is not enabled') || error.message.toLowerCase().includes('unsupported provider')) {
          return {
            error: new Error(
              'Google login is not yet enabled in your Supabase project. Go to Supabase -> Authentication -> Providers -> Google to enable it, or log in with Email & Password below.'
            ),
          };
        }
        return { error };
      }

      return { error: null };
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
    const cleanEmail = email.trim();

    if (!isSupabaseConfigured) {
      const mockUser: AuthUserProfile = {
        id: 'local-email-user',
        email: cleanEmail,
        fullName: cleanEmail.split('@')[0] || 'Juan Dela Cruz',
        isGuest: false,
      };
      localStorage.setItem(LOCAL_GUEST_USER_KEY, JSON.stringify(mockUser));
      return { user: mockUser, error: null };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          return {
            user: null,
            error: new Error('Incorrect email or password. If you do not have an account yet, click "Create account" above.'),
          };
        }
        if (error.message.toLowerCase().includes('email not confirmed')) {
          return {
            user: null,
            error: new Error('Please confirm your email address by clicking the verification link sent to your inbox before logging in.'),
          };
        }
        return { user: null, error };
      }

      if (!data.user) {
        return { user: null, error: new Error('User account not found.') };
      }

      const profile: AuthUserProfile = {
        id: data.user.id,
        email: data.user.email || cleanEmail,
        fullName: data.user.user_metadata?.full_name || cleanEmail.split('@')[0] || 'Juan Dela Cruz',
        avatarUrl: data.user.user_metadata?.avatar_url,
        isGuest: false,
      };

      return { user: profile, error: null };
    } catch (err: any) {
      return { user: null, error: err };
    }
  }

  /**
   * Resend the signup confirmation email (e.g. user never received / lost it).
   */
  public static async resendConfirmationEmail(email: string): Promise<{ error: Error | null; message?: string }> {
    if (!isSupabaseConfigured) {
      return { error: new Error('Offline mode — nothing to confirm.') };
    }
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) {
        if (error.message.toLowerCase().includes('rate limit')) {
          return { error: new Error('Email provider limit reached — please wait about an hour and try again.') };
        }
        return { error };
      }
      return { error: null, message: `Confirmation link re-sent to ${email.trim()}. Check your inbox (and spam folder).` };
    } catch (err: any) {
      return { error: err };
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
    const cleanEmail = email.trim();
    const cleanName = fullName.trim() || cleanEmail.split('@')[0] || 'Juan Dela Cruz';

    if (password.length < 6) {
      return {
        user: null,
        error: new Error('Password must be at least 6 characters long.'),
      };
    }

    if (!isSupabaseConfigured) {
      const mockUser: AuthUserProfile = {
        id: 'local-signup-user',
        email: cleanEmail,
        fullName: cleanName,
        isGuest: false,
      };
      localStorage.setItem(LOCAL_GUEST_USER_KEY, JSON.stringify(mockUser));
      return { user: mockUser, error: null, message: 'Account created successfully!' };
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: cleanName,
            name: cleanName,
          },
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) {
        if (error.message.toLowerCase().includes('rate limit')) {
          return {
            user: null,
            error: new Error('Too many confirmation emails sent right now — the email provider caps us for about an hour. Please try signing up again a bit later.'),
          };
        }
        if (error.message.toLowerCase().includes('already registered')) {
          return {
            user: null,
            error: new Error('This email is already registered. Please sign in instead.'),
          };
        }
        return { user: null, error };
      }

      if (data.user) {
        const profile: AuthUserProfile = {
          id: data.user.id,
          email: data.user.email || cleanEmail,
          fullName: data.user.user_metadata?.full_name || cleanName,
          avatarUrl: data.user.user_metadata?.avatar_url,
          isGuest: false,
        };

        // Check if email confirmation is required by Supabase
        const isSessionActive = Boolean(data.session);

        return {
          user: isSessionActive ? profile : null,
          error: null,
          message: isSessionActive
            ? 'Account created and signed in successfully!'
            : `Account created! We sent a confirmation link to ${cleanEmail}. Open it to activate your account, then sign in here.`,
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
        console.warn('Supabase sign out error:', err);
      }
    }
  }
}
