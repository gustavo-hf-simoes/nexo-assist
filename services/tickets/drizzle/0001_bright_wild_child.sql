DROP INDEX "ticket_events_idempotency_key_uq";--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD COLUMN "requester_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_events_idempotency_key_uq" ON "ticket_events" USING btree ("ticket_code","idempotency_key");