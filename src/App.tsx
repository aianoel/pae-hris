import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";

import { isSupabaseConfigured } from "@/lib/supabase";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { ToastProvider } from "@/components/ui/toast";
import { StoreProvider } from "@/store";
import { AuthProvider } from "@/store/auth";
import { useAuth } from "@/store/auth-context";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAccess } from "@/components/layout/RequireAccess";
import { DashboardPage } from "@/pages/DashboardPage";
import { MyWorkspacePage } from "@/pages/MyWorkspacePage";
import { AnalyticsPage } from "@/pages/AnalyticsPage";
import { EmployeesPage } from "@/pages/EmployeesPage";
import { UsersPage } from "@/pages/UsersPage";
import { DepartmentsPage } from "@/pages/DepartmentsPage";
import { AttendancePage } from "@/pages/AttendancePage";
import { LeavePage } from "@/pages/LeavePage";
import { PayrollPage } from "@/pages/PayrollPage";
import { PayrollEntryPage } from "@/pages/PayrollEntryPage";
import { PayrollReportPage } from "@/pages/PayrollReportPage";
import { ContributionsPage } from "@/pages/ContributionsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LogsPage } from "@/pages/LogsPage";
import { RolesPage } from "@/pages/RolesPage";
import { LoginPage } from "@/components/auth/LoginPage";
import { ResetPasswordPage } from "@/components/auth/ResetPasswordPage";

/**
 * Guards the app shell — unauthenticated users are bounced to /login, and a
 * password-recovery session is held on the reset screen until a new password is
 * set (a recovery link must not double as a way into the app).
 */
function RequireAuth() {
  const { user, recovery } = useAuth();
  if (recovery) return <ResetPasswordPage />;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

/** Keeps authenticated users away from the login screen. */
function LoginRoute() {
  const { user, recovery } = useAuth();
  if (recovery) return <ResetPasswordPage />;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginRoute />,
  },
  {
    path: "/",
    element: <RequireAuth />,
    children: [
      { index: true, element: <DashboardPage /> },
      // Self-service: deliberately outside RequireAccess. Every signed-in user
      // may read their own payslips, leave and attendance regardless of which
      // admin modules they've been granted.
      { path: "my", element: <MyWorkspacePage /> },
      { path: "analytics", element: <RequireAccess><AnalyticsPage /></RequireAccess> },
      { path: "employees", element: <RequireAccess><EmployeesPage /></RequireAccess> },
      { path: "users", element: <RequireAccess><UsersPage /></RequireAccess> },
      { path: "departments", element: <RequireAccess><DepartmentsPage /></RequireAccess> },
      { path: "attendance", element: <RequireAccess><AttendancePage /></RequireAccess> },
      { path: "leave", element: <RequireAccess><LeavePage /></RequireAccess> },
      { path: "payroll", element: <RequireAccess><PayrollPage /></RequireAccess> },
      { path: "payroll/data-entry", element: <RequireAccess><PayrollEntryPage /></RequireAccess> },
      { path: "payroll/report", element: <RequireAccess><PayrollReportPage /></RequireAccess> },
      { path: "contributions", element: <RequireAccess><ContributionsPage /></RequireAccess> },
      { path: "reports", element: <RequireAccess><ReportsPage /></RequireAccess> },
      { path: "documents", element: <RequireAccess><DocumentsPage /></RequireAccess> },
      { path: "settings", element: <RequireAccess><SettingsPage /></RequireAccess> },
      { path: "logs", element: <RequireAccess><LogsPage /></RequireAccess> },
      { path: "roles", element: <RequireAccess><RolesPage /></RequireAccess> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

/**
 * Hard security gate: the app is only functional against a configured Supabase
 * backend, where Row Level Security authorizes every read/write. Without a
 * backend there is no login path (see auth.tsx) and no server-side
 * authorization, so we refuse to mount the app rather than fall back to an
 * unauthenticated in-memory mode. This closes the offline attack surface.
 */
function BackendRequiredScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-soft">
        <h1 className="text-lg font-semibold text-foreground">Backend not configured</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This application requires a Supabase backend for authentication and
          access control. Set <code className="rounded bg-secondary px-1">VITE_SUPABASE_URL</code>{" "}
          and <code className="rounded bg-secondary px-1">VITE_SUPABASE_ANON_KEY</code>, then
          reload.
        </p>
      </div>
    </div>
  );
}

// Provider tree: toast → store → theme → auth → router. Toast sits above the
// store so store write-throughs can surface failures as toasts; theme sits
// inside the store because it reads/persists the DB `settings` theme; auth sits
// above the router so route guards can read the session.
export default function App() {
  // No backend → no auth, no server-side authorization. Refuse to run.
  if (!isSupabaseConfigured) return <BackendRequiredScreen />;

  return (
    <ToastProvider>
      <StoreProvider>
        <ThemeProvider>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </ThemeProvider>
      </StoreProvider>
    </ToastProvider>
  );
}
