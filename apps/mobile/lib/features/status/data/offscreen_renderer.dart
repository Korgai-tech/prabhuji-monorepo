import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// Rasterize [child] to a transparent PNG at [logicalSize], off-screen — no
/// attachment to the visible widget tree. Used by the Status Sharing video
/// render path (TAM-72 §6.8) so the overlay bitmap composited onto the source
/// mp4 is generated from the SAME widget subtree the on-screen preview uses,
/// giving structural preview/export parity for video the same way the image
/// path already does via `RenderRepaintBoundary.toImage`.
///
/// The [child] is wrapped in a `MaterialApp` (default light theme so
/// `AppText.*` styles resolve consistently), a `MediaQuery` with explicit
/// [logicalSize] + [pixelRatio], and a `Directionality`. A transparent
/// `Material` background lets the PNG carry alpha through to FFmpeg's
/// `overlay` filter.
Future<Uint8List> rasterizeToPng({
  required Widget child,
  required Size logicalSize,
  double pixelRatio = 1.0,
}) async {
  final repaintBoundary = RenderRepaintBoundary();
  final view = WidgetsBinding.instance.platformDispatcher.views.first;

  final renderView = RenderView(
    view: view,
    child: RenderPositionedBox(
      alignment: Alignment.center,
      child: repaintBoundary,
    ),
    configuration: ViewConfiguration(
      physicalConstraints:
          BoxConstraints.tight(logicalSize * pixelRatio),
      logicalConstraints: BoxConstraints.tight(logicalSize),
      devicePixelRatio: pixelRatio,
    ),
  );

  final pipelineOwner = PipelineOwner()..rootNode = renderView;
  renderView.prepareInitialFrame();

  final buildOwner = BuildOwner(focusManager: FocusManager());

  final rootElement = RenderObjectToWidgetAdapter<RenderBox>(
    container: repaintBoundary,
    child: MediaQuery(
      data: MediaQueryData(
        size: logicalSize,
        devicePixelRatio: pixelRatio,
      ),
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          home: Material(
            color: const Color(0x00000000),
            child: SizedBox(
              width: logicalSize.width,
              height: logicalSize.height,
              child: child,
            ),
          ),
        ),
      ),
    ),
  ).attachToRenderTree(buildOwner);

  buildOwner
    ..buildScope(rootElement)
    ..finalizeTree();
  pipelineOwner
    ..flushLayout()
    ..flushCompositingBits()
    ..flushPaint();

  final image = await repaintBoundary.toImage(pixelRatio: pixelRatio);
  final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
  image.dispose();
  if (byteData == null) {
    throw StateError('rasterizeToPng: toByteData returned null');
  }
  return byteData.buffer.asUint8List();
}
