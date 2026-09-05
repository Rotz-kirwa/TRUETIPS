import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Loader2, Lock, Mail, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { predictionLabLogo } from "@/assets/logo";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — TrueTips" }] }),
});

function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated) navigate({ to: "/", replace: true });
  }, [isAuthenticated, navigate]);

  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate({ to: "/", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4 overflow-hidden bg-slate-950">
      {/* Background image with light WebP asset */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-scroll transition-opacity duration-1000"
        style={{
          backgroundImage: "url('/login-bg.webp')",
          filter: "brightness(0.55) contrast(1.1)",
        }}
      />

      {/* Suppress browser built-in password reveal / autofill overlay icons */}
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear,
        input::-webkit-credentials-auto-fill-button,
        input::-webkit-strong-password-auto-fill-button,
        input::-webkit-contacts-auto-fill-button {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `}</style>

      {/* Top/bottom dark gradient vignette for enhanced depth and readability */}
      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-900/40 to-slate-950/90 pointer-events-none" />

      {/* Subdued radial glow behind central login card */}
      <div
        className="absolute inset-0 pointer-events-none flex items-center justify-center"
        style={{
          background: "radial-gradient(circle at center, rgba(15, 23, 42, 0.75) 0%, rgba(15, 23, 42, 0.4) 50%, transparent 80%)",
        }}
      />

      {/* Animated card wrapper */}
      <div
        className="relative z-10 w-full max-w-sm transition-all duration-700"
        style={{
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(28px)",
        }}
      >
        {/* Logo + brand */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl shadow-2xl ring-2 ring-white/20 bg-white/10 backdrop-blur-md">
            <img src={predictionLabLogo} alt="TrueTips" className="h-full w-full object-cover" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-black tracking-wide text-white drop-shadow-md">TrueTips</h2>
            <p className="text-xs text-blue-200/70 tracking-widest uppercase font-bold mt-0.5">Admin ERP Portal</p>
          </div>
        </div>

        {/* Glass card */}
        <div
          className="rounded-3xl p-8 shadow-2xl"
          suppressHydrationWarning
          style={{
            background: "rgba(15, 23, 42, 0.85)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 32px 64px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
          }}
        >
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-black tracking-tight text-white">Welcome Back</h1>
            <p className="mt-1.5 text-sm text-slate-300 font-medium">Sign in to manage your ERP portal</p>
          </div>

          <form onSubmit={submit} className="space-y-4" suppressHydrationWarning>
            {/* Email field */}
            <div className="group" suppressHydrationWarning>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300" htmlFor="email">
                Email
              </label>
              <div className="relative" suppressHydrationWarning>
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-400" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="joelesabu2@gmail.com"
                  className="h-12 w-full rounded-xl pl-10 pr-4 text-sm text-white font-medium outline-none transition-all placeholder:text-slate-400"
                  style={{ background: "rgba(255, 255, 255, 0.07)", border: "1px solid rgba(255, 255, 255, 0.14)" }}
                  suppressHydrationWarning
                  onFocus={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(29, 112, 184, 0.8)";
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29, 112, 184, 0.25)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.14)";
                    e.currentTarget.style.background = "rgba(255, 255, 255, 0.07)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Password field */}
            <div className="group" suppressHydrationWarning>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-300" htmlFor="password">
                Password
              </label>
              <div className="flex items-center gap-2" suppressHydrationWarning>
                <div className="relative flex-1" suppressHydrationWarning>
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-blue-400" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="h-12 w-full rounded-xl pl-10 pr-4 text-sm text-white font-medium outline-none transition-all placeholder:text-slate-400"
                    style={{ background: "rgba(255, 255, 255, 0.07)", border: "1px solid rgba(255, 255, 255, 0.14)" }}
                    suppressHydrationWarning
                    onFocus={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(29, 112, 184, 0.8)";
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)";
                      e.currentTarget.style.boxShadow = "0 0 0 3px rgba(29, 112, 184, 0.25)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.border = "1px solid rgba(255, 255, 255, 0.14)";
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.07)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all hover:scale-105 active:scale-95"
                  style={{
                    background: showPassword ? "rgba(29, 112, 184, 0.35)" : "rgba(255, 255, 255, 0.10)",
                    color: showPassword ? "rgb(147, 197, 253)" : "rgba(255, 255, 255, 0.85)",
                    border: showPassword ? "1px solid rgba(29, 112, 184, 0.6)" : "1px solid rgba(255, 255, 255, 0.18)",
                    boxShadow: showPassword ? "0 0 12px rgba(29, 112, 184, 0.4)" : "none",
                  }}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div
                className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm text-rose-300 font-medium"
                style={{ background: "rgba(225, 29, 72, 0.18)", border: "1px solid rgba(225, 29, 72, 0.3)" }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="relative mt-2 h-12 w-full overflow-hidden rounded-xl text-sm font-black tracking-wide text-white shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 bg-blue-600 hover:bg-blue-700 shadow-blue-900/40"
            >
              <span className="pointer-events-none absolute inset-0 rounded-xl"
                style={{ background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)" }} />
              <span className="relative flex items-center justify-center gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? "Signing in…" : "Sign in to TrueTips"}
              </span>
            </button>
          </form>
        </div>

        {/* Bottom brand text */}
        <div className="mt-8 text-center">
          <p className="text-xs tracking-widest text-white/60 uppercase font-bold drop-shadow-sm">
            TrueTips ERP Admin System
          </p>
        </div>
      </div>
    </div>
  );
}
