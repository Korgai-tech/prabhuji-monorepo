import { Outlet, useNavigate } from 'react-router-dom';
import { LogOutIcon, UserIcon } from 'lucide-react';

import { Sidebar } from '@/components/nav/sidebar';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/auth/auth-context';
import { useAdminSession } from '@/auth/use-admin-session';

/**
 * The CMS shell: persistent sidebar + header (user email, logout) + `<Outlet/>`.
 *
 * Only ever rendered inside `<AdminRoute>` (see `router.tsx`), so by the time
 * this mounts the `['admin','session']` query has already resolved 200 and is
 * cached — `useAdminSession()` here is a cache read, not a second request.
 *
 * `<Toaster/>` is mounted once, here, at the shell root: every mutation's
 * feedback surfaces through it (`src/lib/toast.ts`).
 */
export function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar className="hidden md:flex" />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <main className="min-w-0 flex-1 p-6">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}

function AdminHeader() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { data: session } = useAdminSession();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b bg-card px-6">
      <span className="text-sm font-semibold">Prabhuji CMS</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <UserIcon aria-hidden="true" />
            <span className="max-w-[16rem] truncate">
              {session?.email ?? 'Account'}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-medium">
              {session?.email}
            </span>
            <span className="block text-xs text-muted-foreground">
              Signed in as {session?.role ?? 'admin'}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              // Clears the token AND the whole query cache (auth-context), so a
              // stale session cannot survive a re-login as another user.
              logout();
              navigate('/login', { replace: true });
            }}
          >
            <LogOutIcon aria-hidden="true" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
