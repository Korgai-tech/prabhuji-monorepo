/**
 * Payer PII masking, shared by every provider adapter.
 *
 * Provider status responses carry the payer's VPA and legal name in the clear.
 * Both are personal financial data we have no product use for beyond showing
 * the user which account they authorised with, so each adapter masks at its
 * boundary (`getMandateStatus`) — the full values then exist only inside that
 * stack frame and are never returned, persisted (columns are `*_masked`), or
 * logged. The logic is identical across vendors, so it lives here.
 */

/**
 * `abhishek@okhdfcbank` → `ab***@okhdfcbank`.
 *
 * The handle (after `@`) is kept because it names the bank — exactly what makes
 * the masked string useful to a user confirming which account they authorised.
 * The local part identifies the person and is cut to two characters.
 */
export function maskVpa(vpa: string | null): string | null {
  if (!vpa) return null;
  const at = vpa.lastIndexOf("@");
  if (at < 1) return "***"; // No handle, or nothing before it — reveal nothing.
  const local = vpa.slice(0, at);
  const handle = vpa.slice(at);
  return `${local.slice(0, 2)}***${handle}`;
}

/**
 * `Abhishek Kumar` → `A*** K***`.
 *
 * First initial per word. Enough for a user to recognise their own name on a
 * confirmation screen, not enough to identify them from a leaked log line.
 */
export function maskPayerName(name: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.map((part) => `${part.slice(0, 1).toUpperCase()}***`).join(" ");
}
