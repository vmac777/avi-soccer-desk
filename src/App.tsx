import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import AppLayout from "@/components/AppLayout";
import RequireAuth from "@/components/auth/RequireAuth";
import RequireAdmin from "@/components/auth/RequireAdmin";
import RequireSuperAdmin from "@/components/auth/RequireSuperAdmin";
import Dashboard from "@/pages/Dashboard";
import ContactsPage from "@/pages/Contacts";
import PendingActionsPage from "@/pages/PendingActions";
import RosterPage from "@/pages/Roster";
import PitchesPage from "@/pages/BuyPitches";
import LoginPage from "@/pages/Login";
import NotFound from "@/pages/NotFound";
import Audit from "@/pages/admin/Audit";
import SystemHealth from "@/pages/admin/SystemHealth";

const queryClient = new QueryClient();

const adminRoute = (el: JSX.Element) => (
  <RequireAdmin>
    <AppLayout>{el}</AppLayout>
  </RequireAdmin>
);

const superAdminRoute = (el: JSX.Element) => (
  <RequireSuperAdmin>
    <AppLayout>{el}</AppLayout>
  </RequireSuperAdmin>
);

const authedRoute = (el: JSX.Element) => (
  <RequireAuth>
    <AppLayout>{el}</AppLayout>
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

            <Route path="/" element={adminRoute(<Dashboard />)} />
            <Route path="/contacts" element={adminRoute(<ContactsPage />)} />
            <Route path="/pending-actions" element={adminRoute(<PendingActionsPage />)} />
            <Route path="/roster" element={adminRoute(<RosterPage />)} />
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
