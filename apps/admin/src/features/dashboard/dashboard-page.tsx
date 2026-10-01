import { Link } from 'react-router-dom';

import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { navGroups } from '@/components/nav/nav-config';
import { useAdminSession } from '@/auth/use-admin-session';

/**
 * A deliberately minimal landing page (TAM-86 #PLAN_UNCERTAINTY: "recommend a
 * minimal landing page and treat a real dashboard as out of scope").
 *
 * It is a welcome + a map of the CMS — no per-entity counts, because every count
 * would be a query against an endpoint that does not exist yet, and a real
 * dashboard has not been specified. If product wants metrics here, that is its
 * own ticket.
 */
export function DashboardPage() {
  const { data: session } = useAdminSession();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {session?.email
            ? `Signed in as ${session.email}. `
            : ''}
          Pick a section to start editing content.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {navGroups
          .filter((group) => group.label !== 'Overview')
          .map((group) => (
            <Card key={group.label}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <group.icon aria-hidden="true" className="size-4" />
                  {group.label}
                </CardTitle>
                <CardDescription>
                  <ul className="mt-2 grid gap-1">
                    {group.items.map((item) => (
                      <li key={item.to}>
                        {item.status === 'ready' ? (
                          <Link
                            to={item.to}
                            className="text-sm underline-offset-4 hover:underline"
                          >
                            {item.label}
                          </Link>
                        ) : (
                          <span className="flex items-center gap-2 text-sm text-muted-foreground/60">
                            {item.label}
                            <Badge variant="muted" className="text-[10px]">
                              Soon
                            </Badge>
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
      </div>
    </div>
  );
}
