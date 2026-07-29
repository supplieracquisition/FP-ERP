"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { format, isAfter, differenceInDays } from "date-fns";

type Supplier = { id: number; name: string };
type OrderItem = {
  id: number;
  orderId: string;
  orderItemId: string;
  orderName: string | null;
  styleCode: string | null;
  color: string | null;
  quantity: number | null;
  printType: string | null;
  decoratingMethods: string | null;
  dueDate: string | null;
  printerShipDate: string | null;
  originalPrinterShipDate: string | null;
  supplierShipDate: string | null;
  totalValue: number | null;
  status: string;
  productionStage: string | null;
  trackingNumber: string | null;
  supplierName: string | null;
  supplierId: number | null;
  orderCreatedAt: string | null;
};

const STAGE_OPTIONS = [
  { value: "unassigned",        label: "Unassigned" },
  { value: "sample_production", label: "Sample Production" },
  { value: "fabric_sourcing",   label: "Fabric Sourcing / Cutting" },
  { value: "printing",          label: "Printing" },
  { value: "assembly",          label: "Assembly" },
  { value: "qa_packing",        label: "QA + Packing" },
  { value: "shipped",           label: "Shipped" },
  { value: "completed",         label: "Delivered" },
];

const STAGE_LABELS: Record<string, string> = {
  unassigned:        "Unassigned",
  sample_production: "Sample Production",
  fabric_sourcing:   "Fabric Sourcing / Cutting",
  printing:          "Printing",
  assembly:          "Assembly",
  qa_packing:        "QA + Packing",
  shipped:           "Shipped",
  completed:         "Delivered",
};

const STAGE_COLORS: Record<string, string> = {
  unassigned:        "bg-gray-200 text-gray-800",
  sample_production: "bg-purple-100 text-purple-800",
  fabric_sourcing:   "bg-indigo-100 text-indigo-800",
  printing:          "bg-yellow-100 text-yellow-800",
  assembly:          "bg-blue-100 text-blue-800",
  qa_packing:        "bg-orange-100 text-orange-800",
  shipped:           "bg-green-100 text-green-800",
  completed:         "bg-green-200 text-green-900",
};

function effectiveStage(item: OrderItem): string {
  // Only unassigned if no supplier ID (nominated supplier doesn't count)
  if (item.supplierId === null || item.supplierId === 0 || !item.supplierId) {
    return "unassigned";
  }
  if (item.status === "shipped")   return "shipped";
  if (item.status === "completed") return "completed";
  return item.productionStage ?? "sample_production";
}

function StageBadge({ item }: { item: OrderItem }) {
  const stage = effectiveStage(item);
  const label = STAGE_LABELS[stage] ?? stage;
  const color = STAGE_COLORS[stage] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${color}`}>
      {label}
    </span>
  );
}

export function OrdersTable({ suppliers, userRole }: { suppliers: Supplier[]; userRole?: string }) {
  const searchParams = useSearchParams();
  const [items, setItems]               = useState<OrderItem[]>([]);
  const [total, setTotal]               = useState(0);
  const [loading, setLoading]           = useState(true);
  const [page, setPage]                 = useState(1);

  const [search, setSearch]             = useState("");
  const [columnFilter, setColumnFilter] = useState("");
  const [supplierFilter, setSupplierFilter] = useState(searchParams.get("supplierId") ?? "");
  const [styleFilter, setStyleFilter]   = useState("");
  const [colorFilter, setColorFilter]   = useState("");
  const [printTypeFilter, setPrintTypeFilter] = useState("");
  const [decorationFilter, setDecorationFilter] = useState("");
  const [shipDateFilter, setShipDateFilter] = useState("");
  const [sortBy, setSortBy]             = useState("");
  const [showDelivered, setShowDelivered] = useState(false);

  const isAdmin    = userRole === "admin";
  const isSupplier = userRole === "supplier";
  const orderDetailBase = isSupplier ? "/supplier/orders" : "/orders";

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search)          params.set("search", search);
    if (columnFilter)    params.set("column", columnFilter);
    if (supplierFilter)  params.set("supplierId", supplierFilter);
    if (styleFilter)     params.set("styleCode", styleFilter);
    if (colorFilter)     params.set("color", colorFilter);
    if (printTypeFilter) params.set("printType", printTypeFilter);
    if (decorationFilter) params.set("decoration", decorationFilter);
    if (shipDateFilter)  params.set("shipDate", shipDateFilter);
    if (sortBy)          params.set("sortBy", sortBy);
    if (showDelivered)   params.set("showDelivered", "1");
    params.set("page", String(page));

    const res = await fetch(`/api/orders?${params}`);
    const data = await res.json();
    setItems(data.items ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, [search, columnFilter, supplierFilter, styleFilter, colorFilter, printTypeFilter, decorationFilter, shipDateFilter, sortBy, showDelivered, page]);

  useEffect(() => {
    const t = setTimeout(fetchOrders, 200);
    return () => clearTimeout(t);
  }, [fetchOrders]);

  const resetPage = () => setPage(1);

  const isOverdue = (item: OrderItem) => {
    if (!item.dueDate) return false;
    const stage = effectiveStage(item);
    if (stage === "shipped" || stage === "completed") return false;
    return isAfter(new Date(), new Date(item.dueDate));
  };

  const fmt = (d: string | null) => d ? format(new Date(d), "MMM d, yyyy") : "—";

  const totalPages = Math.ceil(total / 50);

  const activeFilterCount = [columnFilter, supplierFilter, styleFilter, colorFilter, printTypeFilter, decorationFilter, shipDateFilter, sortBy, showDelivered ? "1" : ""].filter(Boolean).length;

  const selectCls = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-gray-700 bg-white transition-colors ${
      active ? "border-gray-800 text-gray-900 font-bold bg-gray-50" : "border-gray-300 text-gray-500"
    }`;

  const textCls = (active: boolean) =>
    `rounded-md border px-3 py-1.5 text-xs focus:outline-none focus:border-gray-700 bg-white transition-colors ${
      active ? "border-gray-800 text-gray-900 font-bold bg-gray-50 placeholder-gray-700" : "border-gray-300 text-gray-500"
    }`;

  function clearAll() {
    setSearch(""); setColumnFilter(""); setSupplierFilter("");
    setStyleFilter(""); setColorFilter(""); setPrintTypeFilter("");
    setDecorationFilter(""); setShipDateFilter(""); setSortBy("");
    setShowDelivered(false); setPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-2">
        {/* Row 1: search, sort, delivered toggle, count */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }}
              placeholder="Search orders…"
              className="rounded-md border border-gray-300 pl-3 pr-8 py-1.5 text-sm focus:outline-none focus:border-gray-700 w-52" />
            {search && (
              <button onClick={() => { setSearch(""); resetPage(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs">✕</button>
            )}
          </div>

          <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); resetPage(); }}
            className={selectCls(!!sortBy)}>
            <option value="">Sort: Due Date</option>
            <option value="ship_date">Ship Date: Soonest First</option>
            <option value="quantity_asc">Units: Low → High</option>
            <option value="quantity_desc">Units: High → Low</option>
            {isAdmin && <option value="value_asc">Value: Low → High</option>}
            {isAdmin && <option value="value_desc">Value: High → Low</option>}
          </select>

          <button onClick={() => { setShowDelivered(!showDelivered); resetPage(); }}
            className={`text-xs rounded-md border px-3 py-1.5 font-medium transition-colors ${
              showDelivered ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 text-gray-600 hover:bg-gray-100"
            }`}>
            {showDelivered ? "Hide Delivered" : "Show Delivered"}
          </button>

          <span className="ml-auto text-xs text-gray-400">
            {loading ? "Loading…" : `${total} order${total !== 1 ? "s" : ""}`}
          </span>
        </div>

        {/* Row 2: field filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isSupplier && (
            <select value={supplierFilter} onChange={(e) => { setSupplierFilter(e.target.value); resetPage(); }}
              className={selectCls(!!supplierFilter)}>
              <option value="">Manufacturer: All</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}

          <select value={columnFilter} onChange={(e) => { setColumnFilter(e.target.value); resetPage(); }}
            className={selectCls(!!columnFilter)}>
            <option value="">Stage: All</option>
            {STAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <input type="text" value={styleFilter} onChange={(e) => { setStyleFilter(e.target.value); resetPage(); }}
            placeholder="Style Code…" className={`w-32 ${textCls(!!styleFilter)}`} />

          <input type="text" value={colorFilter} onChange={(e) => { setColorFilter(e.target.value); resetPage(); }}
            placeholder="Color…" className={`w-28 ${textCls(!!colorFilter)}`} />

          <input type="text" value={printTypeFilter} onChange={(e) => { setPrintTypeFilter(e.target.value); resetPage(); }}
            placeholder="Print Type…" className={`w-28 ${textCls(!!printTypeFilter)}`} />

          <input type="text" value={decorationFilter} onChange={(e) => { setDecorationFilter(e.target.value); resetPage(); }}
            placeholder="Decoration…" className={`w-28 ${textCls(!!decorationFilter)}`} />

          <select value={shipDateFilter} onChange={(e) => { setShipDateFilter(e.target.value); resetPage(); }}
            className={selectCls(!!shipDateFilter)}>
            <option value="">Ship Date: All</option>
            <option value="today">Shipping Today</option>
            <option value="3">Within 3 Days</option>
            <option value="7">Within 7 Days</option>
            <option value="14">Within 14 Days</option>
          </select>

          {(activeFilterCount > 0 || search) && (
            <button onClick={clearAll}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:border-gray-400 transition-colors">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide">Order Item</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide">Style / Color</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide">Units</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide">Print / Decoration</th>
                {!isSupplier && <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide">Manufacturer</th>}
                <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide">Ship Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide">Due Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide">Stage</th>
                {!isSupplier && <th className="px-4 py-3 text-left font-semibold text-gray-700 text-xs uppercase tracking-wide">Value</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isSupplier ? 7 : 9} className="px-4 py-12 text-center text-sm text-gray-400">Loading…</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={isSupplier ? 7 : 9} className="px-4 py-12 text-center text-sm text-gray-400">No orders found</td>
                </tr>
              ) : (
                items.map((item) => {
                  const shipDateChanged = item.originalPrinterShipDate &&
                    item.printerShipDate &&
                    item.originalPrinterShipDate !== item.printerShipDate;
                  const shipsInDays = item.supplierShipDate
                    ? differenceInDays(new Date(item.supplierShipDate), new Date())
                    : null;
                  const shipUrgent = shipsInDays !== null && shipsInDays <= 3 && shipsInDays >= 0;

                  return (
                    <tr key={item.orderItemId} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <Link href={`${orderDetailBase}/${item.orderItemId}`}
                          className="font-mono font-semibold text-gray-900 hover:text-blue-600 transition-colors">
                          {item.orderItemId}
                        </Link>
                        {item.orderName && <div className="text-xs text-gray-500 mt-0.5">{item.orderName}</div>}
                        <div className="text-xs text-gray-400">Order {item.orderId}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{item.styleCode ?? "—"}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{item.color ?? "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 tabular-nums">{item.quantity?.toLocaleString() ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="text-gray-700">{item.printType ?? "—"}</div>
                        {item.decoratingMethods && (
                          <div className="text-xs mt-0.5 inline-flex items-center rounded px-1.5 py-0.5 bg-yellow-100 border border-yellow-300 text-yellow-900">
                            {item.decoratingMethods}
                          </div>
                        )}
                      </td>
                      {!isSupplier && (
                        <td className="px-4 py-3">
                          <span className="text-gray-700">{item.supplierName ?? "—"}</span>
                        </td>
                      )}
                      <td className="px-4 py-3 tabular-nums text-xs">
                        <span className={shipUrgent ? "text-red-600 font-semibold" : "text-gray-600"}>
                          {fmt(item.supplierShipDate)}
                        </span>
                        {shipDateChanged && (
                          <span title={`Original: ${fmt(item.originalPrinterShipDate)}`}
                            className="ml-1 text-amber-500 cursor-help">✎</span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs">
                        <span className={isOverdue(item) ? "text-red-600 font-semibold" : "text-gray-600"}>
                          {fmt(item.dueDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><StageBadge item={item} /></td>
                      {!isSupplier && (
                        <td className="px-4 py-3 tabular-nums text-gray-700 text-xs">
                          {item.totalValue && item.totalValue > 0
                            ? `$${item.totalValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                            : "—"}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Previous
            </button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="px-3 py-1.5 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
