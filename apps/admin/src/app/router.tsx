import {
  createBrowserRouter,
  Navigate,
  type RouterProviderProps,
} from 'react-router-dom';
import { LoginPage } from '../features/auth/login-page';
import { UsersPage } from '../features/users/users-page';
import { CreateUserPage } from '../features/users/create-user-page';
import { TestUsersPage } from '../features/test-users/test-users-page';
import { DeitiesPage } from '../features/taxonomy/deities-page';
import { ItemsPage as AartiItemsPage } from '../features/aarti/items-page';
import { CategoriesPage as AartiCategoriesPage } from '../features/aarti/categories-page';
import { SectionsPage as AartiSectionsPage } from '../features/aarti/sections-page';
import { MantraItemsPage } from '../features/mantras/items-page';
import { MantraCategoriesPage } from '../features/mantras/categories-page';
import { MantraSectionsPage } from '../features/mantras/sections-page';
import { RingtonesPage } from '../features/ringtone/ringtones-page';
import { WallpapersPage } from '../features/wallpaper/wallpapers-page';
import { WallpaperRowsPage } from '../features/wallpaper/rows-page';
import { StatusItemsPage } from '../features/status/items-page';
import { StatusPerformancePage } from '../features/status/performance-page';
import { BookContentPage } from '../features/books/content-page';
import { BookDetailPage } from '../features/books/book-detail-page';
import { BookSectionsPage } from '../features/books/sections-page';
import { ResultsPage } from '../features/horoscope/results-page';
import { ZodiacSignsPage } from '../features/horoscope/zodiac-signs-page';
import { HoroscopeModesPage } from '../features/horoscope/modes-page';
import { StepsConfigPage } from '../features/horoscope/steps-config-page';
import { MediaAssetsPage } from '../features/horoscope/media-assets-page';
import { BannersPage } from '../features/home/banners-page';
import { FeedItemsPage } from '../features/home/feed-items-page';
import { ShortcutsPage } from '../features/home/shortcuts-page';
import { SettingsPage } from '../features/home/settings-page';
import { PaywallPage } from '../features/paywall/paywall-page';
import { UtmOverridesPage } from '../features/paywall/utm-overrides-page';
import { PinnedContentPage } from '../features/pinned-content/pinned-content-page';
import { ChatTranscriptPage } from '../features/chat/chat-transcript-page';
import { DashboardPage } from '../features/dashboard/dashboard-page';
import { NotFoundPage } from '../features/not-found/not-found-page';
import { AdminRoute } from '../auth/admin-route';
import { AdminLayout } from './admin-layout';

/**
 * The admin route tree (ADR D1).
 *
 * `/login` is public. EVERYTHING else hangs off one `<AdminRoute>`-guarded
 * `<AdminLayout>` branch, so the guard is applied ONCE, structurally — a module
 * ticket that adds a child route cannot forget to protect it, and a non-admin
 * never renders the shell.
 *
 * ┌── HOW A MODULE UI TICKET ADDS ITS PAGE ─────────────────────────────────┐
 * │ 1. add `{ path: 'aarti/items', element: <AartiItemsPage /> }` to the    │
 * │    `children` array below — paths are RELATIVE (no leading `/`);        │
 * │ 2. flip your entry in `components/nav/nav-config.ts` to `'ready'`.      │
 * │ Do NOT wrap your element in another `<ProtectedRoute>`/`<AdminRoute>` — │
 * │ you are already inside one.                                             │
 * └────────────────────────────────────────────────────────────────────────┘
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/';

export const router: RouterProviderProps['router'] = createBrowserRouter(
  [
    { path: '/login', element: <LoginPage /> },
    {
      path: '/',
      element: (
        <AdminRoute>
          <AdminLayout />
        </AdminRoute>
      ),
      children: [
        { path: '/login', element: <LoginPage /> },
        { index: true, element: <Navigate to="/dashboard" replace /> },
        { path: 'dashboard', element: <DashboardPage /> },
        { path: 'users', element: <UsersPage /> },
        { path: 'users/new', element: <CreateUserPage /> },
        { path: 'test-users', element: <TestUsersPage /> },
        { path: 'taxonomy/deities', element: <DeitiesPage /> },
        { path: 'aarti/items', element: <AartiItemsPage /> },
        { path: 'aarti/categories', element: <AartiCategoriesPage /> },
        { path: 'aarti/sections', element: <AartiSectionsPage /> },
        { path: 'mantras/items', element: <MantraItemsPage /> },
        { path: 'mantras/categories', element: <MantraCategoriesPage /> },
        { path: 'mantras/sections', element: <MantraSectionsPage /> },
        { path: 'ringtones', element: <RingtonesPage /> },
        { path: 'wallpapers/items', element: <WallpapersPage /> },
        { path: 'wallpapers/rows', element: <WallpaperRowsPage /> },
        { path: 'status/items', element: <StatusItemsPage /> },
        { path: 'status/performance', element: <StatusPerformancePage /> },
        { path: 'books/content', element: <BookContentPage /> },
        { path: 'books/content/:id', element: <BookDetailPage /> },
        { path: 'books/sections', element: <BookSectionsPage /> },
        { path: 'horoscope/results', element: <ResultsPage /> },
        { path: 'horoscope/zodiac-signs', element: <ZodiacSignsPage /> },
        { path: 'horoscope/modes', element: <HoroscopeModesPage /> },
        { path: 'horoscope/steps', element: <StepsConfigPage /> },
        { path: 'horoscope/media-assets', element: <MediaAssetsPage /> },
        { path: 'home/banners', element: <BannersPage /> },
        { path: 'home/feed-items', element: <FeedItemsPage /> },
        { path: 'home/shortcuts', element: <ShortcutsPage /> },
        { path: 'home/settings', element: <SettingsPage /> },
        { path: 'paywall', element: <PaywallPage /> },
        { path: 'paywall/ad-groups', element: <UtmOverridesPage /> },
        { path: 'pinned-content', element: <PinnedContentPage /> },
        // NOT `users/chat`: the sidebar's NavLink has no `end`, so a path under
        // `/users` would light up the Users entry as well as this one.
        { path: 'chat/history', element: <ChatTranscriptPage /> },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename },
);
