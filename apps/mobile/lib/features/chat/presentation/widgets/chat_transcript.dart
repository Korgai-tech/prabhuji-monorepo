import 'package:flutter/material.dart';

import '../../../../api/generated/openapi.dart';
import '../../../../core/theme.dart';
import 'chat_bubble.dart';
import 'chat_content_card.dart';
import 'chat_date_separator.dart';

/// Transcript widget — the flex-fill zone inside `ChatScreen`. Renders
/// [messages] (stored newest-LAST in bloc state) as a reversed
/// `ListView.builder` so the newest bubble sits at the visible bottom and
/// pull-to-top drives pagination.
///
/// Item construction order (top → bottom, which equals oldest → newest
/// because the list is REVERSED):
///
///  1. Date-separator row inserted between two adjacent messages when
///     their `createdAt` gap crosses [AppChat.dateSeparatorThreshold].
///  2. The message bubble (user / bot / typing).
///  3. Any content cards accompanying a bot message (rendered as a Column
///     of cards below the bubble).
///
/// [showTypingIndicator] appends a synthetic typing bubble at the tail
/// (spec §Composing & sending — "Renders a TYPING bubble at the tail of
/// the transcript" as soon as the send fires).
///
/// [onCardTapped] fires when the user taps a card; the parent screen
/// dispatches `ChatContentCardTapped` on the bloc (which fires the
/// `chat_content_tapped` analytics event) and calls the module's play/
/// preview route via `GoRouter.push`.
class ChatTranscript extends StatefulWidget {
  const ChatTranscript({
    super.key,
    required this.messages,
    required this.showTypingIndicator,
    required this.hasMoreOlder,
    required this.onLoadOlder,
    required this.onCardTapped,
    this.paginating = false,
    this.activeCardKey,
    this.leadingRows = const <Widget>[],
    this.trailingRows = const <Widget>[],
    this.anchorTop = false,
  });

  /// Lay the thread out top-down instead of bottom-up.
  ///
  /// A `reverse: true` `ListView` parks content that is SHORTER than the
  /// viewport against the bottom edge. That is right for a conversation you
  /// join mid-flow — the newest message is where your eye already is — and it
  /// is what the ordinary chat transcript wants.
  ///
  /// It is wrong for the khoj thread, which every user starts from empty: the
  /// intro bubble and "Shuru Kijiye" would float at the bottom under a screen
  /// of blank space, where Figma `3934:14677` puts them directly under the
  /// header. Caught on-device — it is invisible in a widget test, which never
  /// looks at where short content settles.
  ///
  /// With this set the list runs top-down and auto-scrolls to the newest row
  /// as the thread grows, so a long khoj still behaves like a chat.
  final bool anchorTop;

  /// Rows rendered ABOVE every message-derived row, oldest-first — the seam
  /// that lets non-`ChatMessage` content live in the thread (TAM-177 R4).
  ///
  /// Two consumers:
  ///  * TAM-178's first-time intro block (video bubble + chips) — which must
  ///    be able to sit above a NON-empty transcript, something the either/or
  ///    empty-vs-transcript switch in `ChatScreen._buildReady` cannot express.
  ///  * TAM-177's khoj thread, which passes its ENTIRE conversation here with
  ///    `messages: const []`. The six khoj Q/A pairs never become server-side
  ///    `ChatMessage`s (`POST /kuldevta/identify` creates none, and the chat
  ///    service opens a fresh provider conversation on assignment), so they
  ///    are client-only rows by nature — which is also why "clear the khoj
  ///    Q&A on hand-off" is a no-op at the data layer.
  ///
  /// TRAP: the underlying `ListView` is `reverse: true`, so these must land at
  /// the list's LAST index to render at the visual TOP. `_buildRows` prepends
  /// them to the oldest→newest list, which the reversed `itemBuilder` then
  /// walks from the tail. Get this backwards and the intro block silently
  /// renders at the bottom of the thread.
  final List<Widget> leadingRows;

  /// Rows rendered BELOW every message-derived row and below the typing
  /// indicator — the khoj flow's "Pata Nahi" button and "Shuru Kijiye" CTA,
  /// which must stay pinned to the newest end of the conversation.
  final List<Widget> trailingRows;

  final List<ChatMessage> messages;
  final bool showTypingIndicator;
  final bool hasMoreOlder;
  final VoidCallback onLoadOlder;

  /// Fired on a content-card tap. Args: `(messageId, contentType,
  /// ChatContentItem)`. The card widget renders (see chat_content_card)
  /// but the navigation + analytics dispatch live at the parent.
  final void Function(
    String messageId,
    String contentType,
    ChatContentItem item,
  )
  onCardTapped;

  final bool paginating;

  /// Client-side "active" (last-tapped) transient — the card whose
  /// composite key matches this string paints the orange 2 dp variant.
  /// Composite key format: `${messageId}:${contentType}:${item.id}`.
  final String? activeCardKey;

  @override
  State<ChatTranscript> createState() => _ChatTranscriptState();
}

class _ChatTranscriptState extends State<ChatTranscript> {
  final _scrollController = ScrollController();

  /// Row count at the last auto-scroll, so the top-anchored thread only jumps
  /// when a row is actually added rather than on every rebuild.
  int _lastRowCount = 0;

  /// Viewport height at the last layout, so a SHRINK (the soft keyboard
  /// opening) can re-pin the newest end of a top-anchored thread.
  ///
  /// Why height and not `MediaQuery.viewInsetsOf(context).bottom`: on device
  /// the chat sits in the shell `Scaffold`'s body, and `Scaffold` strips the
  /// bottom view inset from the MediaQuery it hands its body — the keyboard
  /// reaches us ONLY as a smaller box. Watching the inset here works in a
  /// widget test and silently does nothing in the app.
  double? _lastViewportHeight;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_maybeLoadOlder);
  }

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _maybeLoadOlder() {
    // Reversed list — the OLDER end is at the *top* of the visible
    // viewport, which in reverse-list coordinates is the maxScrollExtent.
    if (!widget.hasMoreOlder || widget.paginating) return;
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 120) {
      widget.onLoadOlder();
    }
  }

  /// Re-pin the newest end when the viewport SHRINKS under a top-anchored
  /// thread — i.e. when the soft keyboard opens.
  ///
  /// A forward `ListView` keeps its pixel offset when the viewport shrinks, so
  /// the newest rows (the live khoj question and its action button, or the
  /// intro block) slide out below the fold and the thread looks stuck behind
  /// the keyboard. The reversed thread is already bottom-anchored and needs
  /// nothing — correcting it there would yank a user who is reading history.
  ///
  /// Only re-pins a reader who was ALREADY at the newest end: someone scrolled
  /// up into the backlog keeps their place when the keyboard appears.
  void _handleViewportHeight(double height) {
    final previous = _lastViewportHeight;
    _lastViewportHeight = height;
    if (!widget.anchorTop) return;
    if (previous == null || height >= previous - 0.5) return;
    if (!_scrollController.hasClients) return;
    // Measured BEFORE the new (smaller) viewport is applied, so this is where
    // the reader was standing when the keyboard started to open.
    final position = _scrollController.position;
    if (position.maxScrollExtent - position.pixels > _newestEndSlack) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
    });
  }

  /// How far from the newest end still counts as "at the newest end".
  static const double _newestEndSlack = 120;

  @override
  Widget build(BuildContext context) {
    // Build the flat list of transcript rows, oldest→newest, then reverse
    // for a `ListView.builder(reverse: true)` render.
    final rows = _buildRows();
    // Keep the newest row in view as the thread grows. Only needed in the
    // top-anchored mode — `reverse: true` gets this for free.
    if (widget.anchorTop && rows.length != _lastRowCount) {
      _lastRowCount = rows.length;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_scrollController.hasClients) return;
        _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
      });
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        _handleViewportHeight(constraints.maxHeight);
        return _buildList(rows);
      },
    );
  }

  Widget _buildList(List<Widget> rows) {
    return ListView.builder(
      key: const Key('chat-transcript-scroll'),
      controller: _scrollController,
      reverse: !widget.anchorTop,
      padding: const EdgeInsets.symmetric(
        horizontal: AppChat.screenPadding,
        vertical: AppSpacing.small,
      ),
      itemCount: rows.length,
      itemBuilder: (context, i) {
        // In the reversed list, visually-bottom (index 0) is the NEWEST row,
        // so walk the oldest→newest list from its tail. Top-anchored runs in
        // natural order.
        final row = widget.anchorTop ? rows[i] : rows[rows.length - 1 - i];
        return Padding(
          padding: EdgeInsets.only(bottom: AppChat.bubbleGap / 2),
          child: row,
        );
      },
    );
  }

  List<Widget> _buildRows() {
    // Oldest → newest. `leadingRows` go first so that, once the reversed
    // itemBuilder walks this list from the tail, they land at the visual TOP.
    final rows = <Widget>[...widget.leadingRows];
    DateTime? lastTimestamp;
    for (var i = 0; i < widget.messages.length; i++) {
      final msg = widget.messages[i];
      final needsSeparator =
          lastTimestamp == null ||
          msg.createdAt.difference(lastTimestamp).abs() >=
              AppChat.dateSeparatorThreshold;
      if (needsSeparator) {
        rows.add(
          ChatDateSeparator(
            key: Key('chat-date-${msg.id}'),
            timestamp: msg.createdAt,
          ),
        );
      }
      lastTimestamp = msg.createdAt;
      rows.add(_bubbleFor(msg));
      if (msg.role == ChatMessageRoleEnum.bot) {
        rows.addAll(_cardsFor(msg));
      }
    }
    if (widget.showTypingIndicator) {
      rows.add(
        const Padding(
          padding: EdgeInsets.only(top: AppChat.bubbleGap / 2),
          child: ChatBubble(
            key: Key('chat-typing-bubble'),
            variant: ChatBubbleVariant.typing,
          ),
        ),
      );
      rows.add(
        Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xSmall),
          child: Text(
            'Aapke liye theek cheez dhoondh raha hoon…',
            key: const Key('chat-typing-hint'),
            style: AppText.chatTypingHint(),
          ),
        ),
      );
    }
    rows.addAll(widget.trailingRows);
    return rows;
  }

  Widget _bubbleFor(ChatMessage msg) {
    final variant = msg.role == ChatMessageRoleEnum.user
        ? ChatBubbleVariant.user
        : ChatBubbleVariant.bot;
    return ChatBubble(
      key: Key('chat-bubble-${msg.id}'),
      variant: variant,
      message: msg.message,
    );
  }

  List<Widget> _cardsFor(ChatMessage msg) {
    // Enumerate the six content-type keys in a STABLE order — the server
    // always ships all six (empty when absent), and the client never
    // branches on undefined per spec §API Contract "#EXPORT_CRITICAL".
    final content = msg.content;
    final buckets = <String, List<ChatContentItem>>{
      'aarti': content.aarti,
      'bhajan': content.bhajan,
      'mantra': content.mantra,
      'ringtone': content.ringtone,
      'status': content.status,
      'wallpaper': content.wallpaper,
      'horoscope': content.horoscope,
    };
    final cards = <Widget>[];
    buckets.forEach((type, items) {
      for (final item in items) {
        final compositeKey = '${msg.id}:$type:${item.id}';
        cards.add(
          Padding(
            padding: const EdgeInsets.only(top: AppChat.bubbleGap),
            child: ChatContentCard(
              key: Key('chat-card-$compositeKey'),
              contentType: type,
              item: item,
              // Prefer the CMS-authored title shipped on the item; fall back
              // to the id only if the title is unexpectedly blank so the card
              // still renders something meaningful.
              title: _cardTitle(item),
              subtitle: _fallbackSubtitle(type),
              active: widget.activeCardKey == compositeKey,
              onTap: () => widget.onCardTapped(msg.id, type, item),
            ),
          ),
        );
      }
    });
    return cards;
  }

  /// Card title — the CMS-authored `title` shipped on the item, with the
  /// row id as a last-resort fallback for the unexpected empty-title case.
  /// The backend guarantees `title` is present on every row (Prisma
  /// `String` non-nullable across all five source tables), so the fallback
  /// is defensive: an empty string would render as blank space.
  static String _cardTitle(ChatContentItem item) {
    final t = item.title.trim();
    if (t.isNotEmpty) return t;
    return item.id;
  }

  static String? _fallbackSubtitle(String type) {
    switch (type) {
      case 'mantra':
        return 'Mantra';
      case 'aarti':
        return 'Aarti';
      case 'bhajan':
        return 'Bhajan';
      case 'wallpaper':
        return 'Wallpaper';
      case 'ringtone':
        return 'Ringtone';
      case 'status':
        return 'Status';
    }
    return null;
  }
}
