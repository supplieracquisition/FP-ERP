"use client";

import { useEffect, useState, useCallback } from "react";
import { format, addDays, isToday, isWeekend } from "date-fns";
import { toast } from "sonner";

type SupplierMeta = {
  id: number;
  name: string;
  nickname: string | null;
  comments: string | null;
  turnTime: number | null;
  weeklyCapacity: number | null;
  testPrintTat: number | null;
  productionTime: number | null;
  shippingTimeAir: number | null;
  shippingTimeSea: number | null;
};

type OrderEntry = {
  orderItemId: string;
  supplierShipDate: string | null;
  status: string;
  productionStage: string | null;
  styleCode: string | null;
  color: string | null;
  quantity: number | null;
  requiresTestPrint: boolean;
};

type Indicator = {
  count: number;
  ceiling: number | null;
  status: "green" | "amber" | "red" | "unset";
};

type CapacityData = {
  suppliers: SupplierMeta[];
  /** Per supplier id: the two measurements, reported separately, never summed. */
  capacity: Record<number, { intake: Indicator; pipeline: Indicator }>;
  loads: Record<number, Record<string, number>>;
  ordersByDate: Record<number, Record<string, OrderEntry[]>>;
  ooo: Record<number, Record<string, string | null>>;
  from: string;
  to: string;
};


/**
 * A day cell counts the orders on a factory's floor that day — which is exactly
 * the quantity the PIPELINE ceiling bounds. So the cells are shaded against
 * that derived ceiling, not against a separately-entered daily number.
 *
 * That is the whole point of the change: the retired capacity_units was an
 * orders-per-day figure someone had to reconcile by hand against
 * production_time, and when the two disagreed the colours were quietly wrong.
 */
function cellStyle(units: number, capacity: number | null, isOoo: boolean, isWeekendDay: boolean): string {
  if (isOoo) return "bg-gray-200 text-gray-400";
  if (isWeekendDay) return "bg-gray-50 text-gray-300";
  if (units === 0) return "bg-white text-gray-300";
  // No ceiling — weekly capacity or production time unset. Show the count in a
  // neutral colour rather than implying a verdict.
  if (capacity == null || capacity === 0) return "bg-blue-50 text-blue-800";
  const pct = units / capacity;
  if (pct <= 0.7) return "bg-green-100 text-green-900";
  if (pct <= 1.0) return "bg-amber-100 text-amber-900";
  return "bg-red-100 text-red-900 font-semibold";
}

/** Shared chip for the two indicators. "unset" is grey — never a false green. */
function IndicatorChip({ label, ind }: { label: string; ind: Indicator | undefined }) {
  if (!ind || ind.ceiling == null) {
    return (
      <span className="text-gray-300 text-xs" title={`${label}: capacity not set`}>
        not set
      </span>
    );
  }
  const tone =
    ind.status === "green" ? "bg-green-100 text-green-900 border-green-300"
    : ind.status === "amber" ? "bg-amber-100 text-amber-900 border-amber-300"
    : "bg-red-100 text-red-900 border-red-300 font-semibold";
  const pct = Math.round((ind.count / ind.ceiling) * 100);
  return (
    <span
      className={`inline-block px-1.5 py-0.5 rounded border text-xs tabular-nums ${tone}`}
      title={`${label}: ${ind.count} of ${ind.ceiling} (${pct}%)`}
    >
      {ind.count}/{ind.ceiling}
    </span>
  );
}

function CapacityCell({
  units, capacity, dateIso, dateLabel, supplierName, isOoo, oooReason, orders, supplierId,
  isWeekendDay, onOooClick, expandedKey, onExpandToggle,
}: {
  units: number;
  capacity: number | null;
  dateIso: string;
  dateLabel: string;
  supplierName: string;
  isOoo: boolean;
  oooReason: string | null | undefined;
  orders: OrderEntry[];
  supplierId: number;
  isWeekendDay: boolean;
  onOooClick: (supplierId: number, date: string, currentReason: string | null) => void;
  expandedKey: string | null;
  onExpandToggle: (key: string | null) => void;
}) {
  const cellKey = `${supplierId}-${dateIso}`;
  const isExpanded = expandedKey === cellKey;
  const cap = capacity;
  const cls = cellStyle(units, cap, isOoo, isWeekendDay);
  const pct = cap ? Math.round((units / cap) * 100) : null;

  const title = isOoo
    ? `OOO${oooReason ? `: ${oooReason}` : ""} — click to clear`
    : isWeekendDay
    ? `${supplierName} · ${dateLabel} · Weekend`
    : units === 0
    ? `${supplierName} · ${dateLabel} · No active orders — right-click to mark OOO`
    : pct != null
    ? `${supplierName} · ${dateLabel} · ${units} order${units !== 1 ? "s" : ""} (${pct}% of ${cap} daily)`
    : `${supplierName} · ${dateLabel} · ${units} order${units !== 1 ? "s" : ""}`;

  return (
    <td
      title={title}
      className={`relative px-2 py-2 text-center text-xs tabular-nums border-r border-gray-100 min-w-[64px] cursor-pointer select-none ${cls} ${isExpanded ? "outline outline-2 outline-blue-500 outline-offset-[-2px] z-10" : ""}`}
      onClick={() => {
        if (isOoo) {
          onOooClick(supplierId, dateIso, oooReason ?? null);
        } else if (!isWeekendDay && units > 0) {
          onExpandToggle(isExpanded ? null : cellKey);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!isWeekendDay) onOooClick(supplierId, dateIso, oooReason ?? null);
      }}
    >
      {isOoo ? <span className="text-gray-400 font-medium">OOO</span> : units === 0 ? "—" : units}
    </td>
  );
}

function OooModal({
  supplierId, date, currentReason, onSave, onClear, onClose,
}: {
  supplierId: number;
  date: string;
  currentReason: string | null;
  onSave: (supplierId: number, date: string, reason: string) => Promise<void>;
  onClear: (supplierId: number, date: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(currentReason ?? "");
  const [saving, setSaving] = useState(false);
  const isExisting = currentReason !== null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave(supplierId, date, reason);
    setSaving(false);
    onClose();
  }

  async function handleClear() {
    setSaving(true);
    await onClear(supplierId, date);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <form onSubmit={handleSave} onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
        <h3 className="font-semibold text-gray-900 text-sm">
          Mark OOO — {date}
        </h3>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reason (optional)</label>
          <input
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Holiday, Lunar New Year"
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving}
            className="flex-1 bg-gray-900 text-white text-sm py-1.5 rounded hover:bg-gray-700 disabled:opacity-50">
            {saving ? "Saving…" : isExisting ? "Update" : "Mark OOO"}
          </button>
          {isExisting && (
            <button type="button" onClick={handleClear} disabled={saving}
              className="flex-1 border border-red-300 text-red-600 text-sm py-1.5 rounded hover:bg-red-50 disabled:opacity-50">
              Clear OOO
            </button>
          )}
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 text-sm py-1.5 rounded hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function EditCapacityModal({ supplier, onSave, onClose }: {
  supplier: SupplierMeta;
  onSave: (updates: Partial<SupplierMeta>) => Promise<void>;
  onClose: () => void;
}) {
  const [comments, setComments]         = useState(supplier.comments ?? "");
  const [testPrintTat, setTestPrintTat] = useState(String(supplier.testPrintTat ?? ""));
  const [productionTime, setProdTime]   = useState(String(supplier.productionTime ?? ""));
  const [shippingTimeAir, setShipAir]   = useState(String(supplier.shippingTimeAir ?? ""));
  const [shippingTimeSea, setShipSea]   = useState(String(supplier.shippingTimeSea ?? ""));
  const [capacity, setCapacity]         = useState(String(supplier.weeklyCapacity ?? ""));
  const [saving, setSaving]             = useState(false);

  const baseTime = (parseInt(testPrintTat) || 0) + (parseInt(productionTime) || 0);
  const totalAir = baseTime + (parseInt(shippingTimeAir) || 0);
  const totalSea = baseTime + (parseInt(shippingTimeSea) || 0);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await onSave({
      comments: comments || null,
      testPrintTat: testPrintTat ? parseInt(testPrintTat) : null,
      productionTime: productionTime ? parseInt(productionTime) : null,
      shippingTimeAir: shippingTimeAir ? parseInt(shippingTimeAir) : null,
      shippingTimeSea: shippingTimeSea ? parseInt(shippingTimeSea) : null,
      weeklyCapacity: capacity ? parseInt(capacity) : null,
    });
    setSaving(false);
    onClose();
  }

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input type="number" min="0" value={value} onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-xl p-6 w-80 space-y-4">
        <h3 className="font-semibold text-gray-900 text-sm">{supplier.name}</h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Comments / Type</label>
          <input value={comments} onChange={(e) => setComments(e.target.value)}
            placeholder="e.g. FP Exclusives"
            className="w-full text-sm border border-gray-300 rounded px-3 py-1.5 focus:outline-none focus:border-gray-700" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Lead Times</p>
          {field("Test Print TAT (days)", testPrintTat, setTestPrintTat, "e.g. 7")}
          {field("Production Time (days)", productionTime, setProdTime, "e.g. 14")}
          {field("Shipping Time — Air (days)", shippingTimeAir, setShipAir, "e.g. 5")}
          {field("Shipping Time — Sea (days)", shippingTimeSea, setShipSea, "e.g. 30")}
          {baseTime > 0 && (
            <div className="text-xs text-gray-500 space-y-0.5">
              {totalAir > baseTime && <p>Total (Air): <span className="font-semibold">{totalAir} days</span></p>}
              {totalSea > baseTime && <p>Total (Sea): <span className="font-semibold">{totalSea} days</span></p>}
            </div>
          )}
        </div>

        {field("Capacity (orders / week)", capacity, setCapacity, "e.g. 20")}
        {productionTime && capacity && (
          <p className="text-xs text-gray-500 -mt-2">
            Pipeline ceiling:{" "}
            <span className="font-semibold">
              {Math.round(parseInt(capacity) * (parseInt(productionTime) / 7))} orders
            </span>{" "}
            in progress at once — derived from {capacity}/week over {productionTime} production days.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={saving}
            className="flex-1 bg-gray-900 text-white text-sm py-1.5 rounded hover:bg-gray-700 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={onClose}
            className="flex-1 border border-gray-300 text-gray-600 text-sm py-1.5 rounded hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function STAGE_LABEL(stage: string | null, status: string): string {
  if (status === "shipped") return "Shipped";
  if (status === "completed") return "Delivered";
  const map: Record<string, string> = {
    sample_production: "Sample",
    printing: "Printing",
    assembly: "Assembly",
    qa_packing: "QA/Pack",
  };
  return map[stage ?? ""] ?? stage ?? status;
}

function ExpandedOrdersRow({
  orders, colSpan, expandedDate,
}: {
  orders: OrderEntry[];
  colSpan: number;
  expandedDate: string;
}) {
  const displayDate = expandedDate
    ? new Date(expandedDate + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
    : expandedDate;

  return (
    <tr>
      <td colSpan={colSpan} className="bg-blue-50 border-b border-blue-200 px-0 py-0">
        <div className="px-4 py-2.5">
          <p className="text-xs font-semibold text-blue-700 mb-2">
            Orders active on {displayDate} ({orders.length})
          </p>
          {orders.length === 0 ? (
            <p className="text-xs text-gray-400">No orders on this date.</p>
          ) : (
            <table className="text-xs border-collapse">
              <thead>
                <tr className="text-gray-500 border-b border-blue-200">
                  <th className="text-left pb-1 pr-3 font-medium whitespace-nowrap">Order</th>
                  <th className="text-left pb-1 pr-3 font-medium whitespace-nowrap">Item</th>
                  <th className="text-left pb-1 pr-3 font-medium whitespace-nowrap">Style</th>
                  <th className="text-left pb-1 pr-3 font-medium whitespace-nowrap">Color</th>
                  <th className="text-left pb-1 pr-3 font-medium whitespace-nowrap">Ships</th>
                  <th className="text-left pb-1 pr-3 font-medium whitespace-nowrap">Stage</th>
                  <th className="text-left pb-1 pr-3 font-medium whitespace-nowrap">Qty</th>
                  <th className="text-left pb-1 font-medium whitespace-nowrap">Test Print</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.orderItemId} className="border-b border-blue-100 last:border-0">
                    <td className="py-1 pr-3">
                      <a href={`/orders/${o.orderItemId}`} target="_blank" rel="noreferrer"
                        className="text-blue-700 hover:underline font-mono font-medium">
                        {o.orderItemId}
                      </a>
                    </td>
                    <td className="py-1 pr-3">
                      {o.styleCode && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/icon?style=${encodeURIComponent(o.styleCode.toLowerCase().replace(/\s+/g, ""))}&color=${encodeURIComponent(o.color ?? "")}`}
                          alt={o.styleCode}
                          width={28} height={28}
                          className="rounded object-contain bg-white border border-gray-100 w-7 h-7"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                    </td>
                    <td className="py-1 pr-3 text-gray-700 whitespace-nowrap">{o.styleCode ?? "—"}</td>
                    <td className="py-1 pr-3 text-gray-500 whitespace-nowrap">{o.color ?? "—"}</td>
                    <td className="py-1 pr-3 text-gray-700 whitespace-nowrap font-mono">{o.supplierShipDate}</td>
                    <td className="py-1 pr-3 whitespace-nowrap">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700">
                        {STAGE_LABEL(o.productionStage, o.status)}
                      </span>
                    </td>
                    <td className="py-1 pr-3 text-gray-700">{o.quantity ?? "—"}</td>
                    <td className="py-1 whitespace-nowrap">
                      {o.requiresTestPrint
                        ? <span className="text-amber-600 font-medium">🖨 Yes</span>
                        : <span className="text-gray-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </td>
    </tr>
  );
}

export function CapacityGrid() {
  const [data, setData]             = useState<CapacityData | null>(null);
  const [loading, setLoading]       = useState(true);
  const [windowStart, setWindowStart] = useState(0);
  const windowDays                  = 28;
  const [editing, setEditing]       = useState<SupplierMeta | null>(null);
  const [oooModal, setOooModal]     = useState<{ supplierId: number; date: string; reason: string | null } | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null); // "supplierId-date"

  const fetchData = useCallback(async () => {
    setLoading(true);
    const from = addDays(new Date(), windowStart);
    const to   = addDays(new Date(), windowStart + windowDays - 1);
    const params = new URLSearchParams({
      // format() gives the LOCAL calendar date. toISOString() gave the UTC one,
      // which is a different day once local time is past the UTC rollover — so
      // an evening user was requesting a window shifted a day ahead of the one
      // the column headers claimed to show.
      from: format(from, "yyyy-MM-dd"),
      to:   format(to, "yyyy-MM-dd"),
    });
    const res = await fetch(`/api/capacity?${params}`);
    const d = await res.json();
    setData(d);
    setLoading(false);
  }, [windowStart]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function saveCapacity(supplierId: number, updates: Partial<SupplierMeta>) {
    const res = await fetch(`/api/suppliers/${supplierId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comments: updates.comments,
        turnTime: updates.turnTime,
        weeklyCapacity: updates.weeklyCapacity,
        testPrintTat: updates.testPrintTat,
        productionTime: updates.productionTime,
        shippingTimeAir: updates.shippingTimeAir,
        shippingTimeSea: updates.shippingTimeSea,
      }),
    });
    if (res.ok) {
      toast.success("Saved");
      fetchData();
    } else {
      toast.error("Failed to save");
    }
  }

  async function saveOoo(supplierId: number, date: string, reason: string) {
    const res = await fetch("/api/capacity/overrides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplierId, date, reason }),
    });
    if (res.ok) {
      toast.success("Marked OOO");
      fetchData();
    } else {
      toast.error("Failed to save OOO");
    }
  }

  async function clearOoo(supplierId: number, date: string) {
    const res = await fetch(
      `/api/capacity/overrides?supplierId=${supplierId}&date=${date}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      toast.success("OOO cleared");
      fetchData();
    } else {
      toast.error("Failed to clear OOO");
    }
  }

  const today = new Date();
  const dates = Array.from({ length: windowDays }, (_, i) =>
    addDays(today, windowStart + i)
  );

  const hasPrev = windowStart > -30;
  const hasNext = windowStart + windowDays < 90;

  const legend = [
    { cls: "bg-green-100 border border-green-300", label: "Underload (< 70%)" },
    { cls: "bg-amber-100 border border-amber-300", label: "Properly Loaded (70–100%)" },
    { cls: "bg-red-100 border border-red-300",    label: "Overload (> 100%)" },
    { cls: "bg-blue-50 border border-blue-300",   label: "Capacity not set" },
    { cls: "bg-gray-200 border border-gray-300",  label: "OOO / Holiday" },
  ];

  const totalCols = 5 + windowDays;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-500 mt-0.5">
            Orders per supplier per day (spread across production window).
            Click a cell to see orders. Right-click any cell to mark OOO. Click supplier name to edit settings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setWindowStart((w) => w - 14)} disabled={!hasPrev}
            className="px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40">
            ← Earlier
          </button>
          <button onClick={() => setWindowStart(0)}
            className="px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50">
            Today
          </button>
          <button onClick={() => setWindowStart((w) => w + 14)} disabled={!hasNext}
            className="px-3 py-1.5 text-xs rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40">
            Later →
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {legend.map((l) => (
          <div key={l.label} className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className={`inline-block w-3 h-3 rounded-sm ${l.cls}`} />
            {l.label}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-left font-semibold text-gray-700 uppercase tracking-wide min-w-[220px] border-r border-gray-200">
                  Manufacturer
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-500 min-w-[80px] border-r border-gray-200">
                  Comments
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-500 min-w-[70px] border-r border-gray-200">
                  Prod. Days
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-500 min-w-[86px] border-r border-gray-200"
                    title="Orders newly assigned to this supplier in the last 7 days, against its weekly capacity">
                  Intake (7d)
                </th>
                <th className="px-3 py-2 text-center font-medium text-gray-500 min-w-[86px] border-r border-gray-200"
                    title="Orders on this supplier's floor right now, against weekly capacity x (production days / 7)">
                  Pipeline
                </th>
                {dates.map((d) => (
                  <th key={d.toISOString()}
                    className={`px-2 py-2 text-center font-medium min-w-[64px] border-r border-gray-100 ${
                      isToday(d) ? "bg-blue-50 text-blue-700" :
                      isWeekend(d) ? "bg-gray-100 text-gray-400" : "text-gray-500"
                    }`}>
                    <div className="text-xs">{format(d, "EEE")}</div>
                    <div className={`text-xs font-bold ${isToday(d) ? "text-blue-700" : "text-gray-700"}`}>
                      {format(d, "M/d")}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={totalCols} className="px-4 py-12 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : !data || data.suppliers.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="px-4 py-12 text-center text-gray-400">
                    No active suppliers
                  </td>
                </tr>
              ) : (
                data.suppliers.flatMap((supplier, idx) => {
                  const supplierLoads = data.loads[supplier.id] ?? {};
                  const supplierOrders = data.ordersByDate[supplier.id] ?? {};
                  const supplierOoo = data.ooo[supplier.id] ?? {};
                  const supplierCapacity = data.capacity?.[supplier.id];
                  // Day cells are concurrent work-in-progress, so they share the
                  // pipeline ceiling rather than a separate daily number.
                  const dayCeiling = supplierCapacity?.pipeline.ceiling ?? null;
                  const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50/50";

                  // Determine expanded date from expandedKey
                  const expandedDate = expandedKey?.startsWith(`${supplier.id}-`)
                    ? expandedKey.slice(String(supplier.id).length + 1)
                    : null;

                  const rows = [
                    <tr key={supplier.id} className={`border-b border-gray-100 ${rowBg}`}>
                      <td className={`sticky left-0 z-10 px-4 py-2.5 border-r border-gray-200 min-w-[220px] ${rowBg}`}>
                        <button onClick={() => setEditing(supplier)}
                          className="text-left hover:text-blue-600 transition-colors">
                          {supplier.nickname && (
                            <div className="font-semibold text-gray-900 text-xs">{supplier.nickname}</div>
                          )}
                          <div className={`text-xs ${supplier.nickname ? "text-gray-400" : "font-medium text-gray-900"}`}>{supplier.name}</div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 border-r border-gray-200 min-w-[80px] text-xs">
                        {supplier.comments ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-500 border-r border-gray-200 min-w-[70px] text-center text-xs">
                        {(supplier.productionTime ?? supplier.turnTime) != null
                          ? `${supplier.productionTime ?? supplier.turnTime}d`
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 border-r border-gray-200 min-w-[86px] text-center">
                        <IndicatorChip label="Intake (7d)" ind={supplierCapacity?.intake} />
                      </td>
                      <td className="px-3 py-2.5 border-r border-gray-200 min-w-[86px] text-center">
                        <IndicatorChip label="Pipeline" ind={supplierCapacity?.pipeline} />
                      </td>
                      {dates.map((d) => {
                        // Must use the same local calendar date the header
                        // renders with format(d, "M/d") just below. This was
                        // toISOString(), i.e. the UTC date — so from the
                        // evening onward every cell looked up the NEXT day's
                        // load while displaying today's label, and an order
                        // shipping the 14th appeared under the 13th.
                        const dateStr = format(d, "yyyy-MM-dd");
                        const units = supplierLoads[dateStr] ?? 0;
                        const isOoo = dateStr in supplierOoo;
                        const oooReason = supplierOoo[dateStr];
                        const cellOrders = supplierOrders[dateStr] ?? [];
                        return (
                          <CapacityCell
                            key={dateStr}
                            units={units}
                            capacity={dayCeiling}
                            dateIso={dateStr}
                            dateLabel={format(d, "MMM d")}
                            isWeekendDay={isWeekend(d)}
                            supplierName={supplier.name}
                            isOoo={isOoo}
                            oooReason={oooReason}
                            orders={cellOrders}
                            supplierId={supplier.id}
                            onOooClick={(sid, dt, reason) =>
                              setOooModal({ supplierId: sid, date: dt, reason })
                            }
                            expandedKey={expandedKey}
                            onExpandToggle={setExpandedKey}
                          />
                        );
                      })}
                    </tr>,
                  ];

                  if (expandedDate) {
                    const expandedOrders = supplierOrders[expandedDate] ?? [];
                    rows.push(
                      <ExpandedOrdersRow
                        key={`${supplier.id}-expand`}
                        orders={expandedOrders}
                        colSpan={totalCols}
                        expandedDate={expandedDate}
                      />
                    );
                  }

                  return rows;
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditCapacityModal
          supplier={editing}
          onSave={(updates) => saveCapacity(editing.id, updates)}
          onClose={() => setEditing(null)}
        />
      )}

      {oooModal && (
        <OooModal
          supplierId={oooModal.supplierId}
          date={oooModal.date}
          currentReason={oooModal.reason}
          onSave={saveOoo}
          onClear={clearOoo}
          onClose={() => setOooModal(null)}
        />
      )}
    </div>
  );
}
