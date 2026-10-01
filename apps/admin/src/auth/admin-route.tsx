import type { ReactNode } from 'react';
import { ShieldAlertIcon } from 'lucide-react';
import { ProtectedRoute } from './protected-route';
import { useAdminSession } from './use-admin-session';
import { NotAuthorizedError } from './admin-session';
import { useAuth } from './auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api-error';

/**
 * ⚠️ THIS GUARD IS A UX AFFORDANCE, NOT A SECURITY CONTROL.
 *
 * `adminMiddleware` (TAM-82) is what actually protects the data — every
 * `/admin/*` request is independently guarded server-side. `<AdminRoute>` exists
 * so a non-admin does not see a CMS shell full of privileged surface they cannot
 * use (defence in depth). Do not let a reviewer treat this as the boundary.
 *
 * Semantics (`GET /admin/session` is self-gating — ADR D1):
 *  - **loading** → a skeleton. NEVER children: a flash of the panel before the
 *    guard resolves is exactly what this component exists to prevent.
 *  - **200** → children.
 *  - **403** → an explicit "not authorized" screen. NOT a redirect: bouncing a
 *    successfully-authenticated non-admin to `/login` is an infinite loop and a
 *    lie — their problem is authorization, not authentication.
 *  - **401** → `/login`, handled globally by `lib/api.ts`'s interceptor. Not
 *    duplicated here.
 *  - **anything else** → an error screen with a retry. Fails closed.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <AdminSessionGate>{children}</AdminSessionGate>
    </ProtectedRoute>
  );
}

function AdminSessionGate({ children }: { children: ReactNode }) {
  const { data, isPending, isError, error, refetch } = useAdminSession();

  if (isPending) return <AdminRouteSkeleton />;

  if (isError) {
    if (error instanceof NotAuthorizedError) return <NotAuthorizedScreen />;
    return (
      <SessionErrorScreen
        message={errorMessage(error, 'Could not verify your admin access.')}
        onRetry={() => void refetch()}
      />
    );
  }

  // Fail closed: render children ONLY on a validated 200.
  if (!data) return <AdminRouteSkeleton />;

  return <>{children}</>;
}

function AdminRouteSkeleton() {
  return (
    <div className="flex min-h-screen" data-slot="admin-route-skeleton">
      <div className="hidden w-64 shrink-0 border-r p-4 md:block">
        <Skeleton className="mb-6 h-8 w-32" />
        <div className="grid gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      <div className="flex-1 p-8">
        <Skeleton className="mb-6 h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
      <span className="sr-only" role="status">
        Checking your admin access…
      </span>
    </div>
  );
}

function CenteredScreen({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function NotAuthorizedScreen() {
  const { logout } = useAuth();
  return (
    <CenteredScreen>
      <Alert variant="destructive">
        <ShieldAlertIcon />
        <AlertTitle>Not authorized</AlertTitle>
        <AlertDescription>
          <p>
            You are signed in, but this account does not have admin access. Ask an
            administrator to grant your account the admin role, or sign in with an
            admin account.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              logout();
            }}
          >
            Sign out
          </Button>
        </AlertDescription>
      </Alert>
    </CenteredScreen>
  );
}

function SessionErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <CenteredScreen>
      <Alert variant="destructive">
        <ShieldAlertIcon />
        <AlertTitle>Could not verify your access</AlertTitle>
        <AlertDescription>
          <p>{message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    </CenteredScreen>
  );
}
