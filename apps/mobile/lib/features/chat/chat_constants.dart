/// TAM-166 — Kuldevta persona agent id (client-side mirror).
///
/// Verbatim mirror of `apps/api/src/core/chat/services/chat.constants.ts:34`:
///
/// ```ts
/// const KULDEVTA_PERSONA_AGENT = 'e25f6744a6a511f18e582d93545b9663';
/// ```
///
/// The client uses this constant ONLY as a UI-branch predicate:
///
///   * `AppShellScaffold` reads it to decide between mounting the discovery
///     flow (`kuldevtaAssigned == false`) and the existing chat screen
///     (`kuldevtaAssigned == true`).
///   * `ChatScreen._AppBar` reads it to decide between the persona-header
///     variant and TAM-164's static "Prabhuji Chat" header.
///
/// It is NEVER used as a wire value — `POST /chat/messages`'s `agentId` is
/// always sourced from `chatConfig.agentId` on `/users/me` or
/// `/chat/history`, per TAM-164's security note. A rotation of the
/// server-side constant needs a lockstep update here; anything less and
/// the persona-header branch silently falls back to the generic header for
/// every user in the arm.
const String kKuldevtaPersonaAgentId = 'e25f6744a6a511f18e582d93545b9663';
