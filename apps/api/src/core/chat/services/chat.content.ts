import CONTENT_ID_MAP from "@api/core/chat/assets/content-id-map.json";
import { CHAT_CONTENT_TYPES } from "@api/core/chat/types";
import type {
  ChatContentType,
  ContentGroups,
  ContentItem,
} from "@api/core/chat/types";
import type { ContentRow } from "@api/core/chat/repositories";

/**
 * The agent's answer, unwrapped from the JSON document it replies with.
 *
 * Every field is optional because this is the AGENT's format, not our contract:
 * a prompt edit on their side must degrade to a plain-text reply here, never to
 * a 500. `replyText` falls back to the raw content so a message is always
 * readable even when the envelope changes shape.
 */
export interface ParsedAnswer {
  replyText: string;
  confidence: string | null;
  contentIds: string[];
  /**
   * What the agent decided this turn WAS — "horoscope", "followup",
   * "out_of_scope", "no_match" and so on. The agent's own vocabulary, passed
   * through unvalidated: it is analytics dimensioning, and a value we have not
   * seen before is a new intent to count, not a request to reject.
   *
   * `horoscope` is the single most common value in production, and dropping it
   * is why the client cannot tell a rashifal turn from any other and renders no
   * card for one. See `docs/PHASE-NOTES.md`.
   */
  intentType: string | null;
  /**
   * The deity the agent suggested worshipping this turn ("hanuman", "vishnu").
   *
   * Null on ~80% of turns and that is CORRECT — most turns recommend no deity
   * at all. Not to be confused with the kuldevta persona's own identity, which
   * is who the bot IS rather than what it recommended, and reaches the client
   * as `chatConfig.kuldeveta_name` instead.
   */
  recommendedDeity: string | null;
  /** Suggested repetitions for a jaap, when the agent prescribed one. */
  jaapCount: number | null;
  /** Why the agent declined — "financial", "theology", "politics", "other". */
  declineCategory: string | null;
}

/**
 * The catalogue id map: the agent's stable content tags (`art_0011`,
 * `mnt_0066`) to our production row ids.
 *
 * Bundled as a module rather than read from disk — esbuild inlines it, so there
 * is no asset-copy step and no path to resolve differently under tsx and under
 * the bundle.
 *
 * `id` is a primary key for every type EXCEPT `horoscope`, where it is the
 * stable zodiac slug ("aries"). `zodiac_sign` rows are seeded with generated
 * uuids, so their keys differ per environment and could not live in a
 * committed file — see the horoscope branch of `ContentRepository`.
 */
const ID_MAP = CONTENT_ID_MAP as Record<
  string,
  { type: string; id: string } | undefined
>;

/** An all-keys-present, all-empty group map. */
export function emptyContentGroups(): ContentGroups {
  const groups = {} as ContentGroups;
  for (const type of CHAT_CONTENT_TYPES) groups[type] = [];
  return groups;
}

function isContentType(value: string): value is ChatContentType {
  return (CHAT_CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * Pull the answer out of the agent's reply.
 *
 * Agents trail machine-readable markers after the answer — `[SUGGESTED: ...]`
 * from the content agent, `[META: verses=2.48; flag=none]` from the Gita one —
 * and both are cut here, because they are addressed to us and not to the reader.
 * Neither can occur inside the JSON envelope: a literal newline is illegal
 * inside a JSON string, so a trailer always sits outside the document.
 *
 * Anything unparseable is returned as trimmed prose with no content — the Gita
 * agent replies this way ALWAYS, so this is a supported shape and not merely a
 * guard: a garbled envelope costs the recommendations, never the message.
 */
export function parseAnswer(raw: string): ParsedAnswer {
  const jsonPart = raw.split("\n[SUGGESTED:")[0] ?? raw;
  const prose = (jsonPart.split("\n[META:")[0] ?? jsonPart).trim();
  try {
    const parsed: unknown = JSON.parse(unfence(jsonPart));
    if (typeof parsed !== "object" || parsed === null) return proseOnly(prose);
    const doc = parsed as {
      reply_text?: unknown;
      confidence?: unknown;
      content_ids?: unknown;
      intent_type?: unknown;
      recommended_deity?: unknown;
      jaap_count?: unknown;
      decline_category?: unknown;
    };
    return {
      replyText:
        typeof doc.reply_text === "string" && doc.reply_text.length > 0
          ? doc.reply_text
          : prose,
      confidence: typeof doc.confidence === "string" ? doc.confidence : null,
      contentIds: Array.isArray(doc.content_ids)
        ? doc.content_ids.filter((id): id is string => typeof id === "string")
        : [],
      intentType: str(doc.intent_type),
      recommendedDeity: str(doc.recommended_deity),
      // `Number.isFinite` and not `typeof === "number"`: JSON admits NaN and
      // Infinity through no literal, but a non-finite value would serialize to
      // `null` anyway and reach the client as a lie about its own type.
      jaapCount: typeof doc.jaap_count === "number" && Number.isFinite(doc.jaap_count)
        ? doc.jaap_count
        : null,
      declineCategory: str(doc.decline_category),
    };
  } catch {
    return proseOnly(prose);
  }
}

/**
 * The envelope with a markdown code fence around it removed.
 *
 * The content agent is told never to fence its JSON and still does, mostly on
 * turns where it called its search tool first. A fenced envelope fails
 * `JSON.parse`, so the reader was shown the raw JSON as the message and lost
 * the content cards. Only a fence wrapping the WHOLE envelope is removed:
 * a fence inside prose is prose, and is left for the prose path.
 */
const WHOLE_FENCE = /^\s*```[a-z]*[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```\s*$/i;

function unfence(text: string): string {
  return WHOLE_FENCE.exec(text)?.[1] ?? text;
}

/** A non-empty string, or null — the agent writes JSON `null` for "not set". */
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The shape for a reply that carries no envelope at all.
 *
 * Two of the three live agents answer this way ALWAYS — the Gita agent replies
 * in prose with a `[META:]` trailer, the kuldevta persona in bare prose — so
 * this is the majority path, not an error path. Every analytics field is null
 * for them, which the client must be ready for.
 */
export function proseOnly(prose: string): ParsedAnswer {
  return {
    replyText: prose,
    confidence: null,
    contentIds: [],
    intentType: null,
    recommendedDeity: null,
    jaapCount: null,
    declineCategory: null,
  };
}

/**
 * Translate the agent's content tags into `(type -> row ids)` for the batch
 * lookup. Unknown tags are dropped silently: the agent's catalogue and this map
 * are versioned independently, and a tag we cannot place is a missing
 * recommendation, not a failed request.
 */
export function resolveContentIds(
  contentIds: readonly string[]
): Map<ChatContentType, string[]> {
  const byType = new Map<ChatContentType, string[]>();
  for (const tag of contentIds) {
    const entry = ID_MAP[tag];
    if (!entry || !isContentType(entry.type)) continue;
    const bucket = byType.get(entry.type);
    if (bucket) bucket.push(entry.id);
    else byType.set(entry.type, [entry.id]);
  }
  return byType;
}

/**
 * One agent tag placed against our catalogue, or reported as unplaceable.
 *
 * `resolveContentIds` deliberately DROPS a tag it cannot place, because a
 * mobile caller can do nothing with it — but the CMS transcript exists partly
 * to answer "why did this recommendation render empty in the app", and a
 * silently dropped tag is exactly the answer it needs to show. So the tag is
 * kept and the failure reported, rather than the whole entry disappearing.
 */
export interface ContentTagLookup {
  tag: string;
  /** Null when the tag is absent from the id map, or maps to an unknown type. */
  type: ChatContentType | null;
  /** Our row id for the tag. Null whenever `type` is. */
  id: string | null;
}

/**
 * Place one agent tag against the id map, WITHOUT dropping it on a miss.
 *
 * The per-tag counterpart to `resolveContentIds`, which returns `(type -> ids)`
 * for the batch query and therefore cannot say which tag produced which id.
 * Both read the same `ID_MAP`, so they cannot disagree about what a tag means.
 */
export function lookupContentTag(tag: string): ContentTagLookup {
  const entry = ID_MAP[tag];
  if (!entry || !isContentType(entry.type)) return { tag, type: null, id: null };
  return { tag, type: entry.type, id: entry.id };
}

/**
 * Group resolved rows for the wire, withholding Pro-only play URLs from free
 * callers.
 *
 * The icon is ALWAYS served — it is free card art on every other surface, and a
 * recommendation the user cannot see is worse than one they cannot play.
 */
export function groupContent(
  rows: readonly ContentRow[],
  isPro: boolean
): ContentGroups {
  const groups = emptyContentGroups();
  for (const row of rows) {
    const item: ContentItem = {
      id: row.id,
      title: row.title,
      playUrl: row.gated && !isPro ? null : row.playUrl,
      icon: row.icon,
    };
    groups[row.type].push(item);
  }
  return groups;
}
