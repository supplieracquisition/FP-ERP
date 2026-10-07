/**
 * Rendering calendar dates without losing a day.
 *
 * supplierShipDate, originalSupplierShipDate, assignedDate, dueDate,
 * inHandsDate, testPrintDate and orderCreatedAt are CALENDAR dates, not
 * instants. Every writer pins them to UTC midnight — toIsoTimestamp() in
 * lib/import-mapping.ts does it for imports, and the date inputs in
 * OrderDetail / POBuilder do it by sending a bare "YYYY-MM-DD" through
 * new Date(), which the spec parses as UTC. "The 8th" is stored as
 * "2026-10-08T00:00:00.000Z".
 *
 * date-fns format() reads LOCAL fields. Hand it that instant anywhere west of
 * UTC and it renders the day before — "2026-10-08T00:00:00.000Z" is 8pm on the
 * 7th in New York, so an order the agent set to the 8th displayed as Oct 7.
 * Nothing was wrong in the database; only the read was.
 *
 * So: take the calendar day off the front of the string and rebuild it at LOCAL
 * midnight. format() then prints the day that was actually stored, in any
 * timezone, and differenceInCalendarDays() against a local `new Date()` counts
 * real days rather than a sub-24h gap that truncates to zero.
 *
 * Related but deliberately NOT the same function: utcDay() in lib/capacity.ts
 * anchors the same string to UTC midnight. That one is correct for its job —
 * keying and bucketing days server-side, where mixing in a local offset would
 * drift a row onto the adjacent day. Use utcDay() to compute with days, and
 * calendarDate() to show one to a person. Neither is safe for the other's job.
 */

/** A stored date string -> that same calendar day at LOCAL midnight. */
export function calendarDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * calendarDate() for columns that may be null, which most of these are.
 * Returns null so callers keep rendering their own em dash / placeholder.
 */
export function calendarDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = calendarDate(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
