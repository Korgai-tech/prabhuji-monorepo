-- Records which deity a kuldevta persona session's PROVIDER conversation was
-- opened as. NULL on every non-persona agent, and NULL on persona sessions
-- that predate this column — both are read as "unknown", which the send path
-- treats as "no drift detected", so existing conversations keep working.
ALTER TABLE "chat_sessions" ADD COLUMN "persona_slug" TEXT;
