CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" text NOT NULL,
	"user_id" integer,
	"body" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csv_import_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"import_id" integer NOT NULL,
	"row_number" integer,
	"raw_data" text,
	"error_message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "csv_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"imported_by" integer,
	"imported_at" text DEFAULT now() NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"success_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fabric_colors" (
	"id" serial PRIMARY KEY NOT NULL,
	"fabric_details_id" integer NOT NULL,
	"fabric_code" text NOT NULL,
	"color_code" text NOT NULL,
	"supplier" text,
	"synced_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fabric_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"style" text NOT NULL,
	"product" text NOT NULL,
	"fabric_code" text NOT NULL,
	"print_method" text,
	"decorations" text,
	"synced_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fpe_suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"style_code" text NOT NULL,
	"product" text NOT NULL,
	"supplier_name" text NOT NULL,
	"sales_rep" text,
	"email" text,
	"current_supplier" boolean DEFAULT false NOT NULL,
	"standard_shipping_moq" text,
	"economy_shipping_moq" text,
	"v4_blanks_sea_price" text,
	"v4_blanks_air_price" text,
	"air_ship_price" text,
	"sea_ship_price" text,
	"bulk_production_timeline" text,
	"air_shipping_timeline" text,
	"sea_shipping_timeline" text,
	"weights" text,
	"synced_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_reads" (
	"id" serial PRIMARY KEY NOT NULL,
	"notification_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"read_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"order_item_id" text NOT NULL,
	"supplier_id" integer NOT NULL,
	"triggered_by" integer,
	"message" text NOT NULL,
	"audience" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" text NOT NULL,
	"type" text NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"uploaded_by" integer,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"order_item_id" text NOT NULL,
	"order_name" text,
	"order_created_at" text,
	"style_code" text,
	"color" text,
	"template_pdf" text,
	"printer_ship_date" text,
	"original_printer_ship_date" text,
	"delay_reason" text,
	"supplier_id" integer,
	"print_type" text,
	"print_locations" integer,
	"decorating_methods" text,
	"due_date" text,
	"total_value" real,
	"quantity" integer,
	"status" text DEFAULT 'in_production' NOT NULL,
	"production_stage" text DEFAULT 'sample_production',
	"test_print_status" text,
	"test_print_rejections" integer DEFAULT 0 NOT NULL,
	"shipping_method" text,
	"requires_test_print" boolean DEFAULT false NOT NULL,
	"tracking_number" text,
	"in_hands_date" text,
	"supplier_ship_date" text,
	"test_print_date" text,
	"client_name" text,
	"delivery_address" text,
	"imported_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_order_item_id_unique" UNIQUE("order_item_id")
);
--> statement-breakpoint
CREATE TABLE "status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"changed_by" integer,
	"changed_at" text DEFAULT now() NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "supplier_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"supplier_id" integer NOT NULL,
	"date" text NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"nickname" text,
	"contact_email" text,
	"contact_phone" text,
	"poc_name" text,
	"poc_email" text,
	"poc_phone" text,
	"sales_rep_name" text,
	"address" text,
	"comments" text,
	"turn_time" integer,
	"capacity_units" integer,
	"test_print_tat" integer,
	"production_time" integer,
	"shipping_time_air" integer,
	"shipping_time_sea" integer,
	"active" boolean DEFAULT true NOT NULL,
	"poc_user_id" integer,
	"created_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "test_print_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" text NOT NULL,
	"upload_count" integer DEFAULT 1 NOT NULL,
	"first_upload_time" text DEFAULT now() NOT NULL,
	"notification_sent_at" text,
	"created_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "test_print_queue_order_item_id_unique" UNIQUE("order_item_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'internal' NOT NULL,
	"supplier_id" integer,
	"created_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "users_auth_id_unique" UNIQUE("auth_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_order_item_id_order_items_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("order_item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_import_errors" ADD CONSTRAINT "csv_import_errors_import_id_csv_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."csv_imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "csv_imports" ADD CONSTRAINT "csv_imports_imported_by_users_id_fk" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fabric_colors" ADD CONSTRAINT "fabric_colors_fabric_details_id_fabric_details_id_fk" FOREIGN KEY ("fabric_details_id") REFERENCES "public"."fabric_details"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_order_item_id_order_items_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("order_item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_images" ADD CONSTRAINT "order_images_order_item_id_order_items_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("order_item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_images" ADD CONSTRAINT "order_images_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_order_item_id_order_items_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("order_item_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_overrides" ADD CONSTRAINT "supplier_overrides_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_fabric_colors_fabric_details_id" ON "fabric_colors" USING btree ("fabric_details_id");--> statement-breakpoint
CREATE INDEX "idx_fabric_colors_fabric_code" ON "fabric_colors" USING btree ("fabric_code");--> statement-breakpoint
CREATE INDEX "idx_fabric_colors_color_code" ON "fabric_colors" USING btree ("color_code");--> statement-breakpoint
CREATE INDEX "idx_fabric_details_style" ON "fabric_details" USING btree ("style");--> statement-breakpoint
CREATE INDEX "idx_fabric_details_fabric_code" ON "fabric_details" USING btree ("fabric_code");--> statement-breakpoint
CREATE INDEX "idx_fpe_suppliers_style_code" ON "fpe_suppliers" USING btree ("style_code");--> statement-breakpoint
CREATE INDEX "idx_fpe_suppliers_supplier_name" ON "fpe_suppliers" USING btree ("supplier_name");--> statement-breakpoint
CREATE INDEX "idx_order_items_order_id" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_supplier_id" ON "order_items" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_order_items_status" ON "order_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_order_items_due_date" ON "order_items" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "idx_test_print_queue_order_item" ON "test_print_queue" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "idx_test_print_queue_notification_sent" ON "test_print_queue" USING btree ("notification_sent_at");