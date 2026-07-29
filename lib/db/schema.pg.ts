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
  capacityUnits: integer("capacity_units"),
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
    printerShipDate: text("printer_ship_date"),
    originalPrinterShipDate: text("original_printer_ship_date"),
    delayReason: text("delay_reason"),
    supplierId: integer("supplier_id").references(() => suppliers.id),
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
    supplierShipDate: text("supplier_ship_date"),
    testPrintDate: text("test_print_date"),
    clientName: text("client_name"),
    deliveryAddress: text("delivery_address"),
    importedAt: text("imported_at").notNull().default(sql`now()`),
    updatedAt: text("updated_at").notNull().default(sql`now()`),
  },
  (t) => [
    index("idx_order_items_order_id").on(t.orderId),
    index("idx_order_items_supplier_id").on(t.supplierId),
    index("idx_order_items_status").on(t.status),
    index("idx_order_items_due_date").on(t.dueDate),
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
    fabricDetailsId: integer("fabric_details_id").notNull().references(() => fabricDetails.id),
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
