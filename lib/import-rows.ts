/**
 * The one order-import row processor, shared by both import routes.
 *
 * There are two ways orders enter the ERP — /api/import (a person uploads a
 * file) and /api/n8n/import (the hourly machine pull) — and they read the same
 * sheet. lib/import-mapping.ts already exists because those two routes kept
 * separate copies of the HEADER_MAP and it drifted: a header the manual route
 * understood was silently dropped by the machine one. Fixing the map did not
 * fix the pattern, because the ROW LOOP stayed duplicated, and it drifted in
 * exactly the same way:
 *
 *   - the manual route resolved printer names through resolveSupplier(), which
 *     handles the sheet's " MTO" suffix; the machine route did an exact
 *     lowercase match, which import-mapping.ts measured at 0 of 77 rows against
 *     the production sheet, and swallowed every miss as `|| null`
 *   - the manual route did check-then-update; the machine route did a bare
 *     INSERT, so a row already stored could never be revised — it failed the
 *     order_item_id unique constraint and was filed as an import error
 *   - the manual route used suppliedFields() so an absent column cannot blank
 *     live data; the machine route wrote every field unconditionally
 *
 * So this file exists to make that class of bug unrepresentable: there is one
 * loop, and a route cannot accidentally have a weaker version of it. Anything
 * genuinely different between the two callers is a named argument, not a
 * silently forked copy.
 *
 * Import bookkeeping (the csv_imports record, writing csv_import_errors) stays
 * with the caller. This function only decides what happens to order rows, and
 * reports what went wrong, so it can be reasoned about without the import-record
 * tables in the picture.
 */

import { db } from "@/lib/db";
import { orderItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  HEADER_MAP,
  normalizeHeader,
  suppliedFields,
  unmappedHeaders,
  PARSE,
  buildSupplierIndex,
  resolveSupplier,
} from "./import-mapping";

/** A row that could not be stored, shaped for csv_import_errors. */
export type ImportRowError = {
  /** 1-based line in the source file, counting the header — i.e. index + 2. */
  rowNumber: number;
  /** JSON of the normalized row, for reproducing the failure. */
  rawData: string;
  errorMessage: string;
};

export type ImportRowsResult = {
  successCount: number;
  createdCount: number;
  updatedCount: number;
  errors: ImportRowError[];
  /** Headers present in the file that map to nothing. Report, never swallow. */
  ignoredHeaders: string[];
};

/**
 * Apply one parsed CSV to order_items.
 *
 * `rawRows` are straight from the CSV parser with their original header text;
 * normalization happens here so neither caller can forget it.
 */
export async function importOrderRows(
  rawRows: Record<string, string>[],
  supplierList: { id: number; name: string }[]
): Promise<ImportRowsResult> {
  const errors: ImportRowError[] = [];
  let successCount = 0;
  let createdCount = 0;
  let updatedCount = 0;

  // Which fields this file can speak to. Anything outside this set is left
  // alone on update rather than written as null — see suppliedFields(). This is
  // what stops a CSV without a "requires test print" column from resetting that
  // flag to false on every row it touches.
  const headers = Object.keys(rawRows[0] ?? {});
  const present = suppliedFields(headers);
  const ignoredHeaders = unmappedHeaders(headers);

  const rows = rawRows.map((row) => {
    const normalized: Record<string, string> = {};
    for (const [key, val] of Object.entries(row)) {
      normalized[normalizeHeader(key)] = val;
    }
    return normalized;
  });

  const supplierIndex = buildSupplierIndex(supplierList);

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx];
    const rowNumber = rowIdx + 2;

    const mapped: Record<string, string> = {};
    for (const [csvKey, val] of Object.entries(row)) {
      const schemaKey = HEADER_MAP[csvKey];
      if (schemaKey) mapped[schemaKey] = val;
    }

    const orderItemId = mapped.orderItemId?.trim();
    const orderId = mapped.orderId?.trim();

    if (!orderItemId || !orderId) {
      errors.push({
        rowNumber,
        rawData: JSON.stringify(row),
        errorMessage: !orderItemId ? "Missing order_item_id" : "Missing order_id",
      });
      continue;
    }

    try {
      // Only fields this CSV actually carries. A field the file omits is not
      // written at all, so an absent column cannot blank out live data.
      const values: Record<string, unknown> = { orderId, orderItemId };
      for (const field of present) {
        if (field === "orderId" || field === "orderItemId" || field === "supplierName") continue;
        const raw = mapped[field]?.trim() ?? "";
        values[field] = PARSE[field] ? PARSE[field](raw) : raw || null;
      }

      // Assignment. Three distinct cases, and collapsing any two of them is
      // what made an earlier version destructive:
      //
      //   blank printer   -> genuinely unassigned; return it to the pool
      //   named + matched -> assign, and move it into sample production
      //   named + unknown -> a name we failed to resolve is NOT evidence the
      //                      order is unassigned. Report it and touch nothing.
      //
      // Skipped entirely when the file has no printer column, so a CSV that
      // does not discuss assignment cannot silently un-assign every row. The
      // n8n worksheet is exactly that case: it only carries items not yet
      // assigned to a printer, so it has no printer column and this block never
      // runs for it.
      if (present.has("supplierName")) {
        const supplierName = mapped.supplierName?.trim();

        if (!supplierName) {
          values.supplierId = null;
          // A claim outlives the assignment it was taken under. Left set, the
          // row returns to the pool already greyed out for everyone but its
          // former holder; claimable() reads a null claimed_at as takeable.
          values.claimedAt = null;
        } else {
          const resolved = resolveSupplier(supplierName, supplierIndex);
          if (resolved.kind === "unmatched") {
            errors.push({
              rowNumber,
              rawData: JSON.stringify(row),
              errorMessage: resolved.reason,
            });
            continue;
          }
          values.supplierId = resolved.supplierId;
          values.productionStage = "sample_production";
          // Note what is deliberately NOT done here: assigned_at is never
          // defaulted to now() on this path. It is written only when the file
          // actually carries a "Printer Assigned Date".
          //
          // A file without that column would otherwise stamp every row it
          // touches with today, and re-importing the standing MTO sheet would
          // dump the entire back catalogue of already-assigned orders into this
          // week's intake as one enormous phantom spike. An untimed assignment
          // reads as "assigned before tracking started" and scores zero, which
          // is both honest and recoverable; an invented timestamp is neither.
        }
      }

      const [existing] = await db
        .select({
          id: orderItems.id,
          supplierShipDate: orderItems.supplierShipDate,
          originalSupplierShipDate: orderItems.originalSupplierShipDate,
          assignedAt: orderItems.assignedAt,
        })
        .from(orderItems)
        .where(eq(orderItems.orderItemId, orderItemId))
        .limit(1);

      if (existing) {
        // Fill-blanks-only for the ship date: import supplies it when the tool
        // has none, and never revises one the tool already holds.
        //
        // The sheet stops being the authority on this date the moment a PO
        // exists. supplier_ship_date is then a commitment negotiated with the
        // factory in the PO Builder, and the sheet has no way to know that
        // happened — so a re-upload of the full MTO sheet would walk it back.
        // That failure would be near-silent: capacity anchors its production
        // window on this column, so the damage shows up as the heatmap quietly
        // shifting rather than as an error anyone would notice.
        //
        // Accepted consequence, chosen deliberately: a ship date moved at the
        // source does not propagate to an order that already has one.
        if (existing.supplierShipDate != null) delete values.supplierShipDate;

        // The delay baseline is immutable — set once and never revised.
        // Overwriting it would erase the very evidence that a date moved, which
        // is the only thing it exists to record.
        if (existing.originalSupplierShipDate != null) {
          delete values.originalSupplierShipDate;
        }

        // Same rule for the assignment date, for the same reason. Once a PO has
        // been built in the tool, assigned_at is the date on that document; the
        // sheet's "Printer Assigned Date" must not revise it and shift the
        // order into or out of an intake window after the fact.
        if (existing.assignedAt != null) delete values.assignedAt;

        // Status is preserved; productionStage only moves when this row
        // assigned a supplier above.
        await db
          .update(orderItems)
          .set({ ...values, updatedAt: new Date().toISOString() })
          .where(eq(orderItems.orderItemId, orderItemId));
        updatedCount++;
      } else {
        // Seed the baseline from the live date when the file carries no
        // explicit "original" column. A row inserted with a NULL baseline can
        // never show the "ship date moved" marker, because the comparison has
        // nothing to compare against.
        if (
          values.originalSupplierShipDate == null &&
          values.supplierShipDate != null
        ) {
          values.originalSupplierShipDate = values.supplierShipDate;
        }

        await db.insert(orderItems).values({
          status: "in_production",
          productionStage: "sample_production",
          ...values,
          importedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as typeof orderItems.$inferInsert);
        createdCount++;
      }

      successCount++;
    } catch (err) {
      errors.push({
        rowNumber,
        rawData: JSON.stringify(row),
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { successCount, createdCount, updatedCount, errors, ignoredHeaders };
}
