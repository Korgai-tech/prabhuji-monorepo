import { z } from "zod";

import { mediaUrl } from "@api/shared/schemas";

/**
 * Zod schemas for `POST /kuldevta/identify`.
 *
 * Single source of truth for the OpenAPI contract emitted by
 * `pnpm nx run api:openapi` and the generated TS + Dart clients.
 *
 * Every one of the six answers is free text from the family; empty answers
 * are allowed (the parser agent/matcher degrade gracefully to lower
 * assignment tiers rather than requiring a fully answered form).
 */
const answer = z.string().trim().max(200).default("");

export const IdentifyBody = z.object({
  surname: answer,
  ancestralPlace: answer,
  community: answer,
  gotra: answer,
  templeMentioned: answer,
  mandirPhoto: answer,
});
export type IdentifyInput = z.infer<typeof IdentifyBody>;

const IdentifyResult = z.object({
  slug: z.string(),
  nameRoman: z.string(),
  nameDevanagari: z.string(),
  /** `devi` or `devta` — drives the screen's copy ("Mata se baat karein"). */
  gender: z.string(),
  /** Deity artwork, on this environment's own CDN. */
  imageUrl: mediaUrl,
  /** The temple's place as one line: "Nagana, Barmer, Rajasthan". */
  location: z.string().nullable(),
  /**
   * "Ye aapki kuldevi kyu he?" — one line per piece of evidence, quoting what
   * the family said. Never empty: a fallback match says so plainly rather than
   * leaving the screen with nothing to render.
   */
  reasons: z.array(z.string()).min(1),
  temple: z.object({
    village: z.string().nullable(),
    district: z.string().nullable(),
    state: z.string().nullable(),
  }),
  tier: z.enum(["confirmed", "likely", "possible", "fallback"]),
  matchedOn: z.array(z.string()),
  /**
   * Present only when the match was genuinely ambiguous and the ladder broke
   * a tie; `slug` is always the first entry. Optional and unrendered — no
   * client reads it today. It is emitted so ambiguity rates can be measured
   * on real traffic before deciding whether to ask the family to choose.
   */
  candidates: z.array(z.string()).optional(),
});

/**
 * `{success,message,data}` — every controller in this codebase replies via
 * `sendSuccess`/`sendError` (see `@api/shared/response`), so the OpenAPI
 * contract must describe that envelope, not a bare payload, or
 * `check:openapi`/live responses would disagree with the schema.
 */
export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    success: z.literal(true),
    message: z.string(),
    data,
  });
}

export const IdentifyResponse = envelope(IdentifyResult).meta({
  id: "KuldevtaIdentifyResponse",
});



export const ErrorEnvelope = z
  .object({
    success: z.literal(false),
    message: z.string(),
    data: z.null(),
    errorCode: z.string().optional(),
  })
  .meta({ id: "KuldevtaErrorEnvelope" });
