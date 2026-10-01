import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// A router with the same SHAPE as `router.dart` — an indexed shell for the
/// bottom-nav branches plus flat top-level routes — for exercising the
/// deep-link replay trigger without the app's full DI graph.
GoRouter buildReplayTestRouter({String initialLocation = '/splash'}) =>
    GoRouter(
      initialLocation: initialLocation,
      routes: [
        GoRoute(path: '/splash', builder: (c, s) => const Text('splash')),
        GoRoute(
          path: '/phone-input',
          builder: (c, s) => const Text('phone-input'),
        ),
        GoRoute(path: '/paywall', builder: (c, s) => const Text('paywall')),
        StatefulShellRoute.indexedStack(
          builder: (c, s, shell) => Scaffold(body: shell),
          branches: [
            StatefulShellBranch(routes: [
              GoRoute(path: '/home', builder: (c, s) => const Text('home')),
            ]),
            StatefulShellBranch(routes: [
              GoRoute(path: '/status', builder: (c, s) => const Text('status')),
            ]),
          ],
        ),
        GoRoute(
          path: '/aarti-bhajans/audio/:id',
          builder: (c, s) => const Text('aarti-player'),
        ),
        GoRoute(
          path: '/mantras/audio/:id',
          builder: (c, s) => const Text('mantra-player'),
        ),
      ],
    );
