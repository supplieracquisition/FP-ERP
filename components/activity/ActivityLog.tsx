"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { ACTION_LABELS, ACTION_GROUPS, actionLabel } from "@/lib/activity-actions";

interface Entry {
  id: number;
  createdAt: string;
  actorUserId: number | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | null;
  orderItemId: string | null;
  supplierId: number | null;
  supplierName: string | null;
  summary: string;
  details: unknown;
}

const ROLE_STYLES: Record<string, string> = {
  admin: "bg-purple-50 text-purple-700 border-purple-200",
  internal: "bg-blue-50 text-blue-700 border-blue-200",
  supplier: "bg-amber-50 text-amber-700 border-amber-200",
  system: "bg-gray-100 text-gray-500 border-gray-200",
};

/**
 * Actions that destroy something, flagged in the table.
 *
 * A log where every row looks alike is a log nobody scans. These are the rows
 * that matter when something has gone wrong, so they carry a red left edge —
 * findable by eye without reading every summary.
 */
const DESTRUCTIVE = new Set([
  "order.delete",
  "order.bulk_delete",
  "order.clear_all",
  "user.delete",
  "supplier.delete",
  "apikey.delete",
]);

export function ActivityLog() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  /**
   * A failed load must never render as an empty log.
   *
   * The first version of this had `if (res.ok)` and no else, so a request that
   * failed left the list empty and the table said "No activity recorded yet."
   * — which is what an audit trail with nothing in it says. The two states look
   * identical and mean opposite things: one is "nobody has done anything", the
   * other is "this page cannot see what people have done". An audit tool that
   * quietly reports the second as the first is worse than one that is plainly
   * broken, because nothing prompts anyone to go and fix it.
   *
   * A 500 here is overwhelmingly one thing — activity_log does not exist
   * because scripts/sql/004_activity_log.sql has not been run against this
   * database — so the message says so rather than making someone read the
   * server logs to find out.
   */
  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (action) params.set("action", action);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    try {
      const res = await fetch(`/api/activity?${params}`);

      if (!res.ok) {
        setEntries([]);
        setTotal(0);
        setError(
          res.status === 500
            ? "The activity_log table is missing from this database. Run scripts/sql/004_activity_log.sql against it — until then nothing is being recorded."
            : res.status === 403
              ? "Only admins can read the activity log."
              : `Could not load the activity log (HTTP ${res.status}).`
        );
        return;
      }

      const data = await res.json();
      setEntries(data.items ?? []);
      setTotal(data.total ?? 0);
      setPageSize(data.pageSize ?? 50);
      setError(null);
    } catch {
      setEntries([]);
      setTotal(0);
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [search, action, from, to, page]);

  // Debounced so typing an order id doesn't fire a query per keystroke. Every
  // filter runs through the same effect, so changing any of them re-queries.
  useEffect(() => {
    const t = setTimeout(fetchEntries, 250);
    return () => clearTimeout(t);
  }, [fetchEntries]);

  /**
   * Change a filter and return to page one, in one update.
   *
   * Page one matters: staying on page 4 of a narrower result set shows an empty
   * table, which reads as "nothing matches" rather than "you are past the end".
   *
   * Done here rather than in an effect watching the filters. That version was
   * a cascading render — and worse, it fetched twice for every keystroke, once
   * at the old page and again after the reset landed.
   */
  function applyFilter(set: (value: string) => void, value: string) {
    set(value);
    setPage(1);
  }

  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const activeFilters = [search, action, from, to].filter(Boolean).length;

  function toggleDetails(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Activity log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Every change made through the tool — by the team and by suppliers.
        </p>
      </div>

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-64">
          <label className="text-xs text-gray-500 font-medium">Search</label>
          <input
            value={search}
            onChange={(e) => applyFilter(setSearch, e.target.value)}
            placeholder="Order ID, person, supplier, or any wording…"
            className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700"
          />
        </div>

        <div className="w-56">
          <label className="text-xs text-gray-500 font-medium">Action</label>
          <select
            value={action}
            onChange={(e) => applyFilter(setAction, e.target.value)}
            className="mt-1 w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:border-gray-700"
          >
            <option value="">All actions</option>
            {ACTION_GROUPS.map((group) => (
              <optgroup key={group.prefix} label={group.label}>
                {/* The group itself, then each action in it. A trailing dot is
                    what tells the API to match the whole prefix. */}
                <option value={group.prefix}>All {group.label.toLowerCase()}</option>
                {Object.keys(ACTION_LABELS)
                  .filter((key) => key.startsWith(group.prefix))
                  .map((key) => (
                    <option key={key} value={key}>
                      {ACTION_LABELS[key]}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-500 font-medium">From</label>
          <input
            type="date"
            value={from}
            onChange={(e) => applyFilter(setFrom, e.target.value)}
            className="mt-1 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => applyFilter(setTo, e.target.value)}
            className="mt-1 text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:border-gray-700"
          />
        </div>

        {activeFilters > 0 && (
          <button
            onClick={() => {
              setSearch("");
              setAction("");
              setFrom("");
              setTo("");
              setPage(1);
            }}
            className="text-xs text-gray-500 hover:text-gray-900 underline pb-2"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-medium">The log could not be loaded.</span>{" "}
          {error}
        </div>
      )}

      <p className="text-xs text-gray-500">
        {loading
          ? "Loading…"
          : error
            ? ""
            : `${total.toLocaleString()} ${total === 1 ? "entry" : "entries"}${
                activeFilters > 0 ? " matching" : ""
              }`}
      </p>

      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr className="text-xs uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 font-medium whitespace-nowrap">When</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Who</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Action</th>
                <th className="px-4 py-3 font-medium">What changed</th>
                <th className="px-4 py-3 font-medium whitespace-nowrap">Order</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}

              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-400">
                    {/* Never claims the log is empty when the load failed —
                        that is the confusion this whole error path exists to
                        prevent. */}
                    {error
                      ? "Could not load the log — see above."
                      : activeFilters > 0
                        ? "Nothing matches those filters."
                        : "No activity recorded yet."}
                  </td>
                </tr>
              )}

              {entries.map((entry) => {
                const isOpen = expanded.has(entry.id);
                const hasDetails = entry.details != null;

                return (
                  <tr
                    key={entry.id}
                    className={`border-t border-gray-100 align-top ${
                      DESTRUCTIVE.has(entry.action)
                        ? "border-l-2 border-l-red-400 bg-red-50/40"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500 text-xs">
                      {/* Absolute, never "3 hours ago". An audit trail is read to
                          establish when something happened, and a relative time
                          cannot be compared against anything outside the tool. */}
                      {format(new Date(entry.createdAt), "d MMM yyyy, HH:mm")}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-gray-900">{entry.actorName}</span>
                      <span
                        className={`ml-2 text-[10px] px-1.5 py-0.5 rounded border capitalize ${
                          ROLE_STYLES[entry.actorRole] ?? ROLE_STYLES.system
                        }`}
                      >
                        {entry.actorRole}
                      </span>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-gray-600 text-xs">
                      {actionLabel(entry.action)}
                    </td>

                    <td className="px-4 py-3 text-gray-700">
                      {entry.summary}
                      {entry.supplierName && (
                        <span className="ml-2 text-xs text-gray-400">
                          · {entry.supplierName}
                        </span>
                      )}
                      {hasDetails && (
                        <>
                          <button
                            onClick={() => toggleDetails(entry.id)}
                            className="ml-2 text-xs text-gray-500 hover:text-gray-900 underline"
                          >
                            {isOpen ? "hide" : "details"}
                          </button>
                          {isOpen && (
                            <pre className="mt-2 max-w-xl overflow-x-auto rounded bg-gray-50 border border-gray-200 p-2 text-[11px] text-gray-600">
                              {JSON.stringify(entry.details, null, 2)}
                            </pre>
                          )}
                        </>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap text-xs">
                      {entry.orderItemId ? (
                        // Deliberately still a link for a deleted order. It
                        // 404s, which is the honest answer — the log records
                        // that the order existed and was removed, and hiding
                        // the id would lose the only trace of it.
                        <Link
                          href={`/orders/${entry.orderItemId}`}
                          className="text-blue-600 hover:underline"
                        >
                          {entry.orderItemId}
                        </Link>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {lastPage > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Page {page} of {lastPage}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page >= lastPage}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
