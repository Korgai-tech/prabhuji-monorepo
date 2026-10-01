-- Chatbot: RAGFlow-backed assistant.
--
-- Two tables and one enum. `chat_sessions` is one conversation, owned by a user
-- and pinned to a RAGFlow agent; `chat_messages` is the durable transcript.
--
-- On a `bot` row, `raw_response` holds the provider's entire response body as
-- JSONB (usage, retrieval reference, timings) and `provider_message_id` holds
-- RAGFlow's own message id. Both are NULL on a `user` row: the user's turn is
-- ours and the provider never saw it.
--
-- `provider_session_id` is nullable because RAGFlow only mints its session id
-- when it answers for the first time — the row exists before the handle does.
-- It is a secondary handle: `chat_sessions.id` remains conversation identity.
--
-- Both foreign keys CASCADE: deleting a user takes their whole chat history
-- with it, and deleting a session takes its messages. (Contrast the payment
-- tables, which are deliberately FK-free because a ledger must outlive its
-- user.) `"User"` is quoted because the table really is capitalised.

CREATE TYPE "chat_role" AS ENUM ('user', 'bot');

CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "agent_id" TEXT NOT NULL,
    "provider_session_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" "chat_role" NOT NULL,
    "content" TEXT NOT NULL,
    "provider_message_id" TEXT,
    "raw_response" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- Serves the only session read: this user's, newest first.
CREATE INDEX "chat_sessions_user_id_created_at_idx" ON "chat_sessions"("user_id", "created_at" DESC);

-- Serves the only message read: one session's transcript, newest first,
-- keyset-paged on (created_at DESC, id DESC).
CREATE INDEX "chat_messages_session_id_created_at_idx" ON "chat_messages"("session_id", "created_at" DESC);

ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
