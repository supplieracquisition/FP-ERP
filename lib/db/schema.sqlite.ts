import {
  sqliteTable,
  text,
  integer,
  real,
  index,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

export const suppliers = sqliteTable("suppliers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  capacityUnits: integer("capacity_units"),
  testPrintTat: integer("test_print_tat"),
  productionTime: integer("production_time"),
  shippingTimeAir: integer("shipping_time_air"),
  shippingTimeSea: integer("shipping_time_sea"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  pocUserId: integer("poc_user_id"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  authId: text("auth_id").unique(), // Supabase auth.users UUID (not used in local-SQLite mode)
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("internal"), // 'admin' | 'internal' | 'supplier'
  supplierId: integer("supplier_id").references(() => suppliers.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orderItems = sqliteTable(
  "order_items",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderId: text("order_id").notNull(),
    orderItemId: text("order_item_id").notNull().unique(),
    orderName: text("order_name"),
    orderCreatedAt: text("order_created_at"),
    styleCode: text("style_code"),
    color: text("color"),
    templatePdf: text("template_pdf"),
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
    requiresTestPrint: integer("requires_test_print", { mode: "boolean" })
      .notNull()
      .default(false),
    trackingNumber: text("tracking_number"),
    inHandsDate: text("in_hands_date"),
    supplierShipDate: text("supplier_ship_date"),
    testPrintDate: text("test_print_date"),
    clientName: text("client_name"),
    deliveryAddress: text("delivery_address"),
    poCreated: integer("po_created", { mode: "boolean" }).notNull().default(false),
    importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_order_items_order_id").on(t.orderId),
    index("idx_order_items_supplier_id").on(t.supplierId),
    index("idx_order_items_status").on(t.status),
    index("idx_order_items_due_date").on(t.dueDate),
  ]
);

export const statusHistory = sqliteTable("status_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItems.orderItemId),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: integer("changed_by").references(() => users.id),
  changedAt: text("changed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  note: text("note"),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItems.orderItemId),
  userId: integer("user_id").references(() => users.id),
  body: text("body").notNull(),
  isInternal: integer("is_internal", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const orderImages = sqliteTable("order_images", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderItemId: text("order_item_id")
    .notNull()
    .references(() => orderItems.orderItemId),
  type: text("type").notNull(),
  filePath: text("file_path").notNull(),
  fileName: text("file_name").notNull(),
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const supplierOverrides = sqliteTable("supplier_overrides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  date: text("date").notNull(),
  reason: text("reason"),
});

export const csvImports = sqliteTable("csv_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filename: text("filename").notNull(),
  importedBy: integer("imported_by").references(() => users.id),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  rowCount: integer("row_count").notNull().default(0),
  successCount: integer("success_count").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  status: text("status").notNull().default("pending"),
});

export const csvImportErrors = sqliteTable("csv_import_errors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id")
    .notNull()
    .references(() => csvImports.id),
  rowNumber: integer("row_number"),
  rawData: text("raw_data"),
  errorMessage: text("error_message").notNull(),
});

export const notifications = sqliteTable("notifications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type").notNull(), // 'comment' | 'issue_report' | 'test_print' | 'status_change'
  orderItemId: text("order_item_id").notNull().references(() => orderItems.orderItemId),
  supplierId: integer("supplier_id").notNull().references(() => suppliers.id),
  triggeredBy: integer("triggered_by").references(() => users.id),
  message: text("message").notNull(),
  audience: text("audience").notNull(), // 'team' | 'supplier'
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notificationReads = sqliteTable("notification_reads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  notificationId: integer("notification_id").notNull().references(() => notifications.id),
  userId: integer("user_id").notNull().references(() => users.id),
  readAt: text("read_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

// PO Builder Data Tables
export const fabricDetails = sqliteTable(
  "fabric_details",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    style: text("style").notNull(),
    product: text("product").notNull(),
    fabricCode: text("fabric_code").notNull(),
    printMethod: text("print_method"),
    decorations: text("decorations"),
    syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_fabric_details_style").on(t.style),
    index("idx_fabric_details_fabric_code").on(t.fabricCode),
  ]
);

export const fabricColors = sqliteTable(
  "fabric_colors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fabricDetailsId: integer("fabric_details_id").references(() => fabricDetails.id),
    fabricCode: text("fabric_code").notNull(),
    colorCode: text("color_code").notNull(),
    supplier: text("supplier"),
    syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_fabric_colors_fabric_details_id").on(t.fabricDetailsId),
    index("idx_fabric_colors_fabric_code").on(t.fabricCode),
    index("idx_fabric_colors_color_code").on(t.colorCode),
  ]
);

export const fpeSuppliers = sqliteTable(
  "fpe_suppliers",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    styleCode: text("style_code").notNull(),
    product: text("product").notNull(),
    supplierName: text("supplier_name").notNull(),
    salesRep: text("sales_rep"),
    email: text("email"),
    currentSupplier: integer("current_supplier", { mode: "boolean" }).notNull().default(false),
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
    syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_fpe_suppliers_style_code").on(t.styleCode),
    index("idx_fpe_suppliers_supplier_name").on(t.supplierName),
  ]
);

export const testPrintQueue = sqliteTable(
  "test_print_queue",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    orderItemId: text("order_item_id").notNull().unique(),
    uploadCount: integer("upload_count").notNull().default(1),
    firstUploadTime: text("first_upload_time").notNull().default(sql`CURRENT_TIMESTAMP`),
    notificationSentAt: text("notification_sent_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_test_print_queue_order_item").on(t.orderItemId),
    index("idx_test_print_queue_notification_sent").on(t.notificationSentAt),
  ]
);

export const apiKeys = sqliteTable("api_keys", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  key: text("key").notNull().unique(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  lastUsedAt: text("last_used_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pobFabricColors = sqliteTable("pob_fabric_colors", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fabricCode: text("fabric_code").notNull(),
  colorCode: text("color_code").notNull(),
  syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const pobProductFabricMapping = sqliteTable("pob_product_fabric_mapping", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  styleCode: text("style_code").notNull(),
  fabricCode: text("fabric_code").notNull(),
  syncedAt: text("synced_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

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
