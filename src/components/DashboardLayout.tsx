import { Link, useLocation, useNavigate, Outlet } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Bell,
  X,
  Bot,
  Bug,
  Trophy,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const NAV = [
  {
    to: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    color: "text-sky-400",
    bgColor: "bg-sky-500/15",
    activeBg: "bg-sky-500/25",
    ringColor: "ring-sky-400/40",
    dotColor: "bg-sky-400",
  },
  {
    to: "/payments",
    label: "Payments",
    icon: CreditCard,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/15",
    activeBg: "bg-emerald-500/25",
    ringColor: "ring-emerald-400/40",
    dotColor: "bg-emerald-400",
  },
  {
    to: "/sms-automation",
    label: "Tips Packages",
    icon: Bot,
    color: "text-violet-400",
    bgColor: "bg-violet-500/15",
    activeBg: "bg-violet-500/25",
    ringColor: "ring-violet-400/40",
    dotColor: "bg-violet-400",
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/15",
    activeBg: "bg-cyan-500/25",
    ringColor: "ring-cyan-400/40",
    dotColor: "bg-cyan-400",
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    color: "text-pink-400",
    bgColor: "bg-pink-500/15",
    activeBg: "bg-pink-500/25",
    ringColor: "ring-pink-400/40",
    dotColor: "bg-pink-400",
  },
  {
    to: "/debug",
    label: "System Debug",
    icon: Bug,
    color: "text-orange-400",
    bgColor: "bg-orange-500/15",
    activeBg: "bg-orange-500/25",
    ringColor: "ring-orange-400/40",
    dotColor: "bg-orange-400",
  },
] as const;

export function DashboardLayout() {
  const { isAuthenticated, email, logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) navigate({ to: "/login" });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  if (!isAuthenticated) return null;

  const initials = email?.[0]?.toUpperCase() ?? "A";
  const roleName = user?.role === "admin" ? "Administrator" : "User";

  return (
    <div className="flex min-h-screen" style={{ background: "var(--gradient-subtle)" }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-transform md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ background: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)" }}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl shadow-md bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500">
              <CreditCard className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white">TrueTips</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-white/60 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1.5 px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-white/40">
            Menu
          </p>
          {NAV.map(({ to, label, icon: Icon, color, bgColor, activeBg, ringColor, dotColor }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150",
                  active
                    ? "bg-white/15 text-white shadow-sm ring-1 ring-white/10 font-semibold"
                    : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all duration-200",
                    active
                      ? `${activeBg} ${color} ring-1 ${ringColor} scale-105 shadow-sm`
                      : `${bgColor} ${color} group-hover:scale-110 group-hover:bg-white/15`,
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                </div>
                <span>{label}</span>
                {active && (
                  <span className={cn("ml-auto h-1.5 w-1.5 rounded-full shadow-sm", dotColor)} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="shrink-0 border-t px-3 py-4" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white shadow"
              style={{ background: "var(--gradient-coral)" }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{roleName}</p>
              <p className="truncate text-xs text-white/50">{email}</p>
            </div>
            <button
              onClick={async () => {
                logout();
                await navigate({ to: "/login", replace: true });
              }}
              className="rounded-lg p-1.5 text-rose-400/80 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border bg-card/95 px-4 backdrop-blur-md md:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-secondary md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          {/* Page title breadcrumb area — left spacer on desktop */}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button className="relative rounded-xl p-2 text-muted-foreground hover:bg-secondary transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
            </button>
            <div
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white shadow-sm"
              style={{ background: "var(--gradient-primary)" }}
            >
              {initials}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
