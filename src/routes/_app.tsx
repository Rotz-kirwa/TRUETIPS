import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/DashboardLayout";

// Auth is enforced inside DashboardLayout via useAuth() from AuthProvider.
// The root loader (getCurrentUserFn) populates the AuthProvider on initial load.
// No beforeLoad server round-trip needed here — eliminates navigation latency.
export const Route = createFileRoute("/_app")({
  component: DashboardLayout,
});
