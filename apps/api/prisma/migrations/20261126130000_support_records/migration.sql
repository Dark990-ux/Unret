-- DropForeignKey
ALTER TABLE "SupportMessage" DROP CONSTRAINT "SupportMessage_ticketId_fkey";

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "firstResponseAt" TIMESTAMP(3),
ADD COLUMN     "reopenCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "resolutionSummary" TEXT,
ADD COLUMN     "resolvedById" TEXT;

-- CreateTable
CREATE TABLE "SupportTicketEvent" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "actorId" TEXT,
    "type" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicketEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportTicketEvent_ticketId_createdAt_idx" ON "SupportTicketEvent"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicketEvent_type_createdAt_idx" ON "SupportTicketEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_createdAt_idx" ON "SupportTicket"("createdAt");

-- CreateIndex
CREATE INDEX "SupportTicket_category_createdAt_idx" ON "SupportTicket"("category", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicketEvent" ADD CONSTRAINT "SupportTicketEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ── Fill the record for tickets that already exist ──
UPDATE "SupportTicket" t SET "firstResponseAt" = (
  SELECT min(m."createdAt") FROM "SupportMessage" m WHERE m."ticketId" = t.id AND m."fromStaff" AND NOT m.internal);
UPDATE "SupportTicket" SET "closedAt" = COALESCE("resolvedAt", "updatedAt") WHERE status = 'CLOSED';
INSERT INTO "SupportTicketEvent" (id, "ticketId", "actorId", type, "toValue", "createdAt")
  SELECT gen_random_uuid()::text, t.id, t."userId", 'created', t.category, t."createdAt" FROM "SupportTicket" t;
INSERT INTO "SupportTicketEvent" (id, "ticketId", "actorId", type, "createdAt")
  SELECT gen_random_uuid()::text, m."ticketId", m."authorId", CASE WHEN m.internal THEN 'note' WHEN m."fromStaff" THEN 'reply' ELSE 'person_reply' END, m."createdAt"
  FROM "SupportMessage" m WHERE m."createdAt" > (SELECT t."createdAt" + interval '1 second' FROM "SupportTicket" t WHERE t.id = m."ticketId");
INSERT INTO "SupportTicketEvent" (id, "ticketId", type, "toValue", "createdAt")
  SELECT gen_random_uuid()::text, t.id, 'status', t.status::text, t."resolvedAt" FROM "SupportTicket" t WHERE t."resolvedAt" IS NOT NULL;

-- ── Support records are permanent ──
-- Tickets, their messages and their history cannot be deleted, and a message's text cannot be changed.
-- The only change allowed on a message/event is clearing the link to an account that no longer exists.
-- A deliberate legal purge (e.g. an end-of-retention job) must run: SET LOCAL unret.allow_support_purge = 'on';
CREATE OR REPLACE FUNCTION unret_support_record_guard() RETURNS trigger AS $$
BEGIN
  IF current_setting('unret.allow_support_purge', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Support records are permanent: rows in % cannot be deleted', TG_TABLE_NAME USING ERRCODE = 'P0001';
  END IF;
  IF TG_TABLE_NAME = 'SupportMessage' THEN
    IF NEW.body IS DISTINCT FROM OLD.body OR NEW."ticketId" IS DISTINCT FROM OLD."ticketId" OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NEW.internal IS DISTINCT FROM OLD.internal OR NEW."fromStaff" IS DISTINCT FROM OLD."fromStaff"
       OR NEW."attachmentKeys" IS DISTINCT FROM OLD."attachmentKeys"
       OR (NEW."authorId" IS DISTINCT FROM OLD."authorId" AND NEW."authorId" IS NOT NULL) THEN
      RAISE EXCEPTION 'Support messages cannot be changed once sent' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'SupportTicketEvent' THEN
    IF NEW."ticketId" IS DISTINCT FROM OLD."ticketId" OR NEW.type IS DISTINCT FROM OLD.type OR NEW."fromValue" IS DISTINCT FROM OLD."fromValue"
       OR NEW."toValue" IS DISTINCT FROM OLD."toValue" OR NEW.note IS DISTINCT FROM OLD.note OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR (NEW."actorId" IS DISTINCT FROM OLD."actorId" AND NEW."actorId" IS NOT NULL) THEN
      RAISE EXCEPTION 'Support history cannot be changed' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER support_ticket_no_delete BEFORE DELETE ON "SupportTicket" FOR EACH ROW EXECUTE FUNCTION unret_support_record_guard();
CREATE TRIGGER support_message_permanent BEFORE UPDATE OR DELETE ON "SupportMessage" FOR EACH ROW EXECUTE FUNCTION unret_support_record_guard();
CREATE TRIGGER support_event_permanent BEFORE UPDATE OR DELETE ON "SupportTicketEvent" FOR EACH ROW EXECUTE FUNCTION unret_support_record_guard();
CREATE TRIGGER support_ticket_no_truncate BEFORE TRUNCATE ON "SupportTicket" FOR EACH STATEMENT EXECUTE FUNCTION unret_support_record_guard();
CREATE TRIGGER support_message_no_truncate BEFORE TRUNCATE ON "SupportMessage" FOR EACH STATEMENT EXECUTE FUNCTION unret_support_record_guard();
CREATE TRIGGER support_event_no_truncate BEFORE TRUNCATE ON "SupportTicketEvent" FOR EACH STATEMENT EXECUTE FUNCTION unret_support_record_guard();
