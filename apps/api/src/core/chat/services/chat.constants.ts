import { loadEnv } from "@api/shared/config";

/**
 * Which RAGFlow agent answers each A/B variant of the chatbot experiment.
 *
 * THIS MAP IS ALSO THE ENABLEMENT SWITCH. A variant that is absent from it —
 * today `control` — has no agent, and a user in that arm has chat turned off.
 * So "who gets chat" and "answered by whom" are one decision in one place, and
 * the control arm cannot be accidentally enabled by a second setting
 * disagreeing with this one.
 *
 * A CONSTANT, not configuration, for two reasons. The agent id reaches the
 * provider verbatim, so keeping the set of reachable agents in reviewed source
 * means an experiment console can never repoint our API key at an agent nobody
 * approved. And an arm is only meaningfully "live" once the code that serves it
 * exists, so adding one is a code change either way — a deploy is not the cost
 * it first looks like.
 *
 * Adding a variant: one line here. Retiring one: delete the line, and everyone
 * in that arm falls back to no chat on their next request.
 *
 * Values are typed `string | undefined` deliberately: this is keyed by a string
 * that arrives over the network, so a lookup MUST be allowed to miss. Without
 * the `undefined` an unknown variant would type as `string` and silently become
 * a nonexistent agent id on the wire.
 */
/**
 * TAM-263. `Prabhuji-Chat-Fixed-always-retrieve`, which replaced
 * `Prabhuji-Chat-Fixed` (f75b8dac9a1211f18455bf94535108a7). The old agent had
 * content search as an optional tool, and on about 1 content answer in 4 it
 * skipped the search and invented ids (art_1234 art_5678 art_9101), so the user
 * got no cards or unrelated ones. This one always searches before answering,
 * with a query written from the conversation, and may only return ids from
 * those results. Built and tested by `tools/content-agent-retrieval/`.
 */
const CONTENT_AGENT = "4c858abeb8a711f1976b35098b15915b";
const GITA_AGENT = "e1791026a07b11f18455bf94535108a7";
/**
 * TAM-165. Speaks as the user's own kuldevta, whose identity is injected per
 * conversation from `core/kuldevta` — so unlike the two agents above, this one
 * answers as a DIFFERENT deity for every user. A constant here rather than an
 * env var for the reason stated above: the agent id reaches the provider
 * verbatim, and an unreviewed id must not be able to reach our API key.
 */
const KULDEVTA_PERSONA_AGENT = "e25f6744a6a511f18e582d93545b9663";

export const VARIANT_AGENTS: Readonly<Record<string, string | undefined>> = {
  content_chat: CONTENT_AGENT,
  bhagwat_gita_chat: GITA_AGENT,
  kuldevta_chat: KULDEVTA_PERSONA_AGENT,
};

/**
 * The apiId chat evaluates on the shared abtesting service (TAM-173).
 *
 * Variant ids configured on that console must match `VARIANT_AGENTS` keys — an
 * unmapped id resolves to no agent and behaves as control, which is the
 * enablement rule above doing its job, not an error.
 */
export const CHAT_ABTEST_API_ID = "chat.agent";

/**
 * ⚑ THE CHAT PAYWALL SWITCH. Flip this one line to re-arm it.
 *
 * Published verbatim as `chatConfig.requiresPro` on `GET /users/me`, and it is
 * the ONLY input to whether the app Pro-gates chat. `false` (today) means chat
 * is free for every user in every arm; `true` restores the three client gates
 * exactly as they behaved before:
 *
 *   1. entry from the Home FAB    — `open_chat.dart`
 *   2. the khoj "Baat Karein" CTA — `chat_screen.dart:_onKuldevtaChatPressed`
 *   3. the send-time re-gate      — `chat_bloc.dart:_onSubmitted`
 *
 * ── WHY IT LIVES ON THE WIRE AND NOT IN THE APP ────────────────────────────
 * The gates used to be unconditional client code, so turning the paywall off
 * (or back on) meant an app release and then WAITING for users to take it —
 * with the old build still charging for a product we had made free. Publishing
 * the decision on the payload every launch already fetches means a shipped APK
 * obeys the flip on its next `/users/me`, which is the whole point of putting
 * it here rather than behind `AppConfig` or a Dart const.
 *
 * ── WHY A CONSTANT AND NOT AN ENV VAR ──────────────────────────────────────
 * The `ENABLE_*` flags in `shared/config/env.ts` reach ECS through four
 * Terraform files and a `pnpm deploy:infra`, so flipping one is not cheaper
 * than a code change — it is just a code change in a repo with a slower gate.
 * A constant keeps the switch reviewable in the diff that flips it. Promote it
 * to `boolFromString` if ops ever needs the flip WITHOUT a deploy; the wire
 * contract does not change when you do.
 *
 * ── WHAT THIS DOES NOT CONTROL ─────────────────────────────────────────────
 * Pro-only CONTENT CARDS attached to an agent's reply stay gated regardless:
 * `chat.content.ts` still strips `playUrl` for a non-Pro caller. Chat being
 * free must not become a backdoor around the aarti / books / mantras paywalls,
 * which gate the very same rows.
 *
 * The app now gates the card TAP on entitlement too, independently of this
 * flag (`chat_screen.dart:_gateContentTap` → the unified paywall, then the
 * content on a successful purchase). So keep stripping: the client relies on
 * `playUrl: null` for the lock badge, and serving the real URL to a free
 * caller would hand over the media the paywall is there to sell.
 */
export const CHAT_REQUIRES_PRO = false;

/**
 * True when this agent speaks as the caller's kuldevta and therefore needs the
 * deity identity injected. Compared by id, not by variant, because the id is
 * what the session was opened with — a variant remapped mid-conversation must
 * not change who the open session is talking to.
 */
export function isKuldevtaPersonaAgent(agentId: string): boolean {
  return agentId === KULDEVTA_PERSONA_AGENT;
}

/** The agent serving a variant, or `undefined` when that variant has none. */
export function agentForVariant(variant: string): string | undefined {
  return VARIANT_AGENTS[variant];
}

/**
 * The chat screen's opening state, served with the history so a first-time user
 * sees a greeting and something to tap rather than an empty box.
 *
 * Constants, like the agent map: this is copy, and copy that changes wants a
 * review and a diff. `order` is explicit rather than implied by array position
 * so the client can sort without depending on our serialization, and each entry
 * carries a stable `id` so taps are countable in analytics even after the text
 * is reworded or translated.
 */
export const CHAT_INTRO_TITLE = "Namaste";
export const CHAT_INTRO_SUBTITLE = "Aaj kya poochhna chahenge?";

export interface RecommendedMessage {
  id: string;
  order: number;
  text: string;
  /**
   * What KIND of thing this opener asks for, for analytics grouping — the chip
   * id identifies one chip, this identifies the class of intent behind it.
   *
   * Deliberately coarse and closed: a dimension only earns its place if it
   * still groups usefully once the copy is reworded, and a per-chip category
   * would just be `id` spelled twice.
   */
  category: "mood" | "content" | "horoscope" | "scripture";
}

/**
 * A named, versioned set of openers.
 *
 * `id` travels to the client so a tap can be attributed to the exact set the
 * user was shown. It is NOT derivable from the messages: two agents serve
 * different sets, and the same set changes over time. BUMP THE SUFFIX whenever
 * the messages change — an unchanged id across a copy change silently merges
 * two different experiments in the warehouse, which is the one failure this
 * field exists to prevent.
 */
export interface SuggestionSet {
  id: string;
  messages: readonly RecommendedMessage[];
}

export const CHAT_SUGGESTION_SET: SuggestionSet = {
  // TAM-178: `general_v1` → `general_v2` because all three messages were
  // rewritten. Bumping is the rule stated on `SuggestionSet`, not a formality —
  // the old and the new copy must not aggregate under one id.
  id: "general_v2",
  messages: [
    // NEW chip id, deliberately: the intent FLIPPED from happy ("Aaj man bhot
    // prassan h") to distressed. Reusing `happy_mood` would merge two opposite
    // behaviours under one id, which is the comparison a stable chip id exists
    // to enable.
    { id: "troubled_mood", order: 0, text: "Aaj mann bahut pareshan hai", category: "mood" },
    {
      // Same intent, corrected casing — id stays stable so taps remain
      // comparable across the rewording.
      id: "play_hanuman_chalisa",
      order: 1,
      text: "Hanuman Chalisa suna do",
      category: "content",
    },
    // Same intent ("today horoscope" → Hinglish), so the id stays too.
    { id: "today_horoscope", order: 2, text: "Aaj ka rashifal batao", category: "horoscope" },
  ],
};

/** Back-compat alias — the messages alone, for callers that need no set id. */
export const CHAT_RECOMMENDED_MESSAGES: readonly RecommendedMessage[] =
  CHAT_SUGGESTION_SET.messages;

/**
 * Openers for agents that need their own, keyed by AGENT rather than by
 * variant.
 *
 * What is worth suggesting is a property of what the bot can actually answer,
 * not of the experiment arm it happens to be serving: "hanuman chalisa suna do"
 * asks the Gita agent for a track it has no catalogue for, and reads as a dead
 * button. Keying by agent means the right openers follow that agent into any
 * arm it is later reused in.
 *
 * An agent absent from this map falls back to `CHAT_RECOMMENDED_MESSAGES`, so
 * adding an arm needs a line here only when its openers genuinely differ.
 */
const AGENT_SUGGESTION_SETS: Readonly<Record<string, SuggestionSet | undefined>> = {
  [GITA_AGENT]: {
    id: "gita_v1",
    messages: [
      {
        id: "krishna_arjun",
        order: 0,
        text: "Krishna ne Arjun se kya kaha?",
        category: "scripture",
      },
      { id: "gita_teaching", order: 1, text: "Gita kya sikhati he?", category: "scripture" },
      { id: "calm_mind", order: 2, text: "Mann shaant kaise rahe?", category: "mood" },
    ],
  },
  /**
   * TAM-177. The openers the user sees the moment their kuldevta starts
   * speaking — so they are addressed TO a deity ("Aapki pooja…"), not to an
   * assistant, which is why this agent cannot share the general set.
   *
   * Categories reuse the existing closed vocabulary rather than growing it: a
   * question about whether a wish will be granted is the same "tell me what is
   * coming" class as a rashifal, ritual guidance is `scripture`, and "what is
   * the right path for me" sits with the other personal-state openers.
   */
  [KULDEVTA_PERSONA_AGENT]: {
    id: "kuldevta_v1",
    messages: [
      {
        id: "wish_fulfilment",
        order: 0,
        text: "Meri manokamna poori hogi?",
        category: "horoscope",
      },
      {
        id: "pooja_day",
        order: 1,
        text: "Aapki pooja kis din karni chahiye?",
        category: "scripture",
      },
      { id: "right_path", order: 2, text: "Mere liye sahi raasta kya hai?", category: "mood" },
    ],
  },
};

/** The opener SET for an agent, falling back to the general one. */
export function suggestionSetForAgent(agentId: string | null): SuggestionSet {
  const forAgent = agentId === null ? undefined : AGENT_SUGGESTION_SETS[agentId];
  return forAgent ?? CHAT_SUGGESTION_SET;
}

/** The openers for an agent, falling back to the general set. */
export function recommendedForAgent(
  agentId: string | null
): readonly RecommendedMessage[] {
  return suggestionSetForAgent(agentId).messages;
}

/**
 * An intro clip AS STORED: a RELATIVE media key, never an absolute URL.
 *
 * See `introVideoForAgent` for why the host is absent by design.
 */
export interface IntroVideo {
  /**
   * The analytics `video_id`. Stable across re-encodes — the file behind `key`
   * can be replaced with a smaller encode without splitting the funnel.
   */
  videoId: string;
  /**
   * Relative media key, e.g. `chat/intro/content_chat.mp4`, resolved against
   * THIS environment's `MEDIA_PUBLIC_BASE_URL`. The ONLY form: stage and prod
   * each hold their own copy under the same name, so the constant stays
   * environment-blind.
   *
   * There is deliberately no absolute-URL escape hatch. One was written here
   * for the kuldevta clip on the belief that its host was a CDN shared by
   * every environment; it is in fact the STAGE media distribution
   * (`dcxgz5uyukynh.cloudfront.net` = stage's `media_public_base_url`), so the
   * hatch did precisely the thing the rule below exists to prevent — prod
   * serving stage's bucket. An asset that looks environment-neutral is the
   * case to distrust, not the case to exempt.
   */
  key: string;
  // NOTE: S3 keys are CASE-SENSITIVE and these match the uploaded object names
  // exactly (`Content_Chat.mp4`, not `content_chat.mp4`). No leading slash —
  // `introVideoForAgent` joins with one, and a second would give `//`.
  /**
   * The clip's MEASURED length in milliseconds. It is served to the client,
   * which paints a duration badge from it BEFORE the first frame decodes, and
   * it is never reconciled against the file — so a value copied off a design
   * mock instead of measured off the asset is wrong forever and silently.
   */
  durationMs: number;
  /** Optional still frame, also a relative key. */
  posterKey?: string;
}

/** An intro clip AS SERVED: absolute URLs, resolved per environment. */
export interface IntroVideoDto {
  videoId: string;
  url: string;
  durationMs: number;
  posterUrl?: string;
}

/**
 * The intro clip each agent opens with, keyed by AGENT for the same reason the
 * openers are: the clip pitches what THAT bot can do, so it must follow the
 * agent into whichever arm later serves it.
 *
 * ABSENCE IS THE NORMAL CASE, not an oversight. An agent with no finished
 * asset is deliberately missing here and resolves to `null`, which every
 * client renders as "no video card". Adding one later is a bucket upload plus
 * a line here — no app release.
 *
 * Values are `IntroVideo | undefined` for the same reason `VARIANT_AGENTS` is:
 * this is keyed by a string, so a lookup MUST be allowed to miss.
 *
 * ⚠️ DEPLOY GATE. An entry here is a PROMISE that an object exists at that key
 * in THIS environment's media bucket. A key with no object behind it does not
 * fail loudly — the client just sits on the poster with a play button that
 * never starts, which reads as a broken video rather than as no video. So an
 * entry must land in the same change as the upload to stage AND prod; if the
 * asset is not ready, leave the agent out and let it resolve to `null`, which
 * is a designed state.
 */
const AGENT_INTRO_VIDEOS: Readonly<Record<string, IntroVideo | undefined>> = {
  [CONTENT_AGENT]: {
    videoId: "content_chat_intro_v1",
    key: "chat/intro/Content_Chat.mp4",
    // MEASURED off `Content_Chat.mp4` (27.2 s, 832×1088) — not the `0:10` the
    // Figma frame mocks up. See the note on `IntroVideo.durationMs`.
    durationMs: 27_200,
  },
  [GITA_AGENT]: {
    videoId: "gita_chat_intro_v1",
    key: "chat/intro/Bhagvad_Gita.mp4",
    // MEASURED off `Bhagvad_Gita.mp4` (20.88 s, 832x1088).
    durationMs: 20_880,
  },
  [KULDEVTA_PERSONA_AGENT]: {
    videoId: "kuldevta_chat_intro_v1",
    // The clip the kuldevta intro has ALREADY been showing. It lived as a
    // hardcoded `kKuldevtaEntryHeroVideoUrl` constant in the entry screen this
    // ticket deletes; moving it here is what that file's own TODO asked for
    // ("read off chatConfig and delete the constant"), and it means the video
    // survives the screen.
    //
    // The hardcoded constant's host was stage's media CDN, and this key is the
    // object it was already pointing at inside stage's media bucket — so stage
    // resolves to the identical URL and needs no upload. PROD NEEDS THIS OBJECT
    // UPLOADED to its own media bucket under this key; the old constant was
    // serving prod users from stage, which is the bug this relative key fixes.
    key: "tutorial/use-audio-as-voice.mp4",
    // MEASURED off that asset: 23.76 s, 832x1088.
    durationMs: 23_760,
  },
};

/**
 * The intro clip for an agent, with its URLs resolved for THIS environment, or
 * `null` when the agent has none.
 *
 * The HOST comes from `MEDIA_PUBLIC_BASE_URL`, never from the map above: this
 * file ships to every environment, so a baked-in CDN host would make production
 * serve stage's bucket. (The same rule, and the same reasoning, as
 * `kuldevtaImageUrl()` in `core/kuldevta/index.ts` — the registry there and the
 * constants here are both environment-blind by construction.) Storing only the
 * key is also what lets stage and prod hold the same asset under the same name
 * and each resolve its own CDN with no code difference.
 *
 * `null` for a null agent (chat disabled for this user) and for an unknown one,
 * exactly like `suggestionSetForAgent` — except there is no fallback clip to
 * fall back to, and inventing one would show every agent the content pitch.
 */
export function introVideoForAgent(agentId: string | null): IntroVideoDto | null {
  const video = agentId === null ? undefined : AGENT_INTRO_VIDEOS[agentId];
  if (video === undefined) return null;
  const base = loadEnv().MEDIA_PUBLIC_BASE_URL;
  const url = `${base}/${video.key}`;
  return {
    videoId: video.videoId,
    url,
    durationMs: video.durationMs,
    ...(video.posterKey === undefined ? {} : { posterUrl: `${base}/${video.posterKey}` }),
  };
}

/**
 * The variant an agent id serves, or `null` when no live variant maps to it.
 *
 * The inverse of `agentForVariant`, and the reason the CMS transcript can label
 * a session with the arm it came from: `chat_sessions` stores the AGENT (the
 * thing the provider was actually called with), never the variant, because the
 * variant is a derived, re-derivable fact and the agent is not.
 *
 * `null` is a real and expected answer, not an error — it is what a session
 * opened against a since-retired agent returns, and the CMS shows it as an
 * unknown arm rather than mislabelling it as control. Derived from
 * `VARIANT_AGENTS` on every call rather than cached in a second map, so the two
 * cannot drift.
 */
export function variantForAgent(agentId: string): string | null {
  for (const [variant, id] of Object.entries(VARIANT_AGENTS)) {
    if (id === agentId) return variant;
  }
  return null;
}
