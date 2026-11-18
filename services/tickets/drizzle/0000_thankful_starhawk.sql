CREATE SEQUENCE "public"."inc_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 20520 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."req_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10450 CACHE 1;--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"ticket_code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_code" text NOT NULL,
	"kind" text NOT NULL,
	"actor" text NOT NULL,
	"body" text,
	"metadata" jsonb,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"code" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"priority" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"affected" text NOT NULL,
	"requester_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_support_update_at" timestamp with time zone,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ticket_events" ADD CONSTRAINT "ticket_events_ticket_code_tickets_code_fk" FOREIGN KEY ("ticket_code") REFERENCES "public"."tickets"("code") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ticket_events_ticket_idx" ON "ticket_events" USING btree ("ticket_code");--> statement-breakpoint
CREATE UNIQUE INDEX "ticket_events_idempotency_key_uq" ON "ticket_events" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "tickets_requester_idx" ON "tickets" USING btree ("requester_id","status");