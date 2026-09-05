import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState, memo } from "react";
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
  History,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

const NAV = [
  {
    to: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    color: "text-sky-400",
    bgColor: "bg-sky-500/15",
    activeBg: "bg-sky-500/25",
    ringColor: "ring-sky-400/40",
  },
  {
    to: "/payments",
    label: "Payments",
    icon: CreditCard,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/15",
    activeBg: "bg-emerald-500/25",
    ringColor: "ring-emerald-400/40",
  },
  {
    to: "/sms-automation",
    label: "Tips Packages",
    icon: Bot,
    color: "text-violet-400",
    bgColor: "bg-violet-500/15",
    activeBg: "bg-violet-500/25",
    ringColor: "ring-violet-400/40",
  },
  {
    to: "/history",
    label: "Package History",
    icon: History,
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/15",
    activeBg: "bg-yellow-500/25",
    ringColor: "ring-yellow-400/40",
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    color: "text-cyan-400",
    bgColor: "bg-cyan-500/15",
    activeBg: "bg-cyan-500/25",
    ringColor: "ring-cyan-400/40",
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    color: "text-pink-400",
    bgColor: "bg-pink-500/15",
    activeBg: "bg-pink-500/25",
    ringColor: "ring-pink-400/40",
  },
  {
    to: "/debug",
    label: "System Debug",
    icon: Bug,
    color: "text-orange-400",
    bgColor: "bg-orange-500/15",
    activeBg: "bg-orange-500/25",
    ringColor: "ring-orange-400/40",
  },
] as const;

// Memoized nav item — only re-renders when its own active state changes
const NavItem = memo(function NavItem({
  to,
  label,
  icon: Icon,
  color,
  bgColor,
  activeBg,
  ringColor,
  onClick,
}: (typeof NAV)[number] & { onClick?: () => void }) {
  return (
    <Link
      to={to}
      preload="intent"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors duration-100 touch-manipulation active:scale-[0.98]"
      activeProps={{
        className: "bg-emerald-500/20 text-white shadow-sm ring-1 ring-emerald-500/40 font-bold",
      }}
      inactiveProps={{
        className: "text-white/70 hover:bg-white/10 hover:text-white",
      }}
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors duration-100",
              isActive
                ? `${activeBg} ${color} ring-1 ${ringColor} scale-105 shadow-sm`
                : `${bgColor} ${color} group-hover:scale-110 group-hover:bg-white/15`,
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
          </div>
          <span>{label}</span>
          {isActive && (
            <span className="ml-auto h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(250,204,21,0.8)]" />
          )}
        </>
      )}
    </Link>
  );
});

export function DashboardLayout() {
  const { isAuthenticated, email, logout, user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isNavigating = useRouterState({ select: (s) => s.status === "pending" });

  // Auth guard: DashboardLayout enforces login client-side.
  // Root loader already checked server-side; this handles stale client state.
  if (!isAuthenticated) {
    navigate({ to: "/login", replace: true });
    return null;
  }

  const initials = email?.[0]?.toUpperCase() ?? "A";
  const roleName = user?.role === "admin" ? "Administrator" : "User";

  return (
    <div className="flex min-h-screen relative" style={{ background: "var(--gradient-subtle)" }}>
      {/* Top Page Transition Progress Bar — always in DOM, toggled via opacity for hydration safety */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-[#10B981] via-[#FACC15] to-[#38BDF8] animate-pulse shadow-[0_0_10px_#10B981] transition-opacity duration-200 pointer-events-none",
          isNavigating ? "opacity-100" : "opacity-0"
        )}
      />

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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl shadow-md bg-gradient-to-tr from-amber-400 via-yellow-500 to-amber-600 text-slate-950 font-black">
              <Trophy className="h-5 w-5 text-slate-950" />
            </div>
            <span className="text-xl font-extrabold tracking-tight text-sky-400">TrueTips</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-white/60 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav — each item only re-renders when ITS active state flips */}
        <nav className="flex-1 space-y-1.5 px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-widest text-emerald-400/60">
            Navigation Menu
          </p>
          {NAV.map((item) => (
            <NavItem
              key={item.to}
              {...item}
              onClick={() => setSidebarOpen(false)}
            />
          ))}
        </nav>

        {/* User */}
        <div className="shrink-0 border-t px-3 py-4" style={{ borderColor: "rgba(255,255,255,0.12)" }}>
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-slate-950 shadow-md bg-amber-400">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{roleName}</p>
              <p className="truncate text-xs text-white/50">{email}</p>
            </div>
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login", replace: true });
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
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <button className="relative rounded-xl p-2 text-sky-400 hover:bg-secondary transition-colors">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            </button>
            <div className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black text-slate-950 shadow-sm bg-amber-400">
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
