import type { ChatConfig } from "@api/core/chat/types";

/**
 * The Chat module's public facade — what OTHER modules may call.
 *
 * Exactly one operation, because exactly one thing about chat concerns anyone
 * else: whether this user has it. `core/users` publishes it on `GET /users/me`
 * so the app can hide the entry point rather than render a button that 403s.
 *
 * Deliberately does NOT expose sending or reading messages. A transcript is
 * reachable only through the authenticated chat routes, so no future caller can
 * quietly acquire another user's conversation through a service call.
 */
export interface IChatApi {
  /**
   * Whether the chatbot is available to this user, and which agent answers.
   *
   * Never throws: an unreachable experiment service resolves to disabled.
   */
  getChatConfig(userId: string): Promise<ChatConfig>;
}
