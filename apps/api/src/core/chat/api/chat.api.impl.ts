import type { ChatService } from "@api/core/chat/services";
import type { ChatConfig } from "@api/core/chat/types";
import type { IChatApi } from "./chat.api.js";

/** Thin adapter — the facade shape over the service. */
export class ChatApi implements IChatApi {
  constructor(private readonly service: ChatService) {}

  getChatConfig(userId: string): Promise<ChatConfig> {
    return this.service.getChatConfig(userId);
  }
}
