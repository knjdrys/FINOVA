import React, { useState } from 'react';
import { AuthService, AuthUserProfile } from '../services/supabase/authService';
import { t } from '../i18n/core';
import { notice } from '../components/ui/dialog';
import {
  Mail,
  Lock,
  User,
  ShieldCheck,
  Zap,
  Rocket,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUserProfile) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<'SIGN_IN' | 'SIGN_UP'>('SIGN_IN');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resending, setResending] = useState(false);

  // Handle Google OAuth Sign In
  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { error } = await AuthService.signInWithGoogle();
      if (error) {
        setErrorMessage(error.message || 'Google sign-in failed');
      } else {
        const { user } = await AuthService.getInitialSession();
        if (user) onAuthenticated(user);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Google sign-in failed');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Email / Password Sign In or Sign Up
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      if (mode === 'SIGN_IN') {
        const { user, error } = await AuthService.signInWithEmail(email, password);
        if (error) {
          setNeedsConfirm(/confirm your email/i.test(error.message));
          setErrorMessage(error.message || 'Sign in failed. Check your credentials.');
        } else if (user) {
          onAuthenticated(user);
        }
      } else {
        const { user, error, message } = await AuthService.signUpWithEmail(
          email,
          password,
          fullName || 'Juan Dela Cruz'
        );
        if (error) {
          setErrorMessage(error.message || 'Registration failed.');
        } else if (user) {
          setSuccessMessage(message || 'Account created successfully! Logging you in...');
          setTimeout(() => onAuthenticated(user), 600);
        } else if (message) {
          setSuccessMessage(message);
          setMode('SIGN_IN');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication error');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Guest Offline Session
  const handleGuestSession = () => {
    const guestUser = AuthService.startGuestSession();
    onAuthenticated(guestUser);
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white font-sans text-slate-900">
      {/* ---------------------------------------------------- */}
      {/* LEFT: BRAND AUTHORITY PANEL (GEOMETRIC IDENTITY)     */}
      {/* ---------------------------------------------------- */}
      <section className="relative w-full lg:w-1/2 bg-[#1a3a2e] p-8 md:p-12 lg:p-20 flex flex-col justify-between text-white overflow-hidden lg:min-h-screen">
        {/* Dot Grid Pattern Layer */}
        <div
          className="absolute inset-0 pointer-events-none opacity-30"
          style={{
            backgroundImage: 'radial-gradient(#c4f042 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />

        {/* Top: Geometric Logo Lockup */}
        <div className="relative z-10">
          <div className="flex flex-col items-start gap-4 sm:gap-6">
            {/* Geometric Icon: Three interconnected white nodes with lime connections */}
            <div className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 relative flex items-center justify-center bg-white/5 rounded-2xl border border-white/10 shadow-lg p-2">
              <svg viewBox="0 0 100 100" className="w-full h-full" aria-hidden="true">
                {/* Connecting lines */}
                <line x1="30" y1="35" x2="70" y2="35" stroke="#c4f042" strokeWidth="4" strokeLinecap="round" />
                <line x1="30" y1="35" x2="50" y2="70" stroke="#c4f042" strokeWidth="4" strokeLinecap="round" />
                <line x1="70" y1="35" x2="50" y2="70" stroke="#c4f042" strokeWidth="4" strokeLinecap="round" />
                {/* Nodes */}
                <circle cx="30" cy="35" r="10" fill="white" stroke="#1a3a2e" strokeWidth="1.5" />
                <circle cx="70" cy="35" r="10" fill="white" stroke="#1a3a2e" strokeWidth="1.5" />
                <circle cx="50" cy="70" r="10" fill="white" stroke="#1a3a2e" strokeWidth="1.5" />
              </svg>
            </div>

            <div className="flex flex-col gap-0.5">
              <span className="text-3xl md:text-4xl font-black tracking-tighter text-white">
                FINOVA
              </span>
              <span className="text-[10px] md:text-xs font-extrabold tracking-[0.35em] text-[#c4f042] uppercase">
                Personal Finance OS
              </span>
            </div>
          </div>
        </div>

        {/* Middle Content: Hero & Value Props */}
        <div className="relative z-10 my-8 lg:my-0">
          {mode === 'SIGN_IN' ? (
            <div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-[1.08] text-white mb-6 tracking-tight">
                Your money, your rules, one{' '}
                <span className="relative inline-block z-1">
                  <span className="relative z-10">place.</span>
                  <span className="absolute left-0 bottom-1.5 w-full h-3 bg-[#c4f042] -rotate-1 rounded-xs -z-0 opacity-90" />
                </span>
              </h1>
              <p className="text-emerald-100/80 text-base sm:text-lg max-w-lg mb-8 font-medium leading-relaxed">
                All your accounts, one operating system. No tabs. No chaos. Just mathematical clarity.
              </p>
            </div>
          ) : (
            <div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-[1.08] text-white mb-6 tracking-tight">
                Take control in minutes, not{' '}
                <span className="relative inline-block z-1">
                  <span className="relative z-10">months.</span>
                  <span className="absolute left-0 bottom-1.5 w-full h-3 bg-[#c4f042] -rotate-1 rounded-xs -z-0 opacity-90" />
                </span>
              </h1>
              <p className="text-emerald-100/80 text-base sm:text-lg max-w-lg mb-8 font-medium leading-relaxed">
                Join users building real wealth. Safe-to-Spend™, payday cycles, and zero math drift await.
              </p>
            </div>
          )}

          {/* Value Props Grid */}
          <div className="space-y-4 sm:space-y-6 max-w-md">
            <div className="flex items-start gap-3.5">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#c4f042]/15 flex items-center justify-center text-[#c4f042] shadow-xs">
                <Zap className="h-5 w-5 stroke-[2.5]" />
              </div>
              <div>
                <p className="font-extrabold text-white text-sm">Safe-to-Spend™ Engine</p>
                <p className="text-xs text-emerald-200/70">Authoritative daily limit protecting bills and savings.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#c4f042]/15 flex items-center justify-center text-[#c4f042] shadow-xs">
                <Rocket className="h-5 w-5 stroke-[2.5]" />
              </div>
              <div>
                <p className="font-extrabold text-white text-sm">Twice-a-Month Payday Cycles</p>
                <p className="text-xs text-emerald-200/70">15-day semi-monthly payroll budgeting that matches your real pay.</p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-[#c4f042]/15 flex items-center justify-center text-[#c4f042] shadow-xs">
                <ShieldCheck className="h-5 w-5 stroke-[2.5]" />
              </div>
              <div>
                <p className="font-extrabold text-white text-sm">Zero Math Drift & RLS Security</p>
                <p className="text-xs text-emerald-200/70">Integer minor units standard with Row Level Security.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Trust Row */}
        <div className="relative z-10 pt-6 border-t border-white/10 hidden md:block">
          <p className="text-[10px] font-extrabold tracking-[0.25em] text-emerald-300/60 mb-2 uppercase">
            Bank Presets Supported
          </p>
          <div className="flex items-center gap-6 text-white/40 text-xs font-bold uppercase tracking-wider">
            <span className="text-[#c4f042]/90 font-black">GRBI Rural Bank</span>
            <span>BPI</span>
            <span>BDO</span>
            <span>GCash</span>
            <span>Maya</span>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- */}
      {/* RIGHT: AUTH FORM PANEL                               */}
      {/* ---------------------------------------------------- */}
      <section className="w-full lg:w-1/2 bg-white flex flex-col justify-between">
        {/* Top-Right Contextual Mode Switcher */}
        <div className="p-6 lg:p-10 flex justify-end text-xs sm:text-sm">
          {mode === 'SIGN_IN' ? (
            <p className="text-slate-500 font-medium">
              New here?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('SIGN_UP');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-[#1a3a2e] font-black underline decoration-[#c4f042] decoration-2 underline-offset-4 hover:text-[#0f2420] transition-colors cursor-pointer"
              >
                Create account
              </button>
            </p>
          ) : (
            <p className="text-slate-500 font-medium">
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('SIGN_IN');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="text-[#1a3a2e] font-black underline decoration-[#c4f042] decoration-2 underline-offset-4 hover:text-[#0f2420] transition-colors cursor-pointer"
              >
                Sign in
              </button>
            </p>
          )}
        </div>

        {/* Form Center Container */}
        <div className="flex-1 flex items-center justify-center p-6 md:p-12 lg:p-16">
          <div className="w-full max-w-[420px] space-y-6">
            <div className="text-center lg:text-left">
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {mode === 'SIGN_IN' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                {mode === 'SIGN_IN'
                  ? 'Access your personal finance operating system'
                  : 'Start your journey to complete financial clarity'}
              </p>
            </div>

            {/* SSO Grid */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-slate-200 rounded-xl text-slate-800 font-bold text-xs sm:text-sm hover:border-[#c4f042] hover:bg-slate-50/80 active:scale-[0.99] transition-all cursor-pointer shadow-2xs"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex items-center my-2">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-3 text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
                or with email
              </span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {/* Notifications / Error Banner */}
            {errorMessage && (
              <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 animate-in fade-in duration-150">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
                <span className="font-semibold">{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="flex items-start gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 animate-in fade-in duration-150">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                <span className="font-semibold">{successMessage}</span>
              </div>
            )}

            {needsConfirm && (
              <button
                type="button"
                disabled={resending || isLoading}
                onClick={async () => {
                  setResending(true);
                  const { error, message } = await AuthService.resendConfirmationEmail(email);
                  setResending(false);
                  if (error) { setErrorMessage(error.message); }
                  else { setErrorMessage(null); setNeedsConfirm(false); setSuccessMessage(message || 'Confirmation email re-sent!'); }
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-200 bg-white text-[#1a3a2e] font-bold text-xs hover:bg-slate-50 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
              >
                {resending ? 'Re-sending…' : "Didn't get the email? Resend confirmation link"}
              </button>
            )}

            {/* Email / Password Form */}
            <form onSubmit={handleEmailAuth} className="space-y-4">
              {mode === 'SIGN_UP' && (
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Your Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Juan Dela Cruz"
                      required
                      className="w-full pl-10 pr-3.5 py-3 border border-slate-200 rounded-xl bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-[#c4f042] focus:ring-4 focus:ring-[#c4f042]/20 transition-all font-semibold"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full pl-10 pr-3.5 py-3 border border-slate-200 rounded-xl bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-[#c4f042] focus:ring-4 focus:ring-[#c4f042]/20 transition-all font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 h-4 w-4" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full pl-10 pr-14 py-3 border border-slate-200 rounded-xl bg-white text-xs sm:text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-[#c4f042] focus:ring-4 focus:ring-[#c4f042]/20 transition-all font-semibold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-extrabold uppercase text-[#1a3a2e] hover:text-[#0f2420] transition-colors cursor-pointer"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {mode === 'SIGN_IN' && (
                <div className="flex items-center justify-between text-xs pt-1">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-600 font-medium">
                    <input
                      type="checkbox"
                      checked={keepSignedIn}
                      onChange={(e) => setKeepSignedIn(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-[#1a3a2e] focus:ring-[#c4f042]"
                    />
                    <span>Keep me signed in</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => notice(t('dialog.resetPassword'))}
                    className="text-xs font-bold text-[#1a3a2e] hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Main Submit CTA */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl bg-[#c4f042] text-[#1a3a2e] font-black text-xs sm:text-sm shadow-md hover:bg-[#b5e032] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 mt-2"
              >
                {isLoading ? (
                  <div className="h-4 w-4 border-2 border-[#1a3a2e] border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>{mode === 'SIGN_IN' ? 'Sign in to FINOVA' : 'Create FINOVA Account'}</span>
                    <ArrowRight className="h-4 w-4 stroke-[2.5]" />
                  </>
                )}
              </button>
            </form>

            {/* Offline Guest Mode Fallback */}
            <div className="pt-2 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={handleGuestSession}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
              >
                Try FINOVA as Guest (Offline Mode)
              </button>
            </div>

            {/* Footnote */}
            <p className="text-[10px] text-slate-500 text-center leading-relaxed max-w-[320px] mx-auto pt-2">
              Protected by FINOVA Zero Math Drift engine. By continuing, you agree to our Terms of Service and Privacy Policy.
            </p>
          </div>
        </div>

        {/* Bottom spacing */}
        <div className="p-4" />
      </section>
    </div>
  );
};

export default AuthScreen;
