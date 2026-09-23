import {
  pgTable,
  text,
  integer,
  real,
  serial,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  nickname: text("nickname"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  pocName: text("poc_name"),
  pocEmail: text("poc_email"),
  pocPhone: text("poc_phone"),
  salesRepName: text("sales_rep_name"),
  address: text("address"),
  comments: text("comments"),
  turnTime: integer("turn_time"),
  // DEPRECATED — orders per DAY, kept for its data and no longer read or
  // written by anything. It had to be reconciled by hand against
  // production_time, and getting that relationship wrong is what made the
  // capacity display untrustworthy. weeklyCapacity replaces it; the daily
  // ceiling is now DERIVED. Same treatment as printerShipDate: left in place,
  // not an input. Do not add a new read.
  capacityUnits: integer("capacity_units"),
  // Orders per WEEK — the only capacity figure anyone enters. NULL means "not
  // set yet", and every capacity indicator degrades to a grey "not set" rather
  // than inventing a threshold. See lib/capacity.ts.
  weeklyCapacity: integer("weekly_capacity"),
  testPrintTat: integer("test_print_tat"),
  productionTime: integer("production_time"),
  shippingTimeAir: integer("shipping_time_air"),
  shippingTimeSea: integer("shipping_time_sea"),
  active: boolean("active").notNull().default(true),
  pocUserId: integer("poc_user_id"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  authId: text("auth_id").notNull().unique(), // Supabase auth.users UUID
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("internal"), // 'admin' | 'internal' | 'supplier'
  supplierId: integer("supplier_id").references(() => suppliers.id),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const orderItems = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: text("order_id").notNull(),
    orderItemId: text("order_item_id").notNull().unique(),
    orderName: text("order_name"),
    orderCreatedAt: text("order_created_at"),
    styleCode: text("style_code"),
    color: text("color"),
    templatePdf: text("template_pdf"),
    // DEPRECATED, and retained only as the rollback net for
    // scripts/sql/002_consolidate_ship_date.sql. Still populated, no longer
    // written or read by anything. The sheet's column is titled "printer ship
    // date"; the tool's term for the same date is SUPPLIER ship date, and the
    // data now lives in supplierShipDate / originalSupplierShipDate below. A
    // later migration drops both of these. Do not add a new read.
    printerShipDate: text("printer_ship_date"),
    originalPrinterShipDate: text("original_printer_ship_date"),
    delayReason: text("delay_reason"),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    nominatedSupplierId: integer("nominated_supplier_id").references(() => suppliers.id),
    printType: text("print_type"),
    printLocations: integer("print_locations"),
    decoratingMethods: text("decorating_methods"),
    dueDate: text("due_date"),
    totalValue: real("total_value"),
    quantity: integer("quantity"),
    status: text("status").notNull().default("in_production"),
    productionStage: text("production_stage").default("sample_production"),
    testPrintStatus: text("test_print_status"),
    testPrintRejections: integer("test_print_rejections").notNull().default(0),
    shippingMethod: text("shipping_method"),
    requiresTestPrint: boolean("requires_test_print").notNull().default(false),
    trackingNumber: text("tracking_number"),
    inHandsDate: text("in_hands_date"),
    // The one ship date. Written by the PO Builder (via assign-items), by an
    // in-tool edit, and by import from the sheet's "printer ship date" column.
    // Capacity anchors its production window on this.
    supplierShipDate: text("supplier_ship_date"),
    // The immutable baseline the "this ship date moved" marker compares
    // supplierShipDate against. Set once on first import and never by a client
    // — the PATCH allowlist in /api/orders/[id] deliberately omits it.
    originalSupplierShipDate: text("original_supplier_ship_date"),
    testPrintDate: text("test_print_date"),
    clientName: text("client_name"),
    deliveryAddress: text("delivery_address"),
    // The order PROCESSOR: whoever builds the PO. Deliberately separate from
    // suppliers.poc_user_id, which is the handler of a SUPPLIER. Anyone
    // internal can process any order; being POC of it is unrelated.
    //
    // Set by claiming and never cleared once the PO is built — it is the
    // permanent "who processed this" record. Release only applies while the
    // order is still in the pool.
    processorUserId: integer("processor_user_id").references(() => users.id),
    // When the current claim was taken. A claim older than CLAIM_TTL_MS is
    // treated as abandoned on read, which is why no expiry job exists.
    //
    // ALWAYS written from JS as new Date().toISOString(), never a now()
    // default. Expiry is a string comparison, and Postgres now() renders as
    // "2026-08-24 12:00:00+00" while toISOString() renders
    // "2026-08-24T12:00:00.000Z". Space (0x20) sorts before "T" (0x54), so a
    // column holding both formats compares wrong and every stale claim reads
    // as fresh. One format in, or the lock silently stops expiring.
    claimedAt: text("claimed_at"),
    // When a printer was put on this order. Distinct from claimedAt (who picked
    // the job up — that can precede the PO by days and is cleared on release)
    // and from importedAt (when the row reached the ERP).
    //
    // Written by assign-items from the builder's PO Date, and by an import from
    // the sheet's "Printer Assigned Date" column. ALWAYS an ISO string from
    // toISOString(), never a now() default — the trailing-window comparison is
    // a string comparison and a column holding two formats compares wrong.
    // Same rule, and the same reason, as claimedAt above.
    assignedDate: text("assigned_date"),
    importedAt: text("imported_at").notNull().default(sql`now()`),
    updatedAt: text("updated_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_order_items_order_id").on(t.orderId),
    index("idx_order_items_supplier_id").on(t.supplierId),
    index("idx_order_items_status").on(t.status),
    index("idx_order_items_due_date").on(t.dueDate),
    index("idx_order_items_processor").on(t.processorUserId),
  ]
);

export const statusHistory = pgTable("status_history", {
  id: serial("id").primaryKey(),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItems.orderItemId),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: integer("changed_by").references(() => users.id),
  changedAt: text("changed_at").notNull().default(sql`now()`),
  note: text("note"),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItems.orderItemId),
  userId: integer("user_id").references(() => users.id),
  body: text("body").notNull(),
  isInternal: boolean("is_internal").notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const orderImages = pgTable("order_images", {
  id: serial("id").primaryKey(),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItems.orderItemId),
  type: text("type").notNull(),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const supplierOverrides = pgTable("supplier_overrides", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  date: text("date").notNull(),
  reason: text("reason"),
});

export const csvImports = pgTable("csv_imports", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  importedBy: integer("imported_by").references(() => users.id),
  importedAt: text("imported_at").notNull().default(sql`now()`),
  rowCount: integer("row_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
});

export const csvImportErrors = pgTable("csv_import_errors", {
  id: serial("id").primaryKey(),
  importId: integer("import_id")
    .notNull()
    .references(() => csvImports.id),
  rowNumber: integer("row_number"),
  rawData: text("raw_data"),
  errorMessage: text("error_message").notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  orderItemId: text("order_item_id").notNull().references(() => orderItems.orderItemId),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  triggeredBy: integer("triggered_by").references(() => users.id),
  message: text("message").notNull(),
  audience: text("audience").notNull(), // 'team' | 'supplier'
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const notificationReads = pgTable("notification_reads", {
  id: serial("id").primaryKey(),
  notificationId: integer("notification_id").notNull().references(() => notifications.id),
  userId: integer("user_id").notNull().references(() => users.id),
  readAt: text("read_at").notNull().default(sql`now()`),
});

// PO Builder Data Tables
export const fabricDetails = pgTable(
  "fabric_details",
  {
    id: serial("id").primaryKey(),
    style: text("style").notNull(),
    product: text("product").notNull(),
    fabricCode: text("fabric_code").notNull(),
    printMethod: text("print_method"),
    decorations: text("decorations"),
    syncedAt: text("synced_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_fabric_details_style").on(t.style),
    index("idx_fabric_details_fabric_code").on(t.fabricCode),
  ]
);

export const fabricColors = pgTable(
  "fabric_colors",
  {
    id: serial("id").primaryKey(),
    fabricDetailsId: integer("fabric_details_id").references(() => fabricDetails.id),
    fabricCode: text("fabric_code").notNull(),
    colorCode: text("color_code").notNull(),
    supplier: text("supplier"),
    syncedAt: text("synced_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_fabric_colors_fabric_details_id").on(t.fabricDetailsId),
    index("idx_fabric_colors_fabric_code").on(t.fabricCode),
    index("idx_fabric_colors_color_code").on(t.colorCode),
  ]
);

export const fpeSuppliers = pgTable(
  "fpe_suppliers",
  {
    id: serial("id").primaryKey(),
    styleCode: text("style_code").notNull(),
    product: text("product").notNull(),
    supplierName: text("supplier_name").notNull(),
    salesRep: text("sales_rep"),
    email: text("email"),
    currentSupplier: boolean("current_supplier").notNull().default(false),
    standardShippingMoq: text("standard_shipping_moq"),
    economyShippingMoq: text("economy_shipping_moq"),
    v4BlankSeaPrice: text("v4_blanks_sea_price"),
    v4BlanksAirPrice: text("v4_blanks_air_price"),
    airShipPrice: text("air_ship_price"),
    seaShipPrice: text("sea_ship_price"),
    bulkProductionTimeline: text("bulk_production_timeline"),
    airShippingTimeline: text("air_shipping_timeline"),
    seaShippingTimeline: text("sea_shipping_timeline"),
    weights: text("weights"),
    syncedAt: text("synced_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_fpe_suppliers_style_code").on(t.styleCode),
    index("idx_fpe_suppliers_supplier_name").on(t.supplierName),
  ]
);

export const testPrintQueue = pgTable(
  "test_print_queue",
  {
    id: serial("id").primaryKey(),
    orderItemId: text("order_item_id").notNull().unique(),
    uploadCount: integer("upload_count").notNull().default(1),
    firstUploadTime: text("first_upload_time").notNull().default(sql`now()`),
    notificationSentAt: text("notification_sent_at"),
    createdAt: text("created_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_test_print_queue_order_item").on(t.orderItemId),
    index("idx_test_print_queue_notification_sent").on(t.notificationSentAt),
  ]
);

// Relations
export const suppliersRelations = relations(suppliers, ({ many }) => ({
  users: many(users),
  orderItems: many(orderItems),
}));

export const usersRelations = relations(users, ({ one }) => ({
  supplier: one(suppliers, {
    fields: [users.supplierId],
    references: [suppliers.id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one, many }) => ({
  supplier: one(suppliers, {
    fields: [orderItems.supplierId],
    references: [suppliers.id],
  }),
  statusHistory: many(statusHistory),
  comments: many(comments),
  images: many(orderImages),
}));

export const statusHistoryRelations = relations(statusHistory, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [statusHistory.orderItemId],
    references: [orderItems.orderItemId],
  }),
  changedByUser: one(users, {
    fields: [statusHistory.changedBy],
    references: [users.id],
  }),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [comments.orderItemId],
    references: [orderItems.orderItemId],
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
}));

export const orderImagesRelations = relations(orderImages, ({ one }) => ({
  orderItem: one(orderItems, {
    fields: [orderImages.orderItemId],
    references: [orderItems.orderItemId],
  }),
  uploadedByUser: one(users, {
    fields: [orderImages.uploadedBy],
    references: [users.id],
  }),
}));

export const fabricDetailsRelations = relations(fabricDetails, ({ many }) => ({
  colors: many(fabricColors),
}));

export const fabricColorsRelations = relations(fabricColors, ({ one }) => ({
  fabricDetails: one(fabricDetails, {
    fields: [fabricColors.fabricDetailsId],
    references: [fabricDetails.id],
  }),
}));

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  key: text("key").notNull().unique(), // hashed API key
  createdBy: integer("created_by").notNull().references(() => users.id),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

export const pobFabricColors = pgTable(
  "pob_fabric_colors",
  {
    id: serial("id").primaryKey(),
    fabricCode: text("fabric_code").notNull(),
    colorCode: text("color_code").notNull(),
    syncedAt: text("synced_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_pob_fabric_colors_fabric_code").on(t.fabricCode),
  ]
);

/**
 * The audit trail: one row per change anyone made through the tool.
 *
 * NOTHING HERE IS A FOREIGN KEY, and that is the central design decision.
 *
 * The most important event this table records is a deletion — an order wiped,
 * a user removed, a supplier dropped. A foreign key to order_items would make
 * that impossible to record: ON DELETE CASCADE would erase the evidence along
 * with the order, and a plain reference would block the delete outright. The
 * log has to outlive everything it describes, so it references nothing and
 * every id here is a bare value.
 *
 * The same reasoning drives the denormalised names. actor_name and
 * supplier_name are SNAPSHOTS written at the time of the event, not joins.
 * They keep working after the person leaves and their row is deleted, they
 * still say who did it if someone is later renamed, and they make the search
 * bar a single-table scan instead of a three-way join.
 *
 * created_at is TEXT and is ALWAYS written from JS as toISOString(), never a
 * now() default — the same rule as order_items.claimed_at and assigned_date,
 * and for the same reason: these are compared and sorted as strings, and
 * Postgres now() renders "2026-09-22 12:00:00+00" while toISOString() renders
 * "2026-09-22T12:00:00.000Z". A column holding both formats sorts wrong, which
 * in a log means entries silently appearing in the wrong order.
 *
 * `details` is TEXT holding JSON rather than jsonb: this schema has a SQLite
 * twin that has to stay column-for-column identical, and nothing queries
 * inside it — it is read back whole and rendered.
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: serial("id").primaryKey(),
    createdAt: text("created_at").notNull(),
    /** Null for anything the system did on its own — n8n imports, cron. */
    actorUserId: integer("actor_user_id"),
    actorName: text("actor_name").notNull(),
    /** admin | internal | supplier | system */
    actorRole: text("actor_role").notNull(),
    /** Dotted and stable, e.g. "order.claim". Filtered on; never shown raw. */
    action: text("action").notNull(),
    /** order | supplier | user | import | api_key | capacity */
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** Denormalised so searching an order id is one indexed lookup. */
    orderItemId: text("order_item_id"),
    supplierId: integer("supplier_id"),
    supplierName: text("supplier_name"),
    /** The human sentence shown in the table. Also searched. */
    summary: text("summary").notNull(),
    /** JSON: { field: { from, to } } and anything else worth keeping. */
    details: text("details"),
  },
  (t) => [
    // The log is read newest-first and almost always filtered by nothing else,
    // so this is the index that carries the default view and its pagination.
    index("idx_activity_log_created_at").on(t.createdAt),
    index("idx_activity_log_order_item_id").on(t.orderItemId),
    index("idx_activity_log_actor").on(t.actorUserId),
    index("idx_activity_log_action").on(t.action),
  ]
);

export const pobProductFabricMapping = pgTable(
  "pob_product_fabric_mapping",
  {
    id: serial("id").primaryKey(),
    styleCode: text("style_code").notNull(),
    fabricCode: text("fabric_code").notNull(),
    syncedAt: text("synced_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_pob_product_fabric_style_code").on(t.styleCode),
  ]
);
