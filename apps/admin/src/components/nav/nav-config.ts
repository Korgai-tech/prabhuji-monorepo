import type { LucideIcon } from 'lucide-react';
import {
  BookOpenIcon,
  CreditCardIcon,
  FlameIcon,
  HomeIcon,
  ImageIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  MusicIcon,
  PhoneIcon,
  PinIcon,
  SparklesIcon,
  StarIcon,
  UsersIcon,
} from 'lucide-react';

/**
 * The sidebar nav tree (ADR D1).
 *
 * ┌── HOW A MODULE UI TICKET ADDS ITS PAGE ─────────────────────────────────┐
 * │ 1. add your route under `<AdminLayout>` in `src/app/router.tsx`;        │
 * │ 2. flip your entry here from `status: 'planned'` to `status: 'ready'`.  │
 * │ That is the whole nav change. Do not restructure the groups.            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * DECISION — unbuilt modules render as EXPLICITLY DISABLED, not omitted
 * (TAM-86 #PLAN_UNCERTAINTY, "decide once and apply uniformly"):
 *  - a disabled entry is never a dead link — it is not a link at all, it is a
 *    non-interactive `<span aria-disabled>` with a "Soon" badge, so the AC's
 *    "must not render as dead links" holds;
 *  - the full tree is the epic's map: nine parallel tickets can see exactly
 *    where their page belongs instead of each inventing a placement, and the
 *    grouping is decided once, here;
 *  - flipping one field is a smaller, less conflict-prone diff than nine
 *    tickets each editing the shape of this array.
 * By the end of TAM-81 every entry is `ready` and nothing is disabled.
 */
export type NavItemStatus = 'ready' | 'planned';

export interface NavItem {
  label: string;
  /** The route path. Must match the route registered in `router.tsx`. */
  to: string;
  status: NavItemStatus;
  /** The ticket that turns this entry on — for traceability during the epic. */
  ticket?: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    icon: LayoutDashboardIcon,
    items: [{ label: 'Dashboard', to: '/dashboard', status: 'ready' }],
  },
  {
    label: 'Taxonomy',
    icon: SparklesIcon,
    items: [
      { label: 'Deities', to: '/taxonomy/deities', status: 'ready', ticket: 'TAM-89' },
    ],
  },
  {
    label: 'Aarti',
    icon: FlameIcon,
    items: [
      { label: 'Items', to: '/aarti/items', status: 'ready', ticket: 'TAM-91' },
      { label: 'Categories', to: '/aarti/categories', status: 'ready', ticket: 'TAM-91' },
      { label: 'Sections', to: '/aarti/sections', status: 'ready', ticket: 'TAM-91' },
    ],
  },
  {
    label: 'Mantras',
    icon: MusicIcon,
    items: [
      { label: 'Items', to: '/mantras/items', status: 'ready', ticket: 'TAM-93' },
      { label: 'Categories', to: '/mantras/categories', status: 'ready', ticket: 'TAM-93' },
      { label: 'Sections', to: '/mantras/sections', status: 'ready', ticket: 'TAM-93' },
    ],
  },
  {
    label: 'Ringtones',
    icon: PhoneIcon,
    items: [
      { label: 'Ringtones', to: '/ringtones', status: 'ready', ticket: 'TAM-95' },
    ],
  },
  {
    label: 'Wallpapers',
    icon: ImageIcon,
    items: [
      { label: 'Wallpapers', to: '/wallpapers/items', status: 'ready', ticket: 'TAM-97' },
      { label: 'Homepage rows', to: '/wallpapers/rows', status: 'ready', ticket: 'TAM-97' },
    ],
  },
  {
    label: 'Status',
    icon: SparklesIcon,
    items: [
      { label: 'Items', to: '/status/items', status: 'ready', ticket: 'TAM-99' },
      { label: 'Performance', to: '/status/performance', status: 'ready', ticket: 'TAM-256' },
    ],
  },
  {
    label: 'Horoscope',
    icon: StarIcon,
    items: [
      { label: 'Daily results', to: '/horoscope/results', status: 'ready', ticket: 'TAM-101' },
      { label: 'Zodiac signs', to: '/horoscope/zodiac-signs', status: 'ready', ticket: 'TAM-101' },
      { label: 'Modes', to: '/horoscope/modes', status: 'ready', ticket: 'TAM-101' },
      { label: 'Step config', to: '/horoscope/steps', status: 'ready', ticket: 'TAM-101' },
      { label: 'Media assets', to: '/horoscope/media-assets', status: 'ready', ticket: 'TAM-101' },
    ],
  },
  {
    label: 'Books',
    icon: BookOpenIcon,
    // Sub-books and chapters are edited WITHIN a book (the structure tree on the
    // book detail page), never as top-level lists (TAM-103 §(a), #EXPORT_CRITICAL).
    items: [
      { label: 'Books', to: '/books/content', status: 'ready', ticket: 'TAM-103' },
      { label: 'Sections', to: '/books/sections', status: 'ready', ticket: 'TAM-103' },
    ],
  },
  {
    label: 'Home',
    icon: HomeIcon,
    items: [
      { label: 'Banners', to: '/home/banners', status: 'ready', ticket: 'TAM-105' },
      { label: 'Feed items', to: '/home/feed-items', status: 'ready', ticket: 'TAM-105' },
      { label: 'Shortcuts', to: '/home/shortcuts', status: 'ready', ticket: 'TAM-105' },
      { label: 'Settings', to: '/home/settings', status: 'ready', ticket: 'TAM-105' },
    ],
  },
  {
    // Editorial pins across Home + Status feeds (TAM-173) — a pure overlay on
    // the rotation module. No mobile release; admin-only surface.
    label: 'Content pins',
    icon: PinIcon,
    items: [
      { label: 'Pinned content', to: '/pinned-content', status: 'ready', ticket: 'TAM-173' },
    ],
  },
  {
    // The paywall A/B variants (TAM-159): layout, the version gate, shell copy
    // and hero media. Plans, pricing and legal copy stay ops-managed — a
    // different blast radius from devotional content.
    label: 'Monetization',
    icon: CreditCardIcon,
    items: [
      { label: 'Paywalls', to: '/paywall', status: 'ready', ticket: 'TAM-159' },
      { label: 'Ad group overrides', to: '/paywall/ad-groups', status: 'ready' },
    ],
  },
  {
    // Read-only: what a given user and the assistant said to each other. Its
    // own group rather than an entry under Access, because the path must NOT
    // sit under `/users` — the sidebar's `NavLink` matches by prefix, so
    // `/users/chat` would render Users as active alongside it.
    label: 'Chat',
    icon: MessageSquareIcon,
    items: [{ label: 'History', to: '/chat/history', status: 'ready' }],
  },
  {
    label: 'Access',
    icon: UsersIcon,
    items: [
      { label: 'Users', to: '/users', status: 'ready' },
      // TAM-187 — fixed-OTP QA accounts. `/test-users`, not `/users/test`:
      // the sidebar NavLink matches by prefix.
      { label: 'Test users', to: '/test-users', status: 'ready', ticket: 'TAM-187' },
    ],
  },
];
