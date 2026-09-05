import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState, memo } from "react";
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  X,
  Bot,
  Bug,
  Trophy,
  History,
  User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";

const NAV = [
  {
    to: "/",
    label: "Dashboard",
    icon: LayoutDashboard,
    badgeBg: "bg-blue-500",
  },
  {
    to: "/payments",
    label: "Payments",
    icon: CreditCard,
    badgeBg: "bg-rose-500",
  },
  {
    to: "/sms-automation",
    label: "Tips Packages",
    icon: Bot,
    badgeBg: "bg-purple-500",
  },
  {
    to: "/history",
    label: "Package History",
    icon: History,
    badgeBg: "bg-amber-500",
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    badgeBg: "bg-emerald-500",
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    badgeBg: "bg-cyan-500",
  },
  {
    to: "/debug",
    label: "System Debug",
    icon: Bug,
    badgeBg: "bg-orange-500",
  },
] as const;

// Memoized nav item matching the colorful ERP sidebar icons in reference image
const NavItem = memo(function NavItem({
  to,
  label,
  icon: Icon,
  badgeBg,
  onClick,
}: (typeof NAV)[number] & { onClick?: () => void }) {
  return (
    <Link
      to={to}
      preload="intent"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-bold transition-all duration-100 touch-manipulation active:scale-[0.98]"
      activeProps={{
        className: "bg-blue-600/30 text-white shadow-sm ring-1 ring-blue-400/40 font-black",
      }}
      inactiveProps={{
        className: "text-slate-300 hover:bg-slate-800 hover:text-white",
      }}
    >
      {({ isActive }: { isActive: boolean }) => (
        <>
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm transition-transform duration-100 group-hover:scale-110",
              badgeBg,
              isActive && "ring-2 ring-white/60 scale-105"
            )}
          >
            <Icon className="h-4 w-4 shrink-0 text-white" />
          </div>
          <span>{label}</span>
          {isActive && (
            <span className="ml-auto h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
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

  if (!isAuthenticated) {
    navigate({ to: "/login", replace: true });
    return null;
  }

  const initials = email?.[0]?.toUpperCase() ?? "A";
  const roleName = user?.role === "admin" ? "Administrator" : "User";

  return (
    <div className="flex min-h-screen relative bg-[#F1F5F9] text-slate-900">
      {/* Top Page Transition Progress Bar */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-50 h-1 bg-gradient-to-r from-blue-500 via-amber-400 to-emerald-400 animate-pulse shadow-md transition-opacity duration-200 pointer-events-none",
          isNavigating ? "opacity-100" : "opacity-0"
        )}
      />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/60 backdrop-blur-sm md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar (Dark Navy Slate #1E293B matching reference image) */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-[#1E293B] text-white border-r border-slate-700/60 transition-transform md:static md:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo Header */}
        <div className="flex h-16 items-center justify-between px-5 shrink-0 bg-[#0F172A] border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-black shadow-md">
              <Trophy className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-white">TrueTips</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-1 text-slate-400 hover:text-white md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav Links */}
        <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto">
          <p className="mb-2 px-3 text-[10px] font-black uppercase tracking-widest text-slate-400">
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

        {/* User Footer */}
        <div className="shrink-0 border-t border-slate-700/60 px-3 py-4 bg-[#0F172A]/50">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white shadow-md bg-blue-600">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{roleName}</p>
              <p className="truncate text-xs text-slate-400">{email}</p>
            </div>
            <button
              onClick={() => {
                logout();
                navigate({ to: "/login", replace: true });
              }}
              className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Header Banner — Solid Royal Blue (#1D70B8 / #2563EB) matching reference image */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 bg-[#1D70B8] px-4 md:px-8 shadow-md">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-white hover:bg-white/10 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          
          <h1 className="text-xl font-extrabold tracking-tight text-white">
            TrueTips Admin Console
          </h1>

          <div className="flex-1" />

          {/* Top Right Header User Avatar */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-black text-blue-900 bg-white shadow-md border-2 border-white/80">
              <UserIcon className="h-5 w-5 text-blue-700" />
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8 bg-[#F1F5F9]">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
