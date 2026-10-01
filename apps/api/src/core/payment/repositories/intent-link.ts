/**
 * Find the UPI approval link anywhere in a provider's create-mandate response.
 *
 * Shared by every adapter: provider docs disagree on which field carries the
 * intent link and whether it is a raw `upi://` URI or an `https://` shortener,
 * and the mobile launcher handles either — so rather than hard-code a key that
 * would break silently (a mandate with no link the user can approve at), we
 * search the response for a plausible link-shaped value.
 *
 * `upi://` wins over `https://` when both are present: the intent URI opens the
 * payer's UPI app directly, while the shortener costs a redirect and a browser
 * hop. The search is depth-limited — a response is a payload, not a graph.
 */

const LINK_KEY_PATTERN = /uri|url|link|intent/i;
const MAX_LINK_DEPTH = 4;

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function findIntentLink(response: Record<string, unknown>): string | null {
  const found = collectLinks(response, 0);
  return found.upi ?? found.https;
}

function collectLinks(
  obj: Record<string, unknown>,
  depth: number
): { upi: string | null; https: string | null } {
  let upi: string | null = null;
  let https: string | null = null;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      // The key must look like a link AND the value must be one — either test
      // alone would match, say, a `redirect_url: ""` or a `message` quoting a
      // URL back at us.
      if (!LINK_KEY_PATTERN.test(key)) continue;
      if (!upi && value.startsWith("upi://")) upi = value;
      else if (!https && value.startsWith("https://")) https = value;
    } else if (isJsonObject(value) && depth < MAX_LINK_DEPTH) {
      const nested = collectLinks(value, depth + 1);
      upi = upi ?? nested.upi;
      https = https ?? nested.https;
    }
    if (upi) break; // Best match found; nothing better exists deeper.
  }

  return { upi, https };
}
