import { createModuleLogger } from "@api/shared/logs";

const log = createModuleLogger("chat:crisis");

/**
 * Crisis detection for the chatbot — every agent, not just the persona one.
 *
 * The persona chat is served by a RAGFlow agent, not by this API. What lives
 * here is the SAFETY layer the API must own regardless of how the agent is
 * built: deciding when a user is in crisis and what they are shown instead of
 * the agent's reply.
 *
 * Two independent signals mean crisis, and they arrive by different routes:
 *
 *   1. The agent's own `DISTRESS_DETECTED` sentinel — the designed path. The
 *      persona prompt instructs the model to emit that literal string and
 *      nothing else when it sees any sign of self-harm.
 *
 *   2. An upstream content-policy rejection — the UNdesigned path. Azure's
 *      Responsible AI classifier screens the PROMPT, not just the completion,
 *      so on a long distress conversation it can reject the call before the
 *      model ever runs. The agent never gets the chance to emit its sentinel,
 *      and the rejection itself is then the only distress signal available.
 *
 * Signal 2 is why this module exists. Without it the user who most needs the
 * crisis card is exactly the one who cannot receive it.
 */

/** Why a turn was classified as a crisis. Recorded for monitoring. */
export type CrisisReason =
  /** The agent emitted its `DISTRESS_DETECTED` sentinel. */
  | "sentinel"
  /** Upstream rejected the prompt under a self-harm content policy. */
  | "content_policy_self_harm"
  /**
   * Upstream rejected the prompt under a content policy we could not
   * attribute to a category. Treated as a crisis — see `assessAgentError`.
   */
  | "content_policy_unknown";

/** The outcome of inspecting one agent turn. */
export interface TurnAssessment {
  /** Show the crisis card. The agent's reply must NOT be rendered. */
  crisis: boolean;
  /** Set when `crisis` is true. */
  reason: CrisisReason | null;
  /** True when the turn failed upstream. Not a crisis on its own. */
  upstreamFailure: boolean;
}

/**
 * The agent's distress sentinel, matched anywhere in a body rather than by
 * whole-string equality.
 *
 * Equality is the intuitive check and the wrong one, twice over. A model that
 * appends a period — `DISTRESS_DETECTED.` — has followed the instruction in
 * every way that matters, and equality would render that string verbatim to a
 * suicidal user as their kuldevta's reply. And a FAILED call wraps the same
 * sentinel inside RAGFlow's JSON envelope, where equality can never match.
 *
 * The boundary anchors keep it from firing on a longer identifier that merely
 * contains the token (`NO_DISTRESS_DETECTED_HERE`). Containment is the safe
 * direction here: the token is a screaming-caps ASCII identifier that cannot
 * arise from Hinglish devotional prose, so a false positive costs a helpline
 * shown to someone who did not need it, while a false negative is not
 * recoverable.
 */
const DISTRESS_SENTINEL_RE = /(?<![A-Za-z0-9_])DISTRESS_DETECTED(?![A-Za-z0-9_])/;

/**
 * Tokens that identify a content-policy rejection specifically, as opposed to
 * any other 400. Deliberately narrow: a malformed request and a blocked prompt
 * both surface as a 400, and only one of them means a person may be in danger.
 */
const CONTENT_POLICY_RE =
  /content[_ ]?policy|content[_ ]?filter|ResponsibleAIPolicyViolation|content_policy_violation/i;

/**
 * Azure names the tripped category in the error body. When we can read it, a
 * self-harm block is the one that means crisis — a prompt blocked for `hate`
 * or `sexual` should get a neutral decline, not a helpline.
 */
const SELF_HARM_RE = /self[_ ]?harm/i;

/**
 * What the user sees instead of the agent's reply when a turn is a crisis.
 *
 * NOTE FOR REVIEW: this copy is a placeholder pending PM and clinical
 * sign-off. The numbers are real and current, but the wording of a crisis
 * message is not an engineering decision.
 *
 *   Tele-MANAS 14416 — Government of India, 24/7, multilingual
 *   AASRA +91-9820466726 — 24/7
 *   Vandrevala 9999666555 — 24/7
 */
export const CRISIS_RESPONSE = {
  text: [
    "Aap jo mehsoos kar rahe hain, woh bahut bhaari hai — aur aapko iske saath akela nahi rehna chahiye.",
    "",
    "Kripya kisi se baat kijiye. Yeh log 24 ghante sunne ke liye maujood hain:",
    "",
    "Tele-MANAS: 14416",
    "AASRA: +91-9820466726",
    "Vandrevala: 9999666555",
    "",
    "Agar khatra abhi hai, toh 112 par call kijiye.",
  ].join("\n"),
  /** Signals the client to render the crisis card, not a normal chat bubble. */
  kind: "crisis" as const,
};

/** Pull a readable message out of an unknown thrown value. */
function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** True when a body carries the agent's distress sentinel. */
export function carriesDistressSentinel(value: unknown): boolean {
  const text = typeof value === "string" ? value : errorText(value);
  return DISTRESS_SENTINEL_RE.test(text);
}

/** True when the error is a content-policy rejection rather than any other failure. */
export function isContentPolicyRejection(error: unknown): boolean {
  return CONTENT_POLICY_RE.test(errorText(error));
}

/**
 * Inspect a SUCCESSFUL agent reply.
 *
 * The caller must not render `content` when `crisis` is true.
 */
export function assessAgentReply(content: string): TurnAssessment {
  if (carriesDistressSentinel(String(content ?? ""))) {
    return { crisis: true, reason: "sentinel", upstreamFailure: false };
  }
  return { crisis: false, reason: null, upstreamFailure: false };
}

/**
 * Inspect a FAILED agent call.
 *
 * A content-policy rejection is treated as a crisis signal, because Azure's
 * classifier screens the prompt and the conversation that trips it is
 * overwhelmingly a distress conversation — the agent never got to emit its
 * sentinel.
 *
 * When the tripped category is unreadable we still escalate. That direction is
 * chosen deliberately: showing a helpline to someone who tripped an unrelated
 * filter is confusing, while withholding one from someone in crisis is not
 * recoverable.
 *
 * Returns `crisis: false` for every non-policy failure (timeout, 5xx,
 * network), which the caller surfaces as a neutral retry message.
 */
export function assessAgentError(error: unknown): TurnAssessment {
  if (!isContentPolicyRejection(error)) {
    return { crisis: false, reason: null, upstreamFailure: true };
  }

  const reason: CrisisReason = SELF_HARM_RE.test(errorText(error))
    ? "content_policy_self_harm"
    : "content_policy_unknown";

  log.error(
    { reason },
    "content-policy rejection treated as a crisis turn — the agent never ran"
  );

  return { crisis: true, reason, upstreamFailure: true };
}

/**
 * Whether a failed call may be retried.
 *
 * A content-policy rejection is deterministic for the same conversation: the
 * classifier will reject it identically every time. Retrying wastes a round
 * trip and delays the crisis card for a user who needs it now.
 */
export function isRetryable(error: unknown): boolean {
  return !isContentPolicyRejection(error);
}
