import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import RouteErrorBoundary from "@/components/RouteErrorBoundary";
import RequireAdmin from "@/components/auth/RequireAdmin";
import RequireSuperAdmin from "@/components/auth/RequireSuperAdmin";
import LoginPage from "@/pages/Login";
import { lazyRoute } from "@/lib/lazyRoute";

/**
 * Every page was in the entry chunk: 1.6 MB, 435 kB gzipped, downloaded before
 * the login form could render. Most of that is two libraries almost nobody
 * loads on a given visit — jsPDF and html2canvas are 584 kB between them and
 * only matter when somebody exports a dossier, and recharts only draws the
 * dashboard donuts.
 *
 * Login stays eager because it is the first paint for anyone signed out, and a
 * spinner in front of a password field is a worse trade than a few kilobytes.
 *
 * `lazyRoute` rather than `lazy`: a tab left open across a deploy asks for a
 * chunk filename the new build no longer has, and the route dies with "Failed
 * to fetch dynamically imported module" — which reads as the platform being
 * down when the page is simply out of date.
 */
const BoardPage = lazyRoute(() => import("@/pages/Board"));
const Dashboard = lazyRoute(() => import("@/pages/Dashboard"));
const ContactsPage = lazyRoute(() => import("@/pages/Contacts"));
const PendingActionsPage = lazyRoute(() => import("@/pages/PendingActions"));
const ClubNeedsPage = lazyRoute(() => import("@/pages/ClubNeeds"));
const RequirementDetailPage = lazyRoute(() => import("@/pages/RequirementDetail"));
const RosterPage = lazyRoute(() => import("@/pages/Roster"));
const RosterPlayerPage = lazyRoute(() => import("@/pages/RosterPlayerPage"));
const PitchesPage = lazyRoute(() => import("@/pages/BuyPitches"));
const NotFound = lazyRoute(() => import("@/pages/NotFound"));
const Audit = lazyRoute(() => import("@/pages/admin/Audit"));
const SystemHealth = lazyRoute(() => import("@/pages/admin/SystemHealth"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /**
       * The default is 0, which means every mount and every window focus
       * refetches. `useContacts` is shared by ten modules and pages the whole
       * contact book; alt-tabbing away and back re-read all of it.
       *
       * Thirty seconds is short enough that a colleague's edit shows up while
       * you are still looking at the page, and long enough that switching tabs
       * is free. Hooks that want longer already say so.
       */
      staleTime: 30_000,
      /**
       * Three retries with backoff is a long time to sit on a spinner when the
       * real answer is "your session expired" or "RLS said no" — neither of
       * which a retry fixes.
       */
      retry: 1,
    },
  },
});

/** Shown while a route chunk is in flight. */
const RouteFallback = () => (
  <div className="flex items-center justify-center h-64">
    <span className="text-muted-foreground font-mono text-sm">Loading...</span>
  </div>
);

const adminRoute = (el: JSX.Element) => (
  <RequireAdmin>
    <AppLayout>
      <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback />}>{el}</Suspense>
      </RouteErrorBoundary>
    </AppLayout>
  </RequireAdmin>
);

const superAdminRoute = (el: JSX.Element) => (
  <RequireSuperAdmin>
    <AppLayout>
      <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback />}>{el}</Suspense>
      </RouteErrorBoundary>
    </AppLayout>
  </RequireSuperAdmin>
);

const authedRoute = (el: JSX.Element) => (
  <RequireAuth>
    <AppLayout>
      <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback />}>{el}</Suspense>
      </RouteErrorBoundary>
    </AppLayout>
  </RequireAuth>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={adminRoute(<BoardPage />)} />
            <Route path="/network" element={adminRoute(<Dashboard />)} />
            <Route path="/contacts" element={adminRoute(<ContactsPage />)} />
            <Route path="/pending-actions" element={adminRoute(<PendingActionsPage />)} />
            <Route path="/needs" element={adminRoute(<ClubNeedsPage />)} />
            <Route path="/needs/:id" element={adminRoute(<RequirementDetailPage />)} />
            <Route path="/roster" element={adminRoute(<RosterPage />)} />
            <Route path="/roster/:id" element={adminRoute(<RosterPlayerPage />)} />
            <Route path="/pitches" element={adminRoute(<PitchesPage />)} />

            <Route path="/admin/audit" element={superAdminRoute(<Audit />)} />
            <Route path="/admin/system-health" element={superAdminRoute(<SystemHealth />)} />

            <Route path="*" element={authedRoute(<NotFound />)} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
