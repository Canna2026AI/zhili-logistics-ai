CREATE TABLE "accepted_quote_order_links" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"quote_id" text NOT NULL,
	"quote_option_id" text NOT NULL,
	"quote_acceptance_id" text NOT NULL,
	"quote_version_id" text NOT NULL,
	"accepted_quote_version" bigint NOT NULL,
	"order_id" text NOT NULL,
	"waybill_id" text NOT NULL,
	"accepted_by_subject_id" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accepted_quote_order_links_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "accepted_quote_order_links_order_unique" UNIQUE("tenant_id","order_id"),
	CONSTRAINT "accepted_quote_order_links_waybill_unique" UNIQUE("tenant_id","waybill_id"),
	CONSTRAINT "accepted_quote_order_links_id_ulid_check" CHECK ("accepted_quote_order_links"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "accepted_quote_order_links_tenant_id_ulid_check" CHECK ("accepted_quote_order_links"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "accepted_quote_order_links_quote_version_check" CHECK (accepted_quote_version >= 1),
	CONSTRAINT "accepted_quote_order_links_version_check" CHECK (version >= 1),
	CONSTRAINT "accepted_quote_order_links_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "accepted_quote_order_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "bill_of_lading_waybills" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"bill_of_lading_id" text NOT NULL,
	"waybill_id" text NOT NULL,
	"item_sequence" integer NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bill_of_lading_waybills_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "bill_of_lading_waybills_waybill_unique" UNIQUE("tenant_id","bill_of_lading_id","waybill_id"),
	CONSTRAINT "bill_of_lading_waybills_sequence_unique" UNIQUE("tenant_id","bill_of_lading_id","item_sequence"),
	CONSTRAINT "bill_of_lading_waybills_id_ulid_check" CHECK ("bill_of_lading_waybills"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "bill_of_lading_waybills_tenant_id_ulid_check" CHECK ("bill_of_lading_waybills"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "bill_of_lading_waybills_sequence_check" CHECK (item_sequence >= 1),
	CONSTRAINT "bill_of_lading_waybills_version_check" CHECK (version >= 1),
	CONSTRAINT "bill_of_lading_waybills_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "bill_of_lading_waybills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "declaration_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"declaration_id" text NOT NULL,
	"attachment_id" text,
	"attachment_ref" text NOT NULL,
	"item_sequence" integer NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "declaration_attachments_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "declaration_attachments_ref_unique" UNIQUE("tenant_id","declaration_id","attachment_ref"),
	CONSTRAINT "declaration_attachments_sequence_unique" UNIQUE("tenant_id","declaration_id","item_sequence"),
	CONSTRAINT "declaration_attachments_id_ulid_check" CHECK ("declaration_attachments"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "declaration_attachments_tenant_id_ulid_check" CHECK ("declaration_attachments"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "declaration_attachments_ref_check" CHECK (length(btrim(attachment_ref)) >= 1),
	CONSTRAINT "declaration_attachments_sequence_check" CHECK (item_sequence >= 1),
	CONSTRAINT "declaration_attachments_version_check" CHECK (version >= 1),
	CONSTRAINT "declaration_attachments_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "declaration_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "delivery_task_waybills" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"delivery_task_id" text NOT NULL,
	"waybill_id" text NOT NULL,
	"item_sequence" integer NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_task_waybills_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "delivery_task_waybills_waybill_unique" UNIQUE("tenant_id","delivery_task_id","waybill_id"),
	CONSTRAINT "delivery_task_waybills_sequence_unique" UNIQUE("tenant_id","delivery_task_id","item_sequence"),
	CONSTRAINT "delivery_task_waybills_id_ulid_check" CHECK ("delivery_task_waybills"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "delivery_task_waybills_tenant_id_ulid_check" CHECK ("delivery_task_waybills"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "delivery_task_waybills_sequence_check" CHECK (item_sequence >= 1),
	CONSTRAINT "delivery_task_waybills_version_check" CHECK (version >= 1),
	CONSTRAINT "delivery_task_waybills_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "delivery_task_waybills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fba_shipment_cartons" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"fba_shipment_link_id" text NOT NULL,
	"carton_ref" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fba_shipment_cartons_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "fba_shipment_cartons_ref_unique" UNIQUE("tenant_id","fba_shipment_link_id","carton_ref"),
	CONSTRAINT "fba_shipment_cartons_id_ulid_check" CHECK ("fba_shipment_cartons"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "fba_shipment_cartons_tenant_id_ulid_check" CHECK ("fba_shipment_cartons"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "fba_shipment_cartons_ref_check" CHECK (length(btrim(carton_ref)) >= 1),
	CONSTRAINT "fba_shipment_cartons_version_check" CHECK (version >= 1),
	CONSTRAINT "fba_shipment_cartons_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "fba_shipment_cartons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fba_shipment_links" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"load_unit_id" text NOT NULL,
	"amazon_shipment_id" text NOT NULL,
	"status" text DEFAULT 'LINKED' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fba_shipment_links_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "fba_shipment_links_amazon_unique" UNIQUE("tenant_id","amazon_shipment_id"),
	CONSTRAINT "fba_shipment_links_id_ulid_check" CHECK ("fba_shipment_links"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "fba_shipment_links_tenant_id_ulid_check" CHECK ("fba_shipment_links"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "fba_shipment_links_status_check" CHECK (status IN ('LINKED', 'CONFIRMED', 'CANCELLED')),
	CONSTRAINT "fba_shipment_links_version_check" CHECK (version >= 1),
	CONSTRAINT "fba_shipment_links_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "fba_shipment_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "label_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"waybill_id" text NOT NULL,
	"format" text NOT NULL,
	"copies" integer NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"object_ref" text,
	"last_error" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "label_jobs_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "label_jobs_id_ulid_check" CHECK ("label_jobs"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "label_jobs_tenant_id_ulid_check" CHECK ("label_jobs"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "label_jobs_format_check" CHECK (format IN ('A4', '100X150')),
	CONSTRAINT "label_jobs_copies_check" CHECK (copies BETWEEN 1 AND 100),
	CONSTRAINT "label_jobs_status_check" CHECK (status IN ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED')),
	CONSTRAINT "label_jobs_result_check" CHECK ((status = 'SUCCEEDED' AND object_ref IS NOT NULL AND last_error IS NULL) OR (status = 'FAILED' AND last_error IS NOT NULL) OR (status IN ('QUEUED', 'PROCESSING') AND object_ref IS NULL AND last_error IS NULL)),
	CONSTRAINT "label_jobs_version_check" CHECK (version >= 1),
	CONSTRAINT "label_jobs_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "label_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "last_mile_charge_generation_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"generation_id" text NOT NULL,
	"delivery_task_id" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "last_mile_charge_generation_tasks_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "last_mile_charge_generation_tasks_task_unique" UNIQUE("tenant_id","generation_id","delivery_task_id"),
	CONSTRAINT "last_mile_charge_generation_tasks_id_ulid_check" CHECK ("last_mile_charge_generation_tasks"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_charge_generation_tasks_tenant_id_ulid_check" CHECK ("last_mile_charge_generation_tasks"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_charge_generation_tasks_version_check" CHECK (version >= 1),
	CONSTRAINT "last_mile_charge_generation_tasks_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "last_mile_charge_generation_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "last_mile_charge_generations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"billing_date" date NOT NULL,
	"currency" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"outbox_dedupe_key" text NOT NULL,
	"last_error" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "last_mile_charge_generations_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "last_mile_charge_generations_request_unique" UNIQUE("tenant_id","request_hash"),
	CONSTRAINT "last_mile_charge_generations_outbox_unique" UNIQUE("tenant_id","outbox_dedupe_key"),
	CONSTRAINT "last_mile_charge_generations_id_ulid_check" CHECK ("last_mile_charge_generations"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_charge_generations_tenant_id_ulid_check" CHECK ("last_mile_charge_generations"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_charge_generations_currency_check" CHECK (currency ~ '^[A-Z]{3}$'),
	CONSTRAINT "last_mile_charge_generations_hash_check" CHECK (request_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "last_mile_charge_generations_status_check" CHECK (status IN ('QUEUED', 'COMPLETED', 'FAILED')),
	CONSTRAINT "last_mile_charge_generations_version_check" CHECK (version >= 1),
	CONSTRAINT "last_mile_charge_generations_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "last_mile_charge_generations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "last_mile_intake_expected_waybills" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"intake_id" text NOT NULL,
	"waybill_id" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "last_mile_intake_expected_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "last_mile_intake_expected_waybill_unique" UNIQUE("tenant_id","intake_id","waybill_id"),
	CONSTRAINT "last_mile_intake_expected_id_ulid_check" CHECK ("last_mile_intake_expected_waybills"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_intake_expected_tenant_id_ulid_check" CHECK ("last_mile_intake_expected_waybills"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_intake_expected_version_check" CHECK (version >= 1),
	CONSTRAINT "last_mile_intake_expected_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "last_mile_intake_expected_waybills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "last_mile_intake_scans" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"intake_id" text NOT NULL,
	"device_event_id" text NOT NULL,
	"waybill_id" text NOT NULL,
	"condition" text NOT NULL,
	"note" text,
	"scanned_at" timestamp with time zone NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "last_mile_intake_scans_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "last_mile_intake_scans_event_unique" UNIQUE("tenant_id","intake_id","device_event_id"),
	CONSTRAINT "last_mile_intake_scans_waybill_unique" UNIQUE("tenant_id","intake_id","waybill_id"),
	CONSTRAINT "last_mile_intake_scans_id_ulid_check" CHECK ("last_mile_intake_scans"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_intake_scans_tenant_id_ulid_check" CHECK ("last_mile_intake_scans"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_intake_scans_condition_check" CHECK (condition IN ('ACCEPTED', 'DAMAGED', 'MISSING')),
	CONSTRAINT "last_mile_intake_scans_version_check" CHECK (version >= 1),
	CONSTRAINT "last_mile_intake_scans_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "last_mile_intake_scans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "last_mile_intakes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"intake_no" text NOT NULL,
	"station_id" text NOT NULL,
	"source_type" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"expected_count" integer NOT NULL,
	"scanned_count" integer DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "last_mile_intakes_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "last_mile_intakes_number_unique" UNIQUE("tenant_id","intake_no"),
	CONSTRAINT "last_mile_intakes_id_ulid_check" CHECK ("last_mile_intakes"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_intakes_tenant_id_ulid_check" CHECK ("last_mile_intakes"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "last_mile_intakes_source_check" CHECK (source_type IN ('LINEHAUL', 'PARTNER')),
	CONSTRAINT "last_mile_intakes_status_check" CHECK (status IN ('OPEN', 'RECONCILING', 'CLOSED')),
	CONSTRAINT "last_mile_intakes_count_check" CHECK (expected_count >= 0 AND scanned_count >= 0),
	CONSTRAINT "last_mile_intakes_version_check" CHECK (version >= 1),
	CONSTRAINT "last_mile_intakes_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "last_mile_intakes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "load_unit_waybills" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"load_unit_id" text NOT NULL,
	"waybill_id" text NOT NULL,
	"item_sequence" integer NOT NULL,
	"attached_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "load_unit_waybills_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "load_unit_waybills_waybill_unique" UNIQUE("tenant_id","load_unit_id","waybill_id"),
	CONSTRAINT "load_unit_waybills_sequence_unique" UNIQUE("tenant_id","load_unit_id","item_sequence"),
	CONSTRAINT "load_unit_waybills_id_ulid_check" CHECK ("load_unit_waybills"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "load_unit_waybills_tenant_id_ulid_check" CHECK ("load_unit_waybills"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "load_unit_waybills_sequence_check" CHECK (item_sequence >= 1),
	CONSTRAINT "load_unit_waybills_version_check" CHECK (version >= 1),
	CONSTRAINT "load_unit_waybills_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "load_unit_waybills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "login_throttle_buckets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"login_key_hash" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"blocked_until" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "login_throttle_buckets_key_unique" UNIQUE("login_key_hash"),
	CONSTRAINT "login_throttle_buckets_id_ulid_check" CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "login_throttle_buckets_tenant_id_ulid_check" CHECK (tenant_id IS NULL OR tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "login_throttle_buckets_hash_check" CHECK (login_key_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "login_throttle_buckets_failures_check" CHECK (failure_count >= 0),
	CONSTRAINT "login_throttle_buckets_version_check" CHECK (version >= 1),
	CONSTRAINT "login_throttle_buckets_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
CREATE TABLE "order_package_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"order_id" text NOT NULL,
	"package_sequence" integer NOT NULL,
	"package_ref" text NOT NULL,
	"package_type" text,
	"weight_kg" numeric(20, 6) NOT NULL,
	"length_cm" numeric(20, 6) NOT NULL,
	"width_cm" numeric(20, 6) NOT NULL,
	"height_cm" numeric(20, 6) NOT NULL,
	"commodity_description" text,
	"snapshot_version" bigint DEFAULT 1 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_package_snapshots_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "order_package_snapshots_sequence_unique" UNIQUE("tenant_id","order_id","snapshot_version","package_sequence"),
	CONSTRAINT "order_package_snapshots_id_ulid_check" CHECK ("order_package_snapshots"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "order_package_snapshots_tenant_id_ulid_check" CHECK ("order_package_snapshots"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "order_package_snapshots_sequence_check" CHECK (package_sequence >= 1),
	CONSTRAINT "order_package_snapshots_dimensions_check" CHECK (weight_kg > 0 AND length_cm > 0 AND width_cm > 0 AND height_cm > 0),
	CONSTRAINT "order_package_snapshots_snapshot_version_check" CHECK (snapshot_version >= 1),
	CONSTRAINT "order_package_snapshots_version_check" CHECK (version >= 1),
	CONSTRAINT "order_package_snapshots_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "order_package_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "partner_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text,
	"contact_email" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_contacts_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "partner_contacts_id_ulid_check" CHECK ("partner_contacts"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "partner_contacts_tenant_id_ulid_check" CHECK ("partner_contacts"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "partner_contacts_name_check" CHECK (length(btrim(contact_name)) BETWEEN 1 AND 160),
	CONSTRAINT "partner_contacts_channel_check" CHECK (contact_phone IS NOT NULL OR contact_email IS NOT NULL),
	CONSTRAINT "partner_contacts_version_check" CHECK (version >= 1),
	CONSTRAINT "partner_contacts_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "partner_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "partner_event_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"external_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"payload_ref" text NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"last_error" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_event_receipts_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "partner_event_receipts_external_unique" UNIQUE("tenant_id","partner_id","external_event_id"),
	CONSTRAINT "partner_event_receipts_id_ulid_check" CHECK ("partner_event_receipts"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "partner_event_receipts_tenant_id_ulid_check" CHECK ("partner_event_receipts"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "partner_event_receipts_status_check" CHECK (status IN ('RECEIVED', 'QUEUED', 'APPLIED', 'REJECTED')),
	CONSTRAINT "partner_event_receipts_error_check" CHECK ((status = 'REJECTED' AND last_error IS NOT NULL) OR status <> 'REJECTED'),
	CONSTRAINT "partner_event_receipts_version_check" CHECK (version >= 1),
	CONSTRAINT "partner_event_receipts_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "partner_event_receipts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "partner_event_replay_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"partner_event_receipt_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"reason" text NOT NULL,
	"requested_by_subject_id" text NOT NULL,
	"status" text DEFAULT 'QUEUED' NOT NULL,
	"outbox_dedupe_key" text NOT NULL,
	"last_error" text,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "partner_event_replay_attempts_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "partner_event_replay_attempts_number_unique" UNIQUE("tenant_id","partner_event_receipt_id","attempt_number"),
	CONSTRAINT "partner_event_replay_attempts_outbox_unique" UNIQUE("tenant_id","outbox_dedupe_key"),
	CONSTRAINT "partner_event_replay_attempts_id_ulid_check" CHECK ("partner_event_replay_attempts"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "partner_event_replay_attempts_tenant_id_ulid_check" CHECK ("partner_event_replay_attempts"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "partner_event_replay_attempts_number_check" CHECK (attempt_number >= 1),
	CONSTRAINT "partner_event_replay_attempts_status_check" CHECK (status IN ('QUEUED', 'APPLIED', 'FAILED')),
	CONSTRAINT "partner_event_replay_attempts_version_check" CHECK (version >= 1),
	CONSTRAINT "partner_event_replay_attempts_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "partner_event_replay_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pod_version_media" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"pod_version_id" text NOT NULL,
	"media_reservation_id" text NOT NULL,
	"item_sequence" integer NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pod_version_media_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "pod_version_media_reservation_unique" UNIQUE("tenant_id","pod_version_id","media_reservation_id"),
	CONSTRAINT "pod_version_media_sequence_unique" UNIQUE("tenant_id","pod_version_id","item_sequence"),
	CONSTRAINT "pod_version_media_id_ulid_check" CHECK ("pod_version_media"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "pod_version_media_tenant_id_ulid_check" CHECK ("pod_version_media"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "pod_version_media_sequence_check" CHECK (item_sequence >= 1),
	CONSTRAINT "pod_version_media_version_check" CHECK (version >= 1),
	CONSTRAINT "pod_version_media_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "pod_version_media" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reauthentication_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"grant_digest" text NOT NULL,
	"action_classes" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reauthentication_grants_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "reauthentication_grants_digest_unique" UNIQUE("grant_digest"),
	CONSTRAINT "reauthentication_grants_id_ulid_check" CHECK ("reauthentication_grants"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "reauthentication_grants_tenant_id_ulid_check" CHECK ("reauthentication_grants"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "reauthentication_grants_digest_check" CHECK (grant_digest ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "reauthentication_grants_actions_check" CHECK (jsonb_typeof(action_classes) = 'array' AND jsonb_array_length(action_classes) > 0),
	CONSTRAINT "reauthentication_grants_lifecycle_check" CHECK (expires_at > created_at AND NOT (consumed_at IS NOT NULL AND revoked_at IS NOT NULL)),
	CONSTRAINT "reauthentication_grants_version_check" CHECK (version >= 1),
	CONSTRAINT "reauthentication_grants_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "reauthentication_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shipment_restriction_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"rule_code" text NOT NULL,
	"severity" text NOT NULL,
	"transport_mode" text,
	"origin_country_code" text,
	"destination_country_code" text,
	"package_type" text,
	"min_weight_grams" bigint,
	"max_weight_grams" bigint,
	"condition_operator" text NOT NULL,
	"condition_value" jsonb NOT NULL,
	"message" text NOT NULL,
	"remediation" text,
	"state" text DEFAULT 'DRAFT' NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_restriction_rules_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "shipment_restriction_rules_code_unique" UNIQUE("tenant_id","rule_code"),
	CONSTRAINT "shipment_restriction_rules_id_ulid_check" CHECK ("shipment_restriction_rules"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "shipment_restriction_rules_tenant_id_ulid_check" CHECK ("shipment_restriction_rules"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "shipment_restriction_rules_shape_check" CHECK (severity IN ('INFO', 'WARNING', 'ERROR') AND state IN ('DRAFT', 'ACTIVE', 'INACTIVE') AND condition_operator IN ('EQ', 'IN', 'RANGE', 'REGEX') AND jsonb_typeof(condition_value) IN ('object', 'array', 'string', 'number')),
	CONSTRAINT "shipment_restriction_rules_weight_check" CHECK ((min_weight_grams IS NULL OR min_weight_grams >= 0) AND (max_weight_grams IS NULL OR max_weight_grams >= min_weight_grams)),
	CONSTRAINT "shipment_restriction_rules_version_check" CHECK (version >= 1),
	CONSTRAINT "shipment_restriction_rules_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "shipment_restriction_rules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "transaction_command_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"idempotency_record_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"operation_id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_command_contexts_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "transaction_command_contexts_receipt_unique" UNIQUE("tenant_id","idempotency_record_id"),
	CONSTRAINT "transaction_command_contexts_key_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "transaction_command_contexts_id_ulid_check" CHECK ("transaction_command_contexts"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "transaction_command_contexts_tenant_id_ulid_check" CHECK ("transaction_command_contexts"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "transaction_command_contexts_hash_check" CHECK (request_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "transaction_command_contexts_shape_check" CHECK (length(btrim(idempotency_key)) >= 16 AND length(btrim(operation_id)) >= 1 AND length(btrim(aggregate_type)) >= 1 AND length(btrim(aggregate_id)) >= 1),
	CONSTRAINT "transaction_command_contexts_version_check" CHECK (version >= 1),
	CONSTRAINT "transaction_command_contexts_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "transaction_command_contexts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_organization_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_org_memberships_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "user_org_memberships_user_org_unique" UNIQUE("tenant_id","user_id","organization_id"),
	CONSTRAINT "user_org_memberships_id_ulid_check" CHECK ("user_organization_memberships"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "user_org_memberships_tenant_id_ulid_check" CHECK ("user_organization_memberships"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "user_org_memberships_version_check" CHECK (version >= 1),
	CONSTRAINT "user_org_memberships_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "user_organization_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warehouse_location_inventory" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"location_id" text NOT NULL,
	"sku" text NOT NULL,
	"quantity" bigint DEFAULT 0 NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_location_inventory_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "warehouse_location_inventory_balance_unique" UNIQUE("tenant_id","warehouse_id","location_id","sku"),
	CONSTRAINT "warehouse_location_inventory_id_ulid_check" CHECK ("warehouse_location_inventory"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "warehouse_location_inventory_tenant_id_ulid_check" CHECK ("warehouse_location_inventory"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "warehouse_location_inventory_sku_check" CHECK (length(btrim(sku)) BETWEEN 1 AND 120),
	CONSTRAINT "warehouse_location_inventory_quantity_check" CHECK (quantity >= 0),
	CONSTRAINT "warehouse_location_inventory_version_check" CHECK (version >= 1),
	CONSTRAINT "warehouse_location_inventory_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "warehouse_location_inventory" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warehouse_location_inventory_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"balance_id" text NOT NULL,
	"sku" text NOT NULL,
	"from_location_id" text,
	"to_location_id" text,
	"quantity_delta" bigint NOT NULL,
	"reason" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_location_inventory_ledger_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "warehouse_location_inventory_ledger_idempotency_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "warehouse_location_inventory_ledger_id_ulid_check" CHECK ("warehouse_location_inventory_ledger"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "warehouse_location_inventory_ledger_tenant_id_ulid_check" CHECK ("warehouse_location_inventory_ledger"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "warehouse_location_inventory_ledger_quantity_check" CHECK (quantity_delta <> 0),
	CONSTRAINT "warehouse_location_inventory_ledger_locations_check" CHECK (num_nonnulls(from_location_id, to_location_id) >= 1 AND from_location_id IS DISTINCT FROM to_location_id),
	CONSTRAINT "warehouse_location_inventory_ledger_version_check" CHECK (version >= 1),
	CONSTRAINT "warehouse_location_inventory_ledger_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "warehouse_location_inventory_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warehouse_stocktake_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"stocktake_id" text NOT NULL,
	"item_sequence" integer NOT NULL,
	"sku" text NOT NULL,
	"counted_quantity" bigint NOT NULL,
	"previous_quantity" bigint NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_stocktake_items_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "warehouse_stocktake_items_sequence_unique" UNIQUE("tenant_id","stocktake_id","item_sequence"),
	CONSTRAINT "warehouse_stocktake_items_sku_unique" UNIQUE("tenant_id","stocktake_id","sku"),
	CONSTRAINT "warehouse_stocktake_items_id_ulid_check" CHECK ("warehouse_stocktake_items"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "warehouse_stocktake_items_tenant_id_ulid_check" CHECK ("warehouse_stocktake_items"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "warehouse_stocktake_items_quantity_check" CHECK (counted_quantity >= 0 AND previous_quantity >= 0),
	CONSTRAINT "warehouse_stocktake_items_version_check" CHECK (version >= 1),
	CONSTRAINT "warehouse_stocktake_items_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "warehouse_stocktake_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "warehouse_stocktakes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"location_id" text NOT NULL,
	"counted_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'COMMITTED' NOT NULL,
	"idempotency_key" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouse_stocktakes_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "warehouse_stocktakes_idempotency_unique" UNIQUE("tenant_id","idempotency_key"),
	CONSTRAINT "warehouse_stocktakes_id_ulid_check" CHECK ("warehouse_stocktakes"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "warehouse_stocktakes_tenant_id_ulid_check" CHECK ("warehouse_stocktakes"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "warehouse_stocktakes_status_check" CHECK (status IN ('COMMITTED', 'VOID')),
	CONSTRAINT "warehouse_stocktakes_version_check" CHECK (version >= 1),
	CONSTRAINT "warehouse_stocktakes_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "warehouse_stocktakes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "waybill_lineage" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source_waybill_id" text NOT NULL,
	"target_waybill_id" text NOT NULL,
	"relationship_type" text NOT NULL,
	"lineage_group_id" text NOT NULL,
	"item_sequence" integer NOT NULL,
	"package_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waybill_lineage_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "waybill_lineage_edge_unique" UNIQUE("tenant_id","lineage_group_id","source_waybill_id","target_waybill_id"),
	CONSTRAINT "waybill_lineage_sequence_unique" UNIQUE("tenant_id","lineage_group_id","item_sequence"),
	CONSTRAINT "waybill_lineage_id_ulid_check" CHECK ("waybill_lineage"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "waybill_lineage_tenant_id_ulid_check" CHECK ("waybill_lineage"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "waybill_lineage_type_check" CHECK (relationship_type IN ('SPLIT', 'MERGE')),
	CONSTRAINT "waybill_lineage_distinct_check" CHECK (source_waybill_id <> target_waybill_id),
	CONSTRAINT "waybill_lineage_sequence_check" CHECK (item_sequence >= 1),
	CONSTRAINT "waybill_lineage_packages_check" CHECK (jsonb_typeof(package_refs) = 'array'),
	CONSTRAINT "waybill_lineage_version_check" CHECK (version >= 1),
	CONSTRAINT "waybill_lineage_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "waybill_lineage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "waybill_number_history" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"waybill_id" text NOT NULL,
	"previous_number" text NOT NULL,
	"new_number" text NOT NULL,
	"reason" text NOT NULL,
	"changed_by_subject_id" text NOT NULL,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waybill_number_history_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "waybill_number_history_previous_unique" UNIQUE("tenant_id","previous_number"),
	CONSTRAINT "waybill_number_history_new_unique" UNIQUE("tenant_id","new_number"),
	CONSTRAINT "waybill_number_history_id_ulid_check" CHECK ("waybill_number_history"."id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "waybill_number_history_tenant_id_ulid_check" CHECK ("waybill_number_history"."tenant_id" ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "waybill_number_history_distinct_check" CHECK (previous_number <> new_number),
	CONSTRAINT "waybill_number_history_version_check" CHECK (version >= 1),
	CONSTRAINT "waybill_number_history_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "waybill_number_history" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "device_media_reservations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"client_media_id" text NOT NULL,
	"device_id" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"subject_id" text NOT NULL,
	"event_id" text NOT NULL,
	"content_hash" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"status" text DEFAULT 'UPLOADED' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"version" bigint DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_media_reservations_identity_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "device_media_reservations_client_unique" UNIQUE("tenant_id","device_id","client_media_id"),
	CONSTRAINT "device_media_reservations_event_identity_unique" UNIQUE("tenant_id","id","event_id"),
	CONSTRAINT "device_media_reservations_hash_check" CHECK (content_hash ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "device_media_reservations_id_ulid_check" CHECK (id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "device_media_reservations_tenant_id_ulid_check" CHECK (tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "device_media_reservations_size_check" CHECK (size_bytes > 0),
	CONSTRAINT "device_media_reservations_status_check" CHECK (status IN ('UPLOADED', 'SCANNING', 'READY', 'REJECTED')),
	CONSTRAINT "device_media_reservations_claim_check" CHECK ((status IN ('UPLOADED', 'SCANNING') AND claimed_at IS NULL) OR (status IN ('READY', 'REJECTED'))),
	CONSTRAINT "device_media_reservations_expiry_check" CHECK (expires_at > created_at),
	CONSTRAINT "device_media_reservations_version_check" CHECK (version >= 1),
	CONSTRAINT "device_media_reservations_timestamps_check" CHECK (updated_at >= created_at)
);
--> statement-breakpoint
ALTER TABLE "device_media_reservations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_code_check";--> statement-breakpoint
ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_type_check";--> statement-breakpoint
ALTER TABLE "customer_addresses" DROP CONSTRAINT "customer_addresses_contact_check";--> statement-breakpoint
ALTER TABLE "organizations" DROP CONSTRAINT "organizations_type_check";--> statement-breakpoint
ALTER TABLE "customer_credit_policies" DROP CONSTRAINT "customer_credit_policies_money_check";--> statement-breakpoint
ALTER TABLE "customer_credit_policies" DROP CONSTRAINT "customer_credit_policies_cycle_check";--> statement-breakpoint
ALTER TABLE "customer_credit_policies" DROP CONSTRAINT "customer_credit_policies_hold_check";--> statement-breakpoint
ALTER TABLE "tenant_entitlements" DROP CONSTRAINT "tenant_entitlements_module_check";--> statement-breakpoint
ALTER TABLE "customs_declarations" DROP CONSTRAINT "customs_declarations_number_check";--> statement-breakpoint
ALTER TABLE "customs_declarations" DROP CONSTRAINT "customs_declarations_incoterm_check";--> statement-breakpoint
ALTER TABLE "declaration_items" DROP CONSTRAINT "declaration_items_hs_code_check";--> statement-breakpoint
ALTER TABLE "declaration_items" DROP CONSTRAINT "declaration_items_origin_check";--> statement-breakpoint
ALTER TABLE "declaration_items" DROP CONSTRAINT "declaration_items_weight_check";--> statement-breakpoint
ALTER TABLE "import_jobs" DROP CONSTRAINT "import_jobs_type_check";--> statement-breakpoint
ALTER TABLE "import_jobs" DROP CONSTRAINT "import_jobs_source_check";--> statement-breakpoint
ALTER TABLE "rate_rules" DROP CONSTRAINT "rate_rules_method_check";--> statement-breakpoint
ALTER TABLE "rate_rules" DROP CONSTRAINT "rate_rules_money_check";--> statement-breakpoint
ALTER TABLE "rate_rules" DROP CONSTRAINT "rate_rules_measurement_check";--> statement-breakpoint
ALTER TABLE "rate_rules" DROP CONSTRAINT "rate_rules_state_check";--> statement-breakpoint
ALTER TABLE "shipping_channels" DROP CONSTRAINT "shipping_channels_state_check";--> statement-breakpoint
ALTER TABLE "bills_of_lading" DROP CONSTRAINT "bills_of_lading_status_check";--> statement-breakpoint
ALTER TABLE "delivery_task_events" DROP CONSTRAINT "delivery_task_events_type_check";--> statement-breakpoint
ALTER TABLE "device_event_receipts" DROP CONSTRAINT "device_event_receipts_server_version_check";--> statement-breakpoint
ALTER TABLE "device_sync_conflicts" DROP CONSTRAINT "device_sync_conflicts_resolution_shape_check";--> statement-breakpoint
ALTER TABLE "device_sync_sessions" DROP CONSTRAINT "device_sync_sessions_binding_check";--> statement-breakpoint
ALTER TABLE "load_units" DROP CONSTRAINT "load_units_distinct_warehouses_check";--> statement-breakpoint
ALTER TABLE "permission_simulations" DROP CONSTRAINT "permission_simulations_expiry_check";--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "address_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "address_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ALTER COLUMN "contact_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ALTER COLUMN "credit_limit_minor" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ALTER COLUMN "payment_cycle" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ALTER COLUMN "hold_policy" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ALTER COLUMN "created_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_declarations" ALTER COLUMN "declaration_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_declarations" ALTER COLUMN "incoterm" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "declaration_items" ALTER COLUMN "hs_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "declaration_items" ALTER COLUMN "origin_country_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "declaration_items" ALTER COLUMN "net_weight_grams" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "import_jobs" ALTER COLUMN "source_object_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "import_jobs" ALTER COLUMN "source_sha256" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "import_jobs" ALTER COLUMN "idempotency_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "idempotency_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "idempotency_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "waybills" ALTER COLUMN "idempotency_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ALTER COLUMN "waybill_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ALTER COLUMN "customer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ALTER COLUMN "destination_address_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "device_event_media_claims" ALTER COLUMN "media_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "linehaul_bookings" ALTER COLUMN "load_unit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "load_unit_items" ALTER COLUMN "package_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "load_units" ALTER COLUMN "destination_warehouse_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN "address_label" text;--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "settlement_currency" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "default_timezone" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "default_currency" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mobile" text;--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD COLUMN "credit_limit_amount" numeric(20, 6);--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD COLUMN "credit_tier" text;--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD COLUMN "payment_cycle_days" integer;--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD COLUMN "hold_on_exceed" boolean;--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD COLUMN "change_reason" text;--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "reference_data_versions" ADD COLUMN "version_label" text;--> statement-breakpoint
ALTER TABLE "reference_data_versions" ADD COLUMN "publish_reason" text;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD COLUMN "quota_map" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD COLUMN "is_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD COLUMN "replacement_version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD COLUMN "version" bigint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD COLUMN "created_by_actor_tenant_id" text;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD COLUMN "created_by_actor_subject_id" text;--> statement-breakpoint
ALTER TABLE "customs_declarations" ADD COLUMN "insured" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customs_declarations" ADD COLUMN "insured_value_amount" numeric(20, 6);--> statement-breakpoint
ALTER TABLE "customs_declarations" ADD COLUMN "insured_value_minor" bigint;--> statement-breakpoint
ALTER TABLE "customs_declarations" ADD COLUMN "insured_currency" text;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "source_file_ref" text;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "source_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "atomicity" text;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "mapping_version" integer;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD COLUMN "validation_version" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "order_type" text DEFAULT 'STANDARD' NOT NULL;--> statement-breakpoint
ALTER TABLE "rate_rules" ADD COLUMN "rule_code" text;--> statement-breakpoint
ALTER TABLE "rate_rules" ADD COLUMN "charge_code" text;--> statement-breakpoint
ALTER TABLE "rate_rules" ADD COLUMN "price_type" text;--> statement-breakpoint
ALTER TABLE "rate_rules" ADD COLUMN "zone_code" text;--> statement-breakpoint
ALTER TABLE "rate_rules" ADD COLUMN "rounding_mode" text;--> statement-breakpoint
ALTER TABLE "rate_rules" ADD COLUMN "minimum_charge_minor" bigint;--> statement-breakpoint
ALTER TABLE "rate_rules" ADD COLUMN "effective_from" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rate_rules" ADD COLUMN "effective_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shipping_channels" ADD COLUMN "transport_mode" text;--> statement-breakpoint
ALTER TABLE "bills_of_lading" ADD COLUMN "bill_type" text;--> statement-breakpoint
ALTER TABLE "bills_of_lading" ADD COLUMN "parent_bill_of_lading_id" text;--> statement-breakpoint
ALTER TABLE "delivery_task_events" ADD COLUMN "device_event_id" text;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD COLUMN "station_id" text;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD COLUMN "executor_type" text;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD COLUMN "executor_id" text;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD COLUMN "planned_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD COLUMN "planned_end_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "device_event_media_claims" ADD COLUMN "media_reservation_id" text;--> statement-breakpoint
ALTER TABLE "device_event_receipts" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "device_event_receipts" ADD COLUMN "claimed_media_refs" jsonb;--> statement-breakpoint
ALTER TABLE "device_sync_conflicts" ADD COLUMN "resolved_by_subject_id" text;--> statement-breakpoint
ALTER TABLE "device_sync_conflicts" ADD COLUMN "resolution_reason" text;--> statement-breakpoint
ALTER TABLE "device_sync_sessions" ADD COLUMN "subject_id" text;--> statement-breakpoint
ALTER TABLE "linehaul_bookings" ADD COLUMN "carrier_id" text;--> statement-breakpoint
ALTER TABLE "linehaul_bookings" ADD COLUMN "origin_port" text;--> statement-breakpoint
ALTER TABLE "linehaul_bookings" ADD COLUMN "destination_port" text;--> statement-breakpoint
ALTER TABLE "linehaul_bookings" ADD COLUMN "planned_departure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "linehaul_bookings" ADD COLUMN "station_code" text;--> statement-breakpoint
ALTER TABLE "load_units" ADD COLUMN "load_unit_type" text;--> statement-breakpoint
ALTER TABLE "load_units" ADD COLUMN "seal_no" text;--> statement-breakpoint
ALTER TABLE "load_units" ADD COLUMN "station_code" text;--> statement-breakpoint
ALTER TABLE "pod_versions" ADD COLUMN "device_event_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_measurements" ADD COLUMN "device_event_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_measurements" ADD COLUMN "measured_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "warehouse_receipts" ADD COLUMN "customer_id" text;--> statement-breakpoint
ALTER TABLE "warehouse_receipts" ADD COLUMN "station_code" text;--> statement-breakpoint
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_tenant_id_unique" UNIQUE("tenant_id","id");--> statement-breakpoint
ALTER TABLE "quote_acceptances" ADD CONSTRAINT "quote_acceptances_ownership_unique" UNIQUE("tenant_id","id","quote_id","quote_version_id","quote_option_id");--> statement-breakpoint
ALTER TABLE "accepted_quote_order_links" ADD CONSTRAINT "accepted_quote_order_links_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accepted_quote_order_links" ADD CONSTRAINT "accepted_quote_order_links_quote_fk" FOREIGN KEY ("tenant_id","quote_id") REFERENCES "public"."quotes"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accepted_quote_order_links" ADD CONSTRAINT "accepted_quote_order_links_acceptance_fk" FOREIGN KEY ("tenant_id","quote_acceptance_id","quote_id","quote_version_id","quote_option_id") REFERENCES "public"."quote_acceptances"("tenant_id","id","quote_id","quote_version_id","quote_option_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accepted_quote_order_links" ADD CONSTRAINT "accepted_quote_order_links_version_number_fk" FOREIGN KEY ("tenant_id","quote_id","accepted_quote_version") REFERENCES "public"."quote_versions"("tenant_id","quote_id","version_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accepted_quote_order_links" ADD CONSTRAINT "accepted_quote_order_links_option_ownership_fk" FOREIGN KEY ("tenant_id","quote_option_id","quote_version_id","quote_id") REFERENCES "public"."quote_options"("tenant_id","id","quote_version_id","quote_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accepted_quote_order_links" ADD CONSTRAINT "accepted_quote_order_links_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accepted_quote_order_links" ADD CONSTRAINT "accepted_quote_order_links_waybill_fk" FOREIGN KEY ("tenant_id","waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accepted_quote_order_links" ADD CONSTRAINT "accepted_quote_order_links_actor_fk" FOREIGN KEY ("tenant_id","accepted_by_subject_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_lading_waybills" ADD CONSTRAINT "bill_of_lading_waybills_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_lading_waybills" ADD CONSTRAINT "bill_of_lading_waybills_bill_fk" FOREIGN KEY ("tenant_id","bill_of_lading_id") REFERENCES "public"."bills_of_lading"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_of_lading_waybills" ADD CONSTRAINT "bill_of_lading_waybills_waybill_fk" FOREIGN KEY ("tenant_id","waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_attachments" ADD CONSTRAINT "declaration_attachments_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_attachments" ADD CONSTRAINT "declaration_attachments_declaration_fk" FOREIGN KEY ("tenant_id","declaration_id") REFERENCES "public"."customs_declarations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "declaration_attachments" ADD CONSTRAINT "declaration_attachments_attachment_fk" FOREIGN KEY ("tenant_id","attachment_id") REFERENCES "public"."attachments"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_task_waybills" ADD CONSTRAINT "delivery_task_waybills_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_task_waybills" ADD CONSTRAINT "delivery_task_waybills_task_fk" FOREIGN KEY ("tenant_id","delivery_task_id") REFERENCES "public"."delivery_tasks"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_task_waybills" ADD CONSTRAINT "delivery_task_waybills_waybill_fk" FOREIGN KEY ("tenant_id","waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fba_shipment_cartons" ADD CONSTRAINT "fba_shipment_cartons_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fba_shipment_cartons" ADD CONSTRAINT "fba_shipment_cartons_link_fk" FOREIGN KEY ("tenant_id","fba_shipment_link_id") REFERENCES "public"."fba_shipment_links"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fba_shipment_links" ADD CONSTRAINT "fba_shipment_links_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fba_shipment_links" ADD CONSTRAINT "fba_shipment_links_load_unit_fk" FOREIGN KEY ("tenant_id","load_unit_id") REFERENCES "public"."load_units"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_jobs" ADD CONSTRAINT "label_jobs_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "label_jobs" ADD CONSTRAINT "label_jobs_waybill_fk" FOREIGN KEY ("tenant_id","waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_charge_generation_tasks" ADD CONSTRAINT "last_mile_charge_generation_tasks_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_charge_generation_tasks" ADD CONSTRAINT "last_mile_charge_generation_tasks_generation_fk" FOREIGN KEY ("tenant_id","generation_id") REFERENCES "public"."last_mile_charge_generations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_charge_generation_tasks" ADD CONSTRAINT "last_mile_charge_generation_tasks_task_fk" FOREIGN KEY ("tenant_id","delivery_task_id") REFERENCES "public"."delivery_tasks"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_charge_generations" ADD CONSTRAINT "last_mile_charge_generations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_intake_expected_waybills" ADD CONSTRAINT "last_mile_intake_expected_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_intake_expected_waybills" ADD CONSTRAINT "last_mile_intake_expected_intake_fk" FOREIGN KEY ("tenant_id","intake_id") REFERENCES "public"."last_mile_intakes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_intake_expected_waybills" ADD CONSTRAINT "last_mile_intake_expected_waybill_fk" FOREIGN KEY ("tenant_id","waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_intake_scans" ADD CONSTRAINT "last_mile_intake_scans_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_intake_scans" ADD CONSTRAINT "last_mile_intake_scans_intake_fk" FOREIGN KEY ("tenant_id","intake_id") REFERENCES "public"."last_mile_intakes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_intake_scans" ADD CONSTRAINT "last_mile_intake_scans_waybill_fk" FOREIGN KEY ("tenant_id","waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "last_mile_intakes" ADD CONSTRAINT "last_mile_intakes_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_unit_waybills" ADD CONSTRAINT "load_unit_waybills_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_unit_waybills" ADD CONSTRAINT "load_unit_waybills_load_unit_fk" FOREIGN KEY ("tenant_id","load_unit_id") REFERENCES "public"."load_units"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "load_unit_waybills" ADD CONSTRAINT "load_unit_waybills_waybill_fk" FOREIGN KEY ("tenant_id","waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_throttle_buckets" ADD CONSTRAINT "login_throttle_buckets_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_package_snapshots" ADD CONSTRAINT "order_package_snapshots_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_package_snapshots" ADD CONSTRAINT "order_package_snapshots_order_fk" FOREIGN KEY ("tenant_id","order_id") REFERENCES "public"."orders"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_contacts" ADD CONSTRAINT "partner_contacts_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_receipts" ADD CONSTRAINT "partner_event_receipts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_receipts" ADD CONSTRAINT "partner_event_receipts_partner_fk" FOREIGN KEY ("tenant_id","partner_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_replay_attempts" ADD CONSTRAINT "partner_event_replay_attempts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_replay_attempts" ADD CONSTRAINT "partner_event_replay_attempts_receipt_fk" FOREIGN KEY ("tenant_id","partner_event_receipt_id") REFERENCES "public"."partner_event_receipts"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_replay_attempts" ADD CONSTRAINT "partner_event_replay_attempts_actor_fk" FOREIGN KEY ("tenant_id","requested_by_subject_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod_version_media" ADD CONSTRAINT "pod_version_media_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod_version_media" ADD CONSTRAINT "pod_version_media_pod_version_fk" FOREIGN KEY ("tenant_id","pod_version_id") REFERENCES "public"."pod_versions"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pod_version_media" ADD CONSTRAINT "pod_version_media_reservation_fk" FOREIGN KEY ("tenant_id","media_reservation_id") REFERENCES "public"."device_media_reservations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauthentication_grants" ADD CONSTRAINT "reauthentication_grants_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauthentication_grants" ADD CONSTRAINT "reauthentication_grants_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauthentication_grants" ADD CONSTRAINT "reauthentication_grants_session_fk" FOREIGN KEY ("tenant_id","session_id") REFERENCES "public"."sessions"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_restriction_rules" ADD CONSTRAINT "shipment_restriction_rules_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_command_contexts" ADD CONSTRAINT "transaction_command_contexts_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_command_contexts" ADD CONSTRAINT "transaction_command_contexts_receipt_fk" FOREIGN KEY ("tenant_id","idempotency_record_id") REFERENCES "public"."idempotency_records"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organization_memberships" ADD CONSTRAINT "user_org_memberships_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organization_memberships" ADD CONSTRAINT "user_org_memberships_user_fk" FOREIGN KEY ("tenant_id","user_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_organization_memberships" ADD CONSTRAINT "user_org_memberships_organization_fk" FOREIGN KEY ("tenant_id","organization_id") REFERENCES "public"."organizations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_location_inventory" ADD CONSTRAINT "warehouse_location_inventory_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_location_inventory" ADD CONSTRAINT "warehouse_location_inventory_warehouse_fk" FOREIGN KEY ("tenant_id","warehouse_id") REFERENCES "public"."warehouses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_location_inventory_ledger" ADD CONSTRAINT "warehouse_location_inventory_ledger_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_location_inventory_ledger" ADD CONSTRAINT "warehouse_location_inventory_ledger_balance_fk" FOREIGN KEY ("tenant_id","balance_id") REFERENCES "public"."warehouse_location_inventory"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktake_items" ADD CONSTRAINT "warehouse_stocktake_items_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktake_items" ADD CONSTRAINT "warehouse_stocktake_items_stocktake_fk" FOREIGN KEY ("tenant_id","stocktake_id") REFERENCES "public"."warehouse_stocktakes"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stocktakes" ADD CONSTRAINT "warehouse_stocktakes_warehouse_fk" FOREIGN KEY ("tenant_id","warehouse_id") REFERENCES "public"."warehouses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_lineage" ADD CONSTRAINT "waybill_lineage_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_lineage" ADD CONSTRAINT "waybill_lineage_source_fk" FOREIGN KEY ("tenant_id","source_waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_lineage" ADD CONSTRAINT "waybill_lineage_target_fk" FOREIGN KEY ("tenant_id","target_waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_number_history" ADD CONSTRAINT "waybill_number_history_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_number_history" ADD CONSTRAINT "waybill_number_history_waybill_fk" FOREIGN KEY ("tenant_id","waybill_id") REFERENCES "public"."waybills"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waybill_number_history" ADD CONSTRAINT "waybill_number_history_actor_fk" FOREIGN KEY ("tenant_id","changed_by_subject_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_media_reservations" ADD CONSTRAINT "device_media_reservations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_media_reservations" ADD CONSTRAINT "device_media_reservations_device_fk" FOREIGN KEY ("tenant_id","device_id") REFERENCES "public"."devices"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_media_reservations" ADD CONSTRAINT "device_media_reservations_warehouse_fk" FOREIGN KEY ("tenant_id","warehouse_id") REFERENCES "public"."warehouses"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_media_reservations" ADD CONSTRAINT "device_media_reservations_subject_fk" FOREIGN KEY ("tenant_id","subject_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "label_jobs_queue_idx" ON "label_jobs" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "last_mile_charge_generations_queue_idx" ON "last_mile_charge_generations" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "last_mile_intakes_immutable_list_idx" ON "last_mile_intakes" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "last_mile_intakes_filter_idx" ON "last_mile_intakes" USING btree ("tenant_id","status","station_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "partner_contacts_one_primary_idx" ON "partner_contacts" USING btree ("tenant_id","partner_id") WHERE is_primary;--> statement-breakpoint
CREATE INDEX "partner_event_receipts_queue_idx" ON "partner_event_receipts" USING btree ("tenant_id","status","created_at","id");--> statement-breakpoint
CREATE INDEX "reauthentication_grants_expiry_idx" ON "reauthentication_grants" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX "shipment_restriction_rules_eval_idx" ON "shipment_restriction_rules" USING btree ("tenant_id","state","transport_mode","origin_country_code","destination_country_code");--> statement-breakpoint
CREATE UNIQUE INDEX "user_org_memberships_one_primary_idx" ON "user_organization_memberships" USING btree ("tenant_id","user_id") WHERE is_primary;--> statement-breakpoint
CREATE INDEX "warehouse_location_inventory_list_idx" ON "warehouse_location_inventory" USING btree ("tenant_id","warehouse_id","location_id","sku");--> statement-breakpoint
CREATE INDEX "warehouse_location_inventory_ledger_fold_idx" ON "warehouse_location_inventory_ledger" USING btree ("tenant_id","balance_id","occurred_at","id");--> statement-breakpoint
CREATE INDEX "device_media_reservations_expiry_idx" ON "device_media_reservations" USING btree ("tenant_id","status","expires_at");--> statement-breakpoint
ALTER TABLE "bills_of_lading" ADD CONSTRAINT "bills_of_lading_parent_fk" FOREIGN KEY ("tenant_id","parent_bill_of_lading_id") REFERENCES "public"."bills_of_lading"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_event_media_claims" ADD CONSTRAINT "device_event_media_claims_reservation_fk" FOREIGN KEY ("tenant_id","media_reservation_id") REFERENCES "public"."device_media_reservations"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_event_receipts" ADD CONSTRAINT "device_event_receipts_subject_fk" FOREIGN KEY ("tenant_id","subject_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sync_conflicts" ADD CONSTRAINT "device_sync_conflicts_resolver_fk" FOREIGN KEY ("tenant_id","resolved_by_subject_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_sync_sessions" ADD CONSTRAINT "device_sync_sessions_subject_fk" FOREIGN KEY ("tenant_id","subject_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_actor_creator_fk" FOREIGN KEY ("created_by_actor_tenant_id","created_by_actor_subject_id") REFERENCES "public"."users"("tenant_id","id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "linehaul_bookings" ADD CONSTRAINT "linehaul_bookings_carrier_fk" FOREIGN KEY ("tenant_id","carrier_id") REFERENCES "public"."partners"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_receipts" ADD CONSTRAINT "warehouse_receipts_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_addresses_one_default_idx" ON "customer_addresses" USING btree ("tenant_id","customer_id") WHERE is_default;--> statement-breakpoint
CREATE INDEX "delivery_tasks_immutable_list_idx" ON "delivery_tasks" USING btree ("tenant_id","planned_start_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_sync_sessions_one_open_device_idx" ON "device_sync_sessions" USING btree ("tenant_id","device_id") WHERE status = 'OPEN';--> statement-breakpoint
CREATE INDEX "load_units_immutable_list_idx" ON "load_units" USING btree ("tenant_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "warehouse_receipts_immutable_list_idx" ON "warehouse_receipts" USING btree ("tenant_id","received_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "warehouse_receipts_filter_list_idx" ON "warehouse_receipts" USING btree ("tenant_id","status","warehouse_id","received_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_replacement_module_unique" UNIQUE("tenant_id","replacement_version","module_code");--> statement-breakpoint
ALTER TABLE "device_event_media_claims" ADD CONSTRAINT "device_event_media_claims_reservation_unique" UNIQUE("tenant_id","media_reservation_id");--> statement-breakpoint
ALTER TABLE "pod_versions" ADD CONSTRAINT "pod_versions_device_event_unique" UNIQUE("tenant_id","device_event_id");--> statement-breakpoint
ALTER TABLE "warehouse_measurements" ADD CONSTRAINT "warehouse_measurements_device_event_unique" UNIQUE("tenant_id","receipt_id","device_event_id");--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_label_check" CHECK (address_label IS NULL OR length(btrim(address_label)) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_code_check" CHECK (address_code IS NULL OR length(btrim(address_code)) BETWEEN 1 AND 64);--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_type_check" CHECK (address_type IS NULL OR address_type = ANY (ARRAY['BILLING'::text, 'PICKUP'::text, 'DELIVERY'::text, 'RETURN'::text]));--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_contact_check" CHECK (contact_name IS NULL OR length(btrim(contact_name)) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_settlement_currency_check" CHECK (settlement_currency IS NULL OR settlement_currency ~ '^[A-Z]{3}$'::text);--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_type_check" CHECK (organization_type = ANY (ARRAY['TENANT_ROOT'::text, 'BUSINESS_UNIT'::text, 'BRANCH'::text, 'PARTNER'::text, 'COMPANY'::text, 'DEPARTMENT'::text, 'SITE'::text, 'WAREHOUSE'::text, 'LOCATION'::text]));--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_timezone_check" CHECK (default_timezone IS NULL OR length(btrim(default_timezone)) BETWEEN 1 AND 64);--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_currency_check" CHECK (default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'::text);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_mobile_check" CHECK (mobile IS NULL OR length(btrim(mobile)) BETWEEN 3 AND 32);--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD CONSTRAINT "customer_credit_policies_contract_shape_check" CHECK ((payment_cycle_days IS NULL OR payment_cycle_days BETWEEN 0 AND 365) AND (credit_tier IS NULL OR credit_tier IN ('STANDARD', 'SILVER', 'GOLD', 'STRATEGIC')) AND (change_reason IS NULL OR length(btrim(change_reason)) BETWEEN 5 AND 500));--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD CONSTRAINT "customer_credit_policies_aggregate_version_check" CHECK (version >= 1);--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD CONSTRAINT "customer_credit_policies_timestamps_check" CHECK (updated_at >= created_at);--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD CONSTRAINT "customer_credit_policies_money_check" CHECK (currency ~ '^[A-Z]{3}$' AND (credit_limit_minor IS NULL OR credit_limit_minor >= 0) AND (credit_limit_amount IS NULL OR credit_limit_amount >= 0) AND num_nonnulls(credit_limit_minor, credit_limit_amount) >= 1);--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD CONSTRAINT "customer_credit_policies_cycle_check" CHECK (payment_cycle IS NULL OR payment_cycle IN ('PREPAID', 'WEEKLY', 'SEMIMONTHLY', 'MONTHLY', 'NET_30', 'NET_60'));--> statement-breakpoint
ALTER TABLE "customer_credit_policies" ADD CONSTRAINT "customer_credit_policies_hold_check" CHECK (hold_policy IS NULL OR hold_policy IN ('AUTO_HOLD', 'REVIEW', 'ALLOW'));--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_contact_check" CHECK (contact_name IS NULL OR length(btrim(contact_name)) BETWEEN 1 AND 160);--> statement-breakpoint
ALTER TABLE "reference_data_versions" ADD CONSTRAINT "reference_data_versions_publication_metadata_check" CHECK ((state = 'DRAFT' AND version_label IS NULL AND publish_reason IS NULL) OR (state IN ('PUBLISHED', 'RETIRED') AND length(btrim(version_label)) >= 1 AND length(btrim(publish_reason)) >= 2));--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_aggregate_version_check" CHECK (version >= 1);--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_replacement_version_check" CHECK (replacement_version >= 1);--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_quota_map_check" CHECK (jsonb_typeof(quota_map) = 'object');--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_creator_shape_check" CHECK ((created_by_user_id IS NOT NULL AND created_by_actor_tenant_id IS NULL AND created_by_actor_subject_id IS NULL) OR (created_by_user_id IS NULL AND created_by_actor_tenant_id IS NOT NULL AND created_by_actor_subject_id IS NOT NULL));--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_actor_tenant_id_ulid_check" CHECK (created_by_actor_tenant_id IS NULL OR created_by_actor_tenant_id ~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$');--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_module_check" CHECK (module_code ~ '^([A-Z][A-Z0-9_]{1,63}|[a-z0-9][a-z0-9.-]{1,79})$');--> statement-breakpoint
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_insurance_check" CHECK ((NOT insured AND insured_value_amount IS NULL AND insured_value_minor IS NULL AND insured_currency IS NULL) OR (insured AND (insured_value_amount IS NOT NULL OR insured_value_minor IS NOT NULL) AND insured_currency ~ '^[A-Z]{3}$'::text));--> statement-breakpoint
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_number_check" CHECK (declaration_number IS NULL OR length(btrim(declaration_number)) BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "customs_declarations" ADD CONSTRAINT "customs_declarations_incoterm_check" CHECK (incoterm IS NULL OR incoterm ~ '^[A-Z]{3}$'::text);--> statement-breakpoint
ALTER TABLE "declaration_items" ADD CONSTRAINT "declaration_items_hs_code_check" CHECK (hs_code IS NULL OR hs_code ~ '^[0-9]{6,12}$'::text);--> statement-breakpoint
ALTER TABLE "declaration_items" ADD CONSTRAINT "declaration_items_origin_check" CHECK (origin_country_code IS NULL OR origin_country_code ~ '^[A-Z]{2}$'::text);--> statement-breakpoint
ALTER TABLE "declaration_items" ADD CONSTRAINT "declaration_items_weight_check" CHECK (net_weight_grams IS NULL OR net_weight_grams > 0);--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_atomicity_check" CHECK (atomicity IS NULL OR atomicity IN ('ALL_OR_NOTHING', 'ALLOW_PARTIAL'));--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_versions_check" CHECK ((mapping_version IS NULL OR mapping_version >= 1) AND (validation_version IS NULL OR validation_version >= 1));--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_type_check" CHECK (import_type = ANY (ARRAY['ORDERS'::text, 'PAYABLES'::text, 'MASTER_DATA'::text, 'MIGRATION'::text, 'WAYBILLS'::text]));--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_source_check" CHECK ((source_file_ref IS NULL OR length(btrim(source_file_ref)) >= 1) AND (source_metadata IS NULL OR jsonb_typeof(source_metadata) = 'object') AND (source_object_key IS NULL OR length(btrim(source_object_key)) >= 1) AND (source_sha256 IS NULL OR source_sha256 ~ '^[0-9a-f]{64}$'::text));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_type_check" CHECK (order_type IN ('STANDARD', 'FBA'));--> statement-breakpoint
ALTER TABLE "rate_rules" ADD CONSTRAINT "rate_rules_semantic_metadata_check" CHECK ((rule_code IS NULL OR length(btrim(rule_code)) BETWEEN 1 AND 64) AND (charge_code IS NULL OR length(btrim(charge_code)) BETWEEN 1 AND 64) AND (price_type IS NULL OR price_type IN ('COST', 'AGENT', 'CUSTOMER', 'SPECIAL')) AND (zone_code IS NULL OR length(btrim(zone_code)) BETWEEN 1 AND 64) AND (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from));--> statement-breakpoint
ALTER TABLE "rate_rules" ADD CONSTRAINT "rate_rules_method_check" CHECK (calculation_method = ANY (ARRAY['FLAT'::text, 'PER_KG'::text, 'PERCENT'::text, 'PERCENTAGE'::text, 'MINIMUM'::text]));--> statement-breakpoint
ALTER TABLE "rate_rules" ADD CONSTRAINT "rate_rules_money_check" CHECK (((calculation_method = ANY (ARRAY['FLAT'::text, 'PER_KG'::text, 'MINIMUM'::text])) AND (amount_minor IS NOT NULL) AND (amount_minor >= 0) AND (currency ~ '^[A-Z]{3}$'::text) AND (percentage_bps IS NULL)) OR ((calculation_method IN ('PERCENT', 'PERCENTAGE')) AND (amount_minor IS NULL) AND (currency IS NULL) AND ((percentage_bps >= '-10000'::integer) AND (percentage_bps <= 100000))));--> statement-breakpoint
ALTER TABLE "rate_rules" ADD CONSTRAINT "rate_rules_measurement_check" CHECK (((dimensional_divisor IS NULL) OR (dimensional_divisor > 0)) AND ((rounding_step_grams IS NULL) OR (rounding_step_grams > 0)) AND (rounding_mode IS NULL OR rounding_mode IN ('UP', 'NEAREST', 'DOWN')) AND (minimum_charge_minor IS NULL OR minimum_charge_minor >= 0));--> statement-breakpoint
ALTER TABLE "rate_rules" ADD CONSTRAINT "rate_rules_state_check" CHECK (state = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'INACTIVE'::text]));--> statement-breakpoint
ALTER TABLE "shipping_channels" ADD CONSTRAINT "shipping_channels_transport_mode_check" CHECK (transport_mode IS NULL OR transport_mode IN ('AIR', 'SEA', 'ROAD', 'RAIL', 'EXPRESS'));--> statement-breakpoint
ALTER TABLE "shipping_channels" ADD CONSTRAINT "shipping_channels_state_check" CHECK (state = ANY (ARRAY['DRAFT'::text, 'ACTIVE'::text, 'INACTIVE'::text]));--> statement-breakpoint
ALTER TABLE "bills_of_lading" ADD CONSTRAINT "bills_of_lading_type_check" CHECK (bill_type IS NULL OR bill_type IN ('MASTER', 'HOUSE'));--> statement-breakpoint
ALTER TABLE "bills_of_lading" ADD CONSTRAINT "bills_of_lading_parent_check" CHECK (parent_bill_of_lading_id IS NULL OR parent_bill_of_lading_id <> id);--> statement-breakpoint
ALTER TABLE "bills_of_lading" ADD CONSTRAINT "bills_of_lading_status_check" CHECK (status = ANY (ARRAY['DRAFT'::text, 'CONFIRMED'::text, 'DEPARTED'::text, 'CLOSED'::text, 'ISSUED'::text, 'VOID'::text]));--> statement-breakpoint
ALTER TABLE "delivery_task_events" ADD CONSTRAINT "delivery_task_events_type_check" CHECK (event_type = ANY (ARRAY['INTAKE'::text, 'DISCREPANCY'::text, 'ASSIGNED'::text, 'ACCEPTED'::text, 'DEPARTED'::text, 'ARRIVED'::text, 'DELIVERED'::text, 'FAILED'::text, 'CANCELLED'::text, 'PALLETIZED'::text, 'LOADED'::text, 'OUT_FOR_DELIVERY'::text, 'COMPLETED'::text, 'EXCEPTION'::text, 'PARTNER_REPLAY'::text]));--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_executor_check" CHECK ((executor_type IS NULL AND executor_id IS NULL) OR (executor_type IN ('DRIVER', 'PARTNER') AND length(btrim(executor_id)) >= 1));--> statement-breakpoint
ALTER TABLE "delivery_tasks" ADD CONSTRAINT "delivery_tasks_window_check" CHECK (planned_end_at IS NULL OR planned_start_at IS NULL OR planned_end_at > planned_start_at);--> statement-breakpoint
ALTER TABLE "device_event_media_claims" ADD CONSTRAINT "device_event_media_claims_owner_check" CHECK (num_nonnulls(media_id, media_reservation_id) = 1);--> statement-breakpoint
ALTER TABLE "device_event_receipts" ADD CONSTRAINT "device_event_receipts_claims_check" CHECK (claimed_media_refs IS NULL OR jsonb_typeof(claimed_media_refs) = 'array');--> statement-breakpoint
ALTER TABLE "device_event_receipts" ADD CONSTRAINT "device_event_receipts_server_version_check" CHECK ((server_version IS NULL) OR (server_version >= 1));--> statement-breakpoint
ALTER TABLE "device_sync_conflicts" ADD CONSTRAINT "device_sync_conflicts_resolution_shape_check" CHECK (((status = 'OPEN'::text) AND (resolution IS NULL) AND (resolution_payload IS NULL) AND (resolved_by_subject_id IS NULL) AND (resolution_reason IS NULL) AND (resolved_at IS NULL)) OR ((status = 'RESOLVED'::text) AND (resolution IS NOT NULL) AND (resolved_by_subject_id IS NOT NULL) AND (length(btrim(resolution_reason)) >= 3) AND (resolved_at IS NOT NULL)));--> statement-breakpoint
ALTER TABLE "device_sync_sessions" ADD CONSTRAINT "device_sync_sessions_binding_check" CHECK (binding_version >= 1);--> statement-breakpoint
ALTER TABLE "linehaul_bookings" ADD CONSTRAINT "linehaul_bookings_contract_fields_check" CHECK ((origin_port IS NULL OR length(btrim(origin_port)) >= 1) AND (destination_port IS NULL OR length(btrim(destination_port)) >= 1));--> statement-breakpoint
ALTER TABLE "load_units" ADD CONSTRAINT "load_units_type_check" CHECK (load_unit_type IS NULL OR load_unit_type IN ('BAG', 'PALLET', 'CONTAINER'));--> statement-breakpoint
ALTER TABLE "load_units" ADD CONSTRAINT "load_units_distinct_warehouses_check" CHECK (destination_warehouse_id IS NULL OR origin_warehouse_id <> destination_warehouse_id);--> statement-breakpoint
ALTER TABLE "warehouse_measurements" ADD CONSTRAINT "warehouse_measurements_event_time_check" CHECK ((device_event_id IS NULL AND measured_at IS NULL) OR (length(btrim(device_event_id)) >= 1 AND measured_at IS NOT NULL));--> statement-breakpoint
ALTER TABLE "permission_simulations" ADD CONSTRAINT "permission_simulations_expiry_check" CHECK (expires_at >= created_at + interval '1 minute' AND expires_at <= created_at + interval '30 minutes');--> statement-breakpoint
CREATE POLICY "accepted_quote_order_links_tenant_isolation" ON "accepted_quote_order_links" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "bill_of_lading_waybills_tenant_isolation" ON "bill_of_lading_waybills" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "declaration_attachments_tenant_isolation" ON "declaration_attachments" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "delivery_task_waybills_tenant_isolation" ON "delivery_task_waybills" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "fba_shipment_cartons_tenant_isolation" ON "fba_shipment_cartons" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "fba_shipment_links_tenant_isolation" ON "fba_shipment_links" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "label_jobs_tenant_isolation" ON "label_jobs" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "last_mile_charge_generation_tasks_tenant_isolation" ON "last_mile_charge_generation_tasks" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "last_mile_charge_generations_tenant_isolation" ON "last_mile_charge_generations" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "last_mile_intake_expected_tenant_isolation" ON "last_mile_intake_expected_waybills" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "last_mile_intake_scans_tenant_isolation" ON "last_mile_intake_scans" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "last_mile_intakes_tenant_isolation" ON "last_mile_intakes" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "load_unit_waybills_tenant_isolation" ON "load_unit_waybills" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "order_package_snapshots_tenant_isolation" ON "order_package_snapshots" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "partner_contacts_tenant_isolation" ON "partner_contacts" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "partner_event_receipts_tenant_isolation" ON "partner_event_receipts" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "partner_event_replay_attempts_tenant_isolation" ON "partner_event_replay_attempts" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "pod_version_media_tenant_isolation" ON "pod_version_media" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "reauthentication_grants_tenant_isolation" ON "reauthentication_grants" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "shipment_restriction_rules_tenant_isolation" ON "shipment_restriction_rules" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "transaction_command_contexts_tenant_isolation" ON "transaction_command_contexts" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "user_org_memberships_tenant_isolation" ON "user_organization_memberships" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "warehouse_location_inventory_tenant_isolation" ON "warehouse_location_inventory" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "warehouse_location_inventory_ledger_tenant_isolation" ON "warehouse_location_inventory_ledger" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "warehouse_stocktake_items_tenant_isolation" ON "warehouse_stocktake_items" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "warehouse_stocktakes_tenant_isolation" ON "warehouse_stocktakes" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "waybill_lineage_tenant_isolation" ON "waybill_lineage" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "waybill_number_history_tenant_isolation" ON "waybill_number_history" AS PERMISSIVE FOR ALL TO "zhili_app" USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')) WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), ''));--> statement-breakpoint
CREATE POLICY "device_media_reservations_tenant_isolation" ON "device_media_reservations" AS PERMISSIVE FOR ALL TO "zhili_app" USING ((tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text))) WITH CHECK ((tenant_id = NULLIF(current_setting('app.tenant_id'::text, true), ''::text)));
--> statement-breakpoint
-- New tenant data is fail-closed even for a table owner. The global pre-tenant throttle table has
-- no policy or direct grants and is reachable only through the zhili_auth capability below.
ALTER TABLE accepted_quote_order_links FORCE ROW LEVEL SECURITY;
ALTER TABLE bill_of_lading_waybills FORCE ROW LEVEL SECURITY;
ALTER TABLE declaration_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE delivery_task_waybills FORCE ROW LEVEL SECURITY;
ALTER TABLE fba_shipment_cartons FORCE ROW LEVEL SECURITY;
ALTER TABLE fba_shipment_links FORCE ROW LEVEL SECURITY;
ALTER TABLE label_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE last_mile_charge_generation_tasks FORCE ROW LEVEL SECURITY;
ALTER TABLE last_mile_charge_generations FORCE ROW LEVEL SECURITY;
ALTER TABLE last_mile_intake_expected_waybills FORCE ROW LEVEL SECURITY;
ALTER TABLE last_mile_intake_scans FORCE ROW LEVEL SECURITY;
ALTER TABLE last_mile_intakes FORCE ROW LEVEL SECURITY;
ALTER TABLE load_unit_waybills FORCE ROW LEVEL SECURITY;
ALTER TABLE order_package_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_event_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE partner_event_replay_attempts FORCE ROW LEVEL SECURITY;
ALTER TABLE pod_version_media FORCE ROW LEVEL SECURITY;
ALTER TABLE reauthentication_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE shipment_restriction_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE transaction_command_contexts FORCE ROW LEVEL SECURITY;
ALTER TABLE user_organization_memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE warehouse_location_inventory FORCE ROW LEVEL SECURITY;
ALTER TABLE warehouse_location_inventory_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stocktake_items FORCE ROW LEVEL SECURITY;
ALTER TABLE warehouse_stocktakes FORCE ROW LEVEL SECURITY;
ALTER TABLE waybill_lineage FORCE ROW LEVEL SECURITY;
ALTER TABLE waybill_number_history FORCE ROW LEVEL SECURITY;
ALTER TABLE device_media_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE login_throttle_buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_throttle_buckets FORCE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  accepted_quote_order_links,
  bill_of_lading_waybills,
  declaration_attachments,
  delivery_task_waybills,
  fba_shipment_cartons,
  fba_shipment_links,
  label_jobs,
  last_mile_charge_generation_tasks,
  last_mile_charge_generations,
  last_mile_intake_expected_waybills,
  last_mile_intake_scans,
  last_mile_intakes,
  load_unit_waybills,
  order_package_snapshots,
  partner_contacts,
  partner_event_receipts,
  partner_event_replay_attempts,
  pod_version_media,
  reauthentication_grants,
  shipment_restriction_rules,
  transaction_command_contexts,
  user_organization_memberships,
  warehouse_location_inventory,
  warehouse_location_inventory_ledger,
  warehouse_stocktake_items,
  warehouse_stocktakes,
  waybill_lineage,
  waybill_number_history,
  device_media_reservations
TO zhili_app;

CREATE FUNCTION auth_lookup_refresh_token(p_token_hash text)
RETURNS TABLE (
  token_id text,
  tenant_id text,
  family_id text,
  session_id text,
  token_status text,
  family_status text,
  expires_at timestamptz,
  token_version bigint,
  family_version bigint
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH candidate AS MATERIALIZED (
    SELECT
      token_row.id AS token_id,
      token_row.tenant_id,
      token_row.family_id,
      family_row.session_id,
      token_row.status AS token_status,
      family_row.status AS family_status,
      token_row.expires_at,
      token_row.version AS token_version,
      family_row.version AS family_version
    FROM public.refresh_tokens token_row
    JOIN public.refresh_token_families family_row
      ON family_row.tenant_id = token_row.tenant_id
     AND family_row.id = token_row.family_id
    WHERE token_row.token_hash = lower(btrim(p_token_hash))
      AND p_token_hash ~ '^[0-9a-fA-F]{64}$'
    LIMIT 1
  )
  SELECT * FROM candidate
  UNION ALL
  SELECT
    '01J0000000000000000000000C',
    '01J0000000000000000000000A',
    '01J0000000000000000000000D',
    '01J0000000000000000000000E',
    'REVOKED',
    'REVOKED',
    '1970-01-01 00:00:00+00'::timestamptz,
    1::bigint,
    1::bigint
  WHERE NOT EXISTS (SELECT 1 FROM candidate)
$$;

COMMENT ON FUNCTION auth_lookup_refresh_token(text) IS
  'Returns exactly one credential-shaped row for an opaque refresh hash. The auth service must reject all non-ACTIVE or expired rows generically and handle ROTATED reuse.';
REVOKE ALL ON FUNCTION auth_lookup_refresh_token(text) FROM PUBLIC;
REVOKE ALL ON TABLE refresh_tokens, refresh_token_families FROM zhili_auth;
GRANT EXECUTE ON FUNCTION auth_lookup_refresh_token(text) TO zhili_auth;

CREATE FUNCTION auth_consume_login_throttle(
  p_bucket_id text,
  p_login_key_hash text,
  p_tenant_id text,
  p_succeeded boolean,
  p_now timestamptz DEFAULT clock_timestamp()
)
RETURNS TABLE (allowed boolean, failure_count integer, retry_after_seconds integer, bucket_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  bucket login_throttle_buckets%ROWTYPE;
BEGIN
  IF p_bucket_id !~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'
     OR p_login_key_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid throttle capability input' USING ERRCODE = '22023';
  END IF;

  IF p_succeeded THEN
    DELETE FROM public.login_throttle_buckets
    WHERE login_key_hash = p_login_key_hash;
    RETURN QUERY SELECT true, 0, 0, 1::bigint;
    RETURN;
  END IF;

  INSERT INTO public.login_throttle_buckets (
    id, tenant_id, login_key_hash, window_started_at, failure_count,
    blocked_until, version, created_at, updated_at
  ) VALUES (
    p_bucket_id, p_tenant_id, p_login_key_hash, p_now, 1, NULL, 1, p_now, p_now
  )
  ON CONFLICT (login_key_hash) DO UPDATE
  SET
    tenant_id = COALESCE(login_throttle_buckets.tenant_id, EXCLUDED.tenant_id),
    window_started_at = CASE
      WHEN login_throttle_buckets.window_started_at <= p_now - interval '15 minutes'
        THEN p_now ELSE login_throttle_buckets.window_started_at END,
    failure_count = CASE
      WHEN login_throttle_buckets.window_started_at <= p_now - interval '15 minutes'
        THEN 1 ELSE login_throttle_buckets.failure_count + 1 END,
    blocked_until = CASE
      WHEN (CASE
        WHEN login_throttle_buckets.window_started_at <= p_now - interval '15 minutes'
          THEN 1 ELSE login_throttle_buckets.failure_count + 1 END) >= 5
        THEN GREATEST(COALESCE(login_throttle_buckets.blocked_until, p_now), p_now + interval '15 minutes')
      ELSE login_throttle_buckets.blocked_until END,
    version = login_throttle_buckets.version + 1,
    updated_at = p_now
  RETURNING * INTO bucket;

  RETURN QUERY SELECT
    bucket.blocked_until IS NULL OR bucket.blocked_until <= p_now,
    bucket.failure_count,
    GREATEST(0, CEIL(EXTRACT(EPOCH FROM (bucket.blocked_until - p_now)))::integer),
    bucket.version;
END;
$$;

COMMENT ON FUNCTION auth_consume_login_throttle(text, text, text, boolean, timestamptz) IS
  'Atomically consumes a distributed login throttle attempt without granting direct table access.';
REVOKE ALL ON FUNCTION auth_consume_login_throttle(text, text, text, boolean, timestamptz) FROM PUBLIC;
REVOKE ALL ON TABLE login_throttle_buckets FROM zhili_auth;
GRANT EXECUTE ON FUNCTION auth_consume_login_throttle(text, text, text, boolean, timestamptz)
TO zhili_auth;

CREATE FUNCTION control_plane_replace_entitlements(
  p_actor_tenant_id text,
  p_actor_user_id text,
  p_target_tenant_id text,
  p_expected_tenant_version bigint,
  p_modules jsonb,
  p_operation_id text,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS TABLE (tenant_id text, modules jsonb, tenant_version bigint, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  idempotency_inserted integer;
  stored_hash text;
  stored_response jsonb;
  response jsonb;
  updated_tenant_version bigint;
  next_replacement_version bigint;
  module_row jsonb;
  next_module_version integer;
BEGIN
  IF jsonb_typeof(p_modules) <> 'array' OR jsonb_array_length(p_modules) = 0 THEN
    RAISE EXCEPTION 'modules must be a non-empty array' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_modules) module_item
    WHERE module_item->>'id' !~ '^[0-7][0-9A-HJKMNP-TV-Z]{25}$'
       OR module_item->>'moduleCode' !~ '^[a-z0-9][a-z0-9.-]{1,79}$'
       OR jsonb_typeof(module_item->'enabled') <> 'boolean'
       OR jsonb_typeof(module_item->'quotas') <> 'object'
       OR EXISTS (
         SELECT 1 FROM jsonb_each(module_item->'quotas') quota
         WHERE jsonb_typeof(quota.value) <> 'number'
            OR (quota.value #>> '{}')::numeric < 0
            OR trunc((quota.value #>> '{}')::numeric) <> (quota.value #>> '{}')::numeric
       )
  ) THEN
    RAISE EXCEPTION 'module entry is invalid' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT module_item->>'moduleCode'
    FROM jsonb_array_elements(p_modules) module_item
    GROUP BY module_item->>'moduleCode'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'moduleCode values must be unique' USING ERRCODE = '23505';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants actor_tenant
    JOIN public.users actor_user
      ON actor_user.tenant_id = actor_tenant.id AND actor_user.id = p_actor_user_id
    JOIN public.user_role_assignments assignment
      ON assignment.tenant_id = actor_user.tenant_id AND assignment.user_id = actor_user.id
    JOIN public.roles actor_role
      ON actor_role.tenant_id = assignment.tenant_id AND actor_role.id = assignment.role_id
    JOIN public.role_grants actor_grant
      ON actor_grant.tenant_id = actor_role.tenant_id AND actor_grant.role_id = actor_role.id
    WHERE actor_tenant.id = p_actor_tenant_id
      AND actor_tenant.status = 'ACTIVE'
      AND actor_user.status = 'ACTIVE'
      AND assignment.status = 'ACTIVE'
      AND assignment.valid_from <= now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
      AND actor_role.status = 'ACTIVE'
      AND actor_grant.action_code = 'platform.entitlement.write'
      AND actor_grant.effect = 'ALLOW'
      AND actor_grant.status = 'ACTIVE'
      AND actor_grant.data_scope_kind = 'PLATFORM'
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_role_assignments denied_assignment
        JOIN public.roles denied_role
          ON denied_role.tenant_id = denied_assignment.tenant_id
         AND denied_role.id = denied_assignment.role_id
        JOIN public.role_grants denied_grant
          ON denied_grant.tenant_id = denied_role.tenant_id
         AND denied_grant.role_id = denied_role.id
        WHERE denied_assignment.tenant_id = actor_user.tenant_id
          AND denied_assignment.user_id = actor_user.id
          AND denied_assignment.status = 'ACTIVE'
          AND denied_assignment.valid_from <= now()
          AND (denied_assignment.valid_until IS NULL OR denied_assignment.valid_until > now())
          AND denied_role.status = 'ACTIVE'
          AND denied_grant.action_code = 'platform.entitlement.write'
          AND denied_grant.effect = 'DENY'
          AND denied_grant.status = 'ACTIVE'
          AND denied_grant.data_scope_kind = 'PLATFORM'
      )
  ) THEN
    RAISE EXCEPTION 'control-plane actor is not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.idempotency_records (
    id, tenant_id, idempotency_key, request_hash, expires_at
  ) VALUES (
    p_operation_id, p_actor_tenant_id, p_idempotency_key, p_request_hash,
    now() + interval '24 hours'
  )
  ON CONFLICT ON CONSTRAINT idempotency_records_tenant_key_unique DO NOTHING;
  GET DIAGNOSTICS idempotency_inserted = ROW_COUNT;
  IF idempotency_inserted = 0 THEN
    SELECT record_row.request_hash, record_row.response_body
    INTO stored_hash, stored_response
    FROM public.idempotency_records record_row
    WHERE record_row.tenant_id = p_actor_tenant_id
      AND record_row.idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF stored_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION 'idempotency key request hash mismatch' USING ERRCODE = '23514';
    END IF;
    IF stored_response IS NULL THEN
      RAISE EXCEPTION 'idempotent command is still in progress' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT
      stored_response->>'tenant_id', stored_response->'modules',
      (stored_response->>'tenant_version')::bigint, true;
    RETURN;
  END IF;

  UPDATE public.tenants target_tenant
  SET version = target_tenant.version + 1, updated_at = now()
  WHERE target_tenant.id = p_target_tenant_id
    AND target_tenant.version = p_expected_tenant_version
  RETURNING target_tenant.version INTO updated_tenant_version;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.tenants WHERE id = p_target_tenant_id) THEN
      RAISE EXCEPTION 'tenant version is stale' USING ERRCODE = '40001';
    END IF;
    RAISE EXCEPTION 'tenant not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(max(existing.replacement_version) + 1, 1)
  INTO next_replacement_version
  FROM public.tenant_entitlements existing
  WHERE existing.tenant_id = p_target_tenant_id;

  UPDATE public.tenant_entitlements existing
  SET state = 'RETIRED', version = existing.version + 1
  WHERE existing.tenant_id = p_target_tenant_id AND existing.state = 'ACTIVE';

  FOR module_row IN SELECT value FROM jsonb_array_elements(p_modules)
  LOOP
    SELECT COALESCE(max(existing.entitlement_version), 0) + 1
    INTO next_module_version
    FROM public.tenant_entitlements existing
    WHERE existing.tenant_id = p_target_tenant_id
      AND existing.module_code = module_row->>'moduleCode';

    INSERT INTO public.tenant_entitlements (
      id, tenant_id, module_code, entitlement_version, state, quota_limit,
      quota_map, is_enabled, replacement_version, usage_value, valid_from,
      valid_until, created_by_user_id, created_by_actor_tenant_id,
      created_by_actor_subject_id, version
    ) VALUES (
      module_row->>'id', p_target_tenant_id, module_row->>'moduleCode',
      next_module_version, 'ACTIVE', NULL, module_row->'quotas',
      (module_row->>'enabled')::boolean, next_replacement_version, 0, now(),
      NULLIF(module_row->>'expiresAt', '')::timestamptz, NULL,
      p_actor_tenant_id, p_actor_user_id, 1
    );
  END LOOP;

  response := jsonb_build_object(
    'tenant_id', p_target_tenant_id,
    'modules', (
      SELECT jsonb_agg(module_item.value - 'id' ORDER BY module_item.ordinality)
      FROM jsonb_array_elements(p_modules) WITH ORDINALITY AS module_item(value, ordinality)
    ),
    'tenant_version', updated_tenant_version,
    'replacement_version', next_replacement_version
  );
  INSERT INTO public.audit_events (
    id, tenant_id, subject_id, request_id, action, entity_type, entity_id, payload
  ) VALUES (
    p_operation_id, p_actor_tenant_id, p_actor_user_id, p_operation_id,
    'platform.tenant-entitlements.replaced', 'tenant', p_target_tenant_id,
    jsonb_build_object('target_tenant_id', p_target_tenant_id, 'response', response)
  );
  INSERT INTO public.outbox_events (
    id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, dedupe_key, trace_id
  ) VALUES (
    p_operation_id, p_target_tenant_id, 'TENANT', p_target_tenant_id,
    updated_tenant_version, 'TENANT_ENTITLEMENTS_REPLACED', response,
    'control:' || p_operation_id, p_operation_id
  );
  UPDATE public.idempotency_records record_row
  SET response_status = 200, response_headers = '{}'::jsonb, response_body = response
  WHERE record_row.tenant_id = p_actor_tenant_id
    AND record_row.idempotency_key = p_idempotency_key;

  RETURN QUERY SELECT
    p_target_tenant_id, response->'modules', updated_tenant_version, false;
END;
$$;

REVOKE ALL ON FUNCTION control_plane_replace_entitlements(
  text, text, text, bigint, jsonb, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control_plane_replace_entitlements(
  text, text, text, bigint, jsonb, text, text, text
) TO zhili_control_plane;

-- Complete the pre-tenant OAuth boundary without granting zhili_auth direct tenant-table access.
CREATE FUNCTION auth_resolve_tenant(p_slug text)
RETURNS TABLE (tenant_id text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH candidate AS MATERIALIZED (
    SELECT tenant_row.id AS tenant_id
    FROM public.tenants tenant_row
    WHERE tenant_row.slug = lower(btrim(p_slug))
      AND tenant_row.status = 'ACTIVE'
      AND p_slug IS NOT NULL
    LIMIT 1
  )
  SELECT candidate.tenant_id FROM candidate
  UNION ALL
  SELECT '01J0000000000000000000000A'
  WHERE NOT EXISTS (SELECT 1 FROM candidate)
$$;

CREATE FUNCTION auth_lookup_oauth_state(p_state_hash text)
RETURNS TABLE (tenant_id text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  WITH candidate AS MATERIALIZED (
    SELECT state_row.tenant_id
    FROM public.oauth_states state_row
    JOIN public.tenants tenant_row ON tenant_row.id = state_row.tenant_id
    WHERE state_row.state_hash = lower(btrim(p_state_hash))
      AND p_state_hash ~ '^[0-9a-fA-F]{64}$'
      AND state_row.status = 'PENDING'
      AND state_row.expires_at > now()
      AND tenant_row.status = 'ACTIVE'
    LIMIT 1
  )
  SELECT candidate.tenant_id FROM candidate
  UNION ALL
  SELECT '01J0000000000000000000000A'
  WHERE NOT EXISTS (SELECT 1 FROM candidate)
$$;

COMMENT ON FUNCTION auth_resolve_tenant(text) IS
  'Resolves an active tenant slug to one tenant-shaped row; misses return the fixed dummy tenant.';
COMMENT ON FUNCTION auth_lookup_oauth_state(text) IS
  'Resolves a pending unexpired OAuth state digest to one tenant-shaped row; misses return the fixed dummy tenant. Consumption must still re-check hash, redirect, status and expiry under tenant RLS.';
REVOKE ALL ON FUNCTION auth_resolve_tenant(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION auth_lookup_oauth_state(text) FROM PUBLIC;
REVOKE ALL ON TABLE tenants, oauth_states FROM zhili_auth;
GRANT EXECUTE ON FUNCTION auth_resolve_tenant(text) TO zhili_auth;
GRANT EXECUTE ON FUNCTION auth_lookup_oauth_state(text) TO zhili_auth;

-- 0001 exposed an eight-argument tenant creator before timezone/currency were persistent. Keep its
-- body solely for an exact down migration, but remove it from the capability surface.
REVOKE ALL ON FUNCTION control_plane_create_tenant(
  text, text, text, text, text, text, text, text
) FROM zhili_control_plane;
ALTER FUNCTION control_plane_create_tenant(
  text, text, text, text, text, text, text, text
) RENAME TO control_plane_create_tenant_legacy;

CREATE FUNCTION control_plane_create_tenant(
  p_actor_tenant_id text,
  p_actor_user_id text,
  p_target_tenant_id text,
  p_slug text,
  p_display_name text,
  p_default_timezone text,
  p_default_currency text,
  p_operation_id text,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS TABLE (tenant_id text, status text, version bigint, replayed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  idempotency_inserted integer;
  stored_hash text;
  stored_response jsonb;
  response jsonb;
BEGIN
  IF p_default_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'default currency is invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names timezone_row
    WHERE timezone_row.name = btrim(p_default_timezone)
  ) THEN
    RAISE EXCEPTION 'default timezone is invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants actor_tenant
    JOIN public.users actor_user
      ON actor_user.tenant_id = actor_tenant.id AND actor_user.id = p_actor_user_id
    JOIN public.user_role_assignments assignment
      ON assignment.tenant_id = actor_user.tenant_id AND assignment.user_id = actor_user.id
    JOIN public.roles actor_role
      ON actor_role.tenant_id = assignment.tenant_id AND actor_role.id = assignment.role_id
    JOIN public.role_grants actor_grant
      ON actor_grant.tenant_id = actor_role.tenant_id AND actor_grant.role_id = actor_role.id
    WHERE actor_tenant.id = p_actor_tenant_id
      AND actor_tenant.status = 'ACTIVE'
      AND actor_user.status = 'ACTIVE'
      AND assignment.status = 'ACTIVE'
      AND assignment.valid_from <= now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
      AND actor_role.status = 'ACTIVE'
      AND actor_grant.action_code = 'platform.tenant.manage'
      AND actor_grant.effect = 'ALLOW'
      AND actor_grant.status = 'ACTIVE'
      AND actor_grant.data_scope_kind = 'PLATFORM'
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_role_assignments denied_assignment
        JOIN public.roles denied_role
          ON denied_role.tenant_id = denied_assignment.tenant_id
         AND denied_role.id = denied_assignment.role_id
        JOIN public.role_grants denied_grant
          ON denied_grant.tenant_id = denied_role.tenant_id
         AND denied_grant.role_id = denied_role.id
        WHERE denied_assignment.tenant_id = actor_user.tenant_id
          AND denied_assignment.user_id = actor_user.id
          AND denied_assignment.status = 'ACTIVE'
          AND denied_assignment.valid_from <= now()
          AND (denied_assignment.valid_until IS NULL OR denied_assignment.valid_until > now())
          AND denied_role.status = 'ACTIVE'
          AND denied_grant.action_code = 'platform.tenant.manage'
          AND denied_grant.effect = 'DENY'
          AND denied_grant.status = 'ACTIVE'
          AND denied_grant.data_scope_kind = 'PLATFORM'
      )
  ) THEN
    RAISE EXCEPTION 'control-plane actor is not authorized' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.idempotency_records (
    id, tenant_id, idempotency_key, request_hash, expires_at
  ) VALUES (
    p_operation_id, p_actor_tenant_id, p_idempotency_key, p_request_hash,
    now() + interval '24 hours'
  )
  ON CONFLICT ON CONSTRAINT idempotency_records_tenant_key_unique DO NOTHING;
  GET DIAGNOSTICS idempotency_inserted = ROW_COUNT;
  IF idempotency_inserted = 0 THEN
    SELECT record_row.request_hash, record_row.response_body
    INTO stored_hash, stored_response
    FROM public.idempotency_records record_row
    WHERE record_row.tenant_id = p_actor_tenant_id
      AND record_row.idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF stored_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION 'idempotency key request hash mismatch' USING ERRCODE = '23514';
    END IF;
    IF stored_response IS NULL THEN
      RAISE EXCEPTION 'idempotent command is still in progress' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT
      stored_response->>'tenant_id', stored_response->>'status',
      (stored_response->>'version')::bigint, true;
    RETURN;
  END IF;

  INSERT INTO public.tenants (
    id, slug, display_name, default_timezone, default_currency
  ) VALUES (
    p_target_tenant_id, lower(btrim(p_slug)), p_display_name,
    btrim(p_default_timezone), p_default_currency
  );

  response := jsonb_build_object(
    'tenant_id', p_target_tenant_id,
    'status', 'ACTIVE',
    'version', 1,
    'default_timezone', btrim(p_default_timezone),
    'default_currency', p_default_currency
  );
  INSERT INTO public.audit_events (
    id, tenant_id, subject_id, request_id, action, entity_type, entity_id, payload
  ) VALUES (
    p_operation_id, p_actor_tenant_id, p_actor_user_id, p_operation_id,
    'platform.tenant.created', 'tenant', p_target_tenant_id,
    jsonb_build_object('target_tenant_id', p_target_tenant_id, 'response', response)
  );
  INSERT INTO public.outbox_events (
    id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, dedupe_key, trace_id
  ) VALUES (
    p_operation_id, p_target_tenant_id, 'TENANT', p_target_tenant_id, 1,
    'TENANT_CREATED', response, 'control:' || p_operation_id, p_operation_id
  );
  UPDATE public.idempotency_records record_row
  SET response_status = 201, response_headers = '{}'::jsonb, response_body = response
  WHERE record_row.tenant_id = p_actor_tenant_id
    AND record_row.idempotency_key = p_idempotency_key;

  RETURN QUERY SELECT p_target_tenant_id, 'ACTIVE'::text, 1::bigint, false;
END;
$$;

INSERT INTO permission_actions (action_code, resource_type, description) VALUES
  ('platform.impersonate', 'tenant', 'Start and end audited cross-tenant impersonation')
ON CONFLICT (action_code) DO NOTHING;

CREATE FUNCTION control_plane_start_impersonation(
  p_actor_tenant_id text,
  p_actor_user_id text,
  p_target_tenant_id text,
  p_impersonation_id text,
  p_reason text,
  p_duration_minutes integer,
  p_operation_id text,
  p_idempotency_key text,
  p_request_hash text
)
RETURNS TABLE (
  impersonation_id text,
  tenant_id text,
  actor_id text,
  reason text,
  expires_at timestamptz,
  version bigint,
  replayed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  idempotency_inserted integer;
  stored_hash text;
  stored_response jsonb;
  response jsonb;
  started_time timestamptz;
  expires_time timestamptz;
BEGIN
  IF p_target_tenant_id = p_actor_tenant_id
     OR length(btrim(p_reason)) NOT BETWEEN 10 AND 500
     OR p_duration_minutes NOT BETWEEN 5 AND 60 THEN
    RAISE EXCEPTION 'impersonation request is invalid' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenants actor_tenant
    JOIN public.users actor_user
      ON actor_user.tenant_id = actor_tenant.id AND actor_user.id = p_actor_user_id
    JOIN public.user_role_assignments assignment
      ON assignment.tenant_id = actor_user.tenant_id AND assignment.user_id = actor_user.id
    JOIN public.roles actor_role
      ON actor_role.tenant_id = assignment.tenant_id AND actor_role.id = assignment.role_id
    JOIN public.role_grants actor_grant
      ON actor_grant.tenant_id = actor_role.tenant_id AND actor_grant.role_id = actor_role.id
    WHERE actor_tenant.id = p_actor_tenant_id
      AND actor_tenant.status = 'ACTIVE'
      AND actor_user.status = 'ACTIVE'
      AND assignment.status = 'ACTIVE'
      AND assignment.valid_from <= now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
      AND actor_role.status = 'ACTIVE'
      AND actor_grant.action_code = 'platform.impersonate'
      AND actor_grant.effect = 'ALLOW'
      AND actor_grant.status = 'ACTIVE'
      AND actor_grant.data_scope_kind = 'PLATFORM'
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_role_assignments denied_assignment
        JOIN public.roles denied_role
          ON denied_role.tenant_id = denied_assignment.tenant_id
         AND denied_role.id = denied_assignment.role_id
        JOIN public.role_grants denied_grant
          ON denied_grant.tenant_id = denied_role.tenant_id
         AND denied_grant.role_id = denied_role.id
        WHERE denied_assignment.tenant_id = actor_user.tenant_id
          AND denied_assignment.user_id = actor_user.id
          AND denied_assignment.status = 'ACTIVE'
          AND denied_assignment.valid_from <= now()
          AND (denied_assignment.valid_until IS NULL OR denied_assignment.valid_until > now())
          AND denied_role.status = 'ACTIVE'
          AND denied_grant.action_code = 'platform.impersonate'
          AND denied_grant.effect = 'DENY'
          AND denied_grant.status = 'ACTIVE'
          AND denied_grant.data_scope_kind = 'PLATFORM'
      )
  ) THEN
    RAISE EXCEPTION 'control-plane actor is not authorized' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants target_tenant
    WHERE target_tenant.id = p_target_tenant_id AND target_tenant.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'target tenant is unavailable' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.idempotency_records (
    id, tenant_id, idempotency_key, request_hash, expires_at
  ) VALUES (
    p_operation_id, p_actor_tenant_id, p_idempotency_key, p_request_hash,
    now() + interval '24 hours'
  )
  ON CONFLICT ON CONSTRAINT idempotency_records_tenant_key_unique DO NOTHING;
  GET DIAGNOSTICS idempotency_inserted = ROW_COUNT;
  IF idempotency_inserted = 0 THEN
    SELECT record_row.request_hash, record_row.response_body
    INTO stored_hash, stored_response
    FROM public.idempotency_records record_row
    WHERE record_row.tenant_id = p_actor_tenant_id
      AND record_row.idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF stored_hash IS DISTINCT FROM p_request_hash THEN
      RAISE EXCEPTION 'idempotency key request hash mismatch' USING ERRCODE = '23514';
    END IF;
    IF stored_response IS NULL THEN
      RAISE EXCEPTION 'idempotent command is still in progress' USING ERRCODE = '40001';
    END IF;
    RETURN QUERY SELECT
      stored_response->>'impersonation_id', stored_response->>'tenant_id',
      stored_response->>'actor_id', stored_response->>'reason',
      (stored_response->>'expires_at')::timestamptz,
      (stored_response->>'version')::bigint, true;
    RETURN;
  END IF;

  started_time := clock_timestamp();
  expires_time := started_time + make_interval(mins => p_duration_minutes);
  UPDATE public.impersonation_sessions stale_session
  SET status = 'EXPIRED', ended_at = started_time,
      ended_reason = 'Expired before replacement',
      version = stale_session.version + 1, updated_at = started_time
  WHERE stale_session.tenant_id = p_target_tenant_id
    AND stale_session.actor_subject_id = p_actor_user_id
    AND stale_session.status = 'ACTIVE'
    AND stale_session.expires_at <= started_time;
  INSERT INTO public.impersonation_sessions (
    id, tenant_id, actor_subject_id, reason, started_at, expires_at
  ) VALUES (
    p_impersonation_id, p_target_tenant_id, p_actor_user_id,
    btrim(p_reason), started_time, expires_time
  );

  response := jsonb_build_object(
    'impersonation_id', p_impersonation_id,
    'tenant_id', p_target_tenant_id,
    'actor_id', p_actor_user_id,
    'reason', btrim(p_reason),
    'expires_at', expires_time,
    'version', 1
  );
  INSERT INTO public.audit_events (
    id, tenant_id, subject_id, request_id, action, entity_type, entity_id, payload
  ) VALUES (
    p_operation_id, p_actor_tenant_id, p_actor_user_id, p_operation_id,
    'platform.impersonation.started', 'impersonation', p_impersonation_id,
    jsonb_build_object('target_tenant_id', p_target_tenant_id, 'response', response)
  );
  INSERT INTO public.outbox_events (
    id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, dedupe_key, trace_id
  ) VALUES (
    p_operation_id, p_target_tenant_id, 'IMPERSONATION', p_impersonation_id, 1,
    'IMPERSONATION_STARTED', response, 'control:' || p_operation_id, p_operation_id
  );
  UPDATE public.idempotency_records record_row
  SET response_status = 201, response_headers = '{}'::jsonb, response_body = response
  WHERE record_row.tenant_id = p_actor_tenant_id
    AND record_row.idempotency_key = p_idempotency_key;

  RETURN QUERY SELECT
    p_impersonation_id, p_target_tenant_id, p_actor_user_id, btrim(p_reason),
    expires_time, 1::bigint, false;
END;
$$;

CREATE FUNCTION control_plane_end_impersonation(
  p_actor_tenant_id text,
  p_actor_user_id text,
  p_target_tenant_id text,
  p_impersonation_id text,
  p_operation_id text,
  p_end_reason text
)
RETURNS TABLE (impersonation_id text, tenant_id text, version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  updated_version bigint;
  response jsonb;
BEGIN
  IF length(btrim(p_end_reason)) < 1 OR NOT EXISTS (
    SELECT 1 FROM public.users actor_user
    WHERE actor_user.tenant_id = p_actor_tenant_id
      AND actor_user.id = p_actor_user_id
      AND actor_user.status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'impersonation actor is invalid' USING ERRCODE = '42501';
  END IF;

  UPDATE public.impersonation_sessions session_row
  SET status = 'ENDED', ended_at = clock_timestamp(), ended_reason = btrim(p_end_reason),
      version = session_row.version + 1, updated_at = clock_timestamp()
  WHERE session_row.tenant_id = p_target_tenant_id
    AND session_row.id = p_impersonation_id
    AND session_row.actor_subject_id = p_actor_user_id
    AND session_row.status = 'ACTIVE'
    AND session_row.expires_at > clock_timestamp()
  RETURNING session_row.version INTO updated_version;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active impersonation not found' USING ERRCODE = 'P0002';
  END IF;

  response := jsonb_build_object(
    'impersonation_id', p_impersonation_id,
    'tenant_id', p_target_tenant_id,
    'actor_id', p_actor_user_id,
    'status', 'ENDED',
    'version', updated_version
  );
  INSERT INTO public.audit_events (
    id, tenant_id, subject_id, request_id, action, entity_type, entity_id, payload
  ) VALUES (
    p_operation_id, p_actor_tenant_id, p_actor_user_id, p_operation_id,
    'platform.impersonation.ended', 'impersonation', p_impersonation_id,
    jsonb_build_object('target_tenant_id', p_target_tenant_id, 'response', response)
  );
  INSERT INTO public.outbox_events (
    id, tenant_id, aggregate_type, aggregate_id, aggregate_version,
    event_type, payload, dedupe_key, trace_id
  ) VALUES (
    p_operation_id, p_target_tenant_id, 'IMPERSONATION', p_impersonation_id,
    updated_version, 'IMPERSONATION_ENDED', response,
    'control:' || p_operation_id, p_operation_id
  );

  RETURN QUERY SELECT p_impersonation_id, p_target_tenant_id, updated_version;
END;
$$;

REVOKE ALL ON FUNCTION control_plane_create_tenant(
  text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION control_plane_start_impersonation(
  text, text, text, text, text, integer, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION control_plane_end_impersonation(
  text, text, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION control_plane_create_tenant(
  text, text, text, text, text, text, text, text, text, text
) TO zhili_control_plane;
GRANT EXECUTE ON FUNCTION control_plane_start_impersonation(
  text, text, text, text, text, integer, text, text, text
) TO zhili_control_plane;
GRANT EXECUTE ON FUNCTION control_plane_end_impersonation(
  text, text, text, text, text, text
) TO zhili_control_plane;
