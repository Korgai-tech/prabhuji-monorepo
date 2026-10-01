---
name: flutter-modular-architecture
description: Modular architecture for apps/mobile — feature-first layout, dependency direction (presentation → domain ← data), the data/domain/presentation split (when to reach for it, when to stay flat), barrel files for feature public APIs, and criteria for graduating to a Melos monorepo. DI wiring lives in flutter-dependencies; env/config wiring lives in flutter-env-config. Use when designing a new feature, splitting an overgrown lib/ tree, or deciding whether a feature should become its own package.
user-invocable: false
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
---

# Flutter Modular Architecture Skill

## Purpose

Keep `apps/mobile` maintainable as it grows from a handful of screens to fifty. Enforce **feature-first structure**, **dependency direction rules**, and **when-to-split-a-feature** heuristics. Written to compose with the other Flutter skills:

- **DI wiring** — the `serviceLocator` shape, `configureLocator`, registration lifetimes, Bloc interop, the legacy Riverpod bridge — lives in [flutter-dependencies](../flutter-dependencies/SKILL.md).
- **Env/config wiring** — `AppConfig`, per-env JSON, `--dart-define=ENV=`, local-dev workflow — lives in [flutter-env-config](../flutter-env-config/SKILL.md).

This skill covers structure only.

## When This Skill Applies

- Designing a new feature module in `lib/features/<feature>/`
- Reviewing a PR that spans layers (UI → state → repository → API)
- Splitting an overgrown `lib/` tree
- Deciding whether to promote a feature to a `packages/` package (spoiler: usually don't yet)

For wiring a new dependency into `serviceLocator`, read [flutter-dependencies](../flutter-dependencies/SKILL.md) — that's where all DI guidance lives.
For adding a new env or config field, read [flutter-env-config](../flutter-env-config/SKILL.md).

## Feature-First Layout (Single-Package Phase — Where We Are)

```text
apps/mobile/lib/
├── main.dart                     # inits AppConfig → Secrets → dio → serviceLocator → runApp
├── core/                         # cross-cutting infrastructure
│   ├── app_config.dart           # per-env config singleton      (see flutter-env-config)
│   ├── secrets.dart              # gitignored SDK-keys singleton (see flutter-secrets)
│   ├── service_locator.dart      # serviceLocator + configureLocator (see flutter-dependencies)
│   ├── auth_store.dart           # flutter_secure_storage wrapper
│   ├── dio_client.dart           # buildDio + interceptors       (see flutter-networking)
│   ├── analytics.dart            # the only file that imports an analytics SDK (see flutter-analytics)
│   ├── router.dart               # one long-lived GoRouter       (see flutter-routing)
│   └── theme.dart
├── state/
│   └── providers.dart            # legacy Riverpod — bridge to serviceLocator (see flutter-dependencies)
├── api/
│   ├── api_client.dart           # thin hand-written client
│   └── generated/**              # OpenAPI models — DO NOT HAND-EDIT
└── features/                     # ONE folder per user-facing feature
    ├── onboarding/
    │   ├── data/                 # repositories
    │   ├── bloc/                 # Blocs + states
    │   └── <screen>.dart
    └── paywall/
        ├── data/
        ├── bloc/
        └── <screen>.dart
```

Flat inside a feature is fine until the feature grows past ~8 files. Then split into `data/`/`domain/`/`presentation/` — see the next section.

## When to Split a Feature Into `data`/`domain`/`presentation`

Signals a feature has grown enough to warrant layers:
- More than one repository interface in the feature
- Domain logic worth unit-testing without any Flutter widget
- Multiple screens sharing the same state / repositories
- ~8+ files in a flat feature folder

Post-split layout:

```text
features/orders/
├── orders.dart                   # barrel — exports the public API only
├── domain/                       # pure Dart. interfaces + entities. no Flutter, no Dio.
│   ├── order.dart                # entity
│   └── orders_repository.dart    # interface
├── data/                         # implementation. Dio, DTOs, mappers.
│   └── http_orders_repository.dart
└── presentation/                 # widgets + cubits/blocs
    ├── orders_cubit.dart
    ├── orders_state.dart
    └── orders_screen.dart
```

### The layers, in one sentence each

- **`domain/`** — pure Dart. Entities and repository *interfaces*. Zero dependencies on Flutter, Dio, or any generated model. Rule of thumb: `import 'package:flutter/...'` or `import 'package:dio/...'` in `domain/` is a bug.
- **`data/`** — implementations. `ApiClient` callers, DTO→entity mappers, repository classes.
- **`presentation/`** — widgets + Cubits/Blocs. Consumes `domain/` interfaces only.

## Dependency Direction — the One Rule

```
presentation  →  domain  ←  data
```

Arrows are *imports*. `domain` has no arrows leaving it — it doesn't know Dio exists, doesn't know Flutter exists.

Example violation:

```dart
// features/orders/domain/orders_repository.dart
import 'package:dio/dio.dart';  // domain imports Dio — bug
```

Fix:

```dart
// domain — pure interface, framework-free
abstract interface class OrdersRepository {
  Future<Result<List<Order>>> fetchOrders();
}

// data — Dio-backed implementation
class HttpOrdersRepository implements OrdersRepository { ... }
```

Enforcement: manual PR review, or drop [`import_lint`](https://pub.dev/packages/import_lint) into dev deps when the codebase justifies the ceremony (currently: no).

## DI & Env Wiring — Elsewhere

- **DI (`serviceLocator`, `configureLocator`, registration lifetimes, Bloc interop, Riverpod bridge):** [flutter-dependencies](../flutter-dependencies/SKILL.md).
- **Env selection + per-env values (`AppConfig`, `env/*.json`, `--dart-define=ENV=`, local-dev workflow):** [flutter-env-config](../flutter-env-config/SKILL.md).
- **Secrets (`env/prabhujiSecrets.json`, gitignore, CI release build):** [flutter-secrets](../flutter-secrets/SKILL.md).

Those three skills are the source of truth. Anything about wiring that isn't feature-structure belongs there, not here.

## Public API Boundaries (barrel + implementation)

When a feature has more than one entry point (an auth flow: `LoginScreen`, `SignupScreen`, `PasswordResetScreen`), expose a **narrow public API** via a barrel file. Everything else stays private to the feature.

```dart
// features/auth/auth.dart — the ONLY thing other features may import
export 'domain/user.dart';        // entity used elsewhere
export 'presentation/auth_screen.dart';  // route entry point

// features/auth/data/http_auth_repository.dart — internal, do not export
```

Other features import via the barrel: `import '../auth/auth.dart';`. Never `import '../auth/data/http_auth_repository.dart';` from outside `features/auth/`.

Enforce in PR review. If you find yourself violating this to test-double a repository, register the double in `serviceLocator` (see [flutter-dependencies](../flutter-dependencies/SKILL.md)) — don't reach across features.

## When to Graduate to a Melos Monorepo

Signals it's time (currently: **none of these are true for `apps/mobile`**):

- 3+ features owned by independent teams with independent release cadences
- A shared `core/` reused across the mobile app AND a widget preview harness or a companion tablet app
- CI spends > 5 min on tests unrelated to the PR under review
- Internal packages need semantic versioning

We're a single-team, single-app codebase. Feature-first inside `apps/mobile/lib/` gives us 80% of the modularity for 20% of the ceremony. **Do not add Melos yet.**

If/when it's time, the layout would be:

```text
apps/mobile/
├── lib/
├── packages/
│   ├── core_network/      # dio + interceptors
│   ├── core_result/       # Result / AppError
│   └── feature_orders/    # per-feature package
└── melos.yaml
```

## Enforcement — Where Machines Beat Reviewers

- `flutter analyze` — the analyzer + `flutter_lints` catch layer violations if you keep imports sorted and named. Not perfect, but low ceremony.
- `pnpm verify:mobile` — runs `flutter analyze` + `flutter test` (which includes `leak_tracker` from the UI skill).
- Manual PR review remains the primary enforcement for dependency direction until the codebase justifies adding `import_lint`.

## Common Mistakes (Structure-Level)

- **Reaching into `features/foo/data/...` from another feature.** Bypasses the public API; refactors in one feature silently break another. Use the barrel; register the double in `serviceLocator` if you need a fake in test.
- **Splitting into `data`/`domain`/`presentation` for a 3-file feature.** Premature ceremony. Flat until ~8 files or multiple screens.
- **Splitting into packages (Melos) too early.** 20 files spread across 5 packages is harder than 20 files in one package.
- **Domain imports Dio / Flutter / generated models.** Collapses the whole architecture; the point of `domain/` is to be tool-agnostic. If you can't put it in `domain/`, put it in `data/`.

For DI-shaped mistakes (Bloc registered as singleton, `serviceLocator<T>()` inside `build()`, `Dio` as factory, circular DI, double-source-of-truth on `AuthStore`), see the anti-patterns section of [flutter-dependencies](../flutter-dependencies/SKILL.md).

## Checklist for a New Feature

- [ ] Folder created under `lib/features/<feature>/`
- [ ] Split into `data`/`domain`/`presentation` if the feature crosses ~8 files or multiple screens; otherwise flat
- [ ] `domain/` (if present) has zero Flutter / Dio / generated-model imports
- [ ] Repository interface exists; impl adapts an external system (`Dio`, `SharedPreferences`, etc.) to that interface
- [ ] Repository registered in `serviceLocator` — see [flutter-dependencies checklist](../flutter-dependencies/SKILL.md#checklist-for-a-new-registration)
- [ ] Feature Bloc wired via `BlocProvider(create:)` at its route — see [flutter-state-bloc](../flutter-state-bloc/SKILL.md)
- [ ] Barrel file (`<feature>.dart`) added if more than one thing is imported from outside
- [ ] `flutter analyze` clean
- [ ] Unit tests cover the Bloc (see flutter-state-bloc); repository test with a mocked `Dio` (see flutter-networking)

## Authoritative References

- **Feature-first structure**: https://codewithandrea.com/articles/flutter-project-structure/
- **Clean Architecture layers in Flutter**: https://resocoder.com/2019/08/27/flutter-tdd-clean-architecture-course-1-explanation-project-structure/
- **Melos** (when you're ready): https://melos.invertase.dev/
- Related skills: [flutter-dependencies](../flutter-dependencies/SKILL.md) (DI), [flutter-env-config](../flutter-env-config/SKILL.md) (env), [flutter-secrets](../flutter-secrets/SKILL.md) (SDK keys), [flutter-state-bloc](../flutter-state-bloc/SKILL.md) (Bloc lifecycle), [flutter-networking](../flutter-networking/SKILL.md) (repositories), [flutter-ui](../flutter-ui/SKILL.md) (composition), [frontend-patterns](../frontend-patterns/SKILL.md) (index)
- Mobile conventions: `apps/mobile/CLAUDE.md`
