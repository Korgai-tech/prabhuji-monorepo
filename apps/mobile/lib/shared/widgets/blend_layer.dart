// Private-field ctor params can't use initializing formals.
// ignore_for_file: prefer_initializing_formals

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// Composites [child] onto whatever is already painted beneath it using a real
/// layer [blendMode] — the Flutter equivalent of a Figma layer whose fill
/// carries `blendMode: MULTIPLY / OVERLAY / SOFT_LIGHT`.
///
/// Why this exists (TAM-76, figma-flutter Phase 4/5): the Books design paints a
/// book cover as three stacked layers —
///   1. the CMS cover artwork,
///   2. a paper `Texture` whose IMAGE fill has `blendMode: MULTIPLY`, and
///   3. a `Lights` gloss built from two gradient fills (`OVERLAY` @0.20 +
///      `SOFT_LIGHT`).
/// An isolated `/v1/images` export of layers 2–3 CANNOT bake a blend mode in
/// (there is nothing underneath to blend against), so the raw exports are a flat
/// opaque paper sheet and a flat white rectangle. Wiring those as plain images
/// would completely hide the cover — the failure this widget prevents.
///
/// Flutter's stock tools don't cover this: `ColorFiltered` blends a *colour*,
/// not a layer, and `Image(colorBlendMode:)` blends its own colour into itself.
/// Compositing one layer onto the backdrop needs an explicit
/// `saveLayer(..., Paint()..blendMode = ...)`, which is what this does.
///
/// Must be used inside a [Stack] (or any parent that paints a backdrop first) —
/// the blend has no effect over transparent pixels.
class BlendLayer extends SingleChildRenderObjectWidget {
  const BlendLayer({
    super.key,
    required this.blendMode,
    this.opacity = 1.0,
    required Widget super.child,
  }) : assert(opacity >= 0.0 && opacity <= 1.0);

  /// The Figma fill/node `blendMode`, mapped 1:1 (MULTIPLY → [BlendMode.multiply],
  /// OVERLAY → [BlendMode.overlay], SOFT_LIGHT → [BlendMode.softLight]).
  final BlendMode blendMode;

  /// The Figma fill `opacity` (or node `opacity`) applied to the whole layer.
  final double opacity;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      RenderBlendLayer(blendMode: blendMode, opacity: opacity);

  @override
  void updateRenderObject(BuildContext context, RenderBlendLayer renderObject) {
    renderObject
      ..blendMode = blendMode
      ..opacity = opacity;
  }
}

/// Render object behind [BlendLayer].
class RenderBlendLayer extends RenderProxyBox {
  RenderBlendLayer({required BlendMode blendMode, required double opacity})
      : _blendMode = blendMode,
        _opacity = opacity;

  BlendMode _blendMode;
  BlendMode get blendMode => _blendMode;
  set blendMode(BlendMode value) {
    if (_blendMode == value) return;
    _blendMode = value;
    markNeedsPaint();
  }

  double _opacity;
  double get opacity => _opacity;
  set opacity(double value) {
    if (_opacity == value) return;
    _opacity = value;
    markNeedsPaint();
  }

  // The blend must resolve against the backdrop, so this render object always
  // needs its own composited layer.
  @override
  bool get alwaysNeedsCompositing => true;

  @override
  void paint(PaintingContext context, Offset offset) {
    final child = this.child;
    if (child == null || _opacity == 0.0) return;

    final paint = Paint()
      ..blendMode = _blendMode
      // saveLayer applies the paint's alpha to the entire layer — this is how
      // the Figma fill `opacity` (e.g. Lights' 0.20) is honoured.
      ..color = Color.fromRGBO(0, 0, 0, _opacity);

    context.canvas.saveLayer(offset & size, paint);
    context.paintChild(child, offset);
    context.canvas.restore();
  }
}
