import * as pg from "./schema.pg";
import * as sqlite from "./schema.sqlite";

const dialect = process.env.DATABASE_URL ? pg : sqlite;

export const suppliers = dialect.suppliers;
export const users = dialect.users;
export const orderItems = dialect.orderItems;
export const statusHistory = dialect.statusHistory;
export const comments = dialect.comments;
export const orderImages = dialect.orderImages;
export const supplierOverrides = dialect.supplierOverrides;
export const csvImports = dialect.csvImports;
export const csvImportErrors = dialect.csvImportErrors;
export const notifications = dialect.notifications;
export const notificationReads = dialect.notificationReads;
export const fabricDetails = dialect.fabricDetails;
export const fabricColors = dialect.fabricColors;
export const fpeSuppliers = dialect.fpeSuppliers;
export const testPrintQueue = dialect.testPrintQueue;
export const apiKeys = dialect.apiKeys;
export const pobFabricColors = dialect.pobFabricColors;
export const pobProductFabricMapping = dialect.pobProductFabricMapping;

export const suppliersRelations = dialect.suppliersRelations;
export const usersRelations = dialect.usersRelations;
export const orderItemsRelations = dialect.orderItemsRelations;
export const statusHistoryRelations = dialect.statusHistoryRelations;
export const commentsRelations = dialect.commentsRelations;
export const orderImagesRelations = dialect.orderImagesRelations;
export const fabricDetailsRelations = dialect.fabricDetailsRelations;
export const fabricColorsRelations = dialect.fabricColorsRelations;
