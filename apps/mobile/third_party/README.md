# Vendored packages

Upstream packages we carry a local patch for. Each one is wired in through
`dependency_overrides` in `apps/mobile/pubspec.yaml`. Every changed line is marked
`PRABHUJI PATCH`, so `grep -rn "PRABHUJI PATCH" third_party/` lists the whole diff.

## media_kit_video 2.0.1

Source: pub.dev `media_kit_video-2.0.1` (the `example/` folder was removed).

**Patch:** `MediaKitVideoPlugin.onDetachedFromEngine` now calls
`VideoOutputManager.disposeAll()` (new), which releases every live
`SurfaceProducer`.

**Why:** upstream only unregisters the method-channel handler when the plugin
detaches. libmpv keeps rendering into the old engine's surface from its own
thread. The next frame then reaches `FlutterRenderer.scheduleEngineFrame` on a
detached `FlutterJNI` and kills the app:
`RuntimeException: Cannot execute operation because FlutterJNI is not attached to native`.
We hit this when setting a wallpaper while the preview video was playing: the
wallpaper-driven dynamic-colour change makes Android recreate `MainActivity`.
`MainActivity` now also keeps its engine across that recreation (see its KDoc),
and this patch covers the cases where the engine really is destroyed.

**Upgrading:** copy the new version from the pub cache over this folder, delete
`example/`, and re-apply the two `PRABHUJI PATCH` hunks, unless upstream now
disposes its outputs in `onDetachedFromEngine`. In that case, delete this folder
and the override.
