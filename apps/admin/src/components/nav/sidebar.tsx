import { NavLink } from 'react-router-dom';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { navGroups, type NavItem } from './nav-config';

/**
 * The persistent, module-grouped sidebar (ADR D1).
 *
 * `planned` entries are rendered as non-interactive `<span aria-disabled>` +
 * a "Soon" badge — never as a link to a route that does not exist. See
 * `nav-config.ts` for the decision and for how a module ticket turns its own
 * entry on.
 */
export function Sidebar({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Admin sections"
      data-slot="sidebar"
      className={cn(
        'flex w-64 shrink-0 flex-col gap-6 overflow-y-auto border-r bg-card p-4',
        className,
      )}
    >
      {navGroups.map((group) => (
        <div key={group.label} className="grid gap-1">
          <div className="flex items-center gap-2 px-2 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <group.icon aria-hidden="true" className="size-3.5" />
            {group.label}
          </div>
          <ul className="grid gap-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <SidebarItem item={item} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const itemBase =
  'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors';

function SidebarItem({ item }: { item: NavItem }) {
  if (item.status === 'planned') {
    return (
      <span
        aria-disabled="true"
        title={
          item.ticket
            ? `Not built yet — ${item.ticket}`
            : 'Not built yet'
        }
        className={cn(itemBase, 'cursor-not-allowed text-muted-foreground/60')}
      >
        {item.label}
        <Badge variant="muted" className="text-[10px]">
          Soon
        </Badge>
      </span>
    );
  }

  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn(
          itemBase,
          'hover:bg-accent hover:text-accent-foreground',
          'focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
          isActive && 'bg-accent font-medium text-accent-foreground',
        )
      }
    >
      {item.label}
    </NavLink>
  );
}
