import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';

import '../../../api/generated/openapi.dart';
import '../../../core/entitlement.dart';
import '../../../core/paywall_gate.dart';
import '../../../core/theme.dart';
import '../../../core/user_properties.dart';
import '../../../state/providers.dart';
import '../../aarti/aarti_routes.dart';
import '../../home/home_routes.dart';
import '../../horoscope/horoscope_routes.dart';
import '../../kuldevta/application/kuldevta_bloc.dart';
import '../../kuldevta/application/kuldevta_event.dart';
import '../../kuldevta/application/kuldevta_state.dart';
import '../../kuldevta/domain/kuldevta_result.dart';
import '../../kuldevta/kuldevta_analytics.dart';
import '../../kuldevta/kuldevta_providers.dart';
import '../../kuldevta/presentation/widgets/kuldevta_result_card.dart';
import '../../mantras/mantras_routes.dart';
import '../../paywall/paywall_analytics.dart';
import '../../paywall/presentation/paywall_close.dart';
import '../../paywall/presentation/paywall_screen.dart';
import '../../ringtone/ringtone_routes.dart';
import '../../status/status_routes.dart';
import '../../wallpaper/data/wallpaper_models.dart';
import '../../wallpaper/wallpaper_providers.dart';
import '../../wallpaper/wallpaper_routes.dart';
import '../application/chat_bloc.dart';
import '../application/chat_event.dart';
import '../application/chat_state.dart';
import '../chat_analytics.dart';
import '../chat_paywall.dart';
import '../chat_providers.dart';
import 'widgets/chat_composer.dart';
import 'widgets/chat_empty_state.dart';
import 'widgets/chat_intro_block.dart';
import 'widgets/chat_intro_video_card.dart';
import 'widgets/chat_khoj_rows.dart';
import 'widgets/chat_transcript.dart';

/// The Chat surface (TAM-164, spec §Layout intent).
///
/// Layout — a `Column` with pinned/flex zones. The screen root does NOT
/// scroll; only the transcript zone does (see [ChatTranscript]).
///
///     Column
///     ├─ App bar         (pinned-top,    Key('chat-appbar'))
///     ├─ Transcript      (flex-fill,     Key('chat-transcript'))
///     │   └── (empty state OR reversed ListView of messages)
///     └─ Composer        (pinned-bottom, Key('chat-composer'))
///
/// The bottom nav is hidden by the shell scaffold while the chat branch
/// is active (spec §Layout intent — every Figma chat frame renders WITHOUT
/// the bottom nav). This screen renders straight down to the OS gesture
/// bar under the composer.
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen>
    with WidgetsBindingObserver {
  final TextEditingController _composerController = TextEditingController();

  /// Tracks the last `paywallRequiredNonce` we handled so the BlocListener's
  /// `listenWhen` fires exactly once per new nonce.
  int? _lastHandledPaywallNonce;

  /// Client-side "active" (last-tapped) card key — the card whose composite
  /// key matches paints the orange 2 dp variant. Transient in-widget state
  /// (spec §Content-card tap behaviour — "client-side transient, mirrors
  /// last-tapped").
  String? _activeCardKey;

  // ---- Khoj mode (TAM-177) ---------------------------------------------

  /// Tells the intro video to stop when the user starts answering. Owned here
  /// because neither the composer nor the card can see the other.
  final ChatVideoPauseSignal _pauseSignal = ChatVideoPauseSignal();

  /// Whether the result card overlay is up. Set on the first reveal and again
  /// when the user taps the deity header (D2).
  bool _resultCardOpen = false;

  /// `kuldevta_result_viewed` is a FIRST-REVEAL event, and the thread it now
  /// lives in is always mounted — so a per-mount latch (what the deleted
  /// result screen used) would re-fire on any rebuild. Latching on the
  /// assignment's slug instead makes "exactly once per assignment" true
  /// regardless of how often the widget rebuilds. TAM-177 #RESOLVED R2.
  String? _resultViewedForSlug;

  /// One-shot `KuldevtaFlowMounted` dispatch. Khoj mode is not knowable in
  /// `initState` (it depends on `/users/me`), so the flow is marked mounted on
  /// the first build that resolves to khoj.
  bool _khojMounted = false;

  @override
  void initState() {
    super.initState();
    // Bug 6 — chat_closed needs to fire on `app_backgrounded` too, not only
    // on screen dispose. Registering here + tearing down in `dispose` (below)
    // hooks the app-lifecycle stream via `didChangeAppLifecycleState`.
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    // PRD §18.1 `chat_closed` — the bloc owns the fire (session-lifecycle
    // counters live there). The bloc's `_pendingExitReason` flag flipped
    // on a content-card tap wins over the default `back`, so a tap→pop
    // path reports `content_opened` correctly.
    //
    // Bug 6 — this dispose fire is a BACKUP path only. The primary fire
    // has moved to `PopScope.onPopInvokedWithResult` (below), which runs
    // BEFORE the shell branch-swap tears down the `BlocProvider`. Firing
    // from dispose alone raced the teardown and lost 7/7 close events in
    // production. The bloc guards against double-fire, so a PopScope
    // primary + dispose backup is safe.
    try {
      context.read<ChatBloc>().onSessionClose(exitReason: ChatExitReason.back);
    } catch (_) {
      // Defensive: some short-lived widget tests dispose the ChatScreen
      // after the surrounding BlocProvider has been unmounted (the bloc
      // is closed via `addTearDown`). Analytics is fire-and-forget by
      // policy — never let the dispose blow up on us.
    }
    _composerController.dispose();
    _pauseSignal.dispose();
    super.dispose();
  }

  /// Set by `didChangeAppLifecycleState` when we fire ChatExited on
  /// paused; consulted on `resumed` to fire the paired ChatEntered.
  /// Prevents firing ChatEntered on resumes that happened without a
  /// prior paused-close (e.g. widget mounted but not visible when the
  /// app lifecycle event landed).
  bool _didExitOnPause = false;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    super.didChangeAppLifecycleState(state);
    if (state == AppLifecycleState.paused) {
      // Bug 6 — fire chat_closed on background so a user who tabs away
      // (Home button, task switcher) still shows up in the funnel. The
      // session-active guard in the bloc prevents double-fire when
      // subsequent back / dispose paths also try to close.
      try {
        context.read<ChatBloc>().add(
          const ChatExited(exitReason: ChatExitReason.appBackgrounded),
        );
        _didExitOnPause = true;
      } catch (_) {
        // Same defensive rationale as dispose.
      }
    } else if (state == AppLifecycleState.resumed && _didExitOnPause) {
      // Paired ChatEntered — the paused fire above closed the visit, so
      // resume opens a new one. Guarded on `_didExitOnPause` so a widget
      // that received `paused` while NOT visible (session_started_at
      // stayed null → no exit fired) doesn't spuriously fire ChatEntered
      // on resume.
      _didExitOnPause = false;
      try {
        context.read<ChatBloc>().add(const ChatEntered());
      } catch (_) {
        // Defensive — analytics is fire-and-forget.
      }
    }
  }

  /// Both back gestures (system back + app-bar back) exit chat to Home,
  /// never elsewhere. Mirrors `KuldevtaEntryScreen._exitToHome`: pop
  /// everything above the shell first (defensive — chat is a shell branch
  /// root today, so the loop is a no-op; kept as belt-and-suspenders
  /// against future over-shell pushes that could otherwise leave routes
  /// hanging), then `go('/home')` to swap the shell's active branch to
  /// Home. Prevents the shell-root device-back from bubbling out to the
  /// OS-level pop that would exit the app.
  void _exitToHome(BuildContext context) {
    final router = GoRouter.of(context);
    while (router.canPop()) {
      router.pop();
    }
    router.go(HomeRoutes.home);
  }

  /// Which of the two chat modes this screen is in (TAM-177 §F5).
  ///
  /// **khoj** — the user qualifies for kuldevta chat but has no assignment
  /// yet. Discovery is free, so there is NO paywall on entry; in exchange the
  /// composer routes to `KuldevtaBloc` and can never send a free-form message.
  /// **conversation** — everything else, gated exactly as before.
  ///
  /// This replaces the old route-level invariant ("a non-Pro user must never
  /// mount the chat screen even for a frame"), which stopped being available
  /// the moment the khoj moved inside this screen.
  /// The assigned deity, when this session has one in memory. Null on a cold
  /// launch that has not been through the reveal — which is exactly when the
  /// header falls back to the name-only tier and the card is not re-openable.
  KuldevtaResult? get _persona => ref.watch(kuldevtaChatHandoffProvider);

  bool get _khojMode {
    // STICKY WHILE THE RESULT CARD IS UP. The bloc refetches `/users/me` the
    // moment the server assigns, which flips `kuldevtaAssigned` to true — and
    // without this guard that flip would drop the whole khoj scaffold, and the
    // reveal with it, on the very frame the card was meant to appear. The card
    // is the last beat of khoj mode, not the first beat of the deity chat.
    //
    // Every path that closes the card (the CTA, the paywall returning, back,
    // dismiss) clears `_resultCardOpen`, and the next build then reads the
    // refreshed config and lands in conversation mode with the persona header.
    if (_resultCardOpen) return true;
    final chatConfig = ref.watch(meProvider).value?.chatConfig;
    return (chatConfig?.showKuldevtaChat ?? false) &&
        !(chatConfig?.kuldevtaAssigned ?? false);
  }

  @override
  Widget build(BuildContext context) {
    if (_khojMode) return _buildKhojMode();
    return _buildConversationMode();
  }

  // ---- Khoj mode (TAM-177) ---------------------------------------------

  Widget _buildKhojMode() {
    final kuldevtaBloc = ref.watch(kuldevtaBlocProvider);
    if (!_khojMounted) {
      _khojMounted = true;
      // Fires `kuldevta_intro_viewed` + bumps `kuldevta.open_count`. Deferred
      // to a post-frame callback so it never emits during a build.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        kuldevtaBloc.add(const KuldevtaFlowMounted());
      });
    }
    return BlocProvider<KuldevtaBloc>.value(
      value: kuldevtaBloc,
      child: BlocConsumer<KuldevtaBloc, KuldevtaState>(
        listenWhen: (prev, curr) =>
            curr is KuldevtaResultReady && prev is! KuldevtaResultReady,
        listener: (context, kState) {
          if (kState is! KuldevtaResultReady) return;
          // The persona identity belongs to the REVEAL, not to the CTA. It used
          // to be written only inside the paywall gate's `pending` action, so a
          // non-Pro user who dismissed the paywall left it null: the header fell
          // back to the name-only tier, and tapping it did nothing because
          // `onPersonaTap` is wired only when `_persona != null`. Writing it
          // here means the header names the deity, and re-opens the card, for
          // everyone who has actually been shown one.
          ref.read(kuldevtaChatHandoffProvider.notifier).state = kState.kuldevta;
          setState(() => _resultCardOpen = true);
          _fireResultViewedOnce(kState.kuldevta);
        },
        builder: (context, kState) => _khojScaffold(kState, kuldevtaBloc),
      ),
    );
  }

  Widget _khojScaffold(KuldevtaState kState, KuldevtaBloc bloc) {
    // The intro video rides on the chat history's config, which khoj mode
    // still fetches — the read is free and unauthenticated-by-Pro, and it is
    // the only place `introVideo` lives. It is the SEND path that is inert in
    // khoj mode, not the whole bloc.
    final introVideo = _introVideoFor(context.watch<ChatBloc>().state);
    final agentId = _agentIdOf(context.watch<ChatBloc>().state) ?? '';

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        // Dismiss the overlay first — back should close the card, not the
        // whole screen, when it is up.
        if (_resultCardOpen) {
          setState(() => _resultCardOpen = false);
          return;
        }
        _exitToHome(context);
      },
      child: Scaffold(
        backgroundColor: AppColors.white,
        body: DecoratedBox(
          decoration: const BoxDecoration(gradient: AppGradient.chatScaffold),
          child: SafeArea(
            top: true,
            bottom: false,
            child: Stack(
              children: <Widget>[
                Column(
                  children: <Widget>[
                    const _AppBar(key: Key('chat-appbar'), khojMode: true),
                    Expanded(
                      key: const Key('chat-transcript'),
                      child: ChatTranscript(
                        // The khoj conversation is client-only — it never
                        // becomes server-side ChatMessages — so the whole
                        // thread rides in `leadingRows` with no messages.
                        leadingRows: buildKhojRows(
                          state: kState,
                          agentId: agentId,
                          pauseSignal: _pauseSignal,
                          introVideo: introVideo,
                        ),
                        trailingRows: _khojActions(kState, bloc),
                        // The khoj always starts from empty, so its rows must
                        // begin under the header rather than floating at the
                        // bottom of a blank screen (Figma 3934:14677).
                        anchorTop: true,
                        messages: const <ChatMessage>[],
                        showTypingIndicator: false,
                        hasMoreOlder: false,
                        onLoadOlder: () {},
                        onCardTapped: (_, _, _) {},
                      ),
                    ),
                    _khojComposer(kState, bloc),
                  ],
                ),
                if (_resultCardOpen && kState is KuldevtaResultReady)
                  KuldevtaResultCard(
                    result: kState.kuldevta,
                    onChatPressed: () =>
                        _onKuldevtaChatPressed(kState.kuldevta, bloc),
                    onSharePressed: () => bloc.add(const KuldevtaShareTapped()),
                    onDismiss: () => setState(() => _resultCardOpen = false),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  /// The button under the newest bubble — "Shuru Kijiye", "Pata Nahi", or the
  /// failure pair. Trailing rows, so they stay pinned to the newest end of the
  /// conversation rather than scrolling up with the intro.
  List<Widget> _khojActions(KuldevtaState kState, KuldevtaBloc bloc) {
    switch (kState) {
      case KuldevtaEntry():
        return <Widget>[
          _KhojOutlinedButton(
            buttonKey: const Key('khoj-start-button'),
            label: KhojCopy.start,
            onPressed: () => bloc.add(const KuldevtaStarted()),
          ),
        ];
      case KuldevtaAnsweringQuestion(botTyping: true):
        // Nothing to skip yet — the question is still "being typed". Showing
        // "Pata Nahi" here would let the user decline a question they have not
        // read, and `_recordAnswer` would file it against the next index.
        return const <Widget>[];
      case KuldevtaAnsweringQuestion():
        return <Widget>[
          _KhojOutlinedButton(
            buttonKey: const Key('khoj-pata-nahi-button'),
            label: KhojCopy.pataNahi,
            onPressed: () {
              _pauseSignal.requestPause(ChatVideoPauseTrigger.answerStarted);
              bloc.add(const KuldevtaPataNahiTapped());
            },
          ),
        ];
      case KuldevtaFailed():
        return <Widget>[
          _KhojOutlinedButton(
            buttonKey: const Key('khoj-retry-button'),
            label: KhojCopy.retry,
            onPressed: () => bloc.add(const KuldevtaRetryTapped()),
          ),
          const SizedBox(height: AppSpacing.xSmall),
          _KhojOutlinedButton(
            buttonKey: const Key('khoj-back-button'),
            label: KhojCopy.back,
            onPressed: () => _exitToHome(context),
          ),
        ];
      case KuldevtaIdentifying():
      case KuldevtaResultReady():
        return const <Widget>[];
    }
  }

  Widget _khojComposer(KuldevtaState kState, KuldevtaBloc bloc) {
    return ChatComposer(
      key: const Key('chat-composer-zone'),
      controller: _composerController,
      // Only a question awaiting an answer accepts input. #EXPORT_CRITICAL:
      // every path here goes to KuldevtaBloc — ChatBloc._onSubmitted is
      // unreachable in khoj mode, so no khoj answer can fire
      // chat_message_sent, inflate chat_closed.message_count, or trip the
      // send-time paywall re-gate.
      // `botTyping` excluded: during the beat before the next question appears
      // there is nothing on screen to answer, and accepting input there would
      // file the reply against a question the user has not been shown.
      enabled: kState is KuldevtaAnsweringQuestion && !kState.botTyping,
      onSend: (text) {
        bloc.add(KuldevtaAnswerSubmitted(text));
        _composerController.clear();
      },
      onVoiceSubmit: (transcript, _, _) {
        bloc.add(KuldevtaAnswerSubmitted(transcript, byVoice: true));
      },
      onAnswerStarted: () =>
          _pauseSignal.requestPause(ChatVideoPauseTrigger.answerStarted),
    );
  }

  /// `kuldevta_result_viewed`, exactly once per assignment.
  void _fireResultViewedOnce(KuldevtaResult result) {
    if (_resultViewedForSlug == result.slug) return;
    _resultViewedForSlug = result.slug;
    unawaited(
      ref
          .read(analyticsProvider)
          ?.trackEvent(
            KuldevtaEvents.resultViewed,
            properties: <String, Object?>{
              KuldevtaEventProps.deityId: result.slug,
              KuldevtaEventProps.assignmentTier: result.tier,
              // Not a field on the model — derived at every fire site.
              KuldevtaEventProps.isFallback: result.tier == 'fallback',
              KuldevtaEventProps.source: KuldevtaResultViewedSource.firstReveal,
            },
          ),
    );
  }

  /// Re-open from the deity header (D2). Fires its OWN event so a returning
  /// user is never counted as a new reveal.
  void _reopenResultCard(KuldevtaResult result) {
    setState(() => _resultCardOpen = true);
    unawaited(
      ref
          .read(analyticsProvider)
          ?.trackEvent(
            KuldevtaEvents.resultReopened,
            properties: <String, Object?>{
              KuldevtaEventProps.deityId: result.slug,
              KuldevtaEventProps.assignmentTier: result.tier,
              KuldevtaEventProps.isFallback: result.tier == 'fallback',
              KuldevtaEventProps.source:
                  KuldevtaResultReopenSource.headerAvatar,
            },
          ),
    );
  }

  /// "Mata Se Baat Karein" — the one paywall in the whole khoj flow, and now
  /// only when the server asks for it (`chatConfig.requiresPro`; see
  /// `chat_paywall.dart`). While the flag is false the handoff runs straight
  /// through and the deity chat opens on the first tap.
  ///
  /// Shape preserved byte-for-byte from the deleted result screen so warehouse
  /// aggregation still reads the shell tap and this tap as one funnel — that
  /// remains true whenever the gate is armed.
  void _onKuldevtaChatPressed(KuldevtaResult result, KuldevtaBloc bloc) {
    final gate = ref.read(paywallGateProvider);
    final requiresPro = ref.read(chatPaywallRequiredProvider);
    final router = GoRouter.of(context);
    final counters = ref.read(chatCountersProvider);
    unawaited(
      runChatPaywallGate<void>(
        requiresPro: requiresPro,
        gate: gate,
        pending: PendingAction<void>(
          label: 'open_kuldevta_chat',
          action: () async {
            // Fires kuldevta_result_chat_tapped + refetches /users/me, which
            // flips kuldevtaAssigned and drops this screen out of khoj mode on
            // the next build. The khoj rows simply stop being rendered — there
            // is nothing to delete, because they were never server-side rows.
            bloc.add(const KuldevtaChatTapped());
            ref.read(kuldevtaChatHandoffProvider.notifier).state = result;
            if (mounted) setState(() => _resultCardOpen = false);
          },
        ),
        openPaywall: () async {
          await router.push(
            '/paywall',
            extra: PaywallArgs(
              triggerModule: UserPropertyModule.chat,
              triggerAction: PaywallTriggerAction.openChat,
              entrySource: PaywallEntrySource.chat,
              // TAM-177 attribution fix (A): these were null on this path even
              // though both values were already resolved, which made a
              // kuldevta-CTA paywall view indistinguishable from a content-arm
              // one in the warehouse. Purely additive — it fills nulls.
              agentId: counters.savedAgentId(),
              chatType: counters.savedChatType(),
            ),
          );
          // Dismissing the paywall must not park the user back on the result
          // card. The assignment happened either way, so closing the card drops
          // this screen into the deity chat — the same place they land on a
          // later Chat-tab tap. Without this the card stayed up (khoj mode is
          // sticky while it is open) and the only way out was leaving the tab.
          if (mounted) setState(() => _resultCardOpen = false);
        },
      ),
    );
  }

  /// The first-time intro block, or null when it should not be shown (TAM-178).
  ///
  /// Two conditions, both required: this agent's intro has not been seen on
  /// this install, and there is an agent to attribute it to. The transcript
  /// being empty is checked by the caller.
  ///
  /// Note the block renders even when `introVideo` is null — caption plus chips
  /// is a designed state, and the gita agent shipped that way until its asset
  /// existed.
  Widget? _introBlockFor(ChatReady state) {
    final agentId = state.agentId;
    if (agentId.isEmpty) return null;

    // THE ONLY CONDITION IS AN EMPTY THREAD (checked by the caller).
    //
    // There was a persisted "intro seen" flag here. It is gone because the
    // thread itself already carries the answer: a thread is empty only for
    // someone who has never chatted, so "empty" and "first visit" are the same
    // state, and a flag that can disagree with the thread is a second source
    // of truth with no extra information in it. Once the user sends anything
    // the thread stops being empty and the block never returns.
    return ChatIntroBlock(
      agentId: agentId,
      chips: state.chatConfig.recommendedMessages,
      // The deity chat gets the caption and chips but NOT the video: the clip
      // pitches the khoj, and by the time someone is talking to their kuldevta
      // they have already done it. The server still sends `introVideo` for
      // this agent because the khoj thread — the same agent, before the
      // assignment exists — is where it belongs.
      introVideo: _isAssignedKuldevtaChat ? null : state.chatConfig.introVideo,
      pauseSignal: _pauseSignal,
      onChipTapped: (chip) => _onChipTapped(chip, state),
    );
  }

  /// True in the deity chat — the kuldevta persona agent, after an assignment.
  /// Distinct from khoj mode, which is the same agent BEFORE one exists.
  bool get _isAssignedKuldevtaChat {
    final chatConfig = ref.watch(meProvider).value?.chatConfig;
    return (chatConfig?.showKuldevtaChat ?? false) &&
        (chatConfig?.kuldevtaAssigned ?? false);
  }

  /// `introVideo` off the chat history config, as the khoj thread's own value
  /// object. Null whenever the agent has no asset — two of three do not today.
  KhojIntroVideo? _introVideoFor(ChatState state) {
    final config = switch (state) {
      ChatReady(:final chatConfig) => chatConfig,
      ChatReadOnly(:final chatConfig) => chatConfig,
      _ => null,
    };
    final video = config?.introVideo;
    if (video == null) return null;
    return KhojIntroVideo(
      url: video.url,
      videoId: video.videoId,
      durationMs: video.durationMs.toInt(),
      posterUrl: video.posterUrl,
    );
  }

  static String? _agentIdOf(ChatState state) {
    if (state is ChatReady) return state.agentId;
    if (state is ChatReadOnly) return state.chatConfig.agentId;
    return null;
  }

  // ---- Conversation mode (unchanged behaviour) --------------------------

  Widget _buildConversationMode() {
    return BlocConsumer<ChatBloc, ChatState>(
      listenWhen: (prev, curr) {
        // Wake the paywall listener only when the nonce changes AND the
        // new state is ChatReady with a non-null nonce.
        if (curr is! ChatReady) return false;
        final nonce = curr.paywallRequiredNonce;
        if (nonce == null) return false;
        return nonce != _lastHandledPaywallNonce;
      },
      listener: (context, state) {
        if (state is! ChatReady) return;
        _lastHandledPaywallNonce = state.paywallRequiredNonce;
        _handlePaywallRequired();
      },
      builder: (context, state) {
        return PopScope(
          // Intercept the OS back BEFORE it bubbles to the shell scaffold's
          // own PopScope (which branch-swaps to Home). The redundancy is
          // deliberate — the shell handler is generic across all branches;
          // this local one guarantees the chat-specific "always Home"
          // contract even if the shell wiring changes.
          canPop: false,
          onPopInvokedWithResult: (didPop, _) {
            if (didPop) return;
            // Bug 6 — primary chat_closed fire. Runs BEFORE _exitToHome
            // triggers the shell branch-swap that tears down this
            // BlocProvider, so the fire always lands. The dispose fire
            // below is a backup for edge-case teardown paths.
            try {
              context.read<ChatBloc>().onSessionClose(
                exitReason: ChatExitReason.back,
              );
            } catch (_) {
              // Analytics is fire-and-forget by policy.
            }
            _exitToHome(context);
          },
          child: Scaffold(
            // Chat scaffold fill is a cream→white GRADIENT in every Figma
            // chat frame (2612:17647 / 17701 / 17716 / 17749 / 17787 /
            // 17837), NOT a flat brand100. Match with AppGradient.chatScaffold
            // (identical stop geometry to the home/books scaffolds — see
            // theme.dart). Scaffold's own `backgroundColor` stays white so
            // the gradient DecoratedBox paints unfiltered.
            backgroundColor: AppColors.white,
            body: DecoratedBox(
              decoration: const BoxDecoration(
                gradient: AppGradient.chatScaffold,
              ),
              child: SafeArea(
                top: true,
                bottom: false,
                child: Stack(
                  children: <Widget>[
                    Column(
                      children: <Widget>[
                        _AppBar(
                          key: const Key('chat-appbar'),
                          // D2 — the deity header re-opens the result card. Only
                          // wired once an assignment exists; every other chat
                          // leaves the header inert.
                          onPersonaTap: _persona == null
                              ? null
                              : () => _reopenResultCard(_persona!),
                        ),
                        Expanded(
                          key: const Key('chat-transcript'),
                          child: _buildBody(state),
                        ),
                        _buildComposer(state),
                      ],
                    ),
                    if (_resultCardOpen && _persona != null)
                      KuldevtaResultCard(
                        result: _persona!,
                        // The user is already in the deity chat, so the CTA just
                        // closes the card — no paywall, no navigation.
                        onChatPressed: () =>
                            setState(() => _resultCardOpen = false),
                        onSharePressed: () => ref
                            .read(kuldevtaBlocProvider)
                            .add(const KuldevtaShareTapped()),
                        onDismiss: () =>
                            setState(() => _resultCardOpen = false),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildBody(ChatState state) {
    switch (state) {
      case ChatInitial():
      case ChatLoadingHistory():
        return const Center(
          key: Key('chat-loading'),
          child: CircularProgressIndicator.adaptive(),
        );
      case ChatHistoryFailed():
        return Center(
          key: const Key('chat-history-failed'),
          child: Padding(
            padding: const EdgeInsets.all(AppChat.screenPadding),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: <Widget>[
                Text(
                  'Chat load nahi ho paya',
                  style: AppText.chatCardTitle(),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 12),
                TextButton(
                  onPressed: () =>
                      context.read<ChatBloc>().add(const ChatStarted()),
                  child: const Text('Retry'),
                ),
              ],
            ),
          ),
        );
      case ChatReady():
        return _buildReady(state);
      case ChatReadOnly():
        return _buildReadOnly(state);
    }
  }

  Widget _buildReady(ChatReady state) {
    final transcript = state.transcript;
    final isEmpty = transcript.isEmpty && state.sendingMessage == null;

    // TAM-178 — the first-time intro block. Rendered through the transcript's
    // `leadingRows` seam rather than as a third branch here, so it is the same
    // mechanism the khoj thread uses and so it could later coexist with a
    // non-empty transcript, which this either/or cannot express.
    if (isEmpty) {
      final intro = _introBlockFor(state);
      if (intro != null) {
        return ChatTranscript(
          key: const Key('chat-intro-scroll'),
          leadingRows: <Widget>[intro],
          messages: const <ChatMessage>[],
          // The thread is empty by definition here, so bottom-anchoring would
          // park the whole block under a screen of blank space.
          anchorTop: true,
          showTypingIndicator: false,
          hasMoreOlder: false,
          onLoadOlder: () {},
          onCardTapped: (_, _, _) {},
        );
      }
      // No fallback branch: an empty thread ALWAYS gets the intro block now.
      // `ChatEmptyState` survives only for the read-only case below, where
      // there is no agent to attribute an intro to.
    }
    return ChatTranscript(
      messages: transcript,
      showTypingIndicator: state.sendingMessage != null,
      hasMoreOlder: state.nextCursor != null,
      paginating: state.paginating,
      activeCardKey: _activeCardKey,
      onLoadOlder: () =>
          context.read<ChatBloc>().add(const ChatOlderPageRequested()),
      onCardTapped: (msgId, type, item) => _onCardTapped(msgId, type, item),
    );
  }

  Widget _buildReadOnly(ChatReadOnly state) {
    if (state.transcript.isEmpty) {
      return SingleChildScrollView(
        key: const Key('chat-empty-scroll'),
        child: ChatEmptyState(
          config: state.chatConfig,
          enabled: false,
          onChipTapped: (_) {},
        ),
      );
    }
    return ChatTranscript(
      messages: state.transcript,
      showTypingIndicator: false,
      hasMoreOlder: false,
      paginating: false,
      onLoadOlder: () {},
      onCardTapped: (msgId, type, item) => _onCardTapped(msgId, type, item),
    );
  }

  Widget _buildComposer(ChatState state) {
    // The composer is ALWAYS pinned-bottom regardless of state so its slot
    // stays a stable Key target for the layout-intent test. In read-only /
    // load-failed states we disable input.
    bool enabled;
    bool pending = false;
    switch (state) {
      case ChatReady(:final sendingMessage):
        enabled = true;
        pending = sendingMessage != null;
      case ChatReadOnly():
        enabled = false;
      case ChatInitial():
      case ChatLoadingHistory():
      case ChatHistoryFailed():
        enabled = false;
    }
    return ChatComposer(
      key: const Key('chat-composer-zone'),
      controller: _composerController,
      onSend: _onSendTapped,
      enabled: enabled,
      pending: pending,
      // The intro video yields to the first keystroke / recording, exactly as
      // it does in khoj mode. Harmless when no video is mounted.
      onAnswerStarted: () =>
          _pauseSignal.requestPause(ChatVideoPauseTrigger.answerStarted),
    );
  }

  void _onChipTapped(ChatRecommendedMessage chip, ChatReady state) {
    // PRD §18.2 `chat_suggested_question_clicked` — fires BEFORE the send
    // so we measure discovery even if the send later fails.
    unawaited(
      ref
          .read(analyticsProvider)
          ?.trackEvent(
            ChatEvents.chatSuggestedQuestionClicked,
            properties: <String, Object?>{
              ChatEventProps.agentId: state.agentId,
              // Raw text on the wire — product signed off 2026-09-03.
              ChatEventProps.questionText: chip.text,
              // TAM-165 — the CMS-authored chip category (`mood` / `content` /
              // `horoscope` / `scripture`). Was a TODO blocked on the CMS
              // surface. `.value` is the wire string, not the Dart wrapper's
              // `toString()`; empty when the server omits it on a chip.
              ChatEventProps.category: chip.category?.value ?? '',
              ChatEventProps.positionIndex: chip.order,
              // TODO(TAM-N-chat-content-context) — plumb from launch payload.
              ChatEventProps.entrySource: '',
            },
          ),
    );
    context.read<ChatBloc>().add(
      ChatMessageSubmitted(
        message: chip.text,
        promptSource: 'recommended',
        promptId: chip.id,
      ),
    );
  }

  void _onSendTapped(String text) {
    context.read<ChatBloc>().add(
      ChatMessageSubmitted(message: text, promptSource: 'typed'),
    );
    _composerController.clear();
  }

  void _onCardTapped(
    String messageId,
    String contentType,
    ChatContentItem item,
  ) {
    setState(() {
      _activeCardKey = '$messageId:$contentType:${item.id}';
    });
    // Fire analytics via the bloc (single seam) and navigate via router.
    // Horoscope items always ship `playUrl: null` by design (the "content"
    // is the daily-result screen, not a media asset) — mirror the same
    // exemption `ChatContentCard._proLocked` applies, or the guard below
    // silently swallows every horoscope tap and the Rashifal hand-off
    // never happens.
    final isProLocked = contentType != 'horoscope' && item.playUrl == null;
    final bloc = context.read<ChatBloc>();
    bloc.add(
      ChatContentCardTapped(
        contentType: contentType,
        contentId: item.id,
        messageId: messageId,
        isProLocked: isProLocked,
      ),
    );
    // A PRO user tapping a card with no media at all — a status row with
    // neither video nor image, a wallpaper with no preview. Nothing to open,
    // so this stays the dead-end it has always been. It is deliberately
    // conditioned on Pro: for a FREE user `isProLocked` means "the server
    // withheld a Pro-only URL", which is precisely the tap that must reach
    // the paywall below rather than return here.
    if (isProLocked && ref.read(entitlementProvider)) return;
    unawaited(_gateContentTap(contentType, item.id, bloc));
  }

  /// Every content-card tap goes through the paywall gate: a Pro user opens
  /// the module, a free user gets the paywall and — on a successful purchase
  /// — the content they actually asked for.
  ///
  /// Gated on `isPro`, NOT on `chatConfig.requiresPro`. Those are different
  /// questions and must not share a switch: `requiresPro` says whether
  /// *talking* costs money (false today — chat is free, see
  /// `chat_paywall.dart`), while the cards recommend rows that are Pro
  /// everywhere else in the app. Free chat must not become a side door
  /// around the aarti / mantras / ringtone paywalls, so [runChatPaywallGate]
  /// is deliberately NOT used here.
  ///
  /// Resuming works even though the tapped item's `playUrl` is still `null`
  /// in the loaded transcript: [_openContent] navigates by `contentId` and
  /// the destination module fetches its own detail. Nothing here needs the
  /// stripped URL, so no history refetch is owed.
  Future<void> _gateContentTap(
    String contentType,
    String contentId,
    ChatBloc bloc,
  ) async {
    final gate = ref.read(paywallGateProvider);
    final router = GoRouter.of(context);
    // Captured BEFORE the paywall push, same as `_handlePaywallRequired` —
    // the fire on the paywall side has to be able to say which bot's chat
    // this paywall came out of.
    final counters = ref.read(chatCountersProvider);
    final agentId = counters.savedAgentId();
    final chatType = counters.savedChatType();
    await gate.run<void>(
      pending: PendingAction<void>(
        label: 'open_chat_content',
        action: () async {
          if (!mounted || bloc.isClosed) return;
          // Fire the paired chat_closed(content_opened) BEFORE navigation so
          // the funnel sees the visit boundary at tap time — pushed content
          // routes don't change `navigationShell.currentIndex`, so the shell
          // scaffold's branch-swap detector wouldn't fire the exit itself.
          // For `context.go` routes (status branch-swap, horoscope-main
          // branch-swap) this also wins over the shell's `tab_switch` reason
          // because it fires first and clears `_sessionStartedAt` — the
          // shell's subsequent notify is a guarded no-op.
          bloc.add(const ChatExited(exitReason: ChatExitReason.contentOpened));
          _openContent(contentType, contentId, bloc);
        },
      ),
      openPaywall: () async {
        // Before the push, for the reason given on `_handlePaywallRequired`:
        // a route pushed over chat leaves `currentIndex` alone, so the shell
        // cannot detect this boundary itself.
        bloc.add(const ChatExited(exitReason: ChatExitReason.paywallOpened));
        await router.push(
          '/paywall',
          extra: PaywallArgs(
            // The module being BOUGHT, not the surface it was tapped on —
            // `entry_source: chat` already carries the surface. Pairing them
            // this way makes a chat-recommended mantra aggregate with the
            // mantras module's own gate, separable by entry_source alone.
            triggerModule: _paywallModuleFor(contentType),
            triggerAction: _paywallActionFor(contentType),
            entrySource: PaywallEntrySource.chat,
            agentId: agentId,
            chatType: chatType,
            // The paywall interrupts a conversation, so every way out of it
            // has to hand the user back to that conversation — not to Home,
            // which is where the paywall's exits go by default. This covers
            // the X glyph, Android back, an empty plan list, the config-error
            // escape AND a successful purchase: on success the gate resumes
            // below and pushes the content, which must stack on chat rather
            // than on a Home the user never asked for.
            dismissMode: PaywallDismissMode.returnToCaller,
          ),
        );
        if (!mounted || bloc.isClosed) return;
        // Paywall popped (cancelled, or purchased and about to resume) —
        // chat is visible again, so complete the visit pair.
        bloc.add(const ChatEntered());
      },
    );
  }

  /// `trigger_module` for a content type — the destination module's own
  /// [UserPropertyModule] value, so a chat-sourced paywall view lands in the
  /// same bucket as that module's.
  String _paywallModuleFor(String contentType) => switch (contentType) {
    'aarti' || 'bhajan' => UserPropertyModule.aartiBhajans,
    'mantra' => UserPropertyModule.mantrasStutis,
    'ringtone' => UserPropertyModule.ringtone,
    'status' => UserPropertyModule.statusSharing,
    'wallpaper' => UserPropertyModule.wallpaper,
    'horoscope' => UserPropertyModule.horoscope,
    // Unreachable while `kChatContentTypes` and this switch agree; a new
    // server-side type must not crash a tap, so attribute it to chat.
    _ => UserPropertyModule.chat,
  };

  /// `trigger_action` for a content type — the intent the user was denied,
  /// reusing the vocabulary each module already emits for the same intent.
  String _paywallActionFor(String contentType) => switch (contentType) {
    'aarti' || 'bhajan' || 'mantra' => PaywallTriggerAction.playAudio,
    'ringtone' => PaywallTriggerAction.playRingtone,
    'status' => PaywallTriggerAction.shareStatus,
    'wallpaper' => PaywallTriggerAction.setWallpaper,
    'horoscope' => PaywallTriggerAction.openHoroscope,
    _ => PaywallTriggerAction.upgradeCta,
  };

  void _openContent(String contentType, String contentId, ChatBloc bloc) {
    // For `context.push` routes, chain a return handler that dispatches
    // ChatEntered when the pushed route pops — the user is back on chat,
    // so a fresh visit begins. `context.go` routes (branch swaps) don't
    // return via `.then` because the current route is replaced; the shell
    // scaffold's detector fires ChatEntered when the user swaps back to
    // the chat branch, so no handler is needed here for those paths.
    switch (contentType) {
      case 'aarti':
      case 'bhajan':
        _pushAndEnterOnReturn(bloc, AartiRoutes.deepLink(contentId));
      case 'mantra':
        _pushAndEnterOnReturn(bloc, MantrasRoutes.deepLink(contentId));
      case 'ringtone':
        _pushAndEnterOnReturn(bloc, RingtoneRoutes.preview(contentId));
      case 'wallpaper':
        unawaited(_openWallpaperPreview(contentId, bloc));
      case 'status':
        _openStatusPlayer(contentId);
      case 'horoscope':
        _openHoroscope(contentId);
    }
  }

  /// Push [location] via go_router and dispatch [ChatEntered] to [bloc]
  /// when the pushed route pops. Wraps the router.push future so every
  /// `context.push` call site out of chat gets the paired chat_page_viewed
  /// on return without threading the future through the caller.
  void _pushAndEnterOnReturn(ChatBloc bloc, String location) {
    final router = GoRouter.of(context);
    unawaited(
      router.push<Object?>(location).whenComplete(() {
        if (!mounted) return;
        bloc.add(const ChatEntered());
      }),
    );
  }

  /// Chat-side hand-off into the Rashifal (Horoscope) module. PRD §12:
  /// *"the chat gives a short response and opens the Horoscope section.
  /// It does not read the horoscope out inside the chat and it does not
  /// ask for birth details — the Horoscope module already handles sign
  /// selection."*
  ///
  /// Two shapes:
  ///  * `contentId == ''` — generic "open Rashifal" recommendation.
  ///    Branch-swap to the Rashifal shell tab (bottom nav visible with
  ///    Rashifal highlighted, module's sign-picker grid mounts).
  ///  * `contentId != ''` — backend parsed a specific zodiac slug from
  ///    the user's message (e.g. "Aaj Mesh ka rashifal batao" →
  ///    `id: 'aries'`). Push OVER the shell to the Pro-gated daily
  ///    result for that sign. The Pro gate is the horoscope module's
  ///    concern — free users hit the paywall there, matching every
  ///    other zodiac-result entry point.
  void _openHoroscope(String zodiacId) {
    if (zodiacId.isEmpty) {
      context.go(HoroscopeRoutes.main);
    } else {
      context.push(HoroscopeRoutes.result(zodiacId));
    }
  }

  /// Chat-side deep link into a specific status (TAM-166). The tap swaps to
  /// the Status shell branch and pushes the pinned variant of the feed on
  /// top, so the bottom nav stays visible with Status highlighted (branch
  /// swap, not push-over-shell — that's what `context.go` does here, not
  /// `router.push`). The backend prepends the pinned id + dedupes it from
  /// the tail fail-soft, so a stale/deleted id still lands the user on a
  /// working feed rather than a dead end — no client-side pre-flight
  /// needed anymore (that was the retired `StatusPlayerScreen`'s only
  /// reason for it).
  void _openStatusPlayer(String statusId) {
    // `context.go` triggers a shell branch swap (Chat → Status) with the
    // pinned variant on top; the bottom nav stays mounted with Status
    // highlighted. Do NOT use `router.push` — that would stack the pinned
    // route over the CURRENT branch (chat), hiding the bottom nav.
    context.go(StatusRoutes.homePinned(statusId));
  }

  /// Chat-side deep link into a specific wallpaper. `WallpaperRoutes.preview`
  /// needs a full [WallpaperCardItem] on `WallpaperPreviewArgs`, but the
  /// chat surface only carries an id. Fetch the detail first, hydrate a
  /// single-item feed, push the reels preview standalone (no pagination,
  /// no source query). On failure — the id is stale, offline, or the
  /// detail endpoint rejects — fall back to the wallpaper home so the
  /// tap is never a dead click.
  Future<void> _openWallpaperPreview(String wallpaperId, ChatBloc bloc) async {
    final router = GoRouter.of(context);
    try {
      final detail = await ref
          .read(wallpaperRepositoryProvider)
          .fetchDetail(wallpaperId);
      final item = WallpaperCardItem(
        id: detail.id,
        title: detail.title,
        mediaType: detail.mediaType,
        thumbnailUrl: detail.thumbnailUrl,
        previewImageUrl: detail.previewImageUrl,
        // Detail endpoint doesn't carry `deitySlug` — the preview only reads
        // it for analytics on-swipe within a deity feed, and a chat-sourced
        // open is a standalone context, not a deity feed.
        deitySlug: null,
        setCount: detail.setCount,
        likeCount: detail.likeCount,
        shareCount: detail.shareCount,
        likedByMe: detail.likedByMe,
      );
      unawaited(
        router
            .push<Object?>(
              WallpaperRoutes.preview,
              extra: WallpaperPreviewArgs(
                items: <WallpaperCardItem>[item],
                startIndex: 0,
                sourceContext: 'chat_recommendation',
              ),
            )
            .whenComplete(() {
              if (!mounted) return;
              bloc.add(const ChatEntered());
            }),
      );
    } catch (_) {
      // Detail fetch failed — keep the tap useful by pushing the home.
      unawaited(
        router.push<Object?>(WallpaperRoutes.home).whenComplete(() {
          if (!mounted) return;
          bloc.add(const ChatEntered());
        }),
      );
    }
  }

  Future<void> _handlePaywallRequired() async {
    final gate = ref.read(paywallGateProvider);
    final router = GoRouter.of(context);
    // Bug 7 — capture chat attribution BEFORE the paywall push so the
    // fire on the paywall side can tell WHICH bot's paywall this is.
    // State first (freshest), then the SharedPreferences copy the
    // AppBar's build persists on every /users/me read; both are OMITTED
    // if neither has a value so a stage/control user doesn't emit an
    // empty string that would look like a real bot in the funnel.
    final bloc = context.read<ChatBloc>();
    final chatState = bloc.state;
    final counters = ref.read(chatCountersProvider);
    String? stateAgentId;
    if (chatState is ChatReady) {
      stateAgentId = chatState.agentId;
    } else if (chatState is ChatReadOnly) {
      stateAgentId = chatState.chatConfig.agentId;
    }
    final resolvedAgentId = (stateAgentId != null && stateAgentId.isNotEmpty)
        ? stateAgentId
        : counters.savedAgentId();
    final resolvedChatType = counters.savedChatType();
    await gate.run<void>(
      pending: PendingAction<void>(
        action: () async {
          // Nothing extra to do on resume — the user must re-type / re-tap
          // send. The paywall gate's re-read of entitlement is enough to
          // let the next `ChatMessageSubmitted` through.
        },
        label: 'chat_send',
      ),
      openPaywall: () async {
        // Fire the paired chat_closed(paywall_opened) BEFORE the push so
        // the funnel sees the visit boundary at the moment the paywall
        // takes over the chat surface. Pushing over chat doesn't change
        // `navigationShell.currentIndex`, so the shell scaffold can't
        // detect this transition itself.
        bloc.add(const ChatExited(exitReason: ChatExitReason.paywallOpened));
        await router.push(
          '/paywall',
          extra: PaywallArgs(
            triggerModule: UserPropertyModule.appOpen,
            triggerAction: PaywallTriggerAction.upgradeCta,
            entrySource: PaywallEntrySource.chat,
            agentId: resolvedAgentId,
            chatType: resolvedChatType,
          ),
        );
        // Paywall popped (user cancelled or completed purchase). Chat is
        // visible again — fire the paired chat_page_viewed so the visit
        // pair is complete. `bloc` may be closed if the shell branch was
        // torn down mid-paywall; guard with `isClosed` to keep this
        // fire-and-forget path safe.
        if (!mounted || bloc.isClosed) return;
        bloc.add(const ChatEntered());
      },
    );
  }
}

/// Chat app-bar (TAM-164 + TAM-166 persona-header extension).
///
/// Two variants, chosen by `chatConfig.showKuldevtaChat` +
/// `chatConfig.kuldevtaAssigned` + fresh-handoff identity:
///
///   * **Persona header** (`Chat with Kuldevta.png` reference) — the user
///     is qualified (`showKuldevtaChat == true`) AND the deity identity
///     is in `kuldevtaChatHandoffProvider` (a fresh handoff from the
///     discovery result screen). Renders the deity avatar + name.
///   * **Generic header** — TAM-164's static "Prabhuji Chat" title.
///     Renders for un-qualified users, and for the assigned-path cold
///     launch (`showKuldevtaChat && kuldevtaAssigned` but no identity in
///     memory) — that cold-launch case fires
///     `kuldevta_persona_header_fallback` for QA drift visibility.
class _AppBar extends ConsumerStatefulWidget {
  const _AppBar({super.key, this.khojMode = false, this.onPersonaTap});

  /// TIER 4 (TAM-177) — the khoj thread, before any assignment exists. The
  /// header reads the literal `'Kuldevta Khoj'`. Checked FIRST, because a
  /// khoj-mode user is by definition `!kuldevtaAssigned`, so every other tier
  /// would fall through to the generic "Prabhuji Chat" and the screen would
  /// lie about what the user is doing.
  final bool khojMode;

  /// Makes TIER 1 (the deity avatar + name block) tappable — it re-opens the
  /// result card (locked decision D2). Null leaves the header inert, which is
  /// what every non-kuldevta chat wants.
  final VoidCallback? onPersonaTap;

  @override
  ConsumerState<_AppBar> createState() => _AppBarState();
}

class _AppBarState extends ConsumerState<_AppBar> {
  bool _fallbackLogged = false;

  @override
  Widget build(BuildContext context) {
    final chatState = context.watch<ChatBloc>().state;
    final agentId = _agentIdFromState(chatState);
    final persona = ref.watch(kuldevtaChatHandoffProvider);
    // Read the qualification + assignment flags from /users/me — the
    // server's explicit gate. `meProvider` is a FutureProvider; before
    // the first successful load we treat both as false (generic header),
    // which is the fail-soft direction.
    final chatConfig = ref.watch(meProvider).value?.chatConfig;
    final showKuldevtaChat = chatConfig?.showKuldevtaChat ?? false;
    final kuldevtaAssigned = chatConfig?.kuldevtaAssigned ?? false;

    // Auto-persist the assigned deity's name on every live /users/me
    // read that carries one, so a subsequent cold launch can render a
    // name-only header before meProvider resolves.
    // ChatCounters.saveKuldevtaName is idempotent (SharedPreferences
    // setString on the same value is a no-op in practice) — safe to
    // call on every rebuild.
    final counters = ref.read(chatCountersProvider);
    if (kuldevtaAssigned &&
        chatConfig?.kuldevtaName != null &&
        chatConfig!.kuldevtaName!.isNotEmpty) {
      counters.saveKuldevtaName(chatConfig.kuldevtaName);
    }
    // `chatConfig.agentId` + `chatConfig.chatType` are NOT persisted here.
    // They are mirrored by `UsersRepository.getMe` — the one place the app
    // learns them — so every surface has the right `chat_type` from its
    // first event instead of only after this screen has rendered once, and
    // so a build that runs ahead of `/users/me` can't wipe a correct stored
    // value by writing a null.

    // Resolve the name for the header. Priority:
    //  1. Live chatConfig.kuldevtaName (freshest — this session's /users/me)
    //  2. counters.savedKuldevtaName() (persisted from last session)
    //  3. null → header falls back to "Prabhuji Chat"
    final resolvedKuldevtaName = kuldevtaAssigned
        ? (chatConfig?.kuldevtaName ?? counters.savedKuldevtaName())
        : null;

    // Cold-launch telemetry — the "should show FULL persona header but
    // can't" case. Fires ONCE per app-bar mount when the user is
    // qualified and assigned but the fresh-handoff identity isn't in
    // memory (e.g. they re-launched the app and cold-opened chat).
    // Still fires even when the name-only variant renders, so the
    // funnel can measure how often the avatar+subtitle experience is
    // missed vs the simplified fallback.
    if (showKuldevtaChat &&
        kuldevtaAssigned &&
        persona == null &&
        !_fallbackLogged) {
      _fallbackLogged = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        unawaited(
          ref
              .read(analyticsProvider)
              ?.trackEvent(
                KuldevtaEvents.personaHeaderFallback,
                properties: <String, Object?>{
                  KuldevtaEventProps.agentId: agentId,
                  KuldevtaEventProps.hasKuldevtaAssigned: kuldevtaAssigned,
                },
              ),
        );
      });
    }

    // TAM-166 — use `constraints.minHeight` instead of a rigid
    // `SizedBox(height:)` so the app bar can grow when the persona
    // header's two-line title overflows the design's 64dp height at
    // larger textScales (figma-flutter Traps table §"Literal height:
    // translation around scalable Text").
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppChat.appBarHeight),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppChat.screenPadding,
          vertical: AppSpacing.xSmall,
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: <Widget>[
            IconButton(
              key: const Key('chat-appbar-back'),
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
              onPressed: () {
                // Bug 6 — fire chat_closed BEFORE router.go tears down the
                // BlocProvider. The system-back PopScope in
                // `_ChatScreenState.build` covers the OS-back gesture; this
                // covers the app-bar back tap. Both paths need the fire
                // because both dispose the ChatBloc as a side effect of
                // routing, and the dispose fire raced teardown in prod.
                try {
                  context.read<ChatBloc>().onSessionClose(
                    exitReason: ChatExitReason.back,
                  );
                } catch (_) {
                  // Analytics is fire-and-forget by policy.
                }
                // Always to Home — matches the PopScope for the system-back
                // gesture in `_ChatScreenState.build`. Chat is a shell branch
                // root; the pop-loop guards the (currently non-existent, but
                // possible) case of routes pushed on top before the header
                // back is tapped. See `_ChatScreenState._exitToHome` for the
                // matching rule and rationale.
                final router = GoRouter.of(context);
                while (router.canPop()) {
                  router.pop();
                }
                router.go(HomeRoutes.home);
              },
              icon: SvgPicture.asset(
                'assets/chat/back_arrow.svg',
                width: AppChat.appBarBackArrow,
                height: AppChat.appBarBackArrow,
                colorFilter: const ColorFilter.mode(
                  AppColors.chatAppBarBackArrow,
                  BlendMode.srcIn,
                ),
              ),
            ),
            const SizedBox(width: AppChat.appBarTitleGap),
            Expanded(
              // Three-tier title choice — all branches sit inside
              // Expanded so nothing overflows on narrow devices at
              // large textScales (caught by the persona-appbar
              // multi-size smoke at 320dp × 2.0):
              //  1. Fresh handoff → full persona header (avatar +
              //     name + gender-conditional subtitle).
              //  2. Assigned cold launch WITH a resolved kuldevta
              //     name (live chatConfig OR persisted via
              //     ChatCounters) → name-only text in the same style
              //     as the generic title, so the user still sees
              //     their deity's name in the header without the
              //     avatar/subtitle we can't render without a full
              //     handoff.
              //  3. Otherwise → generic "Prabhuji Chat" title.
              //  4. Khoj mode (TAM-177) → the literal "Kuldevta Khoj".
              //     Checked FIRST: a khoj user is by definition unassigned,
              //     so tiers 1 and 2 cannot match and tier 3 would render
              //     "Prabhuji Chat" over a kuldevta discovery thread.
              child: widget.khojMode
                  ? Text(
                      'Kuldevta Khoj',
                      key: const Key('chat-appbar-khoj-title'),
                      style: AppText.chatAppBarTitle(),
                      overflow: TextOverflow.ellipsis,
                    )
                  : (showKuldevtaChat && persona != null)
                  ? _TappableHeader(
                      onTap: widget.onPersonaTap,
                      child: _PersonaHeaderTitle(persona: persona),
                    )
                  : Text(
                      (showKuldevtaChat &&
                              kuldevtaAssigned &&
                              resolvedKuldevtaName != null &&
                              resolvedKuldevtaName.isNotEmpty)
                          ? resolvedKuldevtaName
                          : 'Prabhuji Chat',
                      key:
                          (showKuldevtaChat &&
                              kuldevtaAssigned &&
                              resolvedKuldevtaName != null &&
                              resolvedKuldevtaName.isNotEmpty)
                          ? const Key('chat-appbar-persona-name-only')
                          : const Key('chat-appbar-generic-title'),
                      style: AppText.chatAppBarTitle(),
                      overflow: TextOverflow.ellipsis,
                    ),
            ),
          ],
        ),
      ),
    );
  }

  static String? _agentIdFromState(ChatState state) {
    if (state is ChatReady) return state.agentId;
    if (state is ChatReadOnly) return state.chatConfig.agentId;
    return null;
  }
}

/// The outlined button that sits under the newest khoj bubble —
/// "Shuru Kijiye", "Pata Nahi", "Retry", "Wapas" (Figma `3934:14677`,
/// `3936:25985`).
///
/// It hugs its label (plus horizontal padding) rather than stretching across
/// the thread, and sits on the left, under the bot bubble it answers.
///
/// It lives INSIDE the transcript rather than pinned above the composer, so it
/// scrolls with the conversation exactly as the design shows. That is also why
/// it is a transcript trailing row and not a fourth layout zone.
class _KhojOutlinedButton extends StatelessWidget {
  const _KhojOutlinedButton({
    required this.buttonKey,
    required this.label,
    required this.onPressed,
  });

  /// Goes on the `OutlinedButton` itself, NOT on this wrapper: the wrapper's
  /// `Align` still fills the transcript row, so a key there would make
  /// `tester.tap` aim at the row's centre and miss the hugged button.
  final Key buttonKey;

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerLeft,
      child: OutlinedButton(
        key: buttonKey,
        onPressed: onPressed,
        style: OutlinedButton.styleFrom(
          // minHeight, never a rigid height — the label scales with textScale.
          minimumSize: const Size(0, AppChat.composerFieldMinHeight),
          // Wrap the label: only the intrinsic text width plus this padding.
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.large,
            vertical: AppSpacing.xSmall,
          ),
          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          backgroundColor: AppColors.white,
          side: const BorderSide(color: AppColors.chatCardBorder),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppChat.cardRadius),
          ),
        ),
        child: Text(label, style: AppText.chatCardCta()),
      ),
    );
  }
}

/// Wraps the persona header so tapping it re-opens the result card (D2).
///
/// A plain `GestureDetector` would give no affordance and no semantics; an
/// `InkWell` over a transparent `Material` keeps the ripple and marks the
/// block as a button for screen readers without changing how it paints.
class _TappableHeader extends StatelessWidget {
  const _TappableHeader({required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    if (onTap == null) return child;
    return Semantics(
      button: true,
      label: 'Apni kuldevta ki jaankari dekhein',
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          key: const Key('chat-appbar-persona-tap'),
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppChat.bubbleCornerLarge),
          child: child,
        ),
      ),
    );
  }
}

class _PersonaHeaderTitle extends StatelessWidget {
  const _PersonaHeaderTitle({required this.persona});

  final KuldevtaResult persona;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        _PersonaAvatar(imageUrl: persona.imageUrl),
        const SizedBox(width: AppKuldevta.personaAvatarGap),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              Text(
                persona.nameRoman,
                key: const Key('chat-appbar-persona-name'),
                overflow: TextOverflow.ellipsis,
                style: AppText.labelLg(color: AppColors.grey500),
              ),
              Text(
                persona.gender == KuldevtaGender.devi
                    ? 'Apki Kuldevi'
                    : 'Apke Kuldevta',
                key: const Key('chat-appbar-persona-subtitle'),
                style: AppText.bodyXs(color: AppColors.grey400),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _PersonaAvatar extends StatelessWidget {
  const _PersonaAvatar({required this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: AppKuldevta.personaAvatarSize,
      height: AppKuldevta.personaAvatarSize,
      child: ClipOval(
        child: (imageUrl == null || imageUrl!.isEmpty)
            ? Container(
                color: AppColors.brand200,
                alignment: Alignment.center,
                child: const Icon(
                  Icons.temple_hindu_outlined,
                  color: AppColors.brand400,
                  size: 20,
                ),
              )
            : CachedNetworkImage(
                imageUrl: imageUrl!,
                fit: BoxFit.cover,
                placeholder: (_, _) => Container(color: AppColors.brand200),
                errorWidget: (_, _, _) => Container(
                  color: AppColors.brand200,
                  alignment: Alignment.center,
                  child: const Icon(
                    Icons.temple_hindu_outlined,
                    color: AppColors.brand400,
                    size: 20,
                  ),
                ),
              ),
      ),
    );
  }
}
