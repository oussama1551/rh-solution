CREATE TYPE "notification_type" AS ENUM (
  'PENDING_APPROVAL',
  'APPROVAL_RESULT',
  'OVERTIME_DECLARED',
  'COMPENSATION_DECLARED',
  'SICK_LEAVE_DECLARED',
  'SYNC_ERROR',
  'CHAT_MESSAGE',
  'SYSTEM'
);

CREATE TYPE "chat_conversation_type" AS ENUM ('DIRECT', 'GROUP');

CREATE TABLE "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipient_user_id" UUID NOT NULL,
  "type" "notification_type" NOT NULL,
  "title" VARCHAR(180) NOT NULL,
  "message" TEXT NOT NULL,
  "entity_type" VARCHAR(120),
  "entity_id" UUID,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_conversations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" "chat_conversation_type" NOT NULL,
  "name" VARCHAR(160),
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_participants" (
  "conversation_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_read_at" TIMESTAMPTZ(6),
  CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("conversation_id", "user_id")
);

CREATE TABLE "chat_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "sender_id" UUID,
  "content" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "edited_at" TIMESTAMPTZ(6),
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_recipient_user_id_is_read_created_at_idx" ON "notifications"("recipient_user_id", "is_read", "created_at");
CREATE INDEX "notifications_type_idx" ON "notifications"("type");
CREATE INDEX "notifications_entity_type_entity_id_idx" ON "notifications"("entity_type", "entity_id");
CREATE INDEX "chat_conversations_created_by_idx" ON "chat_conversations"("created_by");
CREATE INDEX "chat_conversations_created_at_idx" ON "chat_conversations"("created_at");
CREATE INDEX "chat_participants_user_id_idx" ON "chat_participants"("user_id");
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");
CREATE INDEX "chat_messages_sender_id_idx" ON "chat_messages"("sender_id");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipient_user_id_fkey"
  FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_conversations"
  ADD CONSTRAINT "chat_conversations_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chat_participants"
  ADD CONSTRAINT "chat_participants_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_participants_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_messages_sender_id_fkey"
  FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
